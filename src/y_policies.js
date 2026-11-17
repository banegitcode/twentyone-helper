'use strict';
// Experiment policies (round 2). Everything in x_policies.js plus:
//   { type: 'srules', sbScale: 1.5, base: <spec>, exactTrue: true }
//     the base policy SEARCHES under rules whose streak bonuses are multiplied by sbScale (the game itself is scored by
//     whatever rules the caller plays under). exactTrue: the exact endgame (base.exact) keeps the true rules.
const E = require('./engine.js'); const X = require('./x_policies.js'); const { withExactEnd } = require('./exact.js');
function createY(rules, spec) {
  if (spec.type === 'srules') {
    const sb = rules.sb.slice(1).map((x) => x * spec.sbScale);
    const br = E.compile(Object.assign({}, rules.cfg, { streakBonus: sb }));
    if (spec.exactTrue && spec.base.exact) {
      const b = Object.assign({}, spec.base); delete b.exact;
      return withExactEnd(rules, X.createPolicy(br, b), spec.base.exact);
    }
    return X.createPolicy(br, spec.base);
  }
  if (spec.type === 'srl') {
    const p = require('./y_rollout.js').createSRL(rules, spec, createY);
    return spec.exact ? withExactEnd(rules, p, spec.exact) : p;
  }
  if (spec.type === 'abs') {
    // abstract frozen-deck solve for moves with spec.to <= cards left <= spec.from; base policy otherwise
    const base = createY(rules, spec.base), A = require('./y_abs.js').createAbs(rules, { logCap: spec.logCap || 23 });
    const stat = { tried: 0, done: 0, states: 0 };
    return {
      stat,
      choose(st, v) {
        if (st.rem <= spec.from && st.rem >= spec.to) { stat.tried++; const m = A.choose(st, v, spec.budget || 0); if (m) { stat.done++; stat.states += A.states(); return m; } }
        return base.choose(st, v);
      },
      reset() { if (base.reset) base.reset(); },
    };
  }
  return X.createPolicy(rules, spec);
}
module.exports = { createPolicy: createY };
