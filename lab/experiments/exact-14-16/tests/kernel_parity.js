'use strict';
// JS vs WASM: same move, same visit count, same value on a real shorter endgame. Tiny visitCap aborts.
const fs = require('fs'), path = require('path');
const C = require('../js/common.js'), E = C.E, R = C.R;
const E3G = require('../js/exact3g.js');
const champion = require(path.join(C.ENGINE_SRC, 'x_policies.js'));

const base = JSON.parse(fs.readFileSync(path.join(C.ENGINE_SRC, '..', 'results', 'shipped_policies.json'), 'utf8'))['52'];
const spec = JSON.parse(JSON.stringify(base)); delete spec.exact; if (spec.deepen) spec.deepen.budgetMs = 0;
const mid = champion.createPolicy(R, spec);

const line = fs.readFileSync(path.join(__dirname, '../../../bench/shuffles/dev200.txt'), 'utf8').trim().split('\n')[0];
const vals = line.trim().split(/\s+/).map(Number).map((c) => { const r = c % 13; return r === 0 ? 1 : r >= 9 ? 10 : r + 1; });
const st = E.newGame(R); mid.reset();
let card = 0;
for (let i = 0; i < 52 && !st.over; i++) {
  const v = vals[i];
  if (st.rem <= 8) { card = v; break; }
  E.applyMove(R, st, v, mid.choose(st, v));
}
if (!card) throw new Error('did not reach rem<=8');
console.log('rem', st.rem, 'busts', st.busts, 'stays', st.stays, 'card', card);

function run(opts, maxNew, guard) {
  const X = E3G.createExact(R, Object.assign({ logCap: 25 }, opts));
  const m = X.choose(st, card, maxNew, guard);
  return { move: m, lm: X.lastMove(), kernel: X.kernel() };
}

const w = run({ wasm: true }, 3200000);
const j = run({ wasm: false }, 3200000);
console.log('wasm', w.kernel, w.move && { stay: w.move.stay, col: w.move.col, value: +w.move.value.toFixed(4) }, w.lm);
console.log('js  ', j.kernel, j.move && { stay: j.move.stay, col: j.move.col, value: +j.move.value.toFixed(4) }, j.lm);
if (!w.move || !j.move) throw new Error('expected a solved move');
if (w.move.stay !== j.move.stay || w.move.col !== j.move.col) throw new Error('move mismatch');
if (Math.abs(w.move.value - j.move.value) > 1e-3) throw new Error('value mismatch');
if (w.lm.visits !== j.lm.visits) throw new Error('visit mismatch wasm=' + w.lm.visits + ' js=' + j.lm.visits);
if (!(w.lm.visits > 0)) throw new Error('expected visits > 0');
if (w.lm.aborted) throw new Error('expected solved');
console.log('PARITY_OK visits', w.lm.visits, 'fresh', w.lm.fresh);

const tiny = run({ wasm: true, visitCap: 10 }, 3200000);
console.log('tiny visitCap=10', { move: tiny.move, lm: tiny.lm });
if (tiny.move !== null) throw new Error('expected abort');
if (!tiny.lm.aborted || tiny.lm.reason !== 'visit') throw new Error('expected visit abort, got ' + JSON.stringify(tiny.lm));
if (tiny.lm.visits < 11) throw new Error('expected visits >= 11, got ' + tiny.lm.visits);
console.log('VISIT_ABORT_OK visits', tiny.lm.visits);
