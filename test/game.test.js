'use strict';
const test = require('node:test');
const assert = require('node:assert');
const g = require('../src/game');

function fresh() {
  let seed = 7;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const st = g.createGame(rng);
  st.ice = []; // keep ice out of the way unless a test wants it
  g.startGame(st, 0);
  return st;
}
const mv = (st, color, from, to, cheat = false, now = 1000) => g.tryMove(st, color, from, to, cheat, now);

test('each player starts with different private pages, same public pages', () => {
  const st = fresh();
  const w = [...st.revealed.w], b = [...st.revealed.b];
  assert.ok(w.includes(1) && w.includes(2) && b.includes(1) && b.includes(2));
  assert.strictEqual(w.length, 5);
  assert.strictEqual(b.length, 5);
  const wPriv = w.filter((x) => x > 2), bPriv = b.filter((x) => x > 2);
  assert.ok(wPriv.every((x) => !bPriv.includes(x)));
});

test('view never leaks text of unknown rules', () => {
  const st = fresh();
  const v = g.viewFor(st, 'w', 0, true);
  for (const r of v.rules) {
    if (!r.known) { assert.strictEqual(r.text, null); assert.strictEqual(r.title, null); }
  }
  assert.strictEqual(JSON.stringify(v).includes('cheatRule'), false);
});

test('legal pawn step works, illegal diagonal pawn move fumbles and reveals page 3', () => {
  const st = fresh();
  st.revealed.w.delete(3);
  const bad = mv(st, 'w', [6, 0], [5, 1]);
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.fumble, true);
  assert.strictEqual(bad.rule, 3);
  assert.ok(st.revealed.w.has(3));
  assert.strictEqual(st.clocks.w, g.START_CLOCK - g.PENALTY - 1000); // 1s elapsed + penalty
  assert.strictEqual(st.turn, 'w');
  const ok = mv(st, 'w', [6, 0], [5, 0]);
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(st.turn, 'b');
});

test('no encores: same piece twice in a row is blocked (rule 12)', () => {
  const st = fresh();
  mv(st, 'w', [6, 0], [5, 0]);
  mv(st, 'b', [1, 0], [2, 0]);
  const r = mv(st, 'w', [5, 0], [4, 0]);
  assert.strictEqual(r.fumble, true);
  assert.strictEqual(r.rule, 12);
});

test('cheat is accepted, spends a token, and a correct accusation undoes it', () => {
  const st = fresh();
  // White pawn cheats diagonally (breaks rule 3)
  const r = mv(st, 'w', [6, 0], [5, 1], true);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(st.tokens.w, 0);
  assert.strictEqual(st.board[5][1].t, 'P');
  const a = g.accuse(st, 'b', [5, 1], 3, 2000);
  assert.strictEqual(a.hit, true);
  assert.strictEqual(st.board[6][0].t, 'P');
  assert.strictEqual(st.board[5][1], null);
  assert.strictEqual(st.tokens.b, 2);
  assert.strictEqual(st.turn, 'b');
  assert.ok(st.revealed.b.has(3) && st.revealed.w.has(3));
});

test('wrong accusation costs a token, then 20s once out of tokens', () => {
  const st = fresh();
  mv(st, 'w', [6, 0], [5, 0]);
  const a = g.accuse(st, 'b', [5, 0], 3, 2000);
  assert.strictEqual(a.hit, false);
  assert.strictEqual(st.tokens.b, 0);
  const again = g.accuse(st, 'b', [5, 0], 3, 2000);
  assert.strictEqual(again.ok, false); // only one accusation per move
  mv(st, 'b', [1, 0], [2, 0], false, 3000);
  mv(st, 'w', [6, 1], [5, 1], false, 4000);
  const before = st.clocks.b;
  g.accuse(st, 'b', [5, 1], 3, 4000);
  assert.strictEqual(st.clocks.b, before - g.PENALTY);
});

test('accusing the wrong rule or wrong piece on a real cheat fails', () => {
  const st = fresh();
  mv(st, 'w', [6, 0], [5, 1], true);
  assert.strictEqual(g.accuse(st, 'b', [5, 1], 7, 2000).hit, false);
  const st2 = fresh();
  mv(st2, 'w', [6, 0], [5, 1], true);
  assert.strictEqual(g.accuse(st2, 'b', [6, 3], 3, 2000).hit, false);
});

test('a "cheat" that is actually legal keeps the token', () => {
  const st = fresh();
  const r = mv(st, 'w', [6, 0], [5, 0], true);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(st.tokens.w, 1);
  assert.strictEqual(st.lastMove.cheatRule, null);
});

test('cheat limits: range, no king capture, needs token', () => {
  const st = fresh();
  assert.match(mv(st, 'w', [6, 0], [2, 0], true).error, /3 squares/);
  st.board[4][4] = { id: 'bk', t: 'K', c: 'b' };
  st.board[5][3] = { id: 'wx', t: 'P', c: 'w' };
  assert.match(mv(st, 'w', [5, 3], [4, 4], true).error, /King/);
  st.tokens.w = 0;
  assert.match(mv(st, 'w', [6, 0], [5, 1], true).error, /no cheat tokens/);
});

test('rook reach, queen mercy, knight grudge, corner sanctuary', () => {
  const st = fresh();
  st.board = Array.from({ length: 8 }, () => Array(8).fill(null));
  const put = (r, c, t, col, id) => { st.board[r][c] = { id, t, c: col }; };
  put(7, 4, 'K', 'w', 'wk'); put(0, 4, 'K', 'b', 'bk');
  put(4, 0, 'R', 'w', 'wr'); put(3, 5, 'Q', 'w', 'wq'); put(2, 5, 'P', 'b', 'bp');
  put(5, 5, 'N', 'w', 'wn'); put(3, 3, 'B', 'b', 'bb'); put(0, 0, 'R', 'b', 'br');
  assert.strictEqual(g.evaluate(st, 4, 0, 4, 4).legal, true);
  assert.strictEqual(g.evaluate(st, 4, 0, 4, 5).legal, false); // 5 squares
  assert.strictEqual(g.evaluate(st, 4, 0, 4, 5).rule, 7);
  assert.strictEqual(g.evaluate(st, 3, 5, 2, 5).rule, 8);     // queen vs pawn
  assert.strictEqual(g.evaluate(st, 5, 5, 3, 4).legal, true);  // knight jump
  put(4, 4, 'B', 'b', 'bb2');
  assert.strictEqual(g.evaluate(st, 5, 5, 4, 3).legal, true);
  st.board[3][4] = { id: 'bb3', t: 'B', c: 'b' };
  assert.strictEqual(g.evaluate(st, 5, 5, 3, 4).rule, 14);
  assert.strictEqual(g.evaluate(st, 4, 0, 0, 0).rule, 13); // black rook is safe in the corner
});

test('ice slides the piece and reveals page 11 to both', () => {
  const st = fresh();
  st.ice = [[5, 0]];
  const r = mv(st, 'w', [6, 0], [5, 0]);
  assert.strictEqual(r.ok, true);
  assert.ok(st.board[4][0] && st.board[4][0].t === 'P');
  assert.ok(st.revealed.w.has(11) && st.revealed.b.has(11));
  assert.deepStrictEqual(g.viewFor(st, 'b', 0, true).ice, [[5, 0]]);
});

function troll() {
  const st = fresh();
  st.board = Array.from({ length: 8 }, () => Array(8).fill(null));
  st.board[7][4] = { id: 'wk', t: 'K', c: 'w' };
  st.board[0][4] = { id: 'bk', t: 'K', c: 'b' };
  st.board[0][0] = { id: 'wr', t: 'R', c: 'w' };
  return st;
}

test('taking the last Troll with nothing left to crown wins and opens the whole rulebook', () => {
  const st = troll();
  const r = mv(st, 'w', [0, 0], [0, 4]);
  assert.strictEqual(r.over, true);
  assert.strictEqual(st.winner, 'w');
  assert.strictEqual(st.revealed.b.size, 14);
});

test('a fallen Troll must be replaced: the owner crowns any surviving piece', () => {
  const st = troll();
  st.board[3][3] = { id: 'bn', t: 'N', c: 'b' };
  const r = mv(st, 'w', [0, 0], [0, 4]);
  assert.strictEqual(r.over, false);
  assert.strictEqual(st.phase, 'playing');
  assert.strictEqual(st.succession, 'b');
  assert.match(mv(st, 'b', [3, 3], [5, 4]).error, /crown/i);
  assert.match(g.accuse(st, 'b', [0, 4], 3, 2000).error, /crowned/);
  assert.match(g.crown(st, 'w', [7, 4], 2000).error, /nothing to crown/);
  assert.match(g.crown(st, 'b', [7, 4], 2000).error, /own pieces/);
  const c = g.crown(st, 'b', [3, 3], 2000);
  assert.strictEqual(c.ok, true);
  assert.strictEqual(st.board[3][3].t, 'K');
  assert.strictEqual(st.succession, null);
  assert.strictEqual(st.turn, 'b');
  // the new Troll moves like a Troll (one step), and taking it with nothing left wins
  assert.strictEqual(mv(st, 'b', [3, 3], [4, 4]).ok, true);
});

test('the new Troll can fall again and the duel ends when nothing is left', () => {
  const st = troll();
  st.board[3][3] = { id: 'bn', t: 'N', c: 'b' };
  mv(st, 'w', [0, 0], [0, 4]);
  g.crown(st, 'b', [3, 3], 2000);
  st.board[3][2] = { id: 'wx', t: 'R', c: 'w' };
  const r = mv(st, 'b', [3, 3], [3, 4]);
  assert.strictEqual(r.ok, true);
  const r2 = mv(st, 'w', [3, 2], [3, 4]);
  assert.strictEqual(r2.over, true);
  assert.strictEqual(st.winner, 'w');
});

test('view exposes diagrams only for uncovered pages', () => {
  const st = fresh();
  const v = g.viewFor(st, 'w', 0, true);
  for (const r of v.rules) if (!r.known) assert.strictEqual(r.diag, null);
});

test('pawn ascends into a rook and reveals page 4', () => {
  const st = fresh();
  st.board = Array.from({ length: 8 }, () => Array(8).fill(null));
  st.board[7][4] = { id: 'wk', t: 'K', c: 'w' };
  st.board[0][7] = { id: 'bk', t: 'K', c: 'b' };
  st.board[1][2] = { id: 'wp', t: 'P', c: 'w' };
  mv(st, 'w', [1, 2], [0, 2]);
  assert.strictEqual(st.board[0][2].t, 'R');
  assert.ok(st.revealed.b.has(4));
});

test('time runs out', () => {
  const st = fresh();
  assert.strictEqual(g.checkClock(st, g.START_CLOCK + 1), true);
  assert.strictEqual(st.winner, 'b');
});
