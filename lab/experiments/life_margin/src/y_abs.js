'use strict';
// Abstract ("frozen deck") solver, coordinator item b. The remaining deck is collapsed to its current proportions:
// every future card is drawn with probability deck[v]/rem as of now, for exactly `rem` more cards. That removes the
// deck multiset from the state (columns, cards left, busts, stays, streak remain), and the abstract game is solved
// exactly by memoised expectimax, like src/exact.js. Policy: { type: 'abs', base: <spec>, from: 16, to: 13, budget: N }
// uses the abstract solve for moves with to <= cards left <= from (base policy elsewhere / when the budget is hit).
const E = require('./engine.js');
function createAbs(rules, opts) {
  const cfg = rules.cfg, NC = cfg.numCols, SB = rules.sb, maxPrev = SB.length - 1, perfect = cfg.perfectBonus, maxBusts = cfg.maxBusts, sbs = cfg.stayBreaksStreak;
  const canon = (c) => { if (c === 0) return 0; const h = c & 31, a = (c >> 5) & 1, n = (c >> 6) & 7, nt = (c >> 9) & 1; return E.mkCol(h, a && h <= 11 ? 1 : 0, n, !nt && n <= 2 ? 0 : 1); };
  const idOf = new Int16Array(1024).fill(-1), codes = [0]; idOf[0] = 0;
  for (let q = 0; q < codes.length; q++) for (let v = 1; v <= 10; v++) { const k = codes[q] * 11 + v; if (rules.pts[k] !== 0) continue; const c = canon(rules.next[k]); if (idOf[c] < 0) { idOf[c] = codes.length; codes.push(c); } }
  const NID = codes.length, NX = new Int32Array(NID * 11), PT = new Int32Array(NID * 11);
  for (let q = 0; q < NID; q++) for (let v = 1; v <= 10; v++) { const k = codes[q] * 11 + v; PT[q * 11 + v] = rules.pts[k]; NX[q * 11 + v] = rules.pts[k] === 0 ? idOf[canon(rules.next[k])] : 0; }
  const logCap = opts.logCap || 22, cap = 1 << logCap, mask = cap - 1, maxLoad = Math.floor(cap * 0.8);
  const K1 = new Uint32Array(cap), K2 = new Uint32Array(cap), VAL = new Float32Array(cap); let count = 0;
  const cols = new Int32Array(4), pr = new Float64Array(11); let rem = 0, busts = 0, stays = 0, prev = 0, budget = Infinity, fresh = 0;
  const ABORT = { abort: true };
  function V() {
    if (busts >= maxBusts) return 0;
    if (rem === 0) return busts === 0 ? perfect : 0;
    let a = cols[0], b = cols[1], c = cols[2], d = cols[3], t;
    if (a > b) { t = a; a = b; b = t; } if (c > d) { t = c; c = d; d = t; }
    if (a > c) { t = a; a = c; c = t; } if (b > d) { t = b; b = d; d = t; } if (b > c) { t = b; b = c; c = t; }
    const k1 = (a | (b << 8) | (c << 16) | (d << 24)) >>> 0, k2 = (rem | (busts << 25) | (stays << 27) | (prev << 29)) >>> 0;
    let h = (Math.imul(k1 ^ Math.imul(k2, 0x9E3779B1), 0x85EBCA6B)); h = (h ^ (h >>> 15)) & mask;
    while (K2[h] !== 0) { if (K2[h] === k2 && K1[h] === k1) return VAL[h]; h = (h + 1) & mask; }
    const p0 = prev, s0 = stays; let sum = 0; rem--;
    for (let v = 1; v <= 10; v++) {
      const pv = pr[v]; if (pv === 0) continue;
      let best = -Infinity;
      for (let j = 0; j < NC; j++) {
        const cj = cols[j]; let dup = false; for (let k = 0; k < j; k++) if (cols[k] === cj) { dup = true; break; } if (dup) continue;
        const kk = cj * 11 + v, p = PT[kk]; let val;
        if (p < 0) { busts++; cols[j] = 0; prev = 0; val = V(); busts--; }
        else if (p > 0) { cols[j] = 0; prev = p0 < maxPrev ? p0 + 1 : p0; val = p + SB[p0] + V(); }
        else { cols[j] = NX[kk]; prev = 0; val = V(); }
        cols[j] = cj; prev = p0; if (val > best) best = val;
      }
      if (s0 > 0 && cols[0] !== 0 && cols[1] !== 0 && cols[2] !== 0 && cols[3] !== 0) {
        stays = s0 - 1; const ps = sbs ? 0 : p0, p = PT[v], nx = NX[v];
        for (let i = 0; i < NC; i++) {
          const ci = cols[i]; let dup = false; for (let k = 0; k < i; k++) if (cols[k] === ci) { dup = true; break; } if (dup) continue;
          let val;
          if (p < 0) { busts++; cols[i] = 0; prev = 0; val = V(); busts--; }
          else if (p > 0) { cols[i] = 0; prev = ps < maxPrev ? ps + 1 : ps; val = p + SB[ps] + V(); }
          else { cols[i] = nx; prev = 0; val = V(); }
          cols[i] = ci; prev = p0; if (val > best) best = val;
        }
        stays = s0;
      }
      sum += pv * best;
    }
    rem++;
    if (count >= maxLoad || ++fresh > budget) throw ABORT;
    h = (Math.imul(k1 ^ Math.imul(k2, 0x9E3779B1), 0x85EBCA6B)); h = (h ^ (h >>> 15)) & mask;
    while (K2[h] !== 0) h = (h + 1) & mask;
    K1[h] = k1; K2[h] = k2; VAL[h] = sum; count++;
    return sum;
  }
  // action values for card v from engine state st; null if the budget is hit. The table is rebuilt for every move
  // (the frozen proportions change with every card).
  function choose(st, v, maxNew) {
    if (count) { K1.fill(0); K2.fill(0); count = 0; }
    budget = maxNew || Infinity; fresh = 0;
    const r1 = st.rem - 1; for (let x = 1; x <= 10; x++) pr[x] = r1 > 0 ? (st.deck[x] - (x === v ? 1 : 0)) / r1 : 0;
    const base = new Int32Array(4); for (let i = 0; i < NC; i++) base[i] = idOf[canon(st.cols[i])];
    let best = null;
    try {
      const one = (si, j) => {
        cols.set(base); rem = r1; busts = st.busts; stays = st.stays; prev = st.prev;
        if (si >= 0) { cols[si] = 0; stays--; if (sbs) prev = 0; }
        const kk = cols[j] * 11 + v, p = PT[kk]; let val;
        if (p < 0) { busts++; cols[j] = 0; prev = 0; val = V(); }
        else if (p > 0) { const pp = prev; cols[j] = 0; prev = pp < maxPrev ? pp + 1 : pp; val = p + SB[pp] + V(); }
        else { cols[j] = NX[kk]; prev = 0; val = V(); }
        if (!best || val > best.value + 1e-9) best = { stay: si, col: j, value: val, abs: true };
      };
      for (let j = 0; j < NC; j++) one(-1, j);
      if (st.stays > 0) for (let i = 0; i < NC; i++) if (st.cols[i] !== 0) one(i, i);
    } catch (e) { if (e === ABORT) return null; throw e; }
    return best;
  }
  // abstract value of a position between cards (proportions frozen as of now)
  function value(st) {
    if (count) { K1.fill(0); K2.fill(0); count = 0; }
    budget = Infinity; fresh = 0;
    for (let x = 1; x <= 10; x++) pr[x] = st.deck[x] / st.rem;
    for (let i = 0; i < NC; i++) cols[i] = idOf[canon(st.cols[i])];
    rem = st.rem; busts = st.busts; stays = st.stays; prev = st.prev;
    return V();
  }
  return { choose, value, states: () => count, NID };
}
module.exports = { createAbs };
