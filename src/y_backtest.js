'use strict';
// node src/y_backtest.js <specs.json> <seedStart> <count> <out.json>
// specs.json: [{name, spec}] or [{name, ref: 'shipped'}] / spec values of the string "$shipped" are replaced by the shipped policy.
// First row is the paired baseline. Scored under the default (true) rules.
const fs = require('fs'); const P = require('./y_pool.js');
const shipped = JSON.parse(fs.readFileSync(__dirname + '/../results/shipped_policies.json'))['52'];
const sub = (o) => {
  if (o === '$shipped') return shipped;
  if (typeof o === 'string' && o.startsWith('$nn:')) return JSON.parse(fs.readFileSync(o.slice(4)));
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    let r = {}; if (o.$extend) { r = Object.assign({}, sub(o.$extend)); }
    for (const k of Object.keys(o)) if (k !== '$extend') { if (o[k] === null) delete r[k]; else r[k] = sub(o[k]); }
    return r;
  }
  return o;
};
(async () => {
  const [file, s0, count, out] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5]];
  const specs = JSON.parse(fs.readFileSync(file)); const rows = []; let base = null;
  for (const { name, spec } of specs) {
    const t = Date.now(); const g = await P.evaluate(sub(spec), s0, count);
    if (!base) base = g;
    const st = P.stats(g), d = P.paired(g, base), ds = P.paired(g, base, 6);
    rows.push(Object.assign({ name, gain: d.mean, ci: d.ci, streakGain: ds.mean, streakCi: ds.ci }, st));
    console.log(name.padEnd(30), 'n=' + count, 'mean', st.mean.toFixed(0), '0bust', (100 * st.zeroBust).toFixed(1) + '%', '3bust', (100 * st.bustOut).toFixed(1) + '%',
      'ms', st.msPerMove.toFixed(1), 'max', st.maxMs.toFixed(0), '| clears', st.clears.toFixed(2), 'streakPts', st.streakPts.toFixed(0), 'runs4+/game', st.runs4.toFixed(3),
      '>=1:', (100 * st.oneRun4).toFixed(1) + '%', '>=2:', (100 * st.twoRuns4).toFixed(1) + '%', '| gain', d.mean.toFixed(0), '±', d.ci.toFixed(0), 'streakPts gain', ds.mean.toFixed(0), '±', ds.ci.toFixed(0), ((Date.now() - t) / 1000).toFixed(0) + 's');
    fs.writeFileSync(out, JSON.stringify({ seedStart: s0, count, rows }, null, 1));
  }
  P.close();
})();
