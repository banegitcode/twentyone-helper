#!/usr/bin/env node
'use strict';
// Play dev200 games [g0,g1) with frozen deeper:16 or guarded deeper16g. Writes JSONL + a summary.
// usage: node tests/parity_play.js frozen|guard|guardcpu [g0=0] [g1=20] [outfile]
const fs = require('fs'), path = require('path');
const C = require('../js/common.js'), E = C.E, R = C.R;
const D = require('../js/defaults.js');
const which = process.argv[2];
const g0 = +(process.argv[3] || 0), g1 = +(process.argv[4] || 20);
const out = process.argv[5] || path.join(__dirname, '..', 'results', `parity_${which}_${g0}_${g1 - 1}.jsonl`);

let policy, label, visitCap = 0, cpuMs = 0;
if (which === 'frozen') {
  const P = require('/workspace/21lab/bench/frozen/exact-endgame-deeper@90c2d73f938b/experiments/exact-endgame-deeper/js/policy_exact3.js');
  const base = JSON.parse(fs.readFileSync(path.join(C.ENGINE_SRC, '..', 'results', 'shipped_policies.json'), 'utf8'))['52'];
  const spec = JSON.parse(JSON.stringify(base)); delete spec.exact; if (spec.deepen) spec.deepen.budgetMs = 0;
  spec.exact3 = { xK: 16, budget: 3200000, logCap: 25 };
  policy = P.createPolicy(R, spec);
  label = 'deeper:16';
} else if (which === 'guard' || which === 'guardcpu') {
  const { createPolicy } = require('../js/policy.js');
  const base = JSON.parse(fs.readFileSync(path.join(C.ENGINE_SRC, '..', 'results', 'shipped_policies.json'), 'utf8'))['52'];
  const spec = JSON.parse(JSON.stringify(base)); delete spec.exact; if (spec.deepen) spec.deepen.budgetMs = 0;
  visitCap = D.VISIT_CAP; cpuMs = which === 'guardcpu' ? D.CPU_MS_MAC : 0;
  spec.exact3g = { xK: D.XK, budget: D.BUDGET, logCap: D.LOGCAP, visitCap, cpuMs };
  policy = createPolicy(R, spec);
  label = which === 'guardcpu' ? `deeper16g:${visitCap}:cpu=${cpuMs}` : `deeper16g:${visitCap}`;
} else throw new Error('which = frozen|guard|guardcpu');

const lines = fs.readFileSync(path.join(__dirname, '../../../bench/shuffles/dev200.txt'), 'utf8').trim().split('\n');
const fh = fs.openSync(out, 'w');
const games = [];
for (let g = g0; g < g1; g++) {
  const seed = 1 * 1000003 + g; // harness seed for set index g with --seed 1
  const vals = lines[g].trim().split(/\s+/).map(Number).map((c) => { const r = c % 13; return r === 0 ? 1 : r >= 9 ? 10 : r + 1; });
  const st = E.newGame(R); if (policy.reset) policy.reset();
  const u0 = process.cpuUsage();
  const moves = [];
  let maxMove = 0, visitTrips = 0, cpuTrips = 0, budgetAborts = 0, nDec = 0;
  for (let i = 0; i < 52 && !st.over; i++) {
    const v = vals[i]; nDec++;
    const t0 = process.cpuUsage();
    const m = policy.choose(st, v);
    const dt = (() => { const u = process.cpuUsage(t0); return (u.user + u.system) / 1000; })();
    if (dt > maxMove) maxMove = dt;
    const lm = policy.lastExact || null;
    if (lm && lm.aborted && lm.reason === 'visit') visitTrips++;
    else if (lm && lm.aborted && lm.reason === 'cpu') cpuTrips++;
    else if (lm && lm.aborted && lm.reason === 'budget') budgetAborts++;
    moves.push({ move: i + 1, rem: st.rem, stay: m.stay, col: m.col, exact: !!(m && m.exact),
      visits: lm ? lm.visits : 0, aborted: lm ? lm.aborted : false, reason: lm ? lm.reason : null, cpuMs: +dt.toFixed(3) });
    E.applyMove(R, st, v, m);
  }
  const cpu = (() => { const u = process.cpuUsage(u0); return (u.user + u.system) / 1000; })();
  const row = { game: g, seed, config: label, score: st.score, busts: st.busts, perfect: st.busts === 0 ? 1 : 0,
    ncards: nDec, reason: st.reason, cpuMs: +cpu.toFixed(1), maxMoveMs: +maxMove.toFixed(1),
    visitTrips, cpuTrips, budgetAborts, visitCap, cpuMsCap: cpuMs, moves };
  fs.writeSync(fh, JSON.stringify(row) + '\n');
  games.push(row);
  console.log(JSON.stringify({ game: g, seed, score: st.score, busts: st.busts, ncards: nDec, cpuMs: row.cpuMs, maxMoveMs: row.maxMoveMs, visitTrips, cpuTrips, budgetAborts }));
}
fs.closeSync(fh);
const sum = (a) => a.reduce((s, x) => s + x, 0);
const summary = {
  which, label, g0, g1: g1 - 1, n: games.length, out,
  visitTrips: sum(games.map((g) => g.visitTrips)),
  cpuTrips: sum(games.map((g) => g.cpuTrips)),
  budgetAborts: sum(games.map((g) => g.budgetAborts)),
  cpuMean: +(sum(games.map((g) => g.cpuMs)) / games.length).toFixed(1),
  cpuMax: +Math.max(...games.map((g) => g.cpuMs)).toFixed(1),
  maxDecisionMs: +Math.max(...games.map((g) => g.maxMoveMs)).toFixed(1),
  scores: games.map((g) => g.score),
};
fs.writeFileSync(out.replace(/\.jsonl$/, '_summary.json'), JSON.stringify(summary, null, 2));
console.log('WROTE', out);
console.log(JSON.stringify(summary));
