'use strict';
// Exact endgame with a frontier-evaluator fallback.  Same shape as exact2.withExactEnd: returns a policy { choose(st, v), reset() }.
//   const H = require('./hybrid.js');
//   const policy = H.withExactEndFallback(rules, baseChoosePolicy, { xK: 15, budget: 3e6, logCap: 24, evaluator, depth: 2 });
// choose(st, v):
//   rem > xK                         -> base.choose (the champion's own search)
//   rem <= xK, exact solve finishes  -> exact move  (X.choose with at most `budget` NEW positions; solved positions are kept)
//   rem <= xK, exact solve exceeds   -> if o.evaluator is given: depth-limited expectimax of `depth` card plies with evaluator() at the
//                                       frontier (this file);  else base.choose.
// EVALUATOR INTERFACE (what the champion's NN must provide for the frontier):
//   evaluator(s) -> expected points still to come from s (a number; the exact solver's value() has the same meaning), where s is the
//   engine state AFTER a card was placed and BEFORE the next card is revealed:
//   { cols: Int32Array(4) engine column codes (E.mkCol layout), deck: Int32Array(11) unseen cards per value 1..10, rem, busts, stays, prev }
//   It must NOT use the order of the remaining cards (it cannot: only counts are given).
const path = require('path');
const E3 = require('./exact3g.js'); const C = require('./common.js'); const E = C.E;

// Stand-in evaluator: FOR TIMING ONLY (not tuned, not the champion's NN).  Per column: value of the column by card count, times the
// chance the next card does not bust it, plus 170 per remaining card scaled by safe-column share, plus the Perfect Bonus chance proxy.
function standInEvaluator(rules) {
  const V = [0, 30, 80, 200, 450];
  return function (s) {
    let h = 0, nonEmpty = 0;
    for (let j = 0; j < 4; j++) { const c = s.cols[j]; if (!c) continue; nonEmpty++; const hard = E.hardOf(c), n = E.nOf(c); let safe = 0; for (let v = 1; v <= 10; v++) if (hard + v <= 21) safe += s.deck[v]; h += V[n] * (s.rem ? safe / s.rem : 1); }
    return h + 150 * s.rem + (s.busts === 0 ? 700 : 0);
  };
}

// depth-limited expectimax. Returns { stay, col, value } for the dealt card v.  depth = number of further card plies after this one.
function depthLimited(rules, st, v, evaluator, depth) {
  const NC = rules.cfg.numCols, perfect = rules.cfg.perfectBonus;
  let nodes = 0;
  function futureValue(s, d) {          // s after a placement, before next card
    if (s.over) return 0;
    if (s.rem === 0) return s.busts === 0 ? perfect : 0;
    if (d === 0) { nodes++; return evaluator({ cols: s.cols, deck: s.deck, rem: s.rem, busts: s.busts, stays: s.stays, prev: s.prev }); }
    let sum = 0;
    for (let w = 1; w <= 10; w++) { const c = s.deck[w]; if (!c) continue; sum += c * best(s, w, d - 1).value; }
    return sum / s.rem;
  }
  function actions(s) { const a = []; for (let j = 0; j < NC; j++) a.push([-1, j]); if (s.stays > 0) for (let i = 0; i < NC; i++) if (s.cols[i]) for (let j = 0; j < NC; j++) a.push([i, j]); return a; }
  function best(s, w, d) {
    let bv = -1, bs = -1, bc = 0;
    for (const [si, j] of actions(s)) {
      const g = E.cloneGame(s), before = g.score; E.applyMove(rules, g, w, { stay: si, col: j });
      const val = (g.score - before) + futureValue(g, d);
      if (val > bv + 1e-9) { bv = val; bs = si; bc = j; }
    }
    return { stay: bs, col: bc, value: bv };
  }
  const r = best(st, v, depth); r.nodes = nodes; return r;
}

function withExactEndFallback(rules, base, o, shared) {
  const X = shared || E3.createExact(rules, { logCap: o.logCap || 22, restrict: o.restrict, wasm: o.wasm }), K = o.xK, B = o.budget || 0, D = o.depth || 1;
  const stats = { exact: 0, fallbackEval: 0, fallbackBase: 0 };
  return {
    stats,
    choose(st, v) {
      if (st.rem <= K && E.cardsLeftToPlay(st) === st.rem) {
        const m = X.choose(st, v, B); if (m) { stats.exact++; return m; }
        if (o.evaluator) { stats.fallbackEval++; const r = depthLimited(rules, st, v, o.evaluator, D); return { stay: r.stay, col: r.col, value: r.value, exact: false }; }
        stats.fallbackBase++;
      }
      return base.choose(st, v);
    },
    reset() { if (base.reset) base.reset(); },
  };
}
module.exports = { withExactEndFallback, depthLimited, standInEvaluator };
