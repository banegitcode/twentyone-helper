'use strict';
// node src/x_reduced.js <specs.json> <seedStart> <games> <out.json> ['<cfg json>'] [threads=6] [logCap=25]
// Reduced game (default: one copy of each of the 13 ranks = 13 cards, 4 columns, all other rules unchanged), solved
// EXACTLY. Each policy plays the same shuffles; every move is scored against the exact optimum, so
// (optimal expected score) - (policy expected score) = mean summed regret, measured with little noise.
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs'); const E = require('./engine.js');
if (!isMainThread) {
  const { createExact } = require('./exact.js'); const { createPolicy } = require('./x_policies.js');
  const { specs, seeds, cfg, logCap } = workerData, R = E.compile(cfg), X = createExact(R, { logCap });
  const vstar = X.value(E.newGame(R));
  const out = specs.map(({ spec }) => {
    const pol = createPolicy(R, spec);
    return seeds.map((seed) => {
      const deck = E.shuffledDeck(seed, R), st = E.newGame(R); if (pol.reset) pol.reset(); let i = 0, reg = 0, wrong = 0;
      while (!st.over) {
        const v = deck[i++], m = pol.choose(st, v), q = X.q(st, v); let best = -Infinity, mine = 0;
        for (const a of q) { if (a.value > best) best = a.value; if (a.stay === m.stay && a.col === m.col) mine = a.value; }
        reg += best - mine; if (best - mine > 0.01) wrong++;
        E.applyMove(R, st, v, m);
      }
      return [st.score, reg, wrong, st.played];
    });
  });
  parentPort.postMessage({ vstar, states: X.states(), out });
} else {
  const [file, s0, games, outF] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5]];
  const cfg = process.argv[6] && process.argv[6] !== '-' ? JSON.parse(process.argv[6]) : { copiesPerRank: 1 }, T = +process.argv[7] || 6, logCap = +process.argv[8] || 25;
  const specs = JSON.parse(fs.readFileSync(file));
  const chunks = Array.from({ length: T }, () => []); for (let i = 0; i < games; i++) chunks[i % T].push(s0 + i);
  Promise.all(chunks.map((seeds) => new Promise((res, rej) => { const w = new Worker(__filename, { workerData: { specs, seeds, cfg, logCap } }); w.on('message', res); w.on('error', rej); }))).then((parts) => {
    const vstar = parts[0].vstar; console.log('reduced game', JSON.stringify(cfg), 'exact optimum', vstar.toFixed(1), 'positions solved', parts[0].states);
    const rows = specs.map(({ name }, k) => {
      const g = [].concat(...parts.map((p) => p.out[k])), n = g.length, mean = (f) => g.reduce((a, x) => a + f(x), 0) / n;
      const reg = mean((x) => x[1]), sd = Math.sqrt(g.reduce((a, x) => a + (x[1] - reg) * (x[1] - reg), 0) / (n - 1));
      const sc = mean((x) => x[0]), sds = Math.sqrt(g.reduce((a, x) => a + (x[0] - sc) * (x[0] - sc), 0) / (n - 1));
      const row = { name, n, gap: reg, gapCi: 1.96 * sd / Math.sqrt(n), gapPct: 100 * reg / vstar, expectedScore: vstar - reg, realisedMean: sc, realisedCi: 1.96 * sds / Math.sqrt(n), wrongMoveRate: mean((x) => x[2]) / mean((x) => x[3]) };
      console.log(name.padEnd(44), 'n=' + n, 'gap to optimum', reg.toFixed(1), '±', row.gapCi.toFixed(1), '(' + row.gapPct.toFixed(2) + '%)', 'expected', row.expectedScore.toFixed(0), 'realised', sc.toFixed(0), '±', row.realisedCi.toFixed(0), 'wrong moves', (100 * row.wrongMoveRate).toFixed(1) + '%');
      return row;
    });
    fs.writeFileSync(outF, JSON.stringify({ cfg, vstar, seedStart: s0, games, rows }, null, 1));
  });
}
