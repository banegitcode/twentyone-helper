'use strict';
// Shared helpers for the regret map (21 Theorist).  Uses Landon's engine read-only; nothing here sees future card order
// except play_log.js, which owns the real deck and only hands the policy the observable state (like the bench harness).
const fs = require('fs'), path = require('path');
const ROOT = '/workspace/21lab/';
const DIR = process.env.CHAMPION_DIR || path.join(ROOT, 'engine', 'twentyone-solver');
const E = require(path.join(DIR, 'src', 'engine.js'));
const X = require(path.join(DIR, 'src', 'exact2.js'));
const { createPolicy } = require(path.join(DIR, 'src', 'x_policies.js'));
const J = (f) => JSON.parse(fs.readFileSync(path.join(DIR, 'results', f), 'utf8'));
const rules = E.DEFAULT_RULES;
function championSpec() { const s = JSON.parse(JSON.stringify(J('shipped_policies.json')['52'])); if (s.deepen) s.deepen.budgetMs = 0; return s; }   // = bench champion_adapter --config shipped52
function configPolicy(name) {   // bench champion_adapter configs: exact13 = 'Complete solve from 13 cards (faster solver)' (unlimited budget, logCap 26)
  const m = /^exact(\d+)$/.exec(name); const K = +m[1]; const e = J('x_specs_early.json').find((r) => r.spec.exact2 && r.spec.exact2.xK === K).spec;
  const s = JSON.parse(JSON.stringify(e)); if (s.deepen) s.deepen.budgetMs = 0; return createPolicy(rules, s);
}
function championPolicy() { return createPolicy(rules, championSpec()); }
// FAST rollout policy: shipped network, 1-card lookahead, forced-only inner Stays, exact last 4 (no deepen, no exact-13)
function fastPolicy() { const sh = J('shipped_policies.json')['52']; return E.createSearcher(rules, { depth: 1, stayInner: sh.stayInner, cache: true, endgameK: 4, nn: sh.nn }); }
function rolloutPolicy(depth) { const sh = J('shipped_policies.json')['52']; return E.createSearcher(rules, { depth: depth, stayInner: sh.stayInner, cache: true, endgameK: 4, nn: sh.nn }); }
function exactSolver(logCap) { return X.createExact(rules, { logCap: logCap || 22 }); }
// bench card code (0..51, code%13: 0=A,1..9=2..10,10..12=J,Q,K) -> value
const codeVal = (c) => { const r = c % 13; return r === 0 ? 1 : r >= 9 ? 10 : r + 1; };
// decode engine column code
const colInfo = (c) => { if (!c) return null; const h = c & 31, a = (c >> 5) & 1, n = (c >> 6) & 7, not7 = (c >> 9) & 1; return { hard: h, ace: a, n, soft: a && h + 10 <= 21 ? h + 10 : h, all7: !not7 && n <= 3 }; };
// engine state before drawing a card, from a plain record
function mkState(r) {
  const st = E.newGame(rules); st.cols = Int32Array.from(r.cols); st.deck = Int32Array.from(r.deck); st.rem = r.rem; st.played = 52 - r.rem;
  st.busts = r.busts; st.stays = r.stays; st.prev = r.prev; st.score = 0; return st;
}
// all legal actions for card v (one Stay per card; Stay never on an empty column), like exact2.q
function legalActions(st) {
  const out = []; for (let j = 0; j < 4; j++) out.push({ stay: -1, col: j });
  if (st.stays > 0) for (let i = 0; i < 4; i++) if (st.cols[i] !== 0) for (let j = 0; j < 4; j++) out.push({ stay: i, col: j });
  return out;
}
// canonical key of an action's afterstate (to merge symmetric duplicates): resulting column codes sorted + what happened
function afterKey(st, v, a) {
  const g = E.cloneGame(st); const ev = E.applyMove(rules, g, v, a);
  return Array.from(g.cols).sort((x, y) => x - y).join(',') + '|' + g.busts + g.stays + g.prev + '|' + ev.pts + ev.bust;
}
module.exports = { E, X, rules, J, championSpec, championPolicy, configPolicy, fastPolicy, rolloutPolicy, exactSolver, codeVal, colInfo, mkState, legalActions, afterKey, ROOT };
// ---- features used for bucketing ----
// what a move does: kind in {bust, c21, c777, c5, c521, build}; n = cards in the target column after the move (0 if cleared/bust)
function moveInfo(st, v, a) {
  const g = E.cloneGame(st); const before = Array.from(st.cols).map(colInfo); const ev = E.applyMove(rules, g, v, a);
  const tgtBefore = a.stay === a.col ? null : before[a.col]; const tgtCode = a.stay === a.col ? 0 : st.cols[a.col];
  const k = tgtCode * 11 + v, p = rules.pts[k]; let kind = 'build';
  if (p < 0) kind = 'bust'; else if (p > 0) kind = p === 400 ? 'c21' : p === 600 ? 'c777' : p === 800 ? 'c5' : 'c521';
  const after = colInfo(g.cols[a.col]);
  return { kind, stay: a.stay >= 0, n: after ? after.n : 0, hard: after ? after.hard : 0, soft: after ? after.soft : 0, ace: after ? after.ace : 0, intoEmpty: tgtCode === 0,
    stayWasteful: a.stay >= 0 && a.stay !== a.col, stayCol: a.stay >= 0 ? before[a.stay] : null, pts: ev.pts + (ev.streak || 0) };
}
function posFeat(st, v) {
  const cs = Array.from(st.cols).map(colInfo); const live = cs.filter((c) => c);
  return { nEmpty: 4 - live.length, nSoft: live.filter((c) => c.ace && c.soft > c.hard).length, maxN: Math.max(0, ...live.map((c) => c.n)), n4: live.filter((c) => c.n === 4).length, n3: live.filter((c) => c.n === 3).length,
    cols: cs.map((c) => (c ? `${c.n}c/${c.ace && c.soft > c.hard ? 's' : 'h'}${c.soft}` : '-')).join(' '),
    nBustCols: Array.from(st.cols).filter((c) => c && rules.pts[c * 11 + v] < 0).length, nScoreCols: Array.from(st.cols).filter((c) => c && rules.pts[c * 11 + v] > 0).length, tens: st.deck[10] / st.rem };
}
module.exports.moveInfo = moveInfo; module.exports.posFeat = posFeat;
// standalone value network of the shipped policy: expected points to come from a pre-draw position (what the search calls a leaf)
function makeNNValue() {
  const sh = J('shipped_policies.json')['52']; const NN = sh.nn.layers.map((l) => ({ nIn: l.nIn, nOut: l.nOut, W: Float64Array.from(l.W), b: Float64Array.from(l.b) })); const scale = sh.nn.scale || 1000;
  let nnA = new Float64Array(128), nnB = new Float64Array(128); const f = new Float64Array(E.NF);
  return function nnValue(st) {
    E.featurize(st.cols, st.deck, st.rem, E.cardsLeftToPlay(st), st.busts, st.stays, st.prev, 4, f); let x = Float64Array.from(f), y = nnB;
    for (let li = 0; li < NN.length; li++) { const Ly = NN[li], last = li === NN.length - 1; const out = new Float64Array(Ly.nOut); for (let o = 0, k = 0; o < Ly.nOut; o++) { let s = Ly.b[o]; for (let i = 0; i < Ly.nIn; i++, k++) s += Ly.W[k] * x[i]; out[o] = last || s > 0 ? s : 0; } x = out; }
    return x[0] * scale;
  };
}
module.exports.makeNNValue = makeNNValue;
