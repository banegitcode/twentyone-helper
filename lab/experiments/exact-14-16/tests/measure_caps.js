#!/usr/bin/env node
'use strict';
// Offline, chained exact solves on recorded dev200 trajectories (no new midgame search).
// usage: node tests/measure_caps.js <g0> <g1> [out.jsonl] [budget=0] [visitCap=80000000]
// budget 0 = no insert cap (visit cap + table cap only). Apply the LOGGED move after each
// decide so later positions stay on the recorded champion trajectory.
const fs = require('fs'), path = require('path');
const C = require('../js/common.js'), E = C.E, R = C.R;
const E3G = require('../js/exact3g.js');
const D = require('../js/defaults.js');

const g0 = +(process.argv[2] || 0), g1 = +(process.argv[3] || 20);
const out = process.argv[4] || path.join(__dirname, '..', 'results', `caps_${g0}_${g1 - 1}.jsonl`);
const budget = process.argv[5] != null ? +process.argv[5] : 0;
const visitCap = process.argv[6] != null ? +process.argv[6] : D.VISIT_CAP;
const logPath = '/workspace/21lab/experiments/deeper16-guard/results/parity_guard_0_19.jsonl';
const shuffles = fs.readFileSync(path.join(__dirname, '../../../bench/shuffles/dev200.txt'), 'utf8').trim().split('\n');
const games = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const byGame = new Map(games.map((g) => [g.game, g]));

function toState(st) {
  // exact3g expects the current card to still be in deck[] and rem, which it is
  // before we apply the move (st is the pre-decision state).
  return st;
}

const fh = fs.openSync(out, 'w');
for (let g = g0; g < g1; g++) {
  const rec = byGame.get(g);
  if (!rec) throw new Error('missing game ' + g);
  const vals = shuffles[g].trim().split(/\s+/).map(Number).map((c) => { const r = c % 13; return r === 0 ? 1 : r >= 9 ? 10 : r + 1; });
  const st = E.newGame(R);
  const X = E3G.createExact(R, { logCap: D.LOGCAP, wasm: true, visitCap, cpuMs: 0 });
  for (const mv of rec.moves) {
    const v = vals[mv.move - 1];
    if (mv.rem >= 13 && mv.rem <= 16 && E.cardsLeftToPlay(st) === st.rem) {
      const t0 = process.cpuUsage();
      const m = X.choose(st, v, budget);
      const dt = (() => { const u = process.cpuUsage(t0); return (u.user + u.system) / 1000; })();
      const lm = X.lastMove();
      const row = {
        game: g, seed: rec.seed, rem: st.rem, card: v,
        budget, visitCap, kernel: X.kernel(),
        completed: !!(m && m.exact && !lm.aborted),
        aborted: !!lm.aborted, reason: lm.reason, visits: lm.visits, fresh: lm.fresh, cpuMs: +dt.toFixed(3),
        states: X.states(),
        move: m ? { stay: m.stay, col: m.col, value: m.value } : null,
        logged: { stay: mv.stay, col: mv.col, exact: mv.exact, aborted: mv.aborted, reason: mv.reason, visits: mv.visits, cpuMs: mv.cpuMs },
        moveMatch: m ? (m.stay === mv.stay && m.col === mv.col) : null,
      };
      fs.writeSync(fh, JSON.stringify(row) + '\n');
      console.log(JSON.stringify({ game: g, rem: st.rem, completed: row.completed, reason: row.reason, visits: row.visits, fresh: row.fresh, cpuMs: row.cpuMs, states: row.states, moveMatch: row.moveMatch }));
    }
    E.applyMove(R, st, v, { stay: mv.stay, col: mv.col });
  }
}
fs.closeSync(fh);
console.log('WROTE', out);
