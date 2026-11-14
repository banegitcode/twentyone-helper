'use strict';
// node src/headroom.js <seedStart> <nShipped> <nStrong> <nMc> [only]
// Headroom probe: does a far slower player beat the shipped one on the same shuffles?
const fs = require('fs'); const P = require('./pool.js');
const ship = JSON.parse(fs.readFileSync(__dirname + '/../results/shipped_policies.json'))['52'];
const [s0, nA, nB, nC, only] = [+process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5], process.argv[6]];
const strong = Object.assign({}, ship, { depth: 2, deepen: { depth: 3, margin: 300, topK: 4 } });
const mc = { type: 'mc', base: ship, rollout: { depth: 0, nn: ship.nn, stayInner: 'forced' }, rollouts: 100, topK: 3, margin: 150, seed: 7 };
(async () => {
  let base = null;
  for (const [name, spec, n] of [['Shipped', ship, nA], ['Deeper everywhere (3 ahead, 4 on close calls)', strong, nB], ['Shipped + 100 rollouts on close calls', mc, nC]]) {
    if (!n || (only && !name.startsWith(only) && name !== 'Shipped')) continue;
    const t = Date.now(), g = await P.evaluate(spec, s0, n); if (!base) base = g;
    const st = P.stats(g), d = P.paired(g, base.slice(0, n)), sc = g.map((x) => x[0]);
    const tail = (x) => (100 * sc.filter((y) => y >= x).length / n).toFixed(2) + '%';
    console.log(name.padEnd(46), 'n=' + n, 'mean', st.mean.toFixed(0), 'max', Math.max.apply(null, sc), '>=10k', tail(10000), '>=11k', tail(11000), '>=12k', tail(12000), '>=13k', tail(13000), '>=14k', tail(14000),
      'ms/move', st.msPerMove.toFixed(1), 'gain vs shipped', d.mean.toFixed(0), '±', d.ci.toFixed(0), ((Date.now() - t) / 1000).toFixed(0) + 's');
  }
  P.close();
})();
