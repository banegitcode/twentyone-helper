'use strict';
// In-process replay of dev200 games g0..g1-1 in ONE process (like a bench worker chunk), printing per-game CPU and any move slower than 3 s.
// usage: node tests/replay_time.js "<params after midsearch:>" g0 g1
const fs = require('fs'), path = require('path');
const C = require('../js/common.js'), E = C.E, R = C.R, { createMidPolicy } = require('../js/policy.js');
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../engine/twentyone-solver/results/shipped_policies.json'), 'utf8'))['52']; base.deepen.budgetMs = 0;
const pol = createMidPolicy(R, base, 'midsearch:' + process.argv[2]), g0 = +process.argv[3], g1 = +process.argv[4];
const lines = fs.readFileSync(path.join(__dirname, '../../../bench/shuffles/dev200.txt'), 'utf8').trim().split('\n');
for (let g = g0; g < g1; g++) {
  const vals = lines[g].trim().split(/\s+/).map(Number).map((c) => { const r = c % 13; return r === 0 ? 1 : r >= 9 ? 10 : r + 1; });
  const st = E.newGame(R); pol.reset(); let tot = 0;
  for (let i = 0; i < 52 && !st.over; i++) {
    const v = vals[i], u0 = process.cpuUsage(), t0 = Date.now(); const m = pol.choose(st, v); const u = process.cpuUsage(u0), ms = (u.user + u.system) / 1000; tot += ms;
    if (ms > 3000) console.log(`  game ${g} card ${i} rem ${st.rem} move ${ms.toFixed(0)} ms cpu (${Date.now() - t0} wall)`);
    E.applyMove(R, st, v, m);
  }
  console.log(`game ${g} score ${st.score}+bonus cpu ${(tot / 1000).toFixed(1)} s`);
}
