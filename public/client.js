(() => {
'use strict';
const $ = (s) => document.querySelector(s);
const TILE = 16, BX = 32, BY = 24, W = 192, H = 176;
const NAMES = { P: 'Pawn', N: 'Knight', B: 'Bishop', R: 'Rook', Q: 'Queen', K: 'Troll' };
const SIDE = { w: 'Cream', b: 'Moss' };

let ws = null, me = null, st = null, recvAt = 0;
let sel = null, hover = null, cheatArmed = false, accuseMode = false;
let spread = 1, anim = null, lastKey = null;
const flash = new Set();
let sprites = null, soundOn = true, audio = null;

// ---------- sound ----------
function blip(freq, len = 0.08, type = 'square', vol = 0.04) {
  if (!soundOn) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = vol;
    o.connect(g); g.connect(audio.destination);
    o.start(); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + len); o.stop(audio.currentTime + len);
  } catch { /* ignore */ }
}
const jingle = (notes) => notes.forEach((f, i) => setTimeout(() => blip(f, 0.12), i * 110));

// ---------- networking ----------
function connect(onOpen) {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = onOpen;
  ws.onmessage = (e) => handle(JSON.parse(e.data));
  ws.onclose = () => { if (st && st.phase !== 'over') toast('bad', 'Connection lost. Reload to rejoin.'); };
}
const send = (o) => ws && ws.readyState === 1 && ws.send(JSON.stringify(o));

function handle(m) {
  if (m.t === 'joined') {
    me = m.color;
    sessionStorage.setItem('duel', JSON.stringify({ code: m.code, token: m.token }));
    $('#room').textContent = m.code;
    $('#lobby').classList.add('hidden');
    $('#game').classList.remove('hidden');
    history.replaceState(null, '', '?room=' + m.code);
  } else if (m.t === 'state') {
    onState(m);
  } else if (m.t === 'toast') {
    if (m.rule) { flash.add(m.rule); spread = Math.ceil(m.rule / 2); flipBook(); }
    toast(m.kind, m.msg);
    if (m.kind === 'good') jingle([523, 659, 784]);
    else if (m.kind === 'bad') jingle([300, 220]);
    else if (m.kind === 'rule') jingle([440, 554]);
    renderBook();
  } else if (m.t === 'error') {
    toast('bad', m.msg);
    blip(160, 0.2, 'sawtooth');
    if (m.fumble) sel = null;
    $('#lobby-msg').textContent = m.msg;
  } else if (m.t === 'rejoin-failed') {
    sessionStorage.removeItem('duel');
  }
}

function onState(s) {
  const prev = st;
  st = s; me = s.you; recvAt = performance.now();
  const key = s.lastMove ? s.lastMove.by + s.lastMove.from + s.lastMove.to + s.ply : null;
  if (s.lastMove && key !== lastKey) {
    const piece = s.board[s.lastMove.to[0]][s.lastMove.to[1]];
    anim = { id: piece && piece.id, from: s.lastMove.from, to: s.lastMove.to, t0: performance.now() };
    blip(s.lastMove.by === me ? 330 : 262, 0.07);
  }
  lastKey = key;
  if (s.turn !== me || s.succession) cheatArmed = false;
  if (!s.canAccuse) accuseMode = false;
  if (prev && prev.phase !== 'over' && s.phase === 'over') showGameOver();
  render();
}

// ---------- UI ----------
function toast(kind, msg) {
  const d = document.createElement('div');
  d.className = 'toast ' + (kind || '');
  d.textContent = msg;
  $('#toasts').appendChild(d);
  setTimeout(() => d.remove(), 5000);
}

function modal(html, onMount) {
  $('#modal-box').innerHTML = html;
  $('#modal').classList.remove('hidden');
  if (onMount) onMount($('#modal-box'));
}
const closeModal = () => $('#modal').classList.add('hidden');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function fmt(ms) {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function render() {
  if (!st) return;
  const myTurn = st.phase === 'playing' && st.turn === me && !st.succession;
  const opp = me === 'w' ? 'b' : 'w';
  $('#me-name').textContent = SIDE[me] + ' (you)';
  $('#opp-name').textContent = SIDE[opp] + (st.oppConnected ? '' : ' - waiting / offline');
  $('#me-tok').textContent = 'SLY ' + '●'.repeat(st.tokens.you);
  $('#opp-tok').textContent = 'SLY ' + '●'.repeat(st.tokens.opp);
  $('#me-bar').classList.toggle('active', st.phase === 'playing' && st.turn === me);
  $('#opp-bar').classList.toggle('active', st.phase === 'playing' && st.turn === opp);
  let status;
  if (st.phase === 'over') status = 'Duel over';
  else if (st.phase === 'waiting' || (!st.oppConnected && st.ply === 0)) status = 'Waiting for opponent... share the link!';
  else if (st.succession === me) status = 'Your Troll fell! Crown a new one';
  else if (st.succession) status = 'Opponent is crowning a new Troll';
  else status = myTurn ? 'Your move' : "Opponent's move";
  $('#status').textContent = status;
  $('#btn-cheat').disabled = !(myTurn && st.tokens.you > 0);
  $('#btn-cheat').classList.toggle('armed', cheatArmed);
  $('#btn-cheat').textContent = cheatArmed ? 'Cheat ARMED' : 'Cheat';
  $('#btn-resign').disabled = st.phase !== 'playing';
  $('#accuse-tab').classList.toggle('alert', st.canAccuse);
  $('#accuse-tab').classList.toggle('dim', !st.canAccuse);
  $('#btn-accuse').classList.toggle('on', accuseMode);
  $('#btn-accuse').textContent = accuseMode ? 'CANCEL' : 'ACCUSE';
  $('#accuse-note').textContent = st.canAccuse
    ? 'THE OTHER SIDE JUST MOVED. NOW IS THE TIME.'
    : 'YOU CAN ONLY ACCUSE ON YOUR TURN, RIGHT AFTER THE OTHER SIDE MOVES.';
  $('#hint').textContent = st.succession === me
    ? 'Your Troll has fallen. Click any of your pieces (glowing) to crown it as your new Troll.'
    : accuseMode
      ? 'Accuse mode: click the enemy piece you think just cheated, then name the rule.'
      : cheatArmed
        ? 'Cheat armed: make an illegal-looking move (up to 3 squares). If nobody catches it, it stands.'
        : myTurn ? 'Select a piece, then a square. Nothing is highlighted: you do not know all the rules. Catch cheats with the ACCUSE tab on the book.' : '';
  renderBook();
  renderLog();
  tickClocks();
}

function tickClocks() {
  if (!st) return;
  const opp = me === 'w' ? 'b' : 'w';
  const el = performance.now() - recvAt;
  const c = { w: st.clocks.w, b: st.clocks.b };
  if (st.phase === 'playing') c[st.turn] -= el;
  $('#me-clock').textContent = fmt(c[me]);
  $('#opp-clock').textContent = fmt(c[opp]);
}
setInterval(tickClocks, 250);

// ---------- the book ----------
function diagHtml(d) {
  if (!d) return '';
  const cells = [];
  for (let r = 0; r < d.n; r++) {
    for (let c = 0; c < d.n; c++) {
      const is = (list) => (list || []).some((p) => p[0] === r && p[1] === c);
      if (d.me[0] === r && d.me[1] === c) cells.push('<span class="me">●</span>');
      else if (is(d.x)) cells.push('<span class="x">✕</span>');
      else if (is(d.r)) cells.push('<span class="rk">R</span>');
      else cells.push('<span></span>');
    }
  }
  return `<div class="diag" style="grid-template-columns:repeat(${d.n},1fr)">${cells.join('')}</div>`;
}

function pageHtml(rule) {
  const n = String(rule.id).padStart(2, '0');
  if (!rule.known) {
    return `<div class="pg unknown"><div class="rhead"><span class="mv">?</span> RULE ${n}</div><div class="blot"></div><p class="rtext">INK SMUDGED. BREAK IT, CATCH A CHEAT, OR WAIT FOR THE PAGE TO SLIP LOOSE.</p></div>`;
  }
  return `<div class="pg ${flash.has(rule.id) ? 'flash' : ''}"><div class="rhead"><span class="mv">✥</span> RULE ${n}<small>${esc(rule.title)}</small></div><p class="rtext">${esc(rule.text)}</p>${diagHtml(rule.diag)}</div>`;
}

function flipBook() {
  const el = $('#spread');
  el.classList.remove('flip'); void el.offsetWidth; el.classList.add('flip');
}

function renderBook() {
  if (!st) return;
  const maxSpread = Math.ceil(st.rules.length / 2);
  spread = Math.min(Math.max(1, spread), maxSpread);
  const l = st.rules[spread * 2 - 2], r = st.rules[spread * 2 - 1];
  $('#pageL').innerHTML = pageHtml(l);
  $('#pageR').innerHTML = pageHtml(r);
  $('#pg-num').textContent = `pages ${l.id}-${r.id}`;
  $('#pg-prev').disabled = spread <= 1;
  $('#pg-next').disabled = spread >= maxSpread;
  const before = [...flash].some((id) => Math.ceil(id / 2) < spread);
  const after = [...flash].some((id) => Math.ceil(id / 2) > spread);
  $('#pg-prev').classList.toggle('flash', before);
  $('#pg-next').classList.toggle('flash', after);
  setTimeout(() => { flash.delete(l.id); flash.delete(r.id); }, 2500);
}

function flipTo(delta) {
  spread += delta; flipBook(); renderBook(); blip(500, 0.04, 'triangle');
}

function renderLog() {
  const el = $('#log');
  el.innerHTML = st.log.map((l) => `<div class="${l.side || 'sys'}">${esc(l.msg)}</div>`).join('');
  el.scrollTop = el.scrollHeight;
}

function toggleSheet(force) {
  const sheet = $('#accuse-sheet');
  const open = force === undefined ? !sheet.classList.contains('open') : force;
  sheet.classList.toggle('open', open);
}

function enterAccuse() {
  if (!st || !st.canAccuse) { toast('info', 'You can only accuse on your turn, right after the other side moves.'); return; }
  accuseMode = !accuseMode; sel = null; cheatArmed = false;
  toggleSheet(false); render();
}

function showGameOver() {
  const won = st.winner === me;
  const title = st.winner ? (won ? 'You win!' : 'You lose.') : 'Draw.';
  jingle(won ? [523, 659, 784, 1046] : [300, 250, 200]);
  modal(`<h2>${title}</h2><p>${esc(st.reason || '')}</p><p>The whole rulebook is now open on your side. Read what you were up against.</p><div class="row"><button id="m-close">Read the book</button><button id="m-lobby">New duel</button></div>`, () => {
    $('#m-close').onclick = closeModal;
    $('#m-lobby').onclick = () => { sessionStorage.removeItem('duel'); location.href = location.pathname; };
  });
}

function openAccuse(target) {
  const piece = st.board[target[0]][target[1]];
  const rows = st.rules.map((r) => `<button data-r="${r.id}">${r.id}. ${r.known ? esc(r.title) : '??? (unknown page)'}</button>`).join('');
  modal(`<h2>Accuse the ${NAMES[piece.t]}</h2><p>Which rule did it just break? A wrong guess costs you a cheat token (or 20 seconds). A right one undoes the move, costs them their turn, and gives you a token.</p><div class="grid">${rows}</div><div class="row"><button id="m-cancel">Cancel</button></div>`, (box) => {
    box.querySelectorAll('[data-r]').forEach((b) => {
      b.onclick = () => { send({ t: 'accuse', target, rule: Number(b.dataset.r) }); accuseMode = false; closeModal(); render(); };
    });
    $('#m-cancel').onclick = closeModal;
  });
}

function showHow() {
  modal(`<h2>How it works</h2>
  <p>It looks like chess on a bridge, but it is not chess. The rulebook has 14 pages, and <b>you only know some of them</b>, and so does your opponent, and not the same ones. Pieces are never highlighted.</p>
  <p><b>Learn the rules:</b> try an illegal move and the page you broke flips open (but you lose 20 seconds). Every 4th move a loose page slips out. Catching a cheat opens its page. Ice and ascension open for both of you when they happen.</p>
  <p><b>Trolls:</b> both Kings are Trolls. When yours is taken you pick any other piece you own to crown as the new Troll. Lose a Troll with nothing left to crown and you lose.</p>
  <p><b>Cheat:</b> you start with one cheat token. Arm Cheat, then make an illegal-looking move up to 3 squares away (never taking a Troll). The opponent is told nothing.</p>
  <p><b>Accuse:</b> on your turn, before moving, click the ACCUSE tab on the side of the book (or press Space), point at the piece that just moved, and name a rule page. Right: their move is undone, they lose the turn, you gain a token. Wrong: you lose a token (or 20s).</p>
  <div class="row"><button id="m-close">Got it</button></div>`, () => { $('#m-close').onclick = closeModal; });
}

// ---------- board input ----------
const toView = (r, c) => (me === 'w' ? [r, c] : [7 - r, 7 - c]);
const fromView = toView;

function cellAt(e) {
  const cv = $('#board'), rect = cv.getBoundingClientRect();
  const x = (e.clientX - rect.left) * W / rect.width, y = (e.clientY - rect.top) * H / rect.height;
  const vc = Math.floor((x - BX) / TILE), vr = Math.floor((y - BY) / TILE);
  if (vc < 0 || vc > 7 || vr < 0 || vr > 7) return null;
  return fromView(vr, vc);
}

function onBoardClick(e) {
  if (!st || st.phase !== 'playing') return;
  const cell = cellAt(e);
  if (!cell) return;
  const [r, c] = cell, p = st.board[r][c];
  if (st.succession) {
    if (st.succession !== me) { toast('info', 'Your opponent is choosing a new Troll.'); return; }
    if (p && p.c === me) send({ t: 'crown', square: [r, c] }); else toast('bad', 'Click one of your own pieces.');
    return;
  }
  if (accuseMode) {
    if (p && p.c !== me) openAccuse([r, c]); else toast('bad', 'Point at an enemy piece.');
    return;
  }
  if (st.turn !== me) { toast('info', 'Not your turn.'); return; }
  if (!sel) { if (p && p.c === me) sel = [r, c]; return; }
  if (sel[0] === r && sel[1] === c) { sel = null; return; }
  const selP = st.board[sel[0]][sel[1]];
  const swap = selP.t === 'K' && p && p.c === me && p.t === 'R';
  if (p && p.c === me && !swap) { sel = [r, c]; return; }
  send({ t: 'move', from: sel, to: [r, c], cheat: cheatArmed });
  sel = null;
}

// ---------- drawing ----------
const ctx = $('#board').getContext('2d');
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

function drawScene(t) {
  ctx.fillStyle = '#2b5240'; ctx.fillRect(0, 0, W, H);
  // animated wavy water stripes
  for (let sx = 6; sx < W; sx += 24) {
    for (let y = 0; y < H; y++) {
      const x = sx + Math.round(Math.sin(y * 0.13 + t / 520 + sx) * 2.6);
      ctx.fillStyle = '#86b36a'; ctx.fillRect(x, y, 2, 1);
      ctx.fillStyle = '#1f4030'; ctx.fillRect(x + 2, y, 1, 1);
    }
  }
  // a lily pad drifting by
  const lx = (t / 90) % (W + 30) - 15;
  ctx.fillStyle = '#9ccf7a'; ctx.fillRect(Math.round(lx), 160, 7, 4); ctx.fillStyle = '#5d8f4a'; ctx.fillRect(Math.round(lx) + 1, 162, 5, 1);
}

function drawBoard(t) {
  const iceSet = new Set(st ? st.ice.map((a) => a.join(',')) : []);
  ctx.fillStyle = '#0f241b'; ctx.fillRect(BX - 3, BY - 3, 134, 134);
  for (let vr = 0; vr < 8; vr++) {
    for (let vc = 0; vc < 8; vc++) {
      const x = BX + vc * TILE, y = BY + vr * TILE;
      const [r, c] = fromView(vr, vc);
      const dark = (r + c) % 2 === 1;
      ctx.fillStyle = dark ? '#2f5a45' : '#f4e8b8'; ctx.fillRect(x, y, TILE, TILE);
      // hand-drawn inset frame
      const h = hash(r, c), j = h > 0.5 ? 1 : 0;
      ctx.fillStyle = dark ? '#4f8062' : '#cdbd82';
      ctx.fillRect(x + 3, y + 3 + j, 10 - j, 1); ctx.fillRect(x + 3, y + 12, 10, 1);
      ctx.fillRect(x + 3, y + 3, 1, 10 - j); ctx.fillRect(x + 12, y + 3 + j, 1, 10 - j);
      if (iceSet.has(r + ',' + c)) {
        ctx.fillStyle = '#a8dcff'; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = '#fff'; ctx.fillRect(x + 3 + (Math.floor(t / 300) % 3), y + 3, 2, 1); ctx.fillRect(x + 9, y + 10, 3, 1);
      }
    }
  }
  if (!st) return;
  const mark = (r, c, col) => { const [vr, vc] = toView(r, c); ctx.fillStyle = col; ctx.fillRect(BX + vc * TILE, BY + vr * TILE, TILE, TILE); };
  if (st.lastMove) { mark(...st.lastMove.from, 'rgba(255,216,107,0.30)'); mark(...st.lastMove.to, 'rgba(255,216,107,0.30)'); }
  if (cheatArmed) { ctx.strokeStyle = `rgba(232,102,74,${0.6 + 0.4 * Math.sin(t / 120)})`; ctx.lineWidth = 2; ctx.strokeRect(BX - 1, BY - 1, 130, 130); }
  if (accuseMode) { ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 2; ctx.strokeRect(BX - 1, BY - 1, 130, 130); }
  if (hover) { const [vr, vc] = toView(...hover); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1; ctx.strokeRect(BX + vc * TILE + .5, BY + vr * TILE + .5, TILE - 1, TILE - 1); }
  if (sel) { const [vr, vc] = toView(...sel); ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 1; ctx.strokeRect(BX + vc * TILE + .5, BY + vr * TILE + .5, TILE - 1, TILE - 1); }

  const crowning = st.succession === me;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = st.board[r][c];
      if (!p) continue;
      const [vr, vc] = toView(r, c);
      let px = BX + vc * TILE + 2, py = BY + vr * TILE + 1;
      if (anim && anim.id === p.id) {
        const k = Math.min(1, (performance.now() - anim.t0) / 180);
        if (k < 1) {
          const [fvr, fvc] = toView(...anim.from);
          px = BX + (fvc + (vc - fvc) * k) * TILE + 2; py = BY + (fvr + (vr - fvr) * k) * TILE + 1 - Math.sin(k * Math.PI) * 4;
        }
      }
      if (sel && sel[0] === r && sel[1] === c) py -= 1 + (Math.floor(t / 200) % 2);
      if (crowning && p.c === me) {
        const bob = Math.floor(t / 180 + c) % 2;
        py -= bob;
        ctx.fillStyle = '#f2c14e'; ctx.fillRect(Math.round(px) + 3, Math.round(py) - 1, 6, 1); ctx.fillRect(Math.round(px) + 4, Math.round(py) - 2, 1, 1); ctx.fillRect(Math.round(px) + 7, Math.round(py) - 2, 1, 1);
      }
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(Math.round(px) + 1, Math.round(BY + vr * TILE + 14), 10, 2);
      const spr = sprites[p.c + p.t];
      if (p.t === 'N' && p.c === 'b') { ctx.save(); ctx.translate(Math.round(px) + 12, Math.round(py)); ctx.scale(-1, 1); ctx.drawImage(spr, 0, 0); ctx.restore(); }
      else ctx.drawImage(spr, Math.round(px), Math.round(py));
    }
  }
}

function frame(t) {
  drawScene(t);
  drawBoard(t);
  requestAnimationFrame(frame);
}

// ---------- boot ----------
function init() {
  sprites = buildSprites();
  const q = new URLSearchParams(location.search).get('room');
  if (q) $('#code').value = q.toUpperCase();
  const saved = JSON.parse(sessionStorage.getItem('duel') || 'null');
  if (saved && (!q || q.toUpperCase() === saved.code)) connect(() => send({ t: 'rejoin', code: saved.code, token: saved.token }));
  $('#btn-create').onclick = () => { $('#lobby-msg').textContent = ''; if (!ws) connect(() => send({ t: 'create' })); else send({ t: 'create' }); };
  $('#btn-join').onclick = () => {
    const code = $('#code').value.trim().toUpperCase();
    if (code.length !== 4) { $('#lobby-msg').textContent = 'Enter the 4-letter code.'; return; }
    $('#lobby-msg').textContent = '';
    if (!ws || ws.readyState > 1) connect(() => send({ t: 'join', code })); else send({ t: 'join', code });
  };
  $('#btn-how').onclick = showHow;
  $('#btn-cheat').onclick = () => { cheatArmed = !cheatArmed; accuseMode = false; render(); };
  $('#accuse-tab').onclick = () => toggleSheet();
  $('#btn-accuse').onclick = enterAccuse;
  $('#pg-prev').onclick = () => flipTo(-1);
  $('#pg-next').onclick = () => flipTo(1);
  $('#btn-resign').onclick = () => { if (confirm('Resign the duel?')) send({ t: 'resign' }); };
  $('#btn-mute').onclick = () => { soundOn = !soundOn; $('#btn-mute').textContent = 'sound: ' + (soundOn ? 'on' : 'off'); };
  $('#btn-copy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(location.href); toast('info', 'Link copied. Send it to your opponent.'); };
  const cv = $('#board');
  cv.addEventListener('click', onBoardClick);
  cv.addEventListener('mousemove', (e) => { hover = cellAt(e); });
  cv.addEventListener('mouseleave', () => { hover = null; });
  cv.addEventListener('contextmenu', (e) => { e.preventDefault(); sel = null; });
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Escape') { sel = null; accuseMode = false; cheatArmed = false; closeModal(); toggleSheet(false); render(); }
    else if (e.key === ' ' && st && !$('#game').classList.contains('hidden')) { e.preventDefault(); toggleSheet(); }
  });
  requestAnimationFrame(frame);
}
init();
})();
