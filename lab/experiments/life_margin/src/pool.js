'use strict';
// Persistent worker pool: evaluate(spec, seedStart, count, opts) -> per-game results in seed order.
const { Worker, isMainThread, parentPort } = require('worker_threads');
const os = require('os');

if (!isMainThread) {
  const E = require('./engine.js');
  const { createPolicy } = require('./policies.js');
  parentPort.on('message', ({ id, spec, seeds, horizon, config }) => {
    const rules = config ? E.compile(config) : E.DEFAULT_RULES;
    const pol = createPolicy(rules, spec);
    const out = seeds.map((s) => {
      const r = E.playGame(rules, pol, s, { horizon: horizon || Infinity, timing: true });
      return [r.score, r.busts, r.reason === 'busts' ? 1 : 0, r.ms, r.moves, r.counts.s21 + r.counts.s777 + r.counts.s521];
    });
    parentPort.postMessage({ id, out });
  });
} else {
  const N = Math.max(1, Math.min(os.cpus().length - 1, 14));
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
      workers[wi].postMessage({ id, spec, seeds, horizon: opts.horizon, config: opts.config });
    })));
    const games = new Array(count);
    for (let i = 0; i < count; i++) games[i] = res[i % N][Math.floor(i / N)];
    return games;
  }
  function stats(games) {
    const s = games.map((g) => g[0]).sort((a, b) => a - b), n = s.length;
    const q = (p) => s[Math.min(n - 1, Math.floor(p * n))];
    const mean = s.reduce((a, b) => a + b, 0) / n;
    const moves = games.reduce((a, g) => a + g[4], 0);
    return {
      n, mean, median: q(0.5), p5: q(0.05), p95: q(0.95),
      zeroBust: games.filter((g) => g[1] === 0).length / n, bustOut: games.filter((g) => g[2]).length / n,
      msPerMove: games.reduce((a, g) => a + g[3], 0) / moves, clears21: games.reduce((a, g) => a + g[5], 0) / n,
      cards: moves / n,
    };
  }
  // paired difference a - b: mean and 95% CI half-width
  function paired(a, b) {
    const n = a.length; let m = 0; const d = a.map((g, i) => g[0] - b[i][0]);
    for (const x of d) m += x; m /= n; let v = 0; for (const x of d) v += (x - m) * (x - m); v /= n - 1;
    return { mean: m, ci: 1.96 * Math.sqrt(v / n) };
  }
  function close() { if (workers) workers.forEach((w) => w.terminate()); workers = null; }
  module.exports = { evaluate, stats, paired, close, N };
}
