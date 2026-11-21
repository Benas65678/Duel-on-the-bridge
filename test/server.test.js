'use strict';
const test = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const { createApp } = require('../server');

function client(port) {
  const ws = new WebSocket('ws://localhost:' + port);
  const msgs = [];
  const waiters = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    msgs.push(m);
    waiters.slice().forEach((w) => { if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.res(m); } });
  });
  const opened = new Promise((r) => ws.on('open', r));
  return {
    ws, msgs, opened,
    send: (o) => ws.send(JSON.stringify(o)),
    next: (pred) => new Promise((res, rej) => {
      const hit = msgs.find(pred);
      if (hit) return res(hit);
      const t = setTimeout(() => rej(new Error('timeout')), 2000);
      waiters.push({ pred, res: (m) => { clearTimeout(t); res(m); } });
    }),
  };
}

test('two players can duel over websockets without seeing each other\'s rules', async () => {
  const app = createApp();
  await new Promise((r) => app.server.listen(0, r));
  const port = app.server.address().port;
  const a = client(port), b = client(port);
  await Promise.all([a.opened, b.opened]);

  a.send({ t: 'create' });
  const ja = await a.next((m) => m.t === 'joined');
  b.send({ t: 'join', code: ja.code });
  const jb = await b.next((m) => m.t === 'joined');
  assert.notStrictEqual(ja.color, jb.color);

  const white = ja.color === 'w' ? a : b, black = white === a ? b : a;
  const sw = await white.next((m) => m.t === 'state' && m.phase === 'playing');
  const sb = await black.next((m) => m.t === 'state' && m.phase === 'playing');
  const knownW = sw.rules.filter((r) => r.known).map((r) => r.id);
  const knownB = sb.rules.filter((r) => r.known).map((r) => r.id);
  assert.strictEqual(knownW.length, 5);
  assert.notDeepStrictEqual(knownW, knownB);
  assert.ok(sw.rules.filter((r) => !r.known).every((r) => r.text === null));

  // black cannot move on white's turn
  black.send({ t: 'move', from: [1, 0], to: [2, 0] });
  await black.next((m) => m.t === 'error');

  // white cheats a diagonal pawn move; black accuses correctly
  white.send({ t: 'move', from: [6, 0], to: [5, 1], cheat: true });
  const st = await black.next((m) => m.t === 'state' && m.turn === 'b' && m.canAccuse);
  assert.strictEqual(st.board[5][1].t, 'P');
  black.send({ t: 'accuse', target: [5, 1], rule: 3 });
  const good = await black.next((m) => m.t === 'toast' && m.kind === 'good');
  assert.match(good.msg, /Caught/);
  const bad = await white.next((m) => m.t === 'toast' && m.kind === 'bad');
  assert.match(bad.msg, /Caught/);

  a.ws.close(); b.ws.close();
  app.close();
});

test('serves the client and blocks path traversal', async () => {
  const app = createApp();
  await new Promise((r) => app.server.listen(0, r));
  const port = app.server.address().port;
  const ok = await fetch(`http://localhost:${port}/`);
  assert.strictEqual(ok.status, 200);
  assert.match(await ok.text(), /Duel on the Bridge/);
  const bad = await fetch(`http://localhost:${port}/..%2f..%2fserver.js`);
  assert.notStrictEqual(bad.status, 200);
  app.close();
});
