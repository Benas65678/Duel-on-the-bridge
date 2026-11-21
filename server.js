'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const game = require('./src/game');

const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function createApp() {
  const rooms = new Map();

  const server = http.createServer((req, res) => {
    let urlPath = '/';
    try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { /* ignore */ }
    if (urlPath === '/') urlPath = '/index.html';
    const file = path.join(PUBLIC, path.normalize(urlPath));
    if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
    fs.readFile(file, (e, data) => {
      if (e) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(data);
    });
  });

  const wss = new WebSocketServer({ server, maxPayload: 2048 });

  const send = (ws, obj) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); };

  function newCode() {
    for (;;) {
      let c = '';
      for (let i = 0; i < 4; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
      if (!rooms.has(c)) return c;
    }
  }

  function push(room, toasts = []) {
    const now = Date.now();
    for (const color of ['w', 'b']) {
      const p = room.players[color];
      if (!p || !p.ws) continue;
      send(p.ws, game.viewFor(room.st, color, now, room.players[game.other(color)] && room.players[game.other(color)].ws));
      for (const t of toasts) {
        if (t.to === color || t.to === 'both') send(p.ws, { t: 'toast', kind: t.kind, msg: t.msg, rule: t.rule });
      }
    }
    room.touched = now;
  }

  function attach(ws, room, color) {
    ws.room = room;
    ws.color = color;
    room.players[color].ws = ws;
  }

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      let m;
      try { m = JSON.parse(raw.toString()); } catch { return; }
      if (!m || typeof m.t !== 'string') return;
      const now = Date.now();

      if (m.t === 'create') {
        if (ws.room) return;
        const code = newCode();
        const color = crypto.randomInt(2) ? 'w' : 'b';
        const room = { code, st: game.createGame(), players: { w: null, b: null }, touched: now };
        room.players[color] = { token: crypto.randomBytes(12).toString('hex'), ws: null };
        rooms.set(code, room);
        attach(ws, room, color);
        send(ws, { t: 'joined', code, token: room.players[color].token, color });
        return push(room);
      }

      if (m.t === 'join') {
        if (ws.room) return;
        const room = rooms.get(String(m.code || '').toUpperCase());
        if (!room) return send(ws, { t: 'error', msg: 'No duel with that code.' });
        const color = room.players.w ? (room.players.b ? null : 'b') : 'w';
        if (!color) return send(ws, { t: 'error', msg: 'That duel is already full.' });
        room.players[color] = { token: crypto.randomBytes(12).toString('hex'), ws: null };
        attach(ws, room, color);
        send(ws, { t: 'joined', code: room.code, token: room.players[color].token, color });
        game.startGame(room.st, now);
        return push(room);
      }

      if (m.t === 'rejoin') {
        if (ws.room) return;
        const room = rooms.get(String(m.code || '').toUpperCase());
        const color = room && ['w', 'b'].find((c) => room.players[c] && room.players[c].token === m.token);
        if (!color) return send(ws, { t: 'rejoin-failed' });
        if (room.players[color].ws && room.players[color].ws !== ws) room.players[color].ws.close();
        attach(ws, room, color);
        send(ws, { t: 'joined', code: room.code, token: m.token, color });
        return push(room);
      }

      const room = ws.room;
      if (!room) return;
      let r = null;
      if (m.t === 'move') r = game.tryMove(room.st, ws.color, m.from, m.to, m.cheat === true, now);
      else if (m.t === 'accuse') r = game.accuse(room.st, ws.color, m.target, m.rule, now);
      else if (m.t === 'crown') r = game.crown(room.st, ws.color, m.square, now);
      else if (m.t === 'resign') r = game.resign(room.st, ws.color);
      else return;

      if (!r.ok && r.error) send(ws, { t: 'error', msg: r.error, fumble: !!r.fumble });
      push(room, r.toasts || []);
    });

    ws.on('close', () => {
      const room = ws.room;
      if (!room) return;
      const p = room.players[ws.color];
      if (p && p.ws === ws) { p.ws = null; push(room); }
    });
  });

  const tick = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (game.checkClock(room.st, now)) push(room);
      const empty = !(room.players.w && room.players.w.ws) && !(room.players.b && room.players.b.ws);
      if (empty && now - room.touched > 15 * 60 * 1000) rooms.delete(code);
      else if (now - room.touched > 3 * 60 * 60 * 1000) rooms.delete(code);
    }
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 5000);
  tick.unref();

  return { server, wss, rooms, close: () => { clearInterval(tick); wss.close(); server.close(); } };
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  createApp().server.listen(port, () => console.log(`Duel on the Bridge listening on http://localhost:${port}`));
}

module.exports = { createApp };
