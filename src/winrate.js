'use strict';
// Compares the score-maximising policy with the win-chance policy against opponent models.
// node src/winrate.js <dist-net.json> <seedStart> <games> <out.json> [margin=0.01]
// An opponent model is a normal spread of opponent scores (mean, sd). The win chance of a game is the chance
// that the opponent's score falls below ours, so each game gives an exact probability instead of a coin flip.
const fs = require('fs'); const P = require('./pool.js');
const erf = (x) => { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
const cdf = (x, m, sd) => 0.5 * (1 + erf((x - m) / (sd * Math.SQRT2)));
const table = (m, sd) => Array.from({ length: 401 }, (_, k) => +cdf(k * 50, m, sd).toFixed(5));
module.exports = { table, cdf };
if (require.main === module) (async () => {
  const [netF, s0, n, outF, margin] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5], +process.argv[6] || 0.01];
  const nnd = JSON.parse(fs.readFileSync(netF)), base = JSON.parse(fs.readFileSync('results/ship_nn.json'));
  const OPP = [[5000, 1500], [6000, 1500], [7000, 1500], [7300, 1300], [8000, 1300]];
  const col = (g) => g.map((r) => r[0]), mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const t0 = Date.now(), ref = col(await P.evaluate(base, s0, n, {}));
  console.log('score-maximising policy: mean', mean(ref).toFixed(0), ((Date.now() - t0) / 1000).toFixed(0) + 's');
  const meanMode = col(await P.evaluate({ depth: 1, stayInner: 'forced', cache: true, endgameK: 4, nn: nnd, deepen: { depth: 2, margin: 150, topK: 3 } }, s0, n, {}));
  console.log('distribution network used for average score: mean', mean(meanMode).toFixed(0));
  const rows = [];
  for (const [m, sd] of OPP) {
    const tb = table(m, sd), t1 = Date.now();
    const spec = { depth: 1, stayInner: 'forced', cache: true, endgameK: 4, nn: nnd, util: { table: tb, step: 50 }, deepen: { depth: 2, margin, topK: 3 } };
    const got = col(await P.evaluate(spec, s0, n, {}));
    const a = ref.map((x) => cdf(x, m, sd)), b = got.map((x) => cdf(x, m, sd)), d = b.map((x, i) => x - a[i]);
    const md = mean(d), sdv = Math.sqrt(mean(d.map((x) => (x - md) * (x - md))) / n);
    const row = { opp: [m, sd], winRef: mean(a), winNew: mean(b), gain: md, ci: 1.96 * sdv, meanNew: mean(got) };
    rows.push(row);
    console.log('opponent', m, '±', sd, '| win chance: score policy', (100 * row.winRef).toFixed(2) + '%', 'win policy', (100 * row.winNew).toFixed(2) + '%',
      'gain', (100 * md).toFixed(2), '±', (100 * row.ci).toFixed(2), 'points | its mean score', row.meanNew.toFixed(0), ((Date.now() - t1) / 1000).toFixed(0) + 's');
    fs.writeFileSync(outF, JSON.stringify({ seedStart: s0, n, rows }, null, 1));
  }
  P.close();
})();
