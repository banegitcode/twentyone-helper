'use strict';
// node src/x_egtime.js <K> [games=200]  time of the first exact move (x_exact) when K cards remain, shipped play before it
const fs = require('fs'); const E = require('./engine.js'); const { createExact } = require('./exact.js'); const R = E.DEFAULT_RULES;
const K = +process.argv[2], n = +process.argv[3] || 200;
const ship = JSON.parse(fs.readFileSync(__dirname + '/../results/shipped_policies.json'))['52'];
const pol = E.createSearcher(R, Object.assign({}, ship, { deepen: null })), X = createExact(R, { logCap: +process.argv[4] || 21 });
const ts = [], sts = [];
for (let s = 1; s <= n; s++) {
  const deck = E.shuffledDeck(1510000 + s), st = E.newGame(R); pol.reset(); X.clear(); let i = 0;
  while (!st.over) {
    const v = deck[i++]; let m;
    if (st.rem === K) { const t = performance.now(); m = X.choose(st, v); ts.push(performance.now() - t); sts.push(X.states()); break; }
    m = pol.choose(st, v); E.applyMove(R, st, v, m);
  }
}
ts.sort((a, b) => a - b); sts.sort((a, b) => a - b); const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
console.log('K', K, 'n', ts.length, 'first exact move ms: mean', (ts.reduce((a, b) => a + b, 0) / ts.length).toFixed(1), 'median', q(ts, 0.5).toFixed(1), 'p90', q(ts, 0.9).toFixed(1), 'p99', q(ts, 0.99).toFixed(1), 'max', ts[ts.length - 1].toFixed(1), '| states median', q(sts, 0.5), 'max', sts[sts.length - 1]);
