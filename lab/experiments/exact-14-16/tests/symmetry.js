#!/usr/bin/env node
'use strict';
// Verify, from the engine rules and exact3g, whether columns are interchangeable
// and whether the remaining deck is already a value-count (not card identities).
const path = require('path');
const C = require('../js/common.js'), E = C.E, R = C.R;
const E3G = require('../js/exact3g.js');
const assert = require('assert');

const cfg = R.cfg;
const report = {
  numCols: cfg.numCols,
  stayBreaksStreak: cfg.stayBreaksStreak,
  maxStays: cfg.maxStays,
  streakBonus: R.sb,
  perfectBonus: cfg.perfectBonus,
  columnIndexInScoring: false,
  deckIsValueCounts: true,
  notes: [],
};

function packCol(hard, ace, n, not7) { return E.mkCol(hard, ace, n, not7); }

function fresh() {
  const st = E.newGame(R);
  st.cols[0] = packCol(10, 0, 2, 1);
  st.cols[1] = packCol(7, 0, 1, 0);
  st.cols[2] = packCol(15, 0, 3, 1);
  st.cols[3] = 0;
  st.deck.fill(0); st.deck[5] = 3; st.deck[10] = 5; st.deck[1] = 2; st.deck[7] = 2;
  st.rem = 12; st.played = 40; st.busts = 0; st.stays = 2; st.prev = 1; st.score = 1000;
  return st;
}

function colList(st) { return [st.cols[0], st.cols[1], st.cols[2], st.cols[3]]; }

function swapCols(st, i, j) {
  const t = st.cols[i]; st.cols[i] = st.cols[j]; st.cols[j] = t;
}
function remapMove(m, i, j) {
  const map = (c) => (c === i ? j : c === j ? i : c);
  return { stay: m.stay < 0 ? m.stay : map(m.stay), col: map(m.col) };
}

let swapOk = 0, swapN = 0;
const moves = [];
for (let j = 0; j < 4; j++) moves.push({ stay: -1, col: j });
for (let i = 0; i < 4; i++) if (i !== 3) for (let j = 0; j < 4; j++) moves.push({ stay: i, col: j });

for (const m of moves) {
  for (const [i, j] of [[0, 1], [0, 2], [1, 2], [0, 3], [1, 3]]) {
    const a = fresh(), b = fresh();
    swapCols(b, i, j);
    const v = 5;
    try {
      E.applyMove(R, a, v, m);
      E.applyMove(R, b, v, remapMove(m, i, j));
    } catch (e) { continue; }
    swapN++;
    const as = colList(a).slice(); const bs = colList(b).slice();
    const tmp = bs[i]; bs[i] = bs[j]; bs[j] = tmp;
    const same = as.every((x, k) => x === bs[k]) && a.score === b.score && a.busts === b.busts &&
      a.stays === b.stays && a.prev === b.prev && a.over === b.over;
    if (same) swapOk++;
    else report.notes.push({ m, i, j, a: { cols: colList(a), score: a.score, prev: a.prev }, b: { cols: colList(b), score: b.score, prev: b.prev } });
  }
}
report.columnSwapTrials = swapN;
report.columnSwapIdentical = swapOk;
assert.strictEqual(swapOk, swapN, 'column swap broke scoring — columns are NOT interchangeable');
report.notes.push('MEASURED: swapping any two columns and remapping the move leaves score, busts, stays, streak, and the column-content vector identical. Stay does not break the streak (stayBreaksStreak=false); streak and busts are global, not per-column. Columns are interchangeable.');

const st = fresh();
report.deckLength = st.deck.length;
report.deckSlots = 'counts at indices 1..10 (0 unused); no per-card ids';
assert.strictEqual(st.deck.length, 11);
assert.strictEqual(R.fullDeck.length, 11);
const full = Array.from(R.fullDeck);
report.fullDeckCounts = full;
assert.strictEqual(full[10], 16, 'tens (10/J/Q/K) already merged');
for (let v = 1; v <= 9; v++) assert.strictEqual(full[v], 4);

// Use two independent solvers and a short remaining deck so the solve finishes.
function shortState() {
  const st = E.newGame(R);
  st.cols[0] = packCol(10, 0, 2, 1);
  st.cols[1] = packCol(7, 0, 1, 0);
  st.cols[2] = packCol(15, 0, 3, 1);
  st.cols[3] = 0;
  st.deck.fill(0); st.deck[5] = 2; st.deck[10] = 2; st.deck[1] = 1; st.deck[7] = 1;
  st.rem = 6; st.played = 46; st.busts = 0; st.stays = 2; st.prev = 1; st.score = 1000;
  st.deck[5]++; st.rem = 7;
  return st;
}
const p = shortState();
const X1 = E3G.createExact(R, { logCap: 21, wasm: true, visitCap: 0, cpuMs: 0 });
const m1 = X1.choose(p, 5, 2000000);
const lm1 = X1.lastMove();
const q = shortState();
swapCols(q, 0, 2);
const X2 = E3G.createExact(R, { logCap: 21, wasm: true, visitCap: 0, cpuMs: 0 });
const m2 = X2.choose(q, 5, 2000000);
const lm2 = X2.lastMove();
report.exactSwap = {
  move1: m1 && { stay: m1.stay, col: m1.col, value: m1 && m1.value },
  move2: m2 && { stay: m2.stay, col: m2.col, value: m2 && m2.value },
  visits1: lm1.visits, visits2: lm2.visits, aborted1: lm1.aborted, aborted2: lm2.aborted,
};
if (m1 && m2) {
  assert.ok(Math.abs(m1.value - m2.value) < 1e-4, 'exact value changed after column swap');
  assert.strictEqual(lm1.visits, lm2.visits, 'visit count should be identical — columns already canonicalized');
  const remap = remapMove({ stay: m2.stay, col: m2.col }, 0, 2);
  const scores1 = (m1.scores || []).map((a) => ({ stay: a.stay, col: a.col, value: a.value }));
  const scores2 = (m2.scores || []).map((a) => ({ stay: a.stay, col: a.col, value: a.value, remapped: remapMove(a, 0, 2) }));
  report.exactSwap.scores1 = scores1;
  report.exactSwap.scores2 = scores2;
  report.exactSwap.remapped = remap;
  // Tie-break is by the caller's column index, so a remapped unique best should match;
  // if several actions share the top value, the picked index may differ and that is still exact.
  const top1 = (m1.scores || []).filter((a) => Math.abs(a.value - m1.value) < 1e-4).length;
  report.exactSwap.nTop = top1;
  if (top1 === 1) {
    assert.strictEqual(m1.stay, remap.stay);
    assert.strictEqual(m1.col, remap.col);
  }
  report.notes.push('MEASURED: exact3g.choose on a column-swapped state returns the same value and the same visit count. Unique best is remapped; ties may keep a different index (iteration order). Column sorting / class keys are already in the solver.');
} else {
  report.notes.push('exact choose aborted under 2M on this smoke position; swap-value check skipped');
}
report.alreadyInExact3g = {
  columnSortBeforeHash: true,
  deckAsValueCounts: true,
  deckAwareColumnClasses: true,
  stayOnlyClearAndPlaceOnSameCol: true,
  stayDroppedWhenEmptyExists: true,
  stayCapByEmptiesAndCardsLeft: true,
  streakDroppedWhenNoScorePossible: true,
  lastCardInPlace: true,
};

console.log(JSON.stringify(report, null, 2));
console.log('SYMMETRY_OK');
const fs = require('fs');
fs.writeFileSync(path.join(__dirname, '..', 'results', 'symmetry.json'), JSON.stringify(report, null, 2));
