'use strict';
// node src/backtest.js <specs.json> <seedStart> <count> <out.json> [horizon]
// specs.json: [{name, spec, n?}]  (n = optional smaller sample for slow policies; always a prefix of the same seeds)
const fs = require('fs'); const P = require('./pool.js');
(async () => {
  const [file, s0, count, out, hz] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5], +process.argv[6] || 0];
  const specs = JSON.parse(fs.readFileSync(file)); const rows = []; let base = null;
  for (const { name, spec, n } of specs) {
    const cnt = Math.min(n || count, count); const t = Date.now();
    const g = await P.evaluate(spec, s0, cnt, { horizon: hz });
    if (!base) base = g;
    const st = P.stats(g), d = P.paired(g, base.slice(0, cnt));
    const row = Object.assign({ name, gain: d.mean, ci: d.ci }, st); rows.push(row);
    console.log(name.padEnd(34), 'n=' + cnt, 'mean', st.mean.toFixed(0), 'med', st.median, 'p5', st.p5, 'p95', st.p95, '0bust', (100 * st.zeroBust).toFixed(1) + '%',
      '3bust', (100 * st.bustOut).toFixed(1) + '%', 'ms', st.msPerMove.toFixed(3), 'gain', d.mean.toFixed(0), '±', d.ci.toFixed(0), ((Date.now() - t) / 1000).toFixed(0) + 's');
    fs.writeFileSync(out, JSON.stringify({ seedStart: s0, count, horizon: hz || 52, rows }, null, 1));
  }
  P.close();
})();
