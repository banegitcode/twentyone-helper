#!/usr/bin/env node
'use strict';
// Unit test: a tiny visitCap and a tiny cpuMs each abort the exact solve, fall back to the base
// policy, and finish a legal game (engine.applyMove accepts every move; game ends by deck or 3 busts).
const fs = require('fs'), path = require('path'), assert = require('assert');
const C = require('../js/common.js'), E = C.E, R = C.R;
const { createPolicy } = require('../js/policy.js');
const D = require('../js/defaults.js');

const line = fs.readFileSync(path.join(__dirname, '../../../bench/shuffles/dev200.txt'), 'utf8').trim().split('\n')[0];
const vals = line.trim().split(/\s+/).map(Number).map((c) => { const r = c % 13; return r === 0 ? 1 : r >= 9 ? 10 : r + 1; });

function legalActions(st, v) {
  const out = [];
  for (let j = 0; j < 4; j++) out.push({ stay: -1, col: j });
  if (st.stays > 0) {
    for (let i = 0; i < 4; i++) if (st.cols[i]) for (let j = 0; j < 4; j++) out.push({ stay: i, col: j });
  }
  return out;
}
function isLegal(st, v, m) {
  return legalActions(st, v).some((a) => a.stay === m.stay && a.col === m.col);
}

function play(tag, exact3g, { expectVisit, expectCpu }) {
  const base = JSON.parse(fs.readFileSync(path.join(C.ENGINE_SRC, '..', 'results', 'shipped_policies.json'), 'utf8'))['52'];
  const spec = JSON.parse(JSON.stringify(base)); delete spec.exact; if (spec.deepen) spec.deepen.budgetMs = 0;
  spec.exact3g = Object.assign({ xK: D.XK, budget: D.BUDGET, logCap: D.LOGCAP, visitCap: 0, cpuMs: 0 }, exact3g);
  const policy = createPolicy(R, spec);
  const st = E.newGame(R); if (policy.reset) policy.reset();
  let n = 0, visitTrips = 0, cpuTrips = 0, budgetAborts = 0, exactSolved = 0;
  for (let i = 0; i < 52 && !st.over; i++) {
    const v = vals[i];
    const m = policy.choose(st, v);
    assert(m && typeof m.col === 'number', tag + ': missing move at i=' + i);
    assert(isLegal(st, v, m), tag + ': illegal move stay=' + m.stay + ' col=' + m.col + ' rem=' + st.rem);
    const before = st.score;
    E.applyMove(R, st, v, m);
    assert(typeof st.score === 'number' && st.score >= before, tag + ': score went backwards or NaN');
    n++;
    const lm = policy.lastExact;
    if (lm) {
      if (lm.aborted && lm.reason === 'visit') visitTrips++;
      else if (lm.aborted && lm.reason === 'cpu') cpuTrips++;
      else if (lm.aborted && lm.reason === 'budget') budgetAborts++;
      else if (!lm.aborted && lm.visits > 0) exactSolved++;
    }
  }
  assert(st.over, tag + ': game did not end');
  assert(st.reason === 'deck' || st.reason === 'busts' || st.reason === 'bust', tag + ': unexpected reason ' + st.reason);
  assert(n >= 1 && n <= 52, tag + ': bad decision count ' + n);
  if (expectVisit) assert(visitTrips > 0, tag + ': expected at least one visit-cap trip');
  if (expectCpu) assert(cpuTrips > 0, tag + ': expected at least one cpu-guard trip');
  const row = { tag, score: st.score, busts: st.busts, reason: st.reason, cards: n, visitTrips, cpuTrips, budgetAborts, exactSolved, kernel: policy.exact.kernel() };
  console.log(JSON.stringify(row));
  return row;
}

const v = play('visitCap=100', { visitCap: 100, cpuMs: 0, wasm: true }, { expectVisit: true, expectCpu: false });
const c = play('cpuMs=1', { visitCap: D.VISIT_CAP, cpuMs: 1, wasm: true }, { expectVisit: false, expectCpu: true });
// JS kernel too, visit cap
const vj = play('visitCap=100,js', { visitCap: 100, cpuMs: 0, wasm: false }, { expectVisit: true, expectCpu: false });
console.log('FALLBACK_OK');
fs.mkdirSync(path.join(__dirname, '..', 'results'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'results', 'fallback_unit.json'), JSON.stringify({ visit: v, cpu: c, visitJs: vj }, null, 2));
