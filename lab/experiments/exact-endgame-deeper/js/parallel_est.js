'use strict';
// node js/parallel_est.js 11,12,13 n  -> results/parallel_est.json
// How well can ONE move be split over workers that each have their own table (no shared memory)?  Split by root action: each worker solves
// the child of one action from an empty table.  Counted in table positions (exact, machine independent):
//   shared   = positions stored by one choose() (one table, all actions)       <- what the champion does now
//   sumSep   = sum over actions of positions stored when that action's child is solved alone
//   maxSep   = the largest single action
//   bound(W) = shared / max(maxSep, sumSep / W)   upper bound on the speed-up with W workers (ignores communication)
const fs = require('fs'), path = require('path'); const C = require('./common.js'); const E = C.E, R = C.R; const M = require('./exact3.js');
const Ns = process.argv[2].split(',').map(Number), n = +process.argv[3] || 8; const X = M.createExact(R, { logCap: 25, wasm: false }), Y = M.createExact(R, { logCap: 25, wasm: false });
const all = C.loadPositions(path.join(__dirname, '../positions/dev200_expect1.txt')); const out = {};
for (const N of Ns) {
  const rows = [];
  for (const p of all.filter((p) => p.N === N).slice(0, n)) {
    const st = C.toState(p); X.clear(); const ch = X.choose(st, p.cur); const shared = X.states(); const sep = [];
    for (const a of ch.scores) { const c = E.cloneGame(st); E.applyMove(R, c, p.cur, { stay: a.stay, col: a.col }); Y.clear(); Y.value(c); sep.push(Y.states()); }
    const sum = sep.reduce((x, y) => x + y, 0), mx = Math.max(...sep);
    rows.push({ shared, actions: sep.length, sumSep: sum, maxSep: mx, redundancy: sum / shared, bound4: shared / Math.max(mx, sum / 4), bound8: shared / Math.max(mx, sum / 8) });
  }
  const med = (k) => { const s = rows.map((r) => r[k]).sort((a, b) => a - b); return s[s.length >> 1]; };
  out[N] = { n: rows.length, medianActions: med('actions'), medianRedundancy: +med('redundancy').toFixed(2), medianBound4: +med('bound4').toFixed(2), medianBound8: +med('bound8').toFixed(2) };
  console.log(N, JSON.stringify(out[N]));
}
fs.writeFileSync(path.join(__dirname, '../results/parallel_est.json'), JSON.stringify(out, null, 1));
