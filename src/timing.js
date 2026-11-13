'use strict';
// Single-threaded per-move timing: node src/timing.js <specs.json> [games] [horizon]  -> mean / p99 / max ms per move
const fs = require('fs'); const E = require('./engine.js'); const { createPolicy } = require('./policies.js'); const R = E.DEFAULT_RULES;
const specs = JSON.parse(fs.readFileSync(process.argv[2])); const n = +process.argv[3] || 200, hz = +process.argv[4] || Infinity; const out = {};
for (const { name, spec, timeGames } of specs) {
  const pol = createPolicy(R, spec); const t = []; const g = Math.min(n, timeGames || n);
  for (let s = 0; s <= g; s++) {
    const deck = E.shuffledDeck(3000000 + s), st = E.newGame(R, { horizon: hz }); pol.reset(); let i = 0;
    while (!st.over) { const v = deck[i++]; const t0 = performance.now(); const m = pol.choose(st, v); if (s > 0) t.push(performance.now() - t0); E.applyMove(R, st, v, m); }
  }
  t.sort((a, b) => a - b);
  out[name] = { mean: t.reduce((a, b) => a + b, 0) / t.length, p99: t[Math.floor(0.99 * (t.length - 1))], max: t[t.length - 1], moves: t.length };
  console.log(name.padEnd(34), 'mean', out[name].mean.toFixed(3), 'p99', out[name].p99.toFixed(2), 'max', out[name].max.toFixed(2), 'ms');
}
if (process.argv[5]) fs.writeFileSync(process.argv[5], JSON.stringify(out, null, 1));
