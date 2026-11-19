// node time_exact.js  : (1) validate exact2 against my independent Rust exact values at <=6 cards, (2) time exact solves by cards left
const L = require('./lib.js'); const fs = require('fs');
const X = L.exactSolver(23);
const csv = new Map(); for (const l of fs.readFileSync(L.ROOT + 'experiments/theory_sim/data/eg_le6.csv', 'utf8').split('\n').slice(1)) { if (!l) continue; const f = l.split(','); csv.set(f[0] + ':' + f[1], f.map(Number)); }
let n = 0, maxd = 0; const byRem = {};
for (const l of fs.readFileSync(L.ROOT + 'experiments/theory_sim/data/all.jsonl', 'utf8').split('\n')) {
  if (!l.startsWith('{"t":"pos"')) continue; const d = JSON.parse(l); const key = d.seed + ':' + d.rem;
  const t0 = process.hrtime.bigint(); const st = L.mkState({ cols: d.cols, deck: [0].concat(d.deck), rem: d.rem, busts: d.busts, stays: d.stays, prev: d.prev });
  if (d.rem <= 6 && csv.has(key)) { if (n < 600) { const v = X.value(st); const r = csv.get(key); const mine = r[5 + d.busts]; maxd = Math.max(maxd, Math.abs(v - mine)); n++; } continue; }
  if (d.rem >= 8 && d.rem <= 18) { const k = d.rem; const a = byRem[k] || (byRem[k] = { n: 0, ms: [] }); if (a.n < 4) { X.clear(); const t1 = process.hrtime.bigint(); let ok = true; try { X.value(st); } catch (e) { ok = false; } a.ms.push(ok ? Number(process.hrtime.bigint() - t1) / 1e6 : -1); a.n++; console.log('rem', k, a.ms[a.ms.length-1].toFixed(0), 'ms states', X.states()); } }
}
console.log('validated positions', n, 'max |JS exact2 - Rust exact| =', maxd.toFixed(4));
for (const k of Object.keys(byRem)) console.log('rem', k, 'ms/solve', byRem[k].ms.map((x) => x.toFixed(0)).join(' '), 'table states', X.states());
