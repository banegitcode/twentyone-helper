'use strict';
// node src/z_quick.js [K=12] [n=10] [logCap=24]   quick old-vs-new check on the first n bench positions for K
const E = require('./engine.js'), O = require('./exact.js'), N = require('./exact2.js'), R = E.DEFAULT_RULES;
const P = require('../results/z_positions.json');
const K = +process.argv[2] || 12, n = +process.argv[3] || 10, lc = +process.argv[4] || 24;
const mk = (p) => { const st = E.newGame(R); st.cols.set(p.cols); st.deck.set(p.deck); st.rem = p.rem; st.played = 52 - p.rem; st.busts = p.busts; st.stays = p.stays; st.prev = p.prev; return st; };
const X0 = O.createExact(R, { logCap: lc }), X1 = N.createExact(R, { logCap: lc, noStore: process.argv[5] != null ? +process.argv[5] : undefined });
let T0 = 0, T1 = 0, S0 = 0, S1 = 0;
for (const p of (P.bench[K] || P.gate.filter((x) => x.K === K)).slice(0, n)) {
  const st = mk(p);
  X0.clear(); let t = performance.now(); const v0 = X0.value(st); const t0 = performance.now() - t, s0 = X0.states();
  X1.clear(); t = performance.now(); const v1 = X1.value(st); const t1 = performance.now() - t, s1 = X1.states();
  T0 += t0; T1 += t1; S0 += s0; S1 += s1;
  console.log(p.seed, 'old', v0.toFixed(3), s0, t0.toFixed(0) + 'ms', '| new', v1.toFixed(3), s1, t1.toFixed(0) + 'ms', '| entries x' + (s0 / s1).toFixed(2), 'time x' + (t0 / t1).toFixed(2), Math.abs(v0 - v1) < 0.01 ? '' : 'MISMATCH');
}
console.log('total entries x' + (S0 / S1).toFixed(2), 'time x' + (T0 / T1).toFixed(2), 'old', (S0 / T0 * 1000 / 1e6).toFixed(2), 'M/s new', (S1 / T1 * 1000 / 1e6).toFixed(2), 'M/s');
