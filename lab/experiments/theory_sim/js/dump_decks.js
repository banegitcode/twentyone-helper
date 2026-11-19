// node dump_decks.js <seedStart> <count> <out.txt>  : one deck per line (52 card values) using Landon's engine shuffledDeck(seed)
const E = require('/workspace/21lab/engine/twentyone-solver/src/engine.js');
const [s0, n, out] = [+process.argv[2], +process.argv[3], process.argv[4]];
const lines = [];
for (let s = s0; s < s0 + n; s++) lines.push(s + ' ' + E.shuffledDeck(s).join(' '));
require('fs').writeFileSync(out, lines.join('\n') + '\n');
