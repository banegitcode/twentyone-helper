'use strict';
// Extra policy types for experiments (existing src/policies.js is untouched).
//   { type: 'x', base: <spec>, xK: 8, logCap: 22 }  base policy until xK cards remain, then exact play (src/x_exact.js)
//     optional budget: N -> give up a move's exact solve after N new positions and use `fallback` (or base) for that move
//   { type: 'ds', base: <spec> }  base policy with provably dominated Stays replaced
//   { type: 'sw', early: <spec>, late: <spec>, at: 14 }  switch policy when `at` cards or fewer remain
const E = require('./engine.js'); const { createPolicy } = require('./policies.js'); const { createExact, withExactEnd } = require('./exact.js');
function createX(rules, spec) {
  if (spec.exact && !spec.type) { const b = Object.assign({}, spec); delete b.exact; return withExactEnd(rules, createPolicy(rules, b), spec.exact); }
  if (spec.type === 'x') {
    const base = createX(rules, spec.base), fb = spec.fallback ? createX(rules, spec.fallback) : null, X = createExact(rules, { logCap: spec.logCap || 22 }), K = spec.xK;
    return {
      // spec.budget: try the exact solve with at most this many new positions per move, else fall back to the base search
      choose(st, v) {
        if (st.rem <= K && E.cardsLeftToPlay(st) === st.rem) { const m = X.choose(st, v, spec.budget || 0); if (m) return m; if (fb) return fb.choose(st, v); }
        return base.choose(st, v);
      },
      reset() { if (base.reset) base.reset(); if (fb && fb.reset) fb.reset(); if (X.states()) X.clear(); },
    };
  }
  if (spec.type === 'sw') {
    const a = createX(rules, spec.early), b = createX(rules, spec.late), at = spec.at;
    return { choose(st, v) { return st.rem <= at ? b.choose(st, v) : a.choose(st, v); }, reset() { if (a.reset) a.reset(); if (b.reset) b.reset(); } };
  }
  if (spec.type === 'ds') {
    // Replace a provably dominated Stay by the move that dominates it: a Stay on column i with the card placed
    // elsewhere -> same placement without the Stay; a Stay while another column is empty -> the card on the empty column.
    const a = createX(rules, spec.base);
    return {
      choose(st, v) {
        const m = a.choose(st, v); if (m.stay < 0 || m.exact) return m;
        if (m.stay !== m.col) return Object.assign({}, m, { stay: -1, fixed: true });
        for (let j = 0; j < rules.cfg.numCols; j++) if (st.cols[j] === 0) return Object.assign({}, m, { stay: -1, col: j, fixed: true });
        return m;
      },
      reset() { if (a.reset) a.reset(); },
    };
  }
  return createPolicy(rules, spec);
}
module.exports = { createPolicy: createX };
