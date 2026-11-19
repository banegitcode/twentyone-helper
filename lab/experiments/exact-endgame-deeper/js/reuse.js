'use strict';
// node js/reuse.js N0 n -> how much of the later work is already in the table.  For each position with N0 cards left, a random order of the
// unseen cards is dealt (seeded; the solver never sees it) and the exact move is played each turn.
//   A: X.value(root) first (complete solve, what ponder() builds), then choose() each turn
//   B: no complete solve; choose() each turn with the table kept (champion's withExactEnd behaviour)
// Reported: new table positions per turn (states are exact counts; no timing involved).
const path = require('path'); const C = require('./common.js'); const E = C.E, R = C.R;
const M = require('./exact3.js'); const N0 = +process.argv[2] || 12, n = +process.argv[3] || 8;
const all = C.loadPositions(path.join(__dirname, '../positions/dev200_expect1.txt')).filter((p) => p.N === N0).slice(0, n);
const XA = M.createExact(R, { logCap: 25, wasm: false }), XB = M.createExact(R, { logCap: 25, wasm: false });
const rnd = E.mulberry32(12345); const resA = [], resB = [], totA = [], totB = []; let same = 0, tot = 0;
for (const p of all) {
  const unseen = []; for (let v = 1; v <= 10; v++) for (let i = 0; i < p.cnt[v - 1]; i++) unseen.push(v); unseen.push(p.cur);
  const cur = []; // shuffle with the dealt card first (position's current card is fixed), rest random
  const rest = unseen.slice(0, -1); for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  const order = [p.cur].concat(rest);
  const sa = C.toState(p), sb = C.toState(p); XA.clear(); XB.clear();
  XA.value(sa); const rootStates = XA.states(); const A = [rootStates]; const Bn = [];
  for (let i = 0; i < order.length && !sa.over && !sb.over; i++) {
    const v = order[i]; let before = XA.states(); const ma = XA.choose(sa, v); A.push(XA.states() - before);
    before = XB.states(); const mb = XB.choose(sb, v); Bn.push(XB.states() - before);
    tot++; if (ma.stay === mb.stay && ma.col === mb.col || Math.abs(ma.value - mb.value) < 1e-3) same++;
    E.applyMove(R, sa, v, ma); E.applyMove(R, sb, v, ma);   // both follow the same (exact) move so positions coincide
  }
  resA.push(A); resB.push(Bn);
}
const pad = (a, L) => { const o = a.slice(); while (o.length < L) o.push(0); return o; };
const L = N0 + 1; const mean = (rows, k) => rows.reduce((s, r) => s + (pad(r, L)[k] || 0), 0) / rows.length;
console.log('N0', N0, 'positions', all.length, 'moves compared', tot, 'same value', same);
console.log('A (full solve first): mean positions stored by the full solve', mean(resA, 0).toFixed(0), '; new positions per later move:', Array.from({ length: L - 1 }, (_, k) => mean(resA, k + 1).toFixed(0)).join(' '));
console.log('B (choose only, table kept): new positions per move:', Array.from({ length: L - 1 }, (_, k) => mean(resB, k).toFixed(0)).join(' '), ' total', Array.from({ length: L - 1 }, (_, k) => mean(resB, k)).reduce((a, b) => a + b, 0).toFixed(0));
