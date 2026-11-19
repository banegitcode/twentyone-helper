// Validate the engine's exact2 solver against my independent Rust exact expectimax (experiments/theory_sim, eg_le6.csv; rem<=6).
const L = require('./lib.js'); const fs = require('fs'); const X = L.exactSolver(20);
const csv = new Map(); for (const l of fs.readFileSync(L.ROOT + 'experiments/theory_sim/data/eg_le6.csv', 'utf8').split('\n').slice(1)) { if (!l) continue; const f = l.split(','); csv.set(f[0] + ':' + f[1], f.map(Number)); }
let n = 0, maxd = 0, sum = 0;
for (const l of fs.readFileSync(L.ROOT + 'experiments/theory_sim/data/all.jsonl', 'utf8').split('\n')) {
  if (!l.startsWith('{"t":"pos"')) continue; const d = JSON.parse(l); if (d.rem > 6 || !csv.has(d.seed + ':' + d.rem)) continue;
  const st = L.mkState({ cols: d.cols, deck: [0].concat(d.deck), rem: d.rem, busts: d.busts, stays: d.stays, prev: d.prev });
  const v = X.value(st), r = csv.get(d.seed + ':' + d.rem)[5 + d.busts]; maxd = Math.max(maxd, Math.abs(v - r)); sum += Math.abs(v - r); n++;
}
console.log('positions', n, 'max |engine exact2 - my Rust exact| =', maxd.toFixed(4), 'mean abs diff', (sum / n).toFixed(5));
