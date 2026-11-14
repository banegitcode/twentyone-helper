// Bankroll simulation of the page's own bet calculator. Loaded only for testing.
window.simBet = function (mu, slope, runs, games, seed0) {
  const t = window.__t, R = t.rec, fin = [], dds = [], stakes = [];
  const rng = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let x = Math.imul(a ^ a >>> 15, 1 | a); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
  const FEES = [0.06, 0.12, 0.18, 0.24, 0.48, 0.6, 1.2, 1.8, 2.4, 4.8, 9.6, 12, 18, 24, 36, 48, 60, 120];
  for (let r = 0; r < runs; r++) {
    const u = rng(seed0 + r), nrm = () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(6.283185307 * u());
    R.start = 50; R.games = []; R.moves = []; R.boost = false; R.lose = false; R.risk = 0.25;
    let peak = 50, dd = 0, bal = 50; const base = Date.now() - 3600e3;
    for (let i = 0; i < games; i++) {
      const z1 = nrm(), z2 = nrm(), b = t.betAdvice(); if (!b.tier) break;
      const k = FEES.indexOf(b.tier[0]), my = Math.round((8755 + 1100 * z1) / 50) * 50, opp = Math.round((mu + slope * k + 1300 * z2) / 50) * 50;
      const g = { t: base + i * 1000, my, opp, res: my > opp ? 'W' : my < opp ? 'L' : 'T', fee: b.tier[0], prize: b.tier[1] };
      R.games.push(g); bal += g.res === 'W' ? g.prize - g.fee : g.res === 'T' ? g.prize / 2 - g.fee : -g.fee;
      peak = Math.max(peak, bal); dd = Math.max(dd, 1 - bal / peak); if (i === games - 1) stakes.push(b.tier[0]);
    }
    fin.push(bal); dds.push(dd);
  }
  fin.sort((a, b) => a - b); dds.sort((a, b) => a - b); stakes.sort((a, b) => a - b);
  const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
  R.games = []; R.moves = []; R.start = 0;
  return { mu, slope, runs, p10: +q(fin, 0.1).toFixed(2), median: +q(fin, 0.5).toFixed(2), p90: +q(fin, 0.9).toFixed(2), mean: +(fin.reduce((a, b) => a + b, 0) / fin.length).toFixed(2), below25: fin.filter((x) => x < 25).length, medDD: +q(dds, 0.5).toFixed(2), p90DD: +q(dds, 0.9).toFixed(2), medLastStake: q(stakes, 0.5) };
};
