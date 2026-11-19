#!/usr/bin/env node
'use strict';
// Measure visit counts and CPU of normal deeper:16 exact moves on dev200 games [g0, g1).
// visitCap is 0 (count only). Not a scored test.
// usage: node tests/measure_visits.js [g0=0] [g1=10] [out=results/visits_dev200_0_9.json]
const fs = require('fs'), path = require('path');
const C = require('../js/common.js'), E = C.E, R = C.R;
const { createPolicy } = require('../js/policy.js');
const D = require('../js/defaults.js');

const g0 = +(process.argv[2] || 0), g1 = +(process.argv[3] || 10);
const out = process.argv[4] || path.join(__dirname, '..', 'results', `visits_dev200_${g0}_${g1 - 1}.json`);
const base = JSON.parse(fs.readFileSync(path.join(C.ENGINE_SRC, '..', 'results', 'shipped_policies.json'), 'utf8'))['52'];
const spec = JSON.parse(JSON.stringify(base)); delete spec.exact; if (spec.deepen) spec.deepen.budgetMs = 0;
spec.exact3g = { xK: D.XK, budget: D.BUDGET, logCap: D.LOGCAP, visitCap: 0, cpuMs: 0 };
const policy = createPolicy(R, spec);
const lines = fs.readFileSync(path.join(__dirname, '../../../bench/shuffles/dev200.txt'), 'utf8').trim().split('\n');

const moves = [];
const games = [];
for (let g = g0; g < g1; g++) {
  const vals = lines[g].trim().split(/\s+/).map(Number).map((c) => { const r = c % 13; return r === 0 ? 1 : r >= 9 ? 10 : r + 1; });
  const st = E.newGame(R); if (policy.reset) policy.reset();
  const g0u = process.cpuUsage();
  let score = 0, nDec = 0, maxMove = 0, maxVisits = 0;
  for (let i = 0; i < 52 && !st.over; i++) {
    const v = vals[i]; nDec++;
    const t0 = process.cpuUsage();
    const m = policy.choose(st, v);
    const u = process.cpuUsage(t0); const dt = (u.user + u.system) / 1000;
    if (dt > maxMove) maxMove = dt;
    const lm = policy.lastExact;
    if (lm && (lm.visits > 0 || lm.aborted || (st.rem <= 16 && E.cardsLeftToPlay(st) === st.rem))) {
      const rec = { game: g, move: i + 1, rem: st.rem, visits: lm.visits, fresh: lm.fresh, cpuMs: +dt.toFixed(3),
        aborted: lm.aborted, reason: lm.reason, kernel: lm.kernel, stay: m.stay, col: m.col, exact: !!(m && m.exact) };
      moves.push(rec);
      if (lm.visits > maxVisits) maxVisits = lm.visits;
    }
    E.applyMove(R, st, v, m);
  }
  const gu = process.cpuUsage(g0u); const gcpu = (gu.user + gu.system) / 1000;
  games.push({ game: g, score: st.score, busts: st.busts, perfect: st.busts === 0 && !st.over ? 1 : (st.busts === 0 ? 1 : 0),
    over: st.over, reason: st.reason, cards: 52 - st.rem, cpuMs: +gcpu.toFixed(1), maxMoveMs: +maxMove.toFixed(1), maxVisits, nDec, kernel: policy.exact.kernel() });
  console.log(JSON.stringify(games[games.length - 1]));
}

const exact = moves.filter((m) => m.rem <= 16);
const visits = exact.map((m) => m.visits);
const cpus = exact.map((m) => m.cpuMs);
const maxV = Math.max(0, ...visits), maxC = Math.max(0, ...cpus);
const sum = (a) => a.reduce((s, x) => s + x, 0);
const q = (a, f) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(f * s.length))]; };
const byRem = {};
for (const m of exact) {
  const b = byRem[m.rem] || (byRem[m.rem] = { n: 0, abort: 0, maxV: 0, maxC: 0 });
  b.n++; if (m.aborted) b.abort++; if (m.visits > b.maxV) b.maxV = m.visits; if (m.cpuMs > b.maxC) b.maxC = m.cpuMs;
}
// visits/sec from moves with >= 0.2s CPU (stable)
const heavy = exact.filter((m) => m.cpuMs >= 200);
const vps = heavy.map((m) => m.visits / (m.cpuMs / 1000));
const vpsMed = vps.length ? q(vps, 0.5) : null;
const cap3x = 3 * maxV;
const cap5s = vpsMed ? Math.round(vpsMed * 5) : null;
const rec = {
  set: 'dev200', games: `${g0}-${g1 - 1}`, nGames: g1 - g0, kernel: policy.exact.kernel(),
  budget: D.BUDGET, xK: D.XK, visitCap: 0,
  exactMoves: exact.length, budgetAborts: exact.filter((m) => m.reason === 'budget').length,
  maxVisits: maxV, p95Visits: visits.length ? q(visits, 0.95) : 0, meanVisits: visits.length ? Math.round(sum(visits) / visits.length) : 0,
  maxExactCpuMs: maxC, p95ExactCpuMs: cpus.length ? +q(cpus, 0.95).toFixed(1) : 0,
  gameCpuMean: +(sum(games.map((g) => g.cpuMs)) / games.length).toFixed(1),
  gameCpuMax: +Math.max(...games.map((g) => g.cpuMs)).toFixed(1),
  maxDecisionMs: +Math.max(...games.map((g) => g.maxMoveMs)).toFixed(1),
  visitsPerSecMedianHeavy: vpsMed ? Math.round(vpsMed) : null, heavyMoves: heavy.length,
  cap3x, cap5s,
  byRem,
  games, moves: exact,
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(rec, null, 2));
console.log('WROTE', out);
console.log(JSON.stringify({ maxVisits: maxV, maxExactCpuMs: maxC, cap3x, cap5s, visitsPerSecMedianHeavy: rec.visitsPerSecMedianHeavy,
  gameCpuMean: rec.gameCpuMean, gameCpuMax: rec.gameCpuMax, maxDecisionMs: rec.maxDecisionMs }, null, 2));
