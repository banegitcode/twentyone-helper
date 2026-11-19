'use strict';
// createPolicy(rules, spec) for adapter2.js: spec.pooledp = {...} -> js/pooledp.js over the champion policy (spec without `exact`); anything else -> champion createPolicy.
const path = require('path'); const C = require('./common.js');
const champion = require(path.join(C.ENGINE_SRC, 'x_policies.js'));
const P = require('./pooledp.js');
function createPolicy(rules, spec) {
  if (spec.pooledp && !spec.type) { const b = Object.assign({}, spec); delete b.pooledp; return P.withPooledP(rules, champion.createPolicy(rules, b), spec.pooledp); }
  return champion.createPolicy(rules, spec);
}
module.exports = { createPolicy };
