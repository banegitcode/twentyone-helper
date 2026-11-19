#!/usr/bin/env node
'use strict';
// Timing kit: plays 3 fixed dev200 games with the shipped52 adapter and with pooled:16:26 and prints per-game think time.
//   node run_timing.js                       both engines, 3 games, pooled clock = CPU time (what the bench used)
//   node run_timing.js --engines shipped52   only one (shipped52 | pooled16)
//   node run_timing.js --games 1             first N of the 3 games
//   node run_timing.js --wall                pooled clock = WALL time (pooled:16:26:180:wall) = what a real 180 s game would do
//   node run_timing.js --out results.json    where to write the JSON (default results/<host>_<time>.json)
// Needs only Node >= 16 (no npm install). pooled:16:26 allocates a ~800 MB table: close other heavy apps.
const { spawn } = require('child_process'), path = require('path'), os = require('os'), fs = require('fs'), readline = require('readline');
const { Game } = require('./sim.js');
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const wall = argv.includes('--wall'), nGames = Math.min(3, +arg('games', 3)), which = arg('engines', 'shipped52,pooled16').split(',');
const HOOK = path.join(__dirname, 'cpu_hook.js'), V = path.join(__dirname, 'vendor');
const ENGINES = {
  shipped52: { label: 'shipped52', args: [path.join(V, 'bench/champion/champion_adapter.js'), '--config', 'shipped52'] },
  pooled16: { label: wall ? 'pooled:16:26 (wall clock)' : 'pooled:16:26 (cpu clock)', pooled: true, args: [path.join(V, 'experiments/exact-endgame-deeper/adapter.js'), '--config', wall ? 'pooled:16:26:180:wall' : 'pooled:16:26'] },
};
const games = JSON.parse(fs.readFileSync(path.join(__dirname, 'games.json'), 'utf8')).games.slice(0, nGames);
const hr = () => Number(process.hrtime.bigint()) / 1e6;
const K_EXACT = 16;   // pooled:16:26 solves from the first move with <= 16 cards left (rem = cards_left + 1)
async function runEngine(key) {
  const E = ENGINES[key], tlog = path.join(__dirname, 'results', `.timelog_${key}_${process.pid}.jsonl`);
  fs.mkdirSync(path.dirname(tlog), { recursive: true }); try { fs.unlinkSync(tlog); } catch (e) { /* none */ }
  // the solver's own per-game counters come from the adapter's existing --timelog option (vendor files stay untouched)
  const child = spawn(process.execPath, ['-r', HOOK, ...E.args, ...(E.pooled ? ['--timelog', tlog] : [])], { stdio: ['pipe', 'pipe', 'inherit'], env: Object.assign({}, process.env, { CHAMPION_DIR: path.join(V, 'engine/twentyone-solver') }) });
  const rl = readline.createInterface({ input: child.stdout }); const q = []; let waiter = null;
  rl.on('line', (l) => { if (waiter) { const w = waiter; waiter = null; w(l); } else q.push(l); });
  const next = () => new Promise((res) => (q.length ? res(q.shift()) : (waiter = res)));
  const out = []; let cpuTotal = 0;
  for (let gi = 0; gi < games.length; gi++) {
    const g = new Game(games[gi].values); child.stdin.write(JSON.stringify({ type: 'new_game', game: gi, seed: gi }) + '\n');
    let cpu = 0, wl = 0, maxCpu = 0, nDec = 0, over1 = 0, pCpu = 0, pWall = 0; const actions = [], decCpu = [];
    while (!g.over) {
      const ob = g.obs(), t0 = hr(); child.stdin.write(JSON.stringify({ type: 'decide', state: ob }) + '\n');
      const r = JSON.parse(await next()); const w = hr() - t0, c = r._cpu - r._cpuRecv;
      wl += w; cpu += c; nDec++; if (ob.cards_left + 1 <= K_EXACT) { pCpu += c; pWall += w; } if (c > maxCpu) maxCpu = c; if (c > 1000) over1++; decCpu.push(Math.round(c));
      actions.push([r.stay === undefined ? null : r.stay, r.place]); g.step(r.stay, r.place);
    }
    out.push({ game: gi + 1, dev200_line: games[gi].dev200_line, score: g.final, busts: g.busts, decisions: nDec, think_cpu_s: cpu / 1000, think_wall_s: wl / 1000, max_decision_cpu_s: maxCpu / 1000, decisions_over_1s: over1, exact_phase_cpu_s: pCpu / 1000, exact_phase_wall_s: pWall / 1000, actions, decision_cpu_ms: decCpu });
    console.log(`  ${E.label}  game ${gi + 1} (dev200 line ${games[gi].dev200_line}): score ${g.final}  busts ${g.busts}  think CPU ${(cpu / 1000).toFixed(1)} s  wall ${(wl / 1000).toFixed(1)} s  max decision CPU ${(maxCpu / 1000).toFixed(1)} s  (${nDec} decisions)`);
  }
  child.stdin.write(JSON.stringify({ type: 'quit' }) + '\n'); await new Promise((r) => child.on('close', r));
  if (E.pooled) {
    const tl = fs.existsSync(tlog) ? fs.readFileSync(tlog, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    out.forEach((g, i) => { const t = tl[i]; if (!t) return; g.solver = { new_positions: t.newPositions, peak_table_positions: t.peakPositions, solve_ms_solver_clock: t.solveMs, exact_moves: t.exactMoves, give_up_clock: t.giveUpClock, give_up_memory: t.giveUpMemory };
      g.rate_new_positions_per_cpu_s = t.newPositions / g.exact_phase_cpu_s; g.rate_new_positions_per_wall_s = t.newPositions / g.exact_phase_wall_s; g.rate_new_positions_per_solver_clock_s = t.newPositions / (t.solveMs / 1000);
      console.log(`  ${E.label}  game ${g.game}: new table positions ${(t.newPositions / 1e6).toFixed(2)} M (peak table ${(t.peakPositions / 1e6).toFixed(2)} M) | rate ${(g.rate_new_positions_per_cpu_s / 1e6).toFixed(2)} M pos/CPU-s, ${(g.rate_new_positions_per_wall_s / 1e6).toFixed(2)} M pos/wall-s (exact phase: CPU ${g.exact_phase_cpu_s.toFixed(1)} s, wall ${g.exact_phase_wall_s.toFixed(1)} s)`); });
    try { fs.unlinkSync(tlog); } catch (e) { /* ignore */ }
  }
  return { engine: E.label, games: out };
}
(async () => {
  const cpus = os.cpus(); const meta = { host: os.hostname(), platform: os.platform() + ' ' + os.arch() + ' ' + os.release(), cpu: cpus[0] && cpus[0].model, cores: cpus.length, loadavg: os.loadavg(), node: process.version, totalMemGB: +(os.totalmem() / 2 ** 30).toFixed(1), freeMemGB: +(os.freemem() / 2 ** 30).toFixed(1), started: new Date().toString() };
  console.log('Timing kit on', meta.host, '|', meta.cpu, 'x' + meta.cores, '| node', meta.node, '| load', meta.loadavg.map((x) => x.toFixed(1)).join(' '), '| free mem', meta.freeMemGB, 'GB');
  const res = [];
  for (const k of which) { console.log(`\n== ${ENGINES[k].label}`); res.push(await runEngine(k)); }
  console.log('\nSummary (think time per game, seconds; CPU = process CPU of the engine, wall = elapsed incl. time-slicing)');
  console.log('engine'.padEnd(28) + 'game  score  think_cpu  think_wall  max_dec_cpu');
  for (const r of res) for (const g of r.games) console.log(r.engine.padEnd(28) + String(g.game).padEnd(6) + String(g.score).padEnd(7) + g.think_cpu_s.toFixed(1).padEnd(11) + g.think_wall_s.toFixed(1).padEnd(12) + g.max_decision_cpu_s.toFixed(1));
  for (const r of res) { const gs = r.games.filter((g) => g.solver); if (!gs.length) continue; const P = gs.reduce((a, g) => a + g.solver.new_positions, 0), C = gs.reduce((a, g) => a + g.exact_phase_cpu_s, 0), W = gs.reduce((a, g) => a + g.exact_phase_wall_s, 0);
    r.overall = { new_positions: P, exact_phase_cpu_s: C, exact_phase_wall_s: W, positions_per_cpu_s: P / C, positions_per_wall_s: P / W };
    console.log(`\n${r.engine}: exact-solver table positions solved per second, overall (${gs.length} games, ${(P / 1e6).toFixed(2)} M new positions): ${(P / C / 1e6).toFixed(2)} M/CPU-s, ${(P / W / 1e6).toFixed(2)} M/wall-s`);
    console.log('  per game (M positions/CPU-s | /wall-s): ' + gs.map((g) => `g${g.game} ${(g.rate_new_positions_per_cpu_s / 1e6).toFixed(2)} | ${(g.rate_new_positions_per_wall_s / 1e6).toFixed(2)}`).join('; ')); }
  for (const r of res) { const c = r.games.map((g) => g.think_cpu_s); console.log(`${r.engine}: mean think CPU ${(c.reduce((a, b) => a + b, 0) / c.length).toFixed(1)} s, max ${Math.max(...c).toFixed(1)} s (budget for a real game: 150 s target, 180 s limit)`); }
  const file = arg('out', path.join(__dirname, 'results', `${os.hostname().replace(/\W+/g, '_')}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`));
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ meta, wall, results: res }, null, 1)); console.log('\nwrote', file);
})();
