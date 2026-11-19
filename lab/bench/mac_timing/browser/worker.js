'use strict';
// Runs the UNMODIFIED adapters (vendor/.../champion_adapter.js, adapter.js) inside a Web Worker through a tiny CommonJS shim
// (require/path/fs/readline/process), so the code under test is exactly what the Node kit runs. Only wall time is available in a browser.
importScripts('../sim.js');
const ROOT = '/k/', BASE = '../vendor/';
const FILES = ['engine/twentyone-solver/src/engine.js', 'engine/twentyone-solver/src/exact.js', 'engine/twentyone-solver/src/exact2.js',
  'engine/twentyone-solver/src/exact2_kernel.wasm.js', 'engine/twentyone-solver/src/policies.js', 'engine/twentyone-solver/src/x_policies.js',
  'engine/twentyone-solver/results/shipped_policies.json', 'experiments/exact-endgame-deeper/adapter.js', 'experiments/exact-endgame-deeper/js/common.js',
  'experiments/exact-endgame-deeper/js/exact3.js', 'experiments/exact-endgame-deeper/js/hybrid.js', 'experiments/exact-endgame-deeper/js/policy_exact3.js',
  'experiments/exact-endgame-deeper/js/pooled.js', 'bench/champion/champion_adapter.js'];
const posix = {
  normalize(p) { const out = []; for (const s of p.split('/')) { if (!s || s === '.') continue; if (s === '..') out.pop(); else out.push(s); } return '/' + out.join('/'); },
  join(...a) { return posix.normalize(a.join('/')); }, dirname(p) { return p.replace(/\/[^/]*$/, '') || '/'; },
};
const src = {}; let cache, lineHandler, lastOut; const tlines = [];
function makeRequire(dir) {
  return function require(name) {
    if (name === 'path') return posix;
    if (name === 'fs') return { readFileSync: (p) => { const k = posix.normalize(p); if (!(k in src)) throw new Error('ENOENT ' + p); return src[k]; }, appendFileSync: (p, t) => { tlines.push(t); }, existsSync: (p) => posix.normalize(p) in src };
    if (name === 'readline') return { createInterface: () => ({ on: (ev, cb) => { if (ev === 'line') lineHandler = cb; } }) };
    let p = name.startsWith('.') ? posix.join(dir, name) : posix.normalize(name);
    if (!(p in src) && (p + '.js') in src) p += '.js';
    if (!(p in src)) throw new Error('Cannot find module ' + name + ' from ' + dir);
    if (cache[p]) return cache[p].exports;
    const m = { exports: {} }; cache[p] = m;
    new Function('require', 'module', 'exports', '__dirname', '__filename', 'process', src[p].replace(/^#!.*/, ''))(makeRequire(posix.dirname(p)), m, m.exports, posix.dirname(p), p, proc);
    return m.exports;
  };
}
let proc;
function boot(adapter, args) {
  cache = {}; lineHandler = null;
  proc = { env: { CHAMPION_DIR: ROOT + 'engine/twentyone-solver' }, argv: ['node', ROOT + adapter, ...args], stdin: {}, stdout: { write: (s) => { lastOut = s; } },
    exit() {}, memoryUsage: () => ({ rss: 0 }), cpuUsage: () => ({ user: 0, system: 0 }) };
  makeRequire(ROOT)(ROOT + adapter);
}
async function run(cfg) {
  postMessage({ type: 'status', text: 'loading files' });
  for (const f of FILES) { const r = await fetch(BASE + f); if (!r.ok) throw new Error('fetch ' + f); src[ROOT + f] = await r.text(); }
  const games = (await (await fetch('../games.json')).json()).games.slice(0, cfg.games);
  const A = cfg.engine === 'shipped52' ? ['bench/champion/champion_adapter.js', ['--config', 'shipped52']] : ['experiments/exact-endgame-deeper/adapter.js', ['--config', 'pooled:16:26:180:wall', '--timelog', '/k/timelog.jsonl']];
  boot(A[0], A[1]);
  for (let gi = 0; gi < games.length; gi++) {
    const g = new Game(games[gi].values); if (gi === 0) lineHandler(JSON.stringify({ type: 'new_game', game: 0, seed: 0 }));
    let wl = 0, maxW = 0, n = 0, pWall = 0;
    while (!g.over) {
      const ob = g.obs(), t0 = performance.now(); lineHandler(JSON.stringify({ type: 'decide', state: ob })); const w = performance.now() - t0;
      const r = JSON.parse(lastOut); wl += w; n++; if (ob.cards_left + 1 <= 16) pWall += w; if (w > maxW) maxW = w; g.step(r.stay === undefined ? null : r.stay, r.place);
      if (n % 4 === 0) await new Promise((r2) => setTimeout(r2, 0));
    }
    // the adapter's own per-game counters (its --timelog) are flushed when the next new_game arrives; no new_game is sent at the start of games > 1
    let solver = null; if (cfg.engine === 'pooled16') { lineHandler(JSON.stringify({ type: 'new_game', game: gi + 1, seed: gi + 1 })); const t = JSON.parse(tlines[tlines.length - 1]); solver = { new_positions: t.newPositions, peak_table_positions: t.peakPositions, solve_ms_solver_clock: t.solveMs, give_up_clock: t.giveUpClock, give_up_memory: t.giveUpMemory }; }
    postMessage({ type: 'game', engine: cfg.engine, game: gi + 1, dev200_line: games[gi].dev200_line, score: g.final, busts: g.busts, decisions: n, think_wall_s: wl / 1000, max_decision_wall_s: maxW / 1000, exact_phase_wall_s: pWall / 1000, solver });
  }
  postMessage({ type: 'done', engine: cfg.engine });
}
onmessage = (e) => run(e.data).catch((err) => postMessage({ type: 'error', text: String(err && err.stack || err) }));
