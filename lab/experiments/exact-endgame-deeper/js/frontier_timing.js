'use strict';
// node js/frontier_timing.js -> results/frontier_timing.json : time of the depth-limited fallback (stand-in evaluator) per move
const fs = require('fs'), path = require('path'); const C = require('./common.js'); const H = require('./hybrid.js');
const ev = H.standInEvaluator(C.R), all = C.loadPositions(path.join(__dirname, '../positions/dev200_expect1.txt')), out = {};
for (const N of [16, 20, 24]) for (const d of [0, 1, 2]) {
  const ps = all.filter((p) => p.N === N).slice(0, 40); const ts = [], nodes = [];
  for (const p of ps) { const st = C.toState(p); const t0 = performance.now(); const r = H.depthLimited(C.R, st, p.cur, ev, d); ts.push(performance.now() - t0); nodes.push(r.nodes); }
  ts.sort((a, b) => a - b); nodes.sort((a, b) => a - b);
  out[N + '/depth' + d] = { positions: ps.length, medianMs: +ts[ts.length >> 1].toFixed(2), maxMs: +ts[ts.length - 1].toFixed(2), medianLeafEvals: nodes[nodes.length >> 1] };
}
console.table(out); fs.writeFileSync(path.join(__dirname, '../results/frontier_timing.json'), JSON.stringify(out, null, 1));
