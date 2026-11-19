'use strict';
// node js/timing.js --solver exact2|exact3 --set mine|his --N 10,11,12 --n 30 --cap 40000000 --logCap 26 --wasm 1 --out results/x.json
// Each position is solved from an EMPTY table, one process, wall clock (performance.now), twice:
//   solve  = X.value(st)         complete exact value of the position (what ponder() works towards)
//   choose = X.choose(st, card)  the on-tap query for the card actually dealt (what a move needs)
// A solve that needs more than --cap new positions is reported as DNF (counted, excluded from median, included in p90/max as +inf).
const fs = require('fs'), path = require('path');
const C = require('./common.js');
const args = {}; for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const which = args.solver || 'exact2', setName = args.set || 'mine', Ns = (args.N || '12').split(',').map(Number), nPer = +(args.n || 30);
const cap = +(args.cap || 40e6), logCap = +(args.logCap || 26), wasm = (args.wasm || '1') === '1', outF = args.out;
const mod = which === 'exact3' ? require('./exact3.js') : require(path.join(C.ENGINE_SRC, 'exact2.js'));
const extra = args.opts ? JSON.parse(args.opts) : {};
const X = mod.createExact(C.R, Object.assign({ logCap, wasm }, extra));
let pos;
if (setName === 'mine') pos = C.loadPositions(path.join(__dirname, '../positions/dev200_expect1.txt')).map((p) => ({ id: p.id, N: p.N, cur: p.cur, st: C.toState(p), busts: p.busts, stays: p.stays }));
else { const P = require(path.join(C.ENGINE_SRC, '../results/z_positions.json')); pos = C.fromEnginePositions([].concat(...Object.values(P.bench), P.gate)); }
const q = (a, f) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(f * (s.length - 1) + 1e-9))] : null; };
const cpuNow = () => { const c = process.cpuUsage(); return (c.user + c.system) / 1000; };   // CPU ms of this process: the box is shared (load avg >> cores), wall clock is not reliable
const summary = {}, rows = [];
console.log('solver', which, 'kernel', X.kernel(), 'set', setName);
for (const N of Ns) {
  const list = pos.filter((p) => p.N === N).slice(0, nPer); const R = [];
  for (const p of list) {
    const row = { id: p.id, N, busts: p.busts, stays: p.stays };
    try { X.clear(); let t0 = cpuNow(), w0 = performance.now(); const r = X.ponder(p.st, cap); row.solveMs = cpuNow() - t0; row.solveWallMs = performance.now() - w0; row.solveStates = X.states(); row.solveDNF = r !== 1; row.value = r === 1 ? X.value(p.st) : null; } catch (e) { row.solveDNF = true; row.err = e.message; X.clear(); }
    try { X.clear(); const t0 = cpuNow(), w0 = performance.now(); const m = X.choose(p.st, p.cur, cap); row.chooseMs = cpuNow() - t0; row.chooseWallMs = performance.now() - w0; row.chooseStates = X.states(); row.chooseDNF = !m; if (m) row.move = [m.stay, m.col, m.value]; } catch (e) { row.chooseDNF = true; row.err = e.message; X.clear(); }
    R.push(row); rows.push(row);
    console.log(N, p.id, 'solve', row.solveDNF ? 'DNF' : row.solveStates + ' ' + row.solveMs.toFixed(0) + 'ms', '| choose', row.chooseDNF ? 'DNF' : row.chooseStates + ' ' + row.chooseMs.toFixed(0) + 'ms');
  }
  const f = (k) => R.map((r) => (r[k + 'DNF'] ? Infinity : r[k + 'Ms']));
  const st = (k) => R.map((r) => (r[k + 'DNF'] ? Infinity : r[k + 'States']));
  summary[N] = { n: R.length, dnf: R.filter((r) => r.solveDNF).length,
    solveStates: { med: q(st('solve'), .5), p90: q(st('solve'), .9), max: q(st('solve'), 1) }, solveMs: { med: q(f('solve'), .5), p90: q(f('solve'), .9), max: q(f('solve'), 1) },
    chooseStates: { med: q(st('choose'), .5), p90: q(st('choose'), .9), max: q(st('choose'), 1) }, chooseMs: { med: q(f('choose'), .5), p90: q(f('choose'), .9), max: q(f('choose'), 1) } };
  console.log('SUMMARY', N, JSON.stringify(summary[N]));
}
if (outF) fs.writeFileSync(outF, JSON.stringify({ solver: which, kernel: X.kernel(), set: setName, logCap, cap, summary, rows }, null, 1));
