'use strict';
// node src/z_speed.js [K=12] [n=6] [logCap=24] [reps=2] [wasm=1]   new solver only: entries and time (quick tuning aid)
const E = require('./engine.js'), N = require('./exact2.js'), R = E.DEFAULT_RULES, P = require('../results/z_positions.json');
const K = +process.argv[2] || 12, n = +process.argv[3] || 6, lc = +process.argv[4] || 24, reps = +process.argv[5] || 2;
const mk = (p) => { const st = E.newGame(R); st.cols.set(p.cols); st.deck.set(p.deck); st.rem = p.rem; st.played = 52 - p.rem; st.busts = p.busts; st.stays = p.stays; st.prev = p.prev; return st; };
for (const wasm of process.argv[6] === '0' ? [false] : process.argv[6] === 'both' ? [false, true, false, true] : [true]) {
  const X = N.createExact(R, { logCap: lc, wasm });
  for (let r = 0; r < reps; r++) {
    let S = 0, sum = 0, by = 0; const t = performance.now(), c0 = process.cpuUsage();
    for (const p of (P.bench[K] || P.gate.filter((x) => x.K === K)).slice(0, n)) { X.clear(); sum += X.value(mk(p)); S += X.states(); by += X.bytes(); }
    const ms = performance.now() - t, cu = process.cpuUsage(c0), cpu = (cu.user + cu.system) / 1000;
    console.log(X.kernel(), 'K', K, 'entries', S, 'wall ms', ms.toFixed(0), 'cpu ms', cpu.toFixed(0), (S / cpu / 1000).toFixed(2), 'M/cpu-s', 'bytes/entry', (by / S).toFixed(1), 'checksum', sum.toFixed(3));
  }
}
