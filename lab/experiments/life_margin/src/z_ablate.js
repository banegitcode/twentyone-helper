'use strict';
// node src/z_ablate.js [K=12] [n=30] [out=results/z_ablate_K.json]
// Share of each exact reduction in the number of stored positions: the new solver (JavaScript kernel) with reductions
// switched off one at a time and all together, on the bench positions.  "none" should match exact.js minus the
// one-card positions exact.js stores (it is the same search with the same column ids).
const fs = require('fs'), path = require('path');
const E = require('./engine.js'), N = require('./exact2.js'), R = E.DEFAULT_RULES, P = require('../results/z_positions.json');
const K = +process.argv[2] || 12, n = +process.argv[3] || 30, outF = process.argv[4] || path.join(__dirname, '../results/z_ablate_' + K + '.json');
const mk = (p) => { const st = E.newGame(R); st.cols.set(p.cols); st.deck.set(p.deck); st.rem = p.rem; st.played = 52 - p.rem; st.busts = p.busts; st.stays = p.stays; st.prev = p.prev; return st; };
const cfgs = { all: null, 'no column classes': { classes: false }, 'no stay cap': { stayCap: false }, 'no streak drop': { prevDrop: false }, none: { classes: false, stayCap: false, prevDrop: false } };
const res = {};
for (const name of Object.keys(cfgs)) {
  const X = N.createExact(R, { logCap: name === 'all' ? 24 : 26, wasm: false, ablate: cfgs[name] || undefined }); let S = 0, sum = 0, dnf = 0;
  for (const p of (P.bench[K] || P.gate.filter((x) => x.K === K)).slice(0, n)) { X.clear(); try { sum += X.value(mk(p)); S += X.states(); } catch (e) { dnf++; } }
  res[name] = { entries: S, checksum: sum, tableFull: dnf };
  console.log(name.padEnd(18), 'entries', S, 'x' + (S / res.all.entries).toFixed(2), 'vs all', 'value checksum', sum.toFixed(2), dnf ? 'table full on ' + dnf : '');
}
fs.writeFileSync(outF, JSON.stringify({ K, n, res }, null, 1));
