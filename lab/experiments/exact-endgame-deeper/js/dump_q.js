'use strict';
// node js/dump_q.js N1,N2 n  -> results/q_dump.json : exact Q of every legal action at the root (exact2, JS-visible API)
const path = require('path'), fs = require('fs'); const C = require('./common.js');
const Ns = process.argv[2].split(',').map(Number), n = +process.argv[3];
const X = require(path.join(C.ENGINE_SRC, 'exact2.js')).createExact(C.R, { logCap: 24 });
const out = [];
for (const N of Ns) for (const p of C.loadPositions(path.join(__dirname, '../positions/dev200_expect1.txt')).filter((p) => p.N === N).slice(0, n)) {
  X.clear(); const q = X.q(C.toState(p), p.cur); out.push({ id: p.id, N, q });
}
fs.writeFileSync(path.join(__dirname, '../results/q_dump.json'), JSON.stringify(out));
