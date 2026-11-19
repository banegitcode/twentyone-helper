'use strict';
// Builds the midsearch policy:  exact endgame (exact3 + hybrid, identical to deeper:K) with, above `from` cards left, the msearch searcher
// over a selectable leaf network.  Everything it loads is inside experiments/midgame-search/ (nets/<name>.json, js/*) plus engine/ (champion code, read-only).
//   config  midsearch:<params>[:leaf=<name>][:leaflow=<name>]      (params = comma list k=v)
//   leaf     network for the mid-game search (rem >= from) and the default for leaflow; default ship_nn = the champion's own network (nets/ship_nn.json)
//   leaflow  network for the champion-style search used when rem < from (e.g. a move on which the exact solve gives up at 14-16 cards)
//   scope=mine|all  (default mine): mine = extra pass only for decisions above 16 cards with >= 1 empty column and no Stay left; all = every decision
//   params   exact: xK (16) xb (3200000) xl (25) ; search: from (17) + the msearch cfg keys (dm dk dd xd xm xk bm bd cap pool spread depth) ;
//            champ=1: use the champion's own createSearcher for the non-exact moves (reproduces deeper:K exactly; for tests)
const fs = require('fs'), path = require('path');
const C = require('./common.js'); const E = C.E;
const NETS = path.join(__dirname, '..', 'nets');
const H = require('./hybrid.js'); const MS = require('./msearch.js');
function loadNet(name) {
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) throw new Error('bad leaf name ' + name);
  const f = path.join(NETS, name + '.json'); if (!fs.existsSync(f)) throw new Error('leaf network not found: ' + f);
  const m = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (m.layers) return m;                                          // engine format {scale, layers:[{nIn,nOut,W,b}], feat?}
  if (m.W && m.b) {                                                // Learner format {W:[[..]..], b:[[..]..]} on the champion's architecture
    const ship = JSON.parse(fs.readFileSync(path.join(NETS, 'ship_nn.json'), 'utf8'));
    return { scale: m.scale || ship.scale, feat: m.feat, layers: ship.layers.map((l, i) => ({ nIn: l.nIn, nOut: l.nOut, W: [].concat(...m.W[i]), b: m.b[i] })) };
  }
  throw new Error('unknown network format in ' + f);
}
function parseConfig(config) {
  const seg = config.split(':'); if (seg[0] !== 'midsearch') throw new Error('config must start with midsearch');
  const o = { leaf: 'ship_nn', leaflow: null, p: {} };
  for (const s of seg.slice(1)) {
    if (!s) continue;
    for (const kv of s.split(',')) { const [k, v] = kv.split('='); if (v === undefined) throw new Error('bad param ' + kv); if (k === 'leaf') o.leaf = v; else if (k === 'leaflow') o.leaflow = v; else o.p[k] = (v === 'mine' || v === 'all') ? v : +v; }
  }
  if (!o.leaflow) o.leaflow = o.leaf;
  return o;
}
function createMidPolicy(rules, specIn, config, shared) {
  const o = parseConfig(config), p = o.p;
  const spec = JSON.parse(JSON.stringify(specIn)); delete spec.exact;
  const netHi = loadNet(o.leaf), netLo = loadNet(o.leaflow);
  const lowSpec = Object.assign({}, spec, { nn: netLo }), hiSpec = Object.assign({}, spec, { nn: netHi });
  const low = E.createSearcher(rules, lowSpec);
  const from = p.from || 17;
  let mid = null, hiChamp = null;
  if (p.champ) hiChamp = E.createSearcher(rules, hiSpec);
  else mid = MS.create(rules, null, Object.assign({}, p, { from, nnLeaf: netHi, dm: spec.deepen ? spec.deepen.margin : 150, dk: spec.deepen ? spec.deepen.topK : 3, dd: spec.deepen ? spec.deepen.depth : 2, depth: spec.depth }, p.dm != null ? { dm: p.dm } : {}, p.dk != null ? { dk: p.dk } : {}, p.dd != null ? { dd: p.dd } : {}));
  const base = {
    choose(st, v) { if (st.rem >= from) return hiChamp ? hiChamp.choose(st, v) : mid.choose(st, v); return low.choose(st, v); },
    reset() { low.reset(); if (hiChamp) hiChamp.reset(); if (mid) mid.reset(); },
  };
  const ex = { xK: p.xK != null ? p.xK : 16, budget: p.xb != null ? p.xb : 3200000, logCap: p.xl != null ? p.xl : 25 };
  const pol = H.withExactEndFallback(rules, base, ex, shared);
  pol.mid = mid; pol.parsed = o; pol.exactCfg = ex;
  return pol;
}
module.exports = { createMidPolicy, parseConfig, loadNet };
