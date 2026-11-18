'use strict';
// node src/z_gate.js [Kmin=6] [Kmax=13] [out=results/z_gate.json]
// Correctness gate for src/exact2.js against src/exact.js on the fixed gate positions (results/z_positions.json,
// 45 positions for each K = 6..13).  For every position and both kernels (JavaScript, WebAssembly):
//   value      |V_new - V_old| < 0.01
//   q          every legal action for the dealt card: |Q_new - Q_old| < 0.01
//   choose     the action picked by the new choose() (from an empty table) has, per the OLD solver, the old best value
//   budgeted   ponder() in slices then choose() with a cap (resumed until it answers) gives the same value / an optimal action
const fs = require('fs'), path = require('path');
const E = require('./engine.js'), O = require('./exact.js'), N = require('./exact2.js'), R = E.DEFAULT_RULES;
const P = require('../results/z_positions.json');
const Kmin = +process.argv[2] || 6, Kmax = +process.argv[3] || 13, outF = process.argv[4] || path.join(__dirname, '../results/z_gate.json');
const mk = (p) => { const st = E.newGame(R); st.cols.set(p.cols); st.deck.set(p.deck); st.rem = p.rem; st.played = 52 - p.rem; st.busts = p.busts; st.stays = p.stays; st.prev = p.prev; return st; };
const X0 = O.createExact(R, { logCap: 26 });
const XS = [N.createExact(R, { logCap: 24, wasm: false }), N.createExact(R, { logCap: 24 })];
const TOL = 0.01, byK = {}, fails = [];
let maxDV = 0, maxDQ = 0, n = 0, skipped = 0;
for (const p of P.gate) {
  if (p.K < Kmin || p.K > Kmax) continue;
  const st = mk(p), v = p.card; let v0, q0;
  X0.clear();
  try { v0 = X0.value(st); q0 = X0.q(st, v); } catch (e) { skipped++; console.log('old solver failed on', p.seed, e.message); continue; }
  const best0 = Math.max(...q0.map((a) => a.value)), s0 = X0.states();
  const k = byK[p.K] || (byK[p.K] = { n: 0, ok: 0, oldEntries: 0, newEntries: 0, tieMovesDiffer: 0 });
  let ok = true; const bad = (what, extra) => { ok = false; fails.push(Object.assign({ seed: p.seed, K: p.K, what }, extra)); };
  for (const X of XS) {
    const kn = X.kernel();
    X.clear(); const v1 = X.value(st), s1 = X.states(); maxDV = Math.max(maxDV, Math.abs(v1 - v0));
    if (!(Math.abs(v1 - v0) < TOL)) bad('value ' + kn, { v0, v1 });
    const q1 = X.q(st, v);
    if (q1.length !== q0.length) bad('q length ' + kn);
    else for (let i = 0; i < q0.length; i++) {
      const d = Math.abs(q1[i].value - q0[i].value); maxDQ = Math.max(maxDQ, d);
      if (q1[i].stay !== q0[i].stay || q1[i].col !== q0[i].col || !(d < TOL)) bad('q ' + kn, { i, old: q0[i], new: q1[i] });
    }
    const check = (m, what) => {
      const a = m && q0.find((x) => x.stay === m.stay && x.col === m.col);
      if (!a || !(a.value > best0 - TOL) || !(Math.abs(m.value - best0) < TOL)) bad(what + ' ' + kn, { move: m && { stay: m.stay, col: m.col, value: m.value }, best0 });
      return a;
    };
    X.clear(); const m = X.choose(st, v); check(m, 'choose');
    if (kn === 'wasm') { k.newEntries += s1; const m0 = X0.choose(st, v); if (m0.stay !== m.stay || m0.col !== m.col) k.tieMovesDiffer++; }
    // budgeted paths
    X.clear(); let r, it = 0; while ((r = X.ponder(st, 3000)) === 0) it++;
    if (r !== 1) bad('ponder ' + kn, { r });
    const v2 = X.value(st); if (!(Math.abs(v2 - v0) < TOL) || X.states() !== s1) bad('ponder value ' + kn, { v0, v2, states: X.states(), s1 });
    X.clear(); let m2 = null; while (!(m2 = X.choose(st, v, 2000))) it++;
    check(m2, 'choose budget');
  }
  k.n++; n++; if (ok) k.ok++; k.oldEntries += s0;
  if (n % 15 === 0) console.log(n, 'positions', 'failures', fails.length, 'max |dV|', maxDV.toExponential(2), 'max |dQ|', maxDQ.toExponential(2));
}
const res = { positions: n, skippedOldSolverFailed: skipped, passed: n - new Set(fails.map((f) => f.seed + ':' + f.K)).size, tolerance: TOL, maxAbsValueDiff: maxDV, maxAbsQDiff: maxDQ, byK, fails: fails.slice(0, 50) };
fs.writeFileSync(outF, JSON.stringify(res, null, 1));
console.log(JSON.stringify(Object.assign({}, res, { fails: fails.length }), null, 1));
