'use strict';
// Worker pool like x_pool.js, with y_policies and streak statistics. Games are always SCORED under `config` (default
// rules when absent); a policy may search under other rules via the 'srules' type in y_policies.js.
// per game: [score, busts, bustOut, ms, moves, clears, streakBonusPoints, runsOf4plus, maxMoveMs]
const { Worker, isMainThread, parentPort } = require('worker_threads');
if (!isMainThread) {
  const E = require('./engine.js');
  const { createPolicy } = require('./s_policies.js');
  parentPort.on('message', ({ id, spec, seeds, config }) => {
    const R = config ? E.compile(config) : E.DEFAULT_RULES;
    const pol = createPolicy(R, spec);
    const out = seeds.map((s) => {
      const deck = E.shuffledDeck(s, R), st = E.newGame(R); if (pol.reset) pol.reset();
      let i = 0, ms = 0, mx = 0, run = 0, n4 = 0, sbp = 0, clears = 0;
      while (!st.over) {
        const v = deck[i++], t0 = performance.now(), m = pol.choose(st, v), dt = performance.now() - t0; ms += dt; if (dt > mx) mx = dt;
        const ev = E.applyMove(R, st, v, m);
        if (ev.pts > 0) { run++; clears++; sbp += ev.streak; if (run === 4) n4++; } else run = 0;
      }
      return [st.score, st.busts, st.reason === 'busts' ? 1 : 0, ms, i, clears, sbp, n4, mx];
    });
    parentPort.postMessage({ id, out });
  });
} else {
  const N = +process.env.Y_N || 11;
  let workers = null, nextId = 0; const pending = new Map();
  function start() {
    workers = Array.from({ length: N }, () => {
      const w = new Worker(__filename);
      w.on('message', ({ id, out }) => { pending.get(id)(out); pending.delete(id); });
      w.on('error', (e) => { console.error('worker died', e); process.exit(1); });
      return w;
    });
  }
  async function evaluate(spec, seedStart, count, opts) {
    if (!workers) start(); opts = opts || {};
    const chunks = Array.from({ length: N }, () => []);
    for (let i = 0; i < count; i++) chunks[i % N].push(seedStart + i);
    const res = await Promise.all(chunks.map((seeds, wi) => new Promise((resolve) => {
      const id = nextId++; pending.set(id, resolve);
      workers[wi].postMessage({ id, spec, seeds, config: opts.config });
    })));
    const games = new Array(count);
    for (let i = 0; i < count; i++) games[i] = res[i % N][Math.floor(i / N)];
    return games;
  }
  function stats(games) {
    const s = games.map((g) => g[0]).sort((a, b) => a - b), n = s.length, q = (p) => s[Math.min(n - 1, Math.floor(p * n))];
    const sum = (k) => games.reduce((a, g) => a + g[k], 0), moves = sum(4);
    return {
      n, mean: sum(0) / n, median: q(0.5), p5: q(0.05), p95: q(0.95), zeroBust: games.filter((g) => g[1] === 0).length / n,
      bustOut: sum(2) / n, msPerMove: sum(3) / moves, maxMs: Math.max(...games.map((g) => g[8])), clears: sum(5) / n,
      streakPts: sum(6) / n, runs4: sum(7) / n, twoRuns4: games.filter((g) => g[7] >= 2).length / n, oneRun4: games.filter((g) => g[7] >= 1).length / n,
    };
  }
  function paired(a, b, k) {
    k = k || 0; const n = a.length; let m = 0; const d = a.map((g, i) => g[k] - b[i][k]);
    for (const x of d) m += x; m /= n; let v = 0; for (const x of d) v += (x - m) * (x - m); v /= n - 1;
    return { mean: m, ci: 1.96 * Math.sqrt(v / n) };
  }
  function close() { if (workers) workers.forEach((w) => w.terminate()); workers = null; }
  module.exports = { evaluate, stats, paired, close, N };
}
