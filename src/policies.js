'use strict';
const E = require('./engine.js');

// Monte Carlo rollout policy: candidates from a search policy, re-ranked by simulated playouts.
function createMC(rules, p) {
  const base = E.createSearcher(rules, p.base);
  const roll = E.createSearcher(rules, p.rollout);
  const R = p.rollouts || 100, topK = p.topK || 3, margin = p.margin != null ? p.margin : 150;
  let rng = E.mulberry32(p.seed || 1);
  function choose(st, v) {
    const res = base.choose(st, v);
    if (res.exact) return res;
    const cands = res.scores.filter((a) => a.value >= res.value - margin).sort((a, b) => b.value - a.value).slice(0, topK);
    if (cands.length < 2) return res;
    const rest = [];
    for (let x = 1; x <= 10; x++) for (let i = 0; i < st.deck[x] - (x === v ? 1 : 0); i++) rest.push(x);
    const sums = new Float64Array(cands.length);
    for (let r = 0; r < R; r++) {
      for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = rest[i]; rest[i] = rest[j]; rest[j] = t; }
      for (let c = 0; c < cands.length; c++) {
        const g = E.cloneGame(st);
        E.applyMove(rules, g, v, cands[c]);
        let i = 0;
        while (!g.over) { const x = rest[i++]; E.applyMove(rules, g, x, roll.choose(g, x)); }
        sums[c] += g.score;
      }
    }
    let bi = 0; for (let c = 1; c < cands.length; c++) if (sums[c] > sums[bi]) bi = c;
    return cands[bi];
  }
  return { choose, reset() { base.reset(); roll.reset(); rng = E.mulberry32(p.seed || 1); } };
}

function createPolicy(rules, spec) {
  if (spec.type === 'mc') return createMC(rules, spec);
  return E.createSearcher(rules, spec);
}
module.exports = { createPolicy };
