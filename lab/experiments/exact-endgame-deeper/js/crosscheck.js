'use strict';
// node js/crosscheck.js BRUTE_OUTPUT.txt POSITIONS.txt [solver=exact2|exact3] [wasm=0|1]
// Compare a compressed solver's V0 and every action's Q with the brute-force reference (ref/brute).
const fs = require('fs'), path = require('path');
const C = require('./common.js');
const [bf, pf, which = 'exact2', wasm = '1'] = process.argv.slice(2);
const mod = which === 'exact3' ? require('./exact3.js') : require(path.join(C.ENGINE_SRC, 'exact2.js'));
const X = mod.createExact(C.R, { logCap: 22, wasm: wasm === '1' });
const pos = new Map(C.loadPositions(pf).map((p) => [p.id + ':' + p.N, p]));
const lines = fs.readFileSync(bf, 'utf8').split('\n');
let n = 0, nq = 0, maxV = 0, maxQ = 0, bad = 0, badMove = 0; const byN = {};
for (let i = 0; i < lines.length; i++) {
  if (!lines[i].startsWith('P ')) continue;
  const [, id, N, v0, best] = lines[i].split(' '); const acts = [];
  for (i++; i < lines.length && lines[i].startsWith('A '); i++) { const [, s, p, q] = lines[i].split(' '); acts.push({ stay: +s, col: +p, q: +q }); } i--;
  const p = pos.get(id + ':' + N); const st = C.toState(p);
  X.clear(); const V = X.value(st), dv = Math.abs(V - +v0); maxV = Math.max(maxV, dv);
  X.clear(); const ql = X.q(st, p.cur);
  let dq = 0; for (const a of acts) { const m = ql.find((x) => x.stay === a.stay && x.col === a.col); if (!m) { bad++; console.log('missing action', id, N, a); continue; } dq = Math.max(dq, Math.abs(m.value - a.q)); nq++; }
  X.clear(); const ch = X.choose(st, p.cur); const chq = acts.find((a) => a.stay === ch.stay && a.col === ch.col);
  if (!chq || chq.q < +best - 0.01) { badMove++; console.log('choose() not optimal', id, N, ch, chq && chq.q, best); }
  maxQ = Math.max(maxQ, dq); if (dv > 0.01 || dq > 0.01) { bad++; console.log('MISMATCH', id, N, 'dV', dv, 'dQ', dq); }
  const b = byN[N] || (byN[N] = { positions: 0, maxdV: 0, maxdQ: 0 }); b.positions++; b.maxdV = Math.max(b.maxdV, dv); b.maxdQ = Math.max(b.maxdQ, dq); n++;
}
console.log(JSON.stringify({ solver: which, kernel: X.kernel(), positions: n, actionsCompared: nq, maxAbsDiffV: maxV, maxAbsDiffQ: maxQ, mismatches: bad, chooseNotOptimal: badMove, byN }));
