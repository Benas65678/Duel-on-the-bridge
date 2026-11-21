// Pixel sprites, 12x14. Symmetric pieces are stored as left halves (6 chars) and mirrored.
// o outline, h light, f mid, s dark, g gold accent, . empty
const HALF = {
  P: ['......', '....oo', '...ohh', '...ohf', '...off', '....oo', '...ohf', '....of', '....of', '...ohf', '..ohff', '..offs', '.ooooo', '......'],
  R: ['......', '.oo.oo', '.ohohh', '.ohhhh', '..oooo', '...ohf', '...ohf', '...off', '...ohf', '..ohff', '.ohfff', '.offfs', '.ooooo', '......'],
  B: ['......', '.....o', '....oo', '...ohh', '..ohhf', '..ohff', '..ohfo', '...off', '....of', '...ohf', '..ohff', '.offff', '.ooooo', '......'],
  Q: ['......', 'g..g..', 'oo.oo.', '.ohhhh', '..ohff', '..ohff', '...ohf', '...off', '....of', '...ohf', '..ohff', '.ohfff', '.offfs', '.ooooo'],
  // The Troll (King): crowned head, heavy brow, big nose, tusks.
  K: ['..g.g.', '..gggg', '.ooooo', 'ohhhff', 'ohoohf', 'ohhhff', 'ohhfss', '.ohfss', '.ogofo', '..ohff', '..ohff', '.ohfff', '.offfs', '.ooooo'],
};
const FULL = {
  N: [
    '............', '....oo......', '...ohhoo....', '..ohhhhfo...', '.ohhoohffo..', '.ohhhhhffo..', '.oohhhffso..',
    '..oohhfffso.', '....ohffffo.', '...ohfffffso', '..ohffffffso', '.ohffffffffo', '.oooooooooo.', '............',
  ],
};
const PALETTES = {
  w: { o: '#3b3320', h: '#fff7d6', f: '#efe0aa', s: '#c2b072', g: '#e0a21a' },
  b: { o: '#0b1a12', h: '#8fc17f', f: '#568a64', s: '#32604a', g: '#ffd25a' },
};

function spriteRows(type) {
  if (FULL[type]) return FULL[type];
  return HALF[type].map((r) => r + r.split('').reverse().map((ch) => (ch === 'h' ? 'f' : ch)).join(''));
}

function buildSprites() {
  const out = {};
  for (const color of ['w', 'b']) {
    for (const type of ['P', 'N', 'B', 'R', 'Q', 'K']) {
      const cv = document.createElement('canvas');
      cv.width = 12; cv.height = 14;
      const x = cv.getContext('2d');
      spriteRows(type).forEach((row, y) => {
        [...row].forEach((ch, i) => {
          if (ch === '.') return;
          x.fillStyle = PALETTES[color][ch];
          x.fillRect(i, y, 1, 1);
        });
      });
      out[color + type] = cv;
    }
  }
  return out;
}

if (typeof module !== 'undefined') module.exports = { spriteRows, HALF, FULL, PALETTES };
