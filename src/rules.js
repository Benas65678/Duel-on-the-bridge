'use strict';

// The complete rulebook. The server holds every page; a client only ever
// receives the text of pages that player has uncovered.
// diag: small movement diagram drawn in the book. me = piece square, x = reachable, r = rook square.
const ring = (n, c, pts) => ({ n, me: [c, c], x: pts });
const K8 = [[0, 0], [0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1], [2, 2]];
const LINES5 = [[2, 0], [2, 1], [2, 3], [2, 4], [0, 2], [1, 2], [3, 2], [4, 2]];
const DIAGS5 = [[0, 0], [1, 1], [3, 3], [4, 4], [0, 4], [1, 3], [3, 1], [4, 0]];

const RULES = [
  { id: 1, title: 'The Troll', pub: true,
    text: 'Every side has one Troll (the King). Take the enemy Troll and its owner must crown any other piece they have left as the new Troll. If a Troll falls and its owner has nothing left to crown, that player loses the duel.' },
  { id: 2, title: 'Turns & Time', pub: true,
    text: 'Players alternate, one move per turn. Each player has ten minutes in total. After 120 moves the duel ends and the larger army wins (Pawn 1, Knight 3, Bishop 3, Rook 5, Queen 9). A tie is a draw. A player with no legal move loses.' },
  { id: 3, title: 'Pawn Shuffle',
    text: 'Pawns step one square forward or one square sideways, never backward and never diagonally. A Pawn captures only by stepping forward onto an enemy.',
    diag: { n: 3, me: [1, 1], x: [[0, 1], [1, 0], [1, 2]] } },
  { id: 4, title: 'Ascension',
    text: 'A Pawn that reaches the far edge of the bridge ascends and becomes a Rook, not a Queen.' },
  { id: 5, title: "Knight's Leap",
    text: 'Knights move in an L and are the only pieces that may jump over others. Everything else is blocked by whatever stands in its path.',
    diag: ring(5, 2, [[0, 1], [0, 3], [1, 0], [1, 4], [3, 0], [3, 4], [4, 1], [4, 3]]) },
  { id: 6, title: "Bishop's Stride",
    text: 'Bishops slide any distance diagonally, or step one square straight in any of the four directions.',
    diag: ring(5, 2, DIAGS5.concat([[1, 2], [3, 2], [2, 1], [2, 3]])) },
  { id: 7, title: "Rook's Reach",
    text: 'Rooks slide in straight lines, but never more than four squares in a single move.',
    diag: ring(5, 2, LINES5) },
  { id: 8, title: "Queen's Mercy",
    text: 'The Queen slides any distance in a straight or diagonal line, but she refuses to capture Pawns.',
    diag: ring(5, 2, LINES5.concat(DIAGS5)) },
  { id: 9, title: "Troll's Step",
    text: 'A Troll (King) moves one square in any direction, diagonals included.',
    diag: ring(3, 1, K8) },
  { id: 10, title: 'Royal Swap',
    text: 'Instead of moving, a Troll may swap places with a friendly Rook standing next to him.',
    diag: { n: 3, me: [1, 1], x: [], r: [[1, 2]] } },
  { id: 11, title: 'Slippery Ice',
    text: 'Hidden patches of ice lie across the middle of the bridge. A piece that lands on ice slides one extra square in the direction it was travelling, if that square is empty. Ice is only visible once someone has triggered it.' },
  { id: 12, title: 'No Encores',
    text: 'You may never move the same piece two turns in a row (unless it is the only piece you have left).' },
  { id: 13, title: 'Sanctuary',
    text: 'A piece standing in one of the four corners of the bridge cannot be captured. Trolls enjoy no such protection.' },
  { id: 14, title: 'Old Grudge',
    text: 'Knights may not capture Bishops.' },
];

module.exports = { RULES, RULE_COUNT: RULES.length };
