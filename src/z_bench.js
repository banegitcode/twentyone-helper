'use strict';
// node src/z_bench.js <K> [nOld=30] [n=30] [oldLogCap=27] [out=results/z_bench_<K>.json] [newLogCap=25, 27 for K>=14]
// Old (src/exact.js) against new (src/exact2.js, WebAssembly kernel and JavaScript kernel) on the 30 fixed positions with
// K cards left (results/z_positions.json), back to back in one process, each from an empty table:
//   solve   value(st)            the complete solve the page's ponder() works towards
//   choose  choose(st, card)     the on-tap query for the card that was actually dealt
// Reported: positions stored ("entries") and CPU time (process.cpuUsage: user + system; the machine is shared, so
// wall-clock is not used).  The old solver runs on the first nOld positions only (it is the slow part); a position
// where its table fills up (0.8 << oldLogCap entries) is counted as "old did not finish" and left out of the ratios.
const fs = require('fs'), path = require('path');
const E = require('./engine.js'), O = require('./exact.js'), N = require('./exact2.js'), R = E.DEFAULT_RULES, P = require('../results/z_positions.json');
const K = +process.argv[2], nOld = process.argv[3] != null ? +process.argv[3] : 30, n = +process.argv[4] || 30, oldLog = +process.argv[5] || 27;
const outF = process.argv[6] || path.join(__dirname, '../results/z_bench_' + K + '.json');
const mk = (p) => { const st = E.newGame(R); st.cols.set(p.cols); st.deck.set(p.deck); st.rem = p.rem; st.played = 52 - p.rem; st.busts = p.busts; st.stays = p.stays; st.prev = p.prev; return st; };
const cpu = (fn) => { const c0 = process.cpuUsage(), t0 = performance.now(); const r = fn(); const c = process.cpuUsage(c0); return { r, cpu: (c.user + c.system) / 1000, wall: performance.now() - t0 }; };
const XO = nOld > 0 ? O.createExact(R, { logCap: oldLog }) : null, newLog = +process.argv[7] || (K >= 14 ? 27 : 25), XW = N.createExact(R, { logCap: newLog }), XJ = N.createExact(R, { logCap: newLog, wasm: false });
const run = (X, st, card) => {
  const o = {};
  try {
    X.clear(); const a = cpu(() => X.value(st)); o.value = a.r; o.solveEntries = X.states(); o.solveCpu = a.cpu; o.solveWall = a.wall;
    X.clear(); const b = cpu(() => X.choose(st, card)); o.move = { stay: b.r.stay, col: b.r.col, value: b.r.value }; o.chooseEntries = X.states(); o.chooseCpu = b.cpu; o.chooseWall = b.wall;
  } catch (e) { o.failed = e.message; X.clear(); }
  return o;
};
const rows = [];
P.bench[K].slice(0, n).forEach((p, i) => {
  const st = mk(p), row = { seed: p.seed, card: p.card };
  if (i < nOld) row.old = run(XO, st, p.card);
  row.wasm = run(XW, st, p.card); row.js = run(XJ, st, p.card);
  if (row.old && !row.old.failed && !row.wasm.failed) { row.valueDiff = Math.abs(row.old.value - row.wasm.value); row.chooseValueDiff = Math.abs(row.old.move.value - row.wasm.move.value); }
  rows.push(row);
  const f = (o) => (!o ? '-' : o.failed ? 'FAILED' : o.solveEntries + ' ' + o.solveCpu.toFixed(0) + 'ms | choose ' + o.chooseEntries + ' ' + o.chooseCpu.toFixed(0) + 'ms');
  console.log(i, p.seed, 'old', f(row.old), '|| wasm', f(row.wasm), '|| js', f(row.js), row.valueDiff != null ? 'dV ' + row.valueDiff.toExponential(1) : '');
  fs.writeFileSync(outF, JSON.stringify({ K, partial: true, rows }));
});
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; }, max = (a) => (a.length ? Math.max(...a) : null), sum = (a) => a.reduce((x, y) => x + y, 0);
const newFailed = rows.filter((r) => r.wasm.failed || r.js.failed).length; const all = rows.slice(); rows.length = 0; rows.push(...all.filter((r) => !r.wasm.failed && !r.js.failed));
const both = rows.filter((r) => r.old && !r.old.failed), oldRun = all.filter((r) => r.old);
const S = {
  K, positionsNew: rows.length, newDidNotFinish: newFailed, newTableBytes: 12 * 2 ** newLog, oldTableEntriesMax: Math.floor(0.8 * 2 ** oldLog), positionsOldTried: oldRun.length, oldDidNotFinish: oldRun.filter((r) => r.old.failed).length,
  new: { solveEntriesMedian: med(rows.map((r) => r.wasm.solveEntries)), solveEntriesWorst: max(rows.map((r) => r.wasm.solveEntries)), chooseEntriesMedian: med(rows.map((r) => r.wasm.chooseEntries)), chooseEntriesWorst: max(rows.map((r) => r.wasm.chooseEntries)),
    solveCpuMsMedianWasm: med(rows.map((r) => r.wasm.solveCpu)), solveCpuMsWorstWasm: max(rows.map((r) => r.wasm.solveCpu)), chooseCpuMsMedianWasm: med(rows.map((r) => r.wasm.chooseCpu)), chooseCpuMsWorstWasm: max(rows.map((r) => r.wasm.chooseCpu)),
    solveCpuMsMedianJs: med(rows.map((r) => r.js.solveCpu)), chooseCpuMsMedianJs: med(rows.map((r) => r.js.chooseCpu)) },
  onPositionsOldFinished: both.length ? {
    n: both.length,
    oldSolveEntriesMedian: med(both.map((r) => r.old.solveEntries)), oldSolveEntriesWorst: max(both.map((r) => r.old.solveEntries)), newSolveEntriesMedian: med(both.map((r) => r.wasm.solveEntries)), newSolveEntriesWorst: max(both.map((r) => r.wasm.solveEntries)),
    oldChooseEntriesMedian: med(both.map((r) => r.old.chooseEntries)), oldChooseEntriesWorst: max(both.map((r) => r.old.chooseEntries)), newChooseEntriesMedian: med(both.map((r) => r.wasm.chooseEntries)), newChooseEntriesWorst: max(both.map((r) => r.wasm.chooseEntries)),
    solveEntriesRatioTotal: sum(both.map((r) => r.old.solveEntries)) / sum(both.map((r) => r.wasm.solveEntries)), solveEntriesRatioMedian: med(both.map((r) => r.old.solveEntries / r.wasm.solveEntries)),
    chooseEntriesRatioTotal: sum(both.map((r) => r.old.chooseEntries)) / sum(both.map((r) => r.wasm.chooseEntries)), chooseEntriesRatioMedian: med(both.map((r) => r.old.chooseEntries / r.wasm.chooseEntries)),
    solveTimeRatioWasmTotal: sum(both.map((r) => r.old.solveCpu)) / sum(both.map((r) => r.wasm.solveCpu)), solveTimeRatioWasmMedian: med(both.map((r) => r.old.solveCpu / r.wasm.solveCpu)),
    solveTimeRatioJsTotal: sum(both.map((r) => r.old.solveCpu)) / sum(both.map((r) => r.js.solveCpu)), solveTimeRatioJsMedian: med(both.map((r) => r.old.solveCpu / r.js.solveCpu)),
    chooseTimeRatioWasmTotal: sum(both.map((r) => r.old.chooseCpu)) / sum(both.map((r) => r.wasm.chooseCpu)), chooseTimeRatioWasmMedian: med(both.map((r) => r.old.chooseCpu / r.wasm.chooseCpu)),
    chooseTimeRatioJsTotal: sum(both.map((r) => r.old.chooseCpu)) / sum(both.map((r) => r.js.chooseCpu)), chooseTimeRatioJsMedian: med(both.map((r) => r.old.chooseCpu / r.js.chooseCpu)),
    maxValueDiff: max(both.map((r) => r.valueDiff)), maxChooseValueDiff: max(both.map((r) => r.chooseValueDiff)),
  } : null,
};
fs.writeFileSync(outF, JSON.stringify({ summary: S, rows: all }, null, 1));
console.log(JSON.stringify(S, null, 1));
