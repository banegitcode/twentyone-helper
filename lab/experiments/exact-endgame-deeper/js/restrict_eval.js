'use strict';
// node js/restrict_eval.js N1,N2 n   -> results/restrict_eval.json
// Restricted-action exact search (exact3 opts.restrict) vs the full exact search (exact2/exact3 unrestricted, JS kernel), same positions.
// The restricted value IS the true expected score of the restricted policy played to the end of the deck (it is a legal policy),
// so  loss = V_full - V_restricted  is the exact expected number of points lost by playing that restricted policy from the position.
const fs = require('fs'), path = require('path'); const C = require('./common.js'); const M = require('./exact3.js');
const Ns = process.argv[2].split(',').map(Number), n = +process.argv[3], logCap = 25;
const variants = { full: null, noBust: { noBust: true }, greedyScore: { greedyScore: true }, stayForced: { stayForced: true }, 'noBust+stayForced': { noBust: true, stayForced: true }, 'all three': { noBust: true, greedyScore: true, stayForced: true } };
const X = {}; for (const k of Object.keys(variants)) X[k] = M.createExact(C.R, { logCap, wasm: false, restrict: variants[k] || undefined });
const all = C.loadPositions(path.join(__dirname, '../positions/dev200_expect1.txt')); const out = {};
for (const N of Ns) {
  const ps = all.filter((p) => p.N === N).slice(0, n); const acc = {}; for (const k in variants) acc[k] = { states: 0, ms: 0, loss: 0, maxLoss: 0, lossPos: 0 };
  for (const p of ps) {
    const st = C.toState(p); let vf = 0;
    for (const k in variants) {
      const x = X[k]; x.clear(); const t0 = performance.now(); const v = x.value(st); const ms = performance.now() - t0;
      if (k === 'full') vf = v; const a = acc[k]; a.states += x.states(); a.ms += ms; const l = vf - v; a.loss += l; a.maxLoss = Math.max(a.maxLoss, l); if (l > 0.01) a.lossPos++;
    }
  }
  out[N] = {}; for (const k in variants) { const a = acc[k]; out[N][k] = { positions: ps.length, states: a.states, statesVsFull: +(a.states / acc.full.states).toFixed(3), msVsFull: +(a.ms / acc.full.ms).toFixed(3), meanLossPoints: +(a.loss / ps.length).toFixed(3), maxLossPoints: +a.maxLoss.toFixed(2), positionsWithLoss: a.lossPos }; }
  console.log('N', N); console.table(out[N]);
}
fs.writeFileSync(path.join(__dirname, '../results/restrict_eval.json'), JSON.stringify(out, null, 1));
