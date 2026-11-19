'use strict';
// node src/x_timing.js <specs.json> <seedStart> <games>   single-thread per-move time for each spec (x_policies types allowed)
const fs = require('fs'); const E = require('./engine.js'); const { createPolicy } = require('./x_policies.js'); const R = E.DEFAULT_RULES;
const specs = JSON.parse(fs.readFileSync(process.argv[2])), s0 = +process.argv[3], n = +process.argv[4];
for (const { name, spec } of specs) {
  const pol = createPolicy(R, spec), ts = []; let tot = 0;
  for (let s = 0; s < n; s++) {
    const deck = E.shuffledDeck(s0 + s), st = E.newGame(R); if (pol.reset) pol.reset(); let i = 0;
    while (!st.over) { const v = deck[i++], t = performance.now(), m = pol.choose(st, v), d = performance.now() - t; if (s > 0) { ts.push(d); tot += d; } E.applyMove(R, st, v, m); }
  }
  ts.sort((a, b) => a - b); const q = (p) => ts[Math.min(ts.length - 1, Math.floor(p * ts.length))];
  console.log(name.padEnd(34), 'moves', ts.length, 'ms/move mean', (tot / ts.length).toFixed(1), 'p50', q(0.5).toFixed(1), 'p99', q(0.99).toFixed(1), 'p99.9', q(0.999).toFixed(1), 'max', ts[ts.length - 1].toFixed(1), '| >60ms', (100 * ts.filter((x) => x > 60).length / ts.length).toFixed(2) + '%');
}
