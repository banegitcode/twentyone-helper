'use strict';
// Drop-in for the champion's src/x_policies.js createPolicy(rules, spec), with spec.exact3g:
//   spec.exact3g = { xK, budget, logCap, visitCap, cpuMs, wasm? }
// exact3g is the reusable guarded solver (js/exact3g.js). All other specs go to the champion unchanged.
const path = require('path'); const C = require('./common.js');
const champion = require(path.join(C.ENGINE_SRC, 'x_policies.js'));
const H = require('./hybrid.js');
const E3G = require('./exact3g.js');

function createPolicy(rules, spec) {
  if (spec.exact3g && !spec.type) {
    const b = Object.assign({}, spec); delete b.exact3g;
    const o = Object.assign({}, spec.exact3g);
    const X = E3G.createExact(rules, {
      logCap: o.logCap, restrict: o.restrict, wasm: o.wasm,
      visitCap: o.visitCap || 0, cpuMs: o.cpuMs || 0,
    });
    const inner = H.withExactEndFallback(rules, champion.createPolicy(rules, b), o, X);
    return {
      stats: inner.stats,
      exact: X,
      lastExact: null,
      choose(st, v) {
        const m = inner.choose(st, v);
        // lastMove is only meaningful when the exact solver was actually invoked
        if (st.rem <= o.xK && C.E.cardsLeftToPlay(st) === st.rem) this.lastExact = X.lastMove();
        else this.lastExact = null;
        return m;
      },
      reset() { if (inner.reset) inner.reset(); },
    };
  }
  return champion.createPolicy(rules, spec);
}
module.exports = { createPolicy };
