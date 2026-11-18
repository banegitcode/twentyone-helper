'use strict';
// node src/clairvoyant.js <seedStart> <count> [beam]
// Best score reachable when the whole deal order is known in advance (beam search over exact states,
// best score kept per state). A ceiling no real player can reach: real play sees one card at a time.
const E = require('./engine.js');
const R = E.DEFAULT_RULES, cfg = R.cfg, sbMax = R.sb.length - 1;
const [s0, count, beam] = [+process.argv[2], +process.argv[3], +process.argv[4] || 30000];
function solve(deck) {
  let cur = new Map(); cur.set('0,0,0,0|0|' + cfg.maxStays + '|0', { c: [0, 0, 0, 0], b: 0, s: cfg.maxStays, p: 0, sc: 0, x: [0, 0, 0, 0, 0, 0] });   // x: streak points, clears, current run, runs of 2, of 3, of 4+
  let best = 0, bestX = null;
  for (let i = 0; i < deck.length; i++) {
    const v = deck[i], nxt = new Map(), last = i === deck.length - 1;
    const fin = (x) => { const y = x.slice(); if (y[2] === 2) y[3]++; else if (y[2] === 3) y[4]++; else if (y[2] >= 4) y[5]++; y[2] = 0; return y; };
    const push = (c, b, s, p, sc, x) => {
      if (b >= cfg.maxBusts || last) { const f = sc + (b === 0 ? cfg.perfectBonus : 0); if (f > best) { best = f; bestX = fin(x).concat(b); } return; }
      const cs = c.slice().sort((x, y) => x - y), k = cs.join(',') + '|' + b + '|' + s + '|' + p, o = nxt.get(k);
      if (!o || o.sc < sc) nxt.set(k, { c: cs, b, s, p, sc, x });
    };
    for (const st of cur.values()) {
      const place = (c, s) => {
        const seen = new Set();
        for (let j = 0; j < 4; j++) {
          if (seen.has(c[j])) continue; seen.add(c[j]);
          const k = c[j] * 11 + v, pt = R.pts[k], d = c.slice();
          if (pt < 0) { d[j] = 0; push(d, st.b + 1, s, 0, st.sc, fin(st.x)); }
          else if (pt > 0) { d[j] = 0; const y = st.x.slice(); y[0] += R.sb[st.p]; y[1]++; y[2]++; push(d, st.b, s, Math.min(st.p + 1, sbMax), st.sc + pt + R.sb[st.p], y); }
          else { d[j] = R.next[k]; push(d, st.b, s, 0, st.sc, fin(st.x)); }
        }
      };
      place(st.c, st.s);
      if (st.s > 0) { const seen = new Set(); for (let j = 0; j < 4; j++) { if (!st.c[j] || seen.has(st.c[j])) continue; seen.add(st.c[j]); const d = st.c.slice(); d[j] = 0; place(d, st.s - 1); } }
    }
    if (nxt.size > beam) { const a = [...nxt.entries()].sort((x, y) => y[1].sc - x[1].sc).slice(0, beam); cur = new Map(a); } else cur = nxt;
    if (!cur.size) break;
  }
  return { best, x: bestX };
}
const out = []; const t = Date.now();
const X = [0, 0, 0, 0, 0, 0, 0];
for (let g = 0; g < count; g++) { const r = solve(E.shuffledDeck(s0 + g, R)); out.push(r.best); r.x.forEach((v, i) => { X[i] += v; }); }
out.sort((a, b) => a - b);
const mean = out.reduce((a, b) => a + b, 0) / out.length, q = (p) => out[Math.floor(p * (out.length - 1))];
const tail = (x) => (100 * out.filter((s) => s >= x).length / out.length).toFixed(1) + '%';
console.log('Whole deck known in advance n=' + count, 'beam', beam, 'mean', mean.toFixed(0), 'min', out[0], 'p10', q(0.1), 'med', q(0.5), 'p90', q(0.9), 'max', out[out.length - 1],
  '>=12k', tail(12000), '>=14k', tail(14000), '>=16k', tail(16000), ((Date.now() - t) / 1000).toFixed(0) + 's');
console.log('per game on the best line found: streak points', (X[0] / count).toFixed(0), '| clears', (X[1] / count).toFixed(1), '| runs of 2:', (X[3] / count).toFixed(2), 'of 3:', (X[4] / count).toFixed(2), 'of 4+:', (X[5] / count).toFixed(2), '| busts', (X[6] / count).toFixed(2));
