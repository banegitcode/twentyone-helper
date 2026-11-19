'use strict';
// Cost / change-rate probe on champion trajectories (dev200 games g0..g1-1): at each rem >= 17 position, run msearch with the given cfg and report
// NN evals and CPU ms of the extra pass, and how often it changes the champion's move.  usage: node tests/probe.js "xd=3,xk=3" [g0=0] [g1=5]
const fs = require('fs'), path = require('path');
const C = require('../js/common.js'), E = C.E, R = C.R;
const MS = require('../js/msearch.js'), { loadNet, parseConfig } = require('../js/policy.js');
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../engine/twentyone-solver/results/shipped_policies.json'), 'utf8'))['52'];
base.deepen.budgetMs = 0; const spec = JSON.parse(JSON.stringify(base)); delete spec.exact;
const nn = loadNet('ship_nn'); const champ = E.createSearcher(R, Object.assign({}, spec, { nn }));
const cfgs = process.argv[2].split(';'), g0 = +(process.argv[3] || 0), g1 = +(process.argv[4] || 5);
const lines = fs.readFileSync(path.join(__dirname, '../../../bench/shuffles/dev200.txt'), 'utf8').trim().split('\n');
for (const cs of cfgs) {
  const p = parseConfig('midsearch:' + cs).p; const mine = MS.create(R, null, Object.assign({ nnLeaf: nn, dm: 150, dk: 3, dd: 2, depth: 1 }, p));
  const ev = [], ms = []; let scoped = 0, pos = 0, changed = 0, multi = 0, aborted = 0, baseMs = 0;
  for (let g = g0; g < g1; g++) {
    const codes = lines[g].trim().split(/\s+/).map(Number), vals = codes.map((c) => { const r = c % 13; return r === 0 ? 1 : r >= 9 ? 10 : r + 1; });
    const st = E.newGame(R); champ.reset(); mine.reset();
    for (let i = 0; i < 52 && !st.over; i++) {
      const v = vals[i];
      if (st.rem >= 17) {
        const t0 = process.cpuUsage(); const a = champ.choose(st, v); const t1 = process.cpuUsage(t0); baseMs += (t1.user + t1.system) / 1000;
        mine.game(); const u0 = process.cpuUsage(); const b = mine.choose(st, v); const u = process.cpuUsage(u0); const s = mine.game(); pos++;
        ev.push(s.extraEvals); ms.push((u.user + u.system) / 1000); if (s.extraMoves) multi++; scoped += s.inScope; if (s.extraAborted) aborted++;
        if (a.stay !== b.stay || a.col !== b.col) changed++;
        E.applyMove(R, st, v, a);
      } else E.applyMove(R, st, v, champ.choose(st, v));
    }
  }
  const sum = (x) => x.reduce((s, y) => s + y, 0), q = (x, f) => x.slice().sort((a, b) => a - b)[Math.min(x.length - 1, Math.floor(f * x.length))];
  console.log(JSON.stringify({ cfg: cs, positions: pos, inScope: scoped, extraPassPositions: multi, aborted, changedMove: changed, evalsMean: Math.round(sum(ev) / pos), evalsP95: q(ev, .95), evalsMax: Math.max(...ev), msMean: +(sum(ms) / pos).toFixed(1), msP95: +q(ms, .95).toFixed(1), msMax: +Math.max(...ms).toFixed(0), champMsMean: +(baseMs / pos).toFixed(1), perGameMsMean: +(sum(ms) / (g1 - g0)).toFixed(0) }));
}
