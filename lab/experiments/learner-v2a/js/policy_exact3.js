'use strict';
// Drop-in for the champion's src/x_policies.js createPolicy(rules, spec): identical, plus the spec key `exact3`:
//   spec.exact3 = { xK, budget, logCap, restrict?, depth?, useStandInEvaluator? }   (same fields as the champion's `exact` key)
// All other specs are passed to the champion's own createPolicy unchanged.
const path = require('path'); const C = require('./common.js');
const champion = require(path.join(C.ENGINE_SRC, 'x_policies.js'));
const { createPolicy: createBase } = require(path.join(C.ENGINE_SRC, 'policies.js'));
const H = require('./hybrid.js');
const P = require('./pooled.js');
function createPolicy(rules, spec) {
  if (spec.pooled && !spec.type) { const b = Object.assign({}, spec); delete b.pooled; return P.withPooledExact(rules, champion.createPolicy(rules, b), spec.pooled); }
  if (spec.exact3 && !spec.type) {
    const b = Object.assign({}, spec); delete b.exact3;
    const o = Object.assign({}, spec.exact3); if (o.useStandInEvaluator) o.evaluator = H.standInEvaluator(rules);
    return H.withExactEndFallback(rules, champion.createPolicy(rules, b), o);
  }
  return champion.createPolicy(rules, spec);
}
module.exports = { createPolicy };
