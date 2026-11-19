'use strict';
// Sampled deep lookahead (coordinator item a). For the close candidates of the base search, play D sampled cards ahead
// with a fast greedy network player (same sampled deals for every candidate), end on the network value, pick the best mean.
//   { type: 'srl', base: <search spec, no exact key>, exact: {...}?, S: 24, D: 6, margin: 100, w: 1 }
//   final score of a candidate = w * sampled mean + (1 - w) * search value
const E = require('./engine.js');
function createSRL(rules, spec, createPolicy) {
  const base = createPolicy(rules, spec.base), cfg = rules.cfg, PTS = rules.pts, NEXT = rules.next, SB = rules.sb, maxPrev = SB.length - 1, perfect = cfg.perfectBonus, maxBusts = cfg.maxBusts;
  const nn = spec.base.nn, F2 = nn.feat === 2, L = nn.layers.map((l) => ({ nIn: l.nIn, nOut: l.nOut, W: Float64Array.from(l.W), b: Float64Array.from(l.b) })), scale = nn.scale || 1000;
  const bufA = new Float64Array(256), bufB = new Float64Array(256);
  const S = spec.S || 24, D = spec.D || 6, margin = spec.margin != null ? spec.margin : 100, w = spec.w != null ? spec.w : 1;
  const cols = new Int32Array(4), deck = new Int32Array(11); let rem = 0, busts = 0, stays = 0, prev = 0;
  function V() {  // value of the current sim state between cards
    if (busts >= maxBusts) return 0;
    if (rem === 0) return busts === 0 ? perfect : 0;
    if (F2) E.featurize2(cols, deck, rem, rem, busts, stays, prev, 4, bufA, PTS, SB); else E.featurize(cols, deck, rem, rem, busts, stays, prev, 4, bufA);
    let x = bufA, y = bufB;
    for (let li = 0; li < L.length; li++) {
      const l = L[li], W = l.W, nIn = l.nIn, last = li === L.length - 1;
      for (let o = 0, k = 0; o < l.nOut; o++) { let s = l.b[o]; for (let i = 0; i < nIn; i++, k++) s += W[k] * x[i]; y[o] = last || s > 0 ? s : 0; }
      const t = x; x = y; y = t;
    }
    return x[0] * scale;
  }
  // put card v on column j (after an optional stay on si); returns the points scored
  function place(v, si, j) {
    if (si >= 0) { cols[si] = 0; stays--; if (cfg.stayBreaksStreak) prev = 0; }
    const k = cols[j] * 11 + v, p = PTS[k]; deck[v]--; rem--;
    if (p < 0) { busts++; cols[j] = 0; prev = 0; return 0; }
    if (p > 0) { const r = p + SB[prev]; if (prev < maxPrev) prev++; cols[j] = 0; return r; }
    cols[j] = NEXT[k]; prev = 0; return 0;
  }
  // greedy step: returns [reward, valueAfter] having applied the best action
  const sc = new Int32Array(4);
  function greedy(v) {
    const b0 = busts, s0 = stays, p0 = prev; sc.set(cols);
    let best = -Infinity, bsi = -1, bj = 0, allBust = true;
    for (let j = 0; j < 4; j++) {
      let dup = false; for (let k = 0; k < j; k++) if (sc[k] === sc[j]) { dup = true; break; } if (dup) continue;
      if (PTS[sc[j] * 11 + v] >= 0) allBust = false;
      const r = place(v, -1, j), val = r + V();
      cols.set(sc); busts = b0; stays = s0; prev = p0; deck[v]++; rem++;
      if (val > best) { best = val; bsi = -1; bj = j; }
    }
    if (allBust && s0 > 0) for (let i = 0; i < 4; i++) {
      let dup = false; for (let k = 0; k < i; k++) if (sc[k] === sc[i]) { dup = true; break; } if (dup) continue;
      const r = place(v, i, i), val = r + V();
      cols.set(sc); busts = b0; stays = s0; prev = p0; deck[v]++; rem++;
      if (val > best) { best = val; bsi = i; bj = i; }
    }
    const r = place(v, bsi, bj); return [r, best - r];
  }
  let rng = E.mulberry32(spec.seed || 7); const rest = new Int32Array(52), samp = new Int32Array(64 * 16);
  const c0 = new Int32Array(4), d0 = new Int32Array(11);
  function choose(st, v) {
    const res = base.choose(st, v);
    if (res.exact || !res.deepened) return res;
    const all = res.scores.filter((a) => a.deep !== undefined); let bd = -Infinity; for (const a of all) if (a.deep > bd) bd = a.deep;
    const cands = all.filter((a) => a.deep >= bd - margin); if (cands.length < 2) return res;
    let n = 0; for (let x = 1; x <= 10; x++) for (let i = 0; i < st.deck[x] - (x === v ? 1 : 0); i++) rest[n++] = x;
    const d = Math.min(D, n); if (d < 1) return res;
    for (let s = 0; s < S; s++) for (let i = 0; i < d; i++) { const j = i + Math.floor(rng() * (n - i)); const t = rest[i]; rest[i] = rest[j]; rest[j] = t; samp[s * 16 + i] = t; }
    let best = null, bv = -Infinity;
    for (const a of cands) {
      cols.set(st.cols); for (let x = 1; x <= 10; x++) deck[x] = st.deck[x]; rem = st.rem; busts = st.busts; stays = st.stays; prev = st.prev;
      const r0 = place(v, a.stay, a.col); c0.set(cols); d0.set(deck); const rem0 = rem, b0 = busts, s0 = stays, p0 = prev;
      let tot = 0;
      for (let s = 0; s < S; s++) {
        cols.set(c0); deck.set(d0); rem = rem0; busts = b0; stays = s0; prev = p0;
        let acc = 0, tail = -1;
        for (let i = 0; i < d && busts < maxBusts && rem > 0; i++) { const g = greedy(samp[s * 16 + i]); acc += g[0]; tail = g[1]; }
        tot += acc + (tail < 0 ? V() : tail);
      }
      a.mc = r0 + tot / S; const f = w * a.mc + (1 - w) * a.deep;
      if (f > bv) { bv = f; best = a; }
    }
    return { stay: best.stay, col: best.col, value: best.value, scores: res.scores, sampled: true };
  }
  return { choose, reset() { if (base.reset) base.reset(); rng = E.mulberry32(spec.seed || 7); } };
}
module.exports = { createSRL };
