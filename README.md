# Duel on the Bridge

A two-player online fan tribute to **King of the Bridge** by Finn Schuuring, the indie game where a bridge troll challenges you to a chess variant full of secret rules and cheats whenever he can.

Here the troll is replaced by a second human. You duel in real time, and **neither of you can see the whole rulebook**.

> Unofficial fan project, not affiliated with or endorsed by the original developer. The rules text, code and pixel art here are original. If you like the idea, buy the real game on Steam.

## Play

```bash
npm install
npm start          # http://localhost:3000
```

1. Player one clicks **Create duel** and sends the link (or the 4-letter code) to player two.
2. Player two opens it and clicks **Join duel**. Colours are random.

Everything runs on one Node process: HTTP for the page, WebSocket for the game. To play over the internet, deploy it to any host that supports WebSockets (Render, Fly.io, Railway, a VPS) and set `PORT` if the host asks for it.

## What makes it different from chess

- **Hidden rules.** 14 rulebook pages. You start with 5 known pages, your opponent with a different 5. The board does not highlight legal moves.
- **Learn by trying.** An illegal move is refused and opens the page you broke (costs 20 seconds). A loose page slides out every 4th move.
- **Cheating.** Spend a cheat token to make a rule-breaking move up to 3 squares away. If nobody catches it, it stands.
- **Accusations.** Spot a cheat? Click the ACCUSE tab on the side of the book, pick the piece and name the rule page. Right: their move is undone and you gain a token. Wrong: you pay.
- **Trolls.** Both Kings are Trolls. When yours is taken you crown any other piece you own as the new Troll; lose one with nothing left to crown and you lose.
- **Secret ice.** Six hidden slippery tiles in the middle of the bridge.
- After the duel the full rulebook opens for both players.

The complete list of rules and the cheating system is in [RULES.md](RULES.md) (spoilers).

## Project layout

```
server.js        HTTP + WebSocket rooms
src/rules.js     every rule page (server only; clients get text only for pages they have uncovered)
src/game.js      pure game logic: moves, cheats, accusations, clocks, per-player views
public/          canvas pixel-art client (sprites.js, client.js, style.css)
test/            node:test suites (engine + two-player websocket test)
```

The server is authoritative. Hidden rule text and unrevealed ice tiles are never sent to a client that has not uncovered them.

```bash
npm test
```
