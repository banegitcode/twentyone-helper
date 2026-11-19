'use strict';
// node src/y_timing.js <specs.json> <seedStart> <games>   single-thread per-move time (same spec format as y_backtest.js)
const fs = require('fs'); const E = require('./engine.js'); const { createPolicy } = require('./y_policies.js'); const R = E.DEFAULT_RULES;
const shipped = JSON.parse(fs.readFileSync(__dirname + '/../results/shipped_policies.json'))['52'];
const sub = (o) => {
  if (o === '$shipped') return shipped;
  if (typeof o === 'string' && o.startsWith('$nn:')) return JSON.parse(fs.readFileSync(o.slice(4)));
  if (o && typeof o === 'object' && !Array.isArray(o)) { let r = {}; if (o.$extend) r = Object.assign({}, sub(o.$extend)); for (const k of Object.keys(o)) if (k !== '$extend') { if (o[k] === null) delete r[k]; else r[k] = sub(o[k]); } return r; }
  return o;
};
const specs = JSON.parse(fs.readFileSync(process.argv[2])), s0 = +process.argv[3], n = +process.argv[4];
for (const { name, spec } of specs) {
  const pol = createPolicy(R, sub(spec)), ts = []; let tot = 0, score = 0;
  for (let s = 0; s < n; s++) {
    const deck = E.shuffledDeck(s0 + s), st = E.newGame(R); if (pol.reset) pol.reset(); let i = 0;
    while (!st.over) { const v = deck[i++], t = performance.now(), m = pol.choose(st, v), d = performance.now() - t; ts.push(d); tot += d; E.applyMove(R, st, v, m); }
    score += st.score;
  }
  ts.sort((a, b) => a - b); const q = (p) => ts[Math.min(ts.length - 1, Math.floor(p * ts.length))];
  console.log(name.padEnd(30), 'avg score', (score / n).toFixed(1), 'moves', ts.length, 'ms/move mean', (tot / ts.length).toFixed(1), 'p50', q(0.5).toFixed(1), 'p99', q(0.99).toFixed(1), 'max', ts[ts.length - 1].toFixed(1));
}
