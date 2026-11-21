'use strict';
// Pure game logic. No I/O. The server wraps this and personalises state per player.
const { RULES, RULE_COUNT } = require('./rules');

const FILES = 'abcdefgh';
const NAMES = { P: 'Pawn', N: 'Knight', B: 'Bishop', R: 'Rook', Q: 'Queen', K: 'King' };
const SIDE = { w: 'Cream', b: 'Moss' };
const VALUE = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };
const MOVE_RULE = { P: 3, N: 5, B: 6, R: 7, Q: 8, K: 9 };
const START_CLOCK = 10 * 60 * 1000;
const PENALTY = 20 * 1000;
const MAX_PLY = 120;
const REVEAL_EVERY = 4;
const CHEAT_RANGE = 3;

const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];

const other = (c) => (c === 'w' ? 'b' : 'w');
const inb = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const sq = (r, c) => FILES[c] + (8 - r);
const isCorner = (r, c) => (r === 0 || r === 7) && (c === 0 || c === 7);

function shuffle(a, rng) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newBoard() {
  const b = Array.from({ length: 8 }, () => Array(8).fill(null));
  const back = 'RNBQKBNR';
  let n = 0;
  for (let c = 0; c < 8; c++) {
    b[0][c] = { id: 'b' + n++, t: back[c], c: 'b' };
    b[1][c] = { id: 'b' + n++, t: 'P', c: 'b' };
    b[6][c] = { id: 'w' + n++, t: 'P', c: 'w' };
    b[7][c] = { id: 'w' + n++, t: back[c], c: 'w' };
  }
  return b;
}

function createGame(rng = Math.random) {
  const st = {
    phase: 'waiting', // waiting | playing | over
    board: newBoard(),
    turn: 'w',
    ply: 0,
    lastMoved: { w: null, b: null },
    moves: { w: 0, b: 0 },
    ice: [],
    iceSeen: new Set(),
    revealed: { w: new Set([1, 2]), b: new Set([1, 2]) },
    tokens: { w: 1, b: 1 },
    clocks: { w: START_CLOCK, b: START_CLOCK },
    turnStart: null,
    lastMove: null,
    log: [],
    winner: null,
    reason: null,
    succession: null, // colour that must crown a new Troll before play continues
    rng,
  };
  // Six hidden ice tiles in the middle four rows.
  const cells = [];
  for (let r = 2; r <= 5; r++) for (let c = 0; c < 8; c++) cells.push([r, c]);
  st.ice = shuffle(cells, rng).slice(0, 6);
  // Each player starts with three different private pages.
  const pool = shuffle(RULES.filter((r) => !r.pub).map((r) => r.id), rng);
  pool.slice(0, 3).forEach((id) => st.revealed.w.add(id));
  pool.slice(3, 6).forEach((id) => st.revealed.b.add(id));
  return st;
}

function startGame(st, now) {
  st.phase = 'playing';
  st.turn = 'w';
  st.turnStart = now;
  addLog(st, null, 'The duel begins. Cream moves first.');
}

function addLog(st, side, msg) {
  st.log.push({ side, msg });
  if (st.log.length > 80) st.log.shift();
}

// ---------- move generation ----------

function geometry(board, r, c) {
  const p = board[r][c];
  const out = [];
  const push = (nr, nc) => { if (inb(nr, nc)) out.push({ r: nr, c: nc }); };
  const slide = (dirs, max) => {
    for (const [dr, dc] of dirs) {
      for (let k = 1; k <= max; k++) {
        const nr = r + dr * k, nc = c + dc * k;
        if (!inb(nr, nc)) break;
        out.push({ r: nr, c: nc });
        if (board[nr][nc]) break;
      }
    }
  };
  switch (p.t) {
    case 'P': {
      const d = p.c === 'w' ? -1 : 1;
      push(r + d, c);
      for (const dc of [-1, 1]) if (inb(r, c + dc) && !board[r][c + dc]) push(r, c + dc);
      break;
    }
    case 'N': KNIGHT.forEach(([dr, dc]) => push(r + dr, c + dc)); break;
    case 'B': slide(DIAG, 8); ORTH.forEach(([dr, dc]) => push(r + dr, c + dc)); break;
    case 'R': slide(ORTH, 4); break;
    case 'Q': slide(ORTH, 8); slide(DIAG, 8); break;
    case 'K': ORTH.concat(DIAG).forEach(([dr, dc]) => push(r + dr, c + dc)); break;
  }
  return out;
}

function countPieces(board, color) {
  let n = 0;
  for (const row of board) for (const p of row) if (p && p.c === color) n++;
  return n;
}

// Returns { legal, rule, blocked }. `rule` is the rule the move would break.
function evaluate(st, fr, fc, tr, tc) {
  const b = st.board;
  const p = b[fr][fc];
  const tgt = b[tr][tc];
  const g = geometry(b, fr, fc).find((m) => m.r === tr && m.c === tc);
  if (!g) return { legal: false, rule: MOVE_RULE[p.t] };
  let swap = false;
  if (tgt && tgt.c === p.c) {
    if (p.t === 'K' && tgt.t === 'R') swap = true;
    else return { legal: false, rule: null, blocked: true };
  }
  if (st.lastMoved[p.c] === p.id && countPieces(b, p.c) > 1) return { legal: false, rule: 12 };
  if (!swap && tgt) {
    if (tgt.t !== 'K' && isCorner(tr, tc)) return { legal: false, rule: 13 };
    if (p.t === 'N' && tgt.t === 'B') return { legal: false, rule: 14 };
    if (p.t === 'Q' && tgt.t === 'P') return { legal: false, rule: 8 };
  }
  return { legal: true, swap };
}

function hasLegalMove(st, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = st.board[r][c];
      if (!p || p.c !== color) continue;
      for (const m of geometry(st.board, r, c)) {
        if (evaluate(st, r, c, m.r, m.c).legal) return true;
      }
    }
  }
  return false;
}

// ---------- applying moves ----------

function applyMove(st, fr, fc, tr, tc) {
  const b = st.board;
  const p = b[fr][fc];
  const tgt = b[tr][tc];
  const res = { captured: null, fin: { r: tr, c: tc }, swap: false, ice: false, promoted: false };
  if (tgt && tgt.c === p.c) {
    b[fr][fc] = tgt; b[tr][tc] = p; res.swap = true;
  } else {
    res.captured = tgt;
    b[tr][tc] = p; b[fr][fc] = null;
  }
  if (!res.swap && st.ice.some(([r, c]) => r === tr && c === tc)) {
    res.ice = true;
    st.iceSeen.add(tr + ',' + tc);
    const nr = tr + Math.sign(tr - fr), nc = tc + Math.sign(tc - fc);
    if (inb(nr, nc) && !b[nr][nc]) {
      b[nr][nc] = p; b[tr][tc] = null; res.fin = { r: nr, c: nc };
    }
  }
  if (p.t === 'P' && ((p.c === 'w' && res.fin.r === 0) || (p.c === 'b' && res.fin.r === 7))) {
    p.t = 'R'; res.promoted = true;
  }
  return res;
}

function snapshot(st) {
  return {
    board: JSON.parse(JSON.stringify(st.board)),
    lastMoved: { ...st.lastMoved },
    ply: st.ply,
  };
}
function restore(st, s) {
  st.board = JSON.parse(JSON.stringify(s.board));
  st.lastMoved = { ...s.lastMoved };
  st.ply = s.ply;
}

// ---------- helpers ----------

function revealTo(st, color, id) {
  if (!id || st.revealed[color].has(id)) return false;
  st.revealed[color].add(id);
  return true;
}
function revealBoth(st, id) {
  return [revealTo(st, 'w', id), revealTo(st, 'b', id)];
}
const err = (error) => ({ ok: false, error });

function settleClock(st, now) {
  if (st.phase !== 'playing') return;
  st.clocks[st.turn] -= now - st.turnStart;
  st.turnStart = now;
}

function endGame(st, winner, reason) {
  st.phase = 'over';
  st.winner = winner;
  st.reason = reason;
  for (let i = 1; i <= RULE_COUNT; i++) revealBoth(st, i);
  addLog(st, null, winner
    ? `${SIDE[winner]} wins (${reason}). The troll's rulebook falls open.`
    : `The duel is a draw (${reason}). The troll's rulebook falls open.`);
}

function checkClock(st, now) {
  if (st.phase !== 'playing') return false;
  if (st.clocks[st.turn] - (now - st.turnStart) <= 0) {
    st.clocks[st.turn] = 0;
    endGame(st, other(st.turn), 'time');
    return true;
  }
  return false;
}

function material(board, color) {
  let n = 0;
  for (const row of board) for (const p of row) if (p && p.c === color) n += VALUE[p.t];
  return n;
}

// ---------- actions ----------

function tryMove(st, color, from, to, cheat, now) {
  if (st.phase !== 'playing') return err('The duel is not running.');
  if (st.succession) {
    return err(st.succession === color
      ? 'Your Troll has fallen. Click one of your pieces to crown it first.'
      : 'Wait while your opponent crowns a new Troll.');
  }
  if (st.turn !== color) return err('It is not your turn.');
  const okc =(a) => Array.isArray(a) && a.length === 2 && a.every((n) => Number.isInteger(n)) && inb(a[0], a[1]);
  if (!okc(from) || !okc(to)) return err('Bad squares.');
  settleClock(st, now);
  if (checkClock(st, now)) return { ok: true, toasts: [], over: true };
  const [fr, fc] = from, [tr, tc] = to;
  const p = st.board[fr][fc];
  if (!p || p.c !== color) return err('Pick one of your own pieces.');
  if (fr === tr && fc === tc) return err('Pick a different square.');
  const tgt = st.board[tr][tc];
  const ev = evaluate(st, fr, fc, tr, tc);
  const toasts = [];
  let cheatRule = null;

  if (!ev.legal) {
    if (ev.blocked) return err('One of your own pieces is standing there.');
    if (!cheat) {
      revealTo(st, color, ev.rule);
      st.clocks[color] -= PENALTY;
      const over = checkClock(st, now);
      return {
        ok: false, fumble: true, rule: ev.rule, over,
        error: `Illegal move! The rulebook flips open to page ${ev.rule}. (-20s)`,
      };
    }
    if (st.tokens[color] < 1) return err('You have no cheat tokens left.');
    if (Math.max(Math.abs(tr - fr), Math.abs(tc - fc)) > CHEAT_RANGE) return err('Even cheaters can only sneak up to 3 squares.');
    if (tgt && tgt.t === 'K') return err('A cheat can never take the King.');
    st.tokens[color]--;
    cheatRule = ev.rule;
    revealTo(st, color, ev.rule);
    toasts.push({ to: color, kind: 'rule', rule: ev.rule, msg: `You broke page ${ev.rule}. Hope nobody noticed.` });
  } else if (cheat) {
    toasts.push({ to: color, kind: 'info', msg: 'That move was legal anyway. Cheat token kept.' });
  }

  const snap = snapshot(st);
  const pieceType = p.t;
  const res = applyMove(st, fr, fc, tr, tc);
  st.lastMoved[color] = p.id;
  st.ply++;
  st.moves[color]++;
  st.lastMove = {
    by: color, pieceId: p.id, from: [fr, fc], to: [res.fin.r, res.fin.c],
    cheatRule, snapshot: snap, accused: false,
  };

  let msg = `${SIDE[color]}: ${NAMES[pieceType]} ${sq(fr, fc)}${res.captured ? 'x' : '-'}${sq(tr, tc)}`;
  if (res.swap) msg = `${SIDE[color]}: King swaps with Rook ${sq(fr, fc)}<->${sq(tr, tc)}`;
  if (res.captured) msg += ` (takes ${NAMES[res.captured.t]})`;
  if (res.ice) {
    msg += res.fin.r !== tr || res.fin.c !== tc ? `, slips on ice to ${sq(res.fin.r, res.fin.c)}!` : ', lands on ice!';
    revealBoth(st, 11).forEach((n, i) => n && toasts.push({ to: 'wb'[i], kind: 'rule', rule: 11, msg: 'Ice! Page 11 is now in your rulebook.' }));
  }
  if (res.promoted) {
    msg += ' and ascends into a Rook!';
    revealBoth(st, 4).forEach((n, i) => n && toasts.push({ to: 'wb'[i], kind: 'rule', rule: 4, msg: 'Ascension! Page 4 is now in your rulebook.' }));
  }
  addLog(st, color, msg);

  const opp = other(color);
  let trollFell = false;
  if (res.captured && res.captured.t === 'K') {
    if (countPieces(st.board, opp) === 0) {
      endGame(st, color, `${SIDE[opp]}'s last Troll fell`);
      return { ok: true, toasts, over: true };
    }
    trollFell = true;
    st.succession = opp;
    addLog(st, color, `${SIDE[opp]}'s Troll falls! ${SIDE[opp]} must crown a new one.`);
    toasts.push({ to: opp, kind: 'bad', msg: 'Your Troll has fallen! Click one of your pieces to crown it as the new Troll.' });
    toasts.push({ to: color, kind: 'good', msg: 'Troll taken! Your opponent is choosing a successor.' });
  }
  if (st.ply >= MAX_PLY) {
    const a = material(st.board, 'w'), b = material(st.board, 'b');
    endGame(st, a === b ? null : a > b ? 'w' : 'b', `move limit, ${a} vs ${b}`);
    return { ok: true, toasts, over: true };
  }
  if (!trollFell && !hasLegalMove(st, opp)) {
    endGame(st, color, `${SIDE[opp]} has no legal move`);
    return { ok: true, toasts, over: true };
  }
  st.turn = opp;
  st.turnStart = now;
  if (st.moves[color] % REVEAL_EVERY === 0) {
    const hidden = RULES.map((r) => r.id).filter((id) => !st.revealed[color].has(id));
    if (hidden.length) {
      const id = hidden[Math.floor(st.rng() * hidden.length)];
      revealTo(st, color, id);
      toasts.push({ to: color, kind: 'rule', rule: id, msg: `A loose page slides out: page ${id}.` });
    }
  }
  return { ok: true, toasts, over: false };
}

function crown(st, color, square, now) {
  if (st.phase !== 'playing') return err('The duel is not running.');
  if (st.succession !== color) return err('There is nothing to crown.');
  if (!Array.isArray(square) || square.length !== 2 || !square.every(Number.isInteger) || !inb(square[0], square[1])) return err('Bad square.');
  const piece = st.board[square[0]][square[1]];
  if (!piece || piece.c !== color) return err('Crown one of your own pieces.');
  settleClock(st, now);
  const was = NAMES[piece.t];
  piece.t = 'K';
  st.succession = null;
  addLog(st, color, `${SIDE[color]} crowns the ${was} on ${sq(square[0], square[1])} as the new Troll.`);
  const toasts = [{ to: color, kind: 'info', msg: 'Long live the new Troll!' }];
  if (!hasLegalMove(st, color)) {
    endGame(st, other(color), `${SIDE[color]} has no legal move`);
    return { ok: true, toasts, over: true };
  }
  return { ok: true, toasts, over: false };
}

function accuse(st, color, target, ruleId, now) {
  if (st.phase !== 'playing') return err('The duel is not running.');
  if (st.succession) return err('Wait until the new Troll is crowned.');
  if (st.turn !== color) return err('You can only accuse on your own turn, before you move.');
  const lm = st.lastMove;
  if (!lm || lm.by === color) return err('There is nothing to accuse.');
  if (lm.accused) return err('You already accused that move.');
  if (!Number.isInteger(ruleId) || ruleId < 1 || ruleId > RULE_COUNT) return err('Pick a rule page.');
  if (!Array.isArray(target) || target.length !== 2 || !target.every(Number.isInteger) || !inb(target[0], target[1])) return err('Bad square.');
  const piece = st.board[target[0]][target[1]];
  if (!piece || piece.c === color) return err('Point at an enemy piece.');
  settleClock(st, now);
  lm.accused = true;
  const toasts = [];
  const opp = other(color);
  const hit = lm.cheatRule !== null && piece.id === lm.pieceId && lm.cheatRule === ruleId;
  if (hit) {
    restore(st, lm.snapshot);
    st.tokens[color]++;
    revealBoth(st, ruleId);
    st.lastMove = null;
    st.turnStart = now;
    addLog(st, color, `${SIDE[color]} accuses ${SIDE[opp]}'s ${NAMES[piece.t]} of breaking page ${ruleId}. CAUGHT! The move is undone.`);
    toasts.push({ to: color, kind: 'good', rule: ruleId, msg: `Caught him! You gain a cheat token, and page ${ruleId} is yours.` });
    toasts.push({ to: opp, kind: 'bad', rule: ruleId, msg: `Caught cheating on page ${ruleId}! Your move is undone and your turn is lost.` });
    return { ok: true, hit: true, toasts, over: false };
  }
  addLog(st, color, `${SIDE[color]} accuses ${SIDE[opp]}'s ${NAMES[piece.t]} of breaking page ${ruleId}. Nothing sticks.`);
  if (st.tokens[color] > 0) {
    st.tokens[color]--;
    toasts.push({ to: color, kind: 'bad', msg: 'False accusation! You lose a cheat token.' });
  } else {
    st.clocks[color] -= PENALTY;
    toasts.push({ to: color, kind: 'bad', msg: 'False accusation! You lose 20 seconds.' });
  }
  toasts.push({ to: opp, kind: 'info', msg: 'You were accused, but it did not stick.' });
  const over = checkClock(st, now);
  return { ok: true, hit: false, toasts, over };
}

function resign(st, color) {
  if (st.phase !== 'playing') return err('The duel is not running.');
  endGame(st, other(color), `${SIDE[color]} resigned`);
  return { ok: true, toasts: [], over: true };
}

// ---------- per-player view (never leaks hidden rules) ----------

function viewFor(st, color, now, oppConnected) {
  const clocks = { ...st.clocks };
  if (st.phase === 'playing') clocks[st.turn] -= now - st.turnStart;
  const lm = st.lastMove;
  return {
    t: 'state',
    you: color,
    phase: st.phase,
    turn: st.turn,
    ply: st.ply,
    board: st.board.map((row) => row.map((p) => (p ? { id: p.id, t: p.t, c: p.c } : null))),
    tokens: { you: st.tokens[color], opp: st.tokens[other(color)] },
    clocks: { w: Math.max(0, clocks.w), b: Math.max(0, clocks.b) },
    rules: RULES.map((r) => {
      const known = st.revealed[color].has(r.id);
      return { id: r.id, known, title: known ? r.title : null, text: known ? r.text : null, diag: known ? r.diag || null : null };
    }),
    ice: [...st.iceSeen].map((k) => k.split(',').map(Number)),
    succession: st.succession,
    canAccuse: st.phase === 'playing' && !st.succession && st.turn === color && !!lm && lm.by !== color && !lm.accused,
    lastMove: lm ? { by: lm.by, from: lm.from, to: lm.to } : null,
    log: st.log.slice(-40),
    winner: st.winner,
    reason: st.reason,
    oppConnected: !!oppConnected,
  };
}

module.exports = {
  createGame, startGame, tryMove, accuse, crown, resign, checkClock, viewFor, evaluate, geometry,
  hasLegalMove, SIDE, NAMES, START_CLOCK, PENALTY, MAX_PLY, other,
};
