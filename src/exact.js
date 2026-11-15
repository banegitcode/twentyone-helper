'use strict';
// Exact solver (memoised expectimax to the end of the deck, true objective) with a compact typed-array hash table.
// Works for any rules from E.compile(cfg) with numCols <= 4, no card timer, and any start position.
//   const X = createExact(rules, { logCap: 26 });
//   X.value(st)            -> optimal expected points still to come from engine state st (between cards)
//   X.q(st, v)             -> [{stay, col, value}] exact value of every legal action for dealt card v
// Column states are canonicalised (ace flag kept only while it can still count as 11; the all-sevens flag only
// while three 7s is still possible), which does not change any payout.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.TwentyOneExact = factory(root.TwentyOne);
})(typeof self !== 'undefined' ? self : this, function (E) {
function createExact(rules, opts) {
  opts = opts || {};
  const cfg = rules.cfg, NC = cfg.numCols, SB = rules.sb, maxPrev = SB.length - 1, perfect = cfg.perfectBonus, maxBusts = cfg.maxBusts;
  if (NC > 4) throw new Error('at most 4 columns');
  const sbs = cfg.stayBreaksStreak;
  // ---- dense canonical column ids ----
  const canon = (c) => {
    if (c === 0) return 0;
    const h = c & 31, a = (c >> 5) & 1, n = (c >> 6) & 7, nt = (c >> 9) & 1;
    return E.mkCol(h, a && h <= 11 ? 1 : 0, n, !nt && n <= 2 ? 0 : 1);
  };
  const idOf = new Int16Array(1024).fill(-1), codes = [0]; idOf[0] = 0;
  for (let q = 0; q < codes.length; q++) for (let v = 1; v <= 10; v++) {
    const k = codes[q] * 11 + v; if (rules.pts[k] !== 0) continue;
    const c = canon(rules.next[k]); if (idOf[c] < 0) { idOf[c] = codes.length; codes.push(c); }
  }
  const NID = codes.length; if (NID > 255) throw new Error('too many column states');
  const NX = new Int32Array(NID * 11), PT = new Int32Array(NID * 11);
  for (let q = 0; q < NID; q++) for (let v = 1; v <= 10; v++) { const k = codes[q] * 11 + v; PT[q * 11 + v] = rules.pts[k]; NX[q * 11 + v] = rules.pts[k] === 0 ? idOf[canon(rules.next[k])] : 0; }
  // ---- deck index ----
  const mult = new Int32Array(11); let m = 1;
  for (let v = 1; v <= 10; v++) { mult[v] = m; m *= rules.fullDeck[v] + 1; }
  if (m > (1 << 25)) throw new Error('deck too large for the key');
  // ---- hash table ----
  let logCap = opts.logCap || 24, cap = 1 << logCap, mask = cap - 1;
  let K1 = new Uint32Array(cap), K2 = new Uint32Array(cap), VAL = new Float32Array(cap), count = 0;
  const maxLoad = opts.maxStates || Math.floor(cap * 0.8);
  // ---- mutable search state ----
  const cols = new Int32Array(4), deck = new Int32Array(11);
  let rem = 0, busts = 0, stays = 0, prev = 0, didx = 0, budget = Infinity, fresh = 0;
  const ABORT = { abort: true };

  function V() {
    if (busts >= maxBusts) return 0;
    if (rem === 0) return busts === 0 ? perfect : 0;
    // sorted column key
    let a = cols[0], b = cols[1], c = cols[2], d = cols[3], t;
    if (a > b) { t = a; a = b; b = t; } if (c > d) { t = c; c = d; d = t; }
    if (a > c) { t = a; a = c; c = t; } if (b > d) { t = b; b = d; d = t; } if (b > c) { t = b; b = c; c = t; }
    const k1 = (a | (b << 8) | (c << 16) | (d << 24)) >>> 0;
    const k2 = (didx | (busts << 25) | (stays << 27) | (prev << 29)) >>> 0;
    let h = (Math.imul(k1 ^ Math.imul(k2, 0x9E3779B1), 0x85EBCA6B)); h = (h ^ (h >>> 15)) & mask;
    while (K2[h] !== 0) { if (K2[h] === k2 && K1[h] === k1) return VAL[h]; h = (h + 1) & mask; }
    const p0 = prev, s0 = stays;
    let sum = 0;
    for (let v = 1; v <= 10; v++) {
      const cnt = deck[v]; if (!cnt) continue;
      deck[v]--; rem--; didx -= mult[v];
      let best = -Infinity;
      for (let j = 0; j < NC; j++) {
        const cj = cols[j];
        let dup = false; for (let k = 0; k < j; k++) if (cols[k] === cj) { dup = true; break; }
        if (dup) continue;
        const kk = cj * 11 + v, p = PT[kk]; let val;
        if (p < 0) { busts++; cols[j] = 0; prev = 0; val = V(); busts--; }
        else if (p > 0) { cols[j] = 0; prev = p0 < maxPrev ? p0 + 1 : p0; val = p + SB[p0] + V(); }
        else { cols[j] = NX[kk]; prev = 0; val = V(); }
        cols[j] = cj; prev = p0;
        if (val > best) best = val;
      }
      // Stays. Exact pruning (proved by a strategy-copying argument and checked against the engine's full search):
      // a Stay on column i followed by placing the card somewhere else is never better than the same placement
      // without the Stay (the Stay can still be used later), and with an empty column available no Stay is needed.
      if (s0 > 0 && cols[0] !== 0 && (NC < 2 || cols[1] !== 0) && (NC < 3 || cols[2] !== 0) && (NC < 4 || cols[3] !== 0)) {
        stays = s0 - 1; const ps = sbs ? 0 : p0, p = PT[v], nx = NX[v];
        for (let i = 0; i < NC; i++) {
          const ci = cols[i];
          let dup = false; for (let k = 0; k < i; k++) if (cols[k] === ci) { dup = true; break; }
          if (dup) continue;
          let val;
          if (p < 0) { busts++; cols[i] = 0; prev = 0; val = V(); busts--; }
          else if (p > 0) { cols[i] = 0; prev = ps < maxPrev ? ps + 1 : ps; val = p + SB[ps] + V(); }
          else { cols[i] = nx; prev = 0; val = V(); }
          cols[i] = ci; prev = p0;
          if (val > best) best = val;
        }
        stays = s0;
      }
      deck[v]++; rem++; didx += mult[v];
      sum += cnt * best;
    }
    const r = sum / rem;
    if (count >= maxLoad) throw new Error('exact table full: ' + count);
    if (++fresh > budget) throw ABORT;
    h = (Math.imul(k1 ^ Math.imul(k2, 0x9E3779B1), 0x85EBCA6B)); h = (h ^ (h >>> 15)) & mask;
    while (K2[h] !== 0) h = (h + 1) & mask;
    K1[h] = k1; K2[h] = k2; VAL[h] = r; count++;
    return r;
  }

  function load(st) {
    if (st.horizon !== Infinity && st.horizon - st.played < st.rem) throw new Error('card timer not supported');
    cols.fill(0);
    for (let i = 0; i < NC; i++) cols[i] = idOf[canon(st.cols[i])];
    didx = 0; rem = 0;
    for (let v = 1; v <= 10; v++) { deck[v] = st.deck[v]; didx += mult[v] * deck[v]; rem += deck[v]; }
    busts = st.busts; stays = st.stays; prev = st.prev;
  }
  function value(st) { load(st); return V(); }
  // exact value of each action for card v (engine column indices; duplicates by symmetry are all listed)
  function q(st, v) {
    load(st);
    const out = [], p0 = prev, s0 = stays, b0 = busts;
    deck[v]--; rem--; didx -= mult[v];
    const one = (si, j) => {
      const save = Int32Array.from(cols); let ps = p0;
      if (si >= 0) { cols[si] = 0; stays = s0 - 1; if (sbs) ps = 0; }
      const kk = cols[j] * 11 + v, p = PT[kk]; let val;
      if (p < 0) { busts++; cols[j] = 0; prev = 0; val = V(); }
      else if (p > 0) { cols[j] = 0; prev = ps < maxPrev ? ps + 1 : ps; val = p + SB[ps] + V(); }
      else { cols[j] = NX[kk]; prev = 0; val = V(); }
      cols.set(save); prev = p0; stays = s0; busts = b0;
      out.push({ stay: si, col: j, value: val });
    };
    for (let j = 0; j < NC; j++) one(-1, j);
    if (s0 > 0) for (let i = 0; i < NC; i++) if (cols[i] !== 0) for (let j = 0; j < NC; j++) one(i, j);
    deck[v]++; rem++; didx += mult[v];
    return out;
  }
  function clear() { K1.fill(0); K2.fill(0); count = 0; }
  // policy interface: plays exactly from the given position on
  // maxNew (optional): give up (return null) once this many new positions had to be solved; solved ones are kept
  function choose(st, v, maxNew) {
    let list;
    if (maxNew) { if (count + maxNew + 64 > maxLoad) clear(); budget = maxNew; fresh = 0; try { list = q(st, v); } catch (e) { budget = Infinity; if (e === ABORT) return null; throw e; } budget = Infinity; }
    else list = q(st, v);
    let best = list[0];
    for (const a of list) if (a.value > best.value + 1e-9) best = a;
    return { stay: best.stay, col: best.col, value: best.value, scores: list, exact: true };
  }
  return { value, q, choose, clear, states: () => count, cap: () => cap };
}
// Shipped wrapper: `base` policy until xK cards remain, then an exact solve of the rest of the game for each move,
// capped at `budget` new positions; if the cap is hit that move uses `base` (solved positions are kept for later moves).
// The table holds true position values, so it is kept between games; choose() empties it when it is nearly full.
function withExactEnd(rules, base, o, shared) {
  const X = shared || createExact(rules, { logCap: o.logCap || 21 }), K = o.xK, B = o.budget || 0;
  return {
    choose(st, v) {
      if (st.rem <= K && E.cardsLeftToPlay(st) === st.rem) { const m = X.choose(st, v, B); if (m) return m; }
      return base.choose(st, v);
    },
    reset() { if (base.reset) base.reset(); },
  };
}
return { createExact, withExactEnd };
});
