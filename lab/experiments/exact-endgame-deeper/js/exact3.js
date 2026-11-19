'use strict';
// Exact solver, second version: same answers and interface as src/exact.js (createExact with value/q/choose/ponder/
// clear/states/cap, and withExactEnd), fewer positions and less time per position.
//
// What is different from exact.js (every item is exact; src/z_gate.js checks the result against exact.js):
//  1. Deck-aware column classes.  Two column states are interchangeable when every sequence of cards that can still
//     be dealt (any sub-multiset of the remaining deck, in any order) produces the same outcomes on both (nothing /
//     bust / clear worth p points) at every step.  The value of a position depends on a column only through that
//     behaviour, so each column is replaced by the smallest id of its class.  The classes for deck D are computed from
//     the classes for the decks D - v (partition refinement), once per deck.  This subsumes: ace flag kept only while
//     a soft 21 is reachable, the all-sevens flag only while enough 7s remain, card count dropped when five cards
//     cannot be reached, totals merged when 21 is unreachable, "every card busts" columns merged, and so on.
//     Classes only merge as the deck shrinks, so a representative stays valid for every later deck.
//  2. Stays that can never be used are dropped: a Stay is only ever needed on a turn that starts with no empty column
//     (kept from exact.js: a Stay is only useful as "clear column i and put the card there", and never with an empty
//     column available), so at most (cards left - empty columns) Stays can be used.
//  3. The streak counter is dropped when no remaining card can score on any column next turn (it resets anyway).
//  4. Positions with one card left are computed in place, never stored.
//  5. Storage: one small open-addressing table per (deck, busts, stays, streak), 8 bytes per position (32-bit column
//     key + float32 value), all inside one pool of 12 << logCap bytes (the memory exact.js uses for the same logCap).
//     The search works deck by deck, so the tables it touches stay in the processor cache.  Children are looked up
//     before the call (no call for a hit); the three untouched columns are sorted once per card, not once per child.
//  6. choose() scores only actions that can be optimal (distinct column classes; Stay i + card on i, and only without
//     an empty column); its `scores` list has those actions only.  q() still lists every legal action.
//  7. Optional WebAssembly kernel (src/exact2_kernel.wasm.js, same algorithm, same memory layout); the JavaScript
//     kernel below is the fallback.  opts.wasm = false forces JavaScript.
// The table is emptied when a position arrives whose deck is not a sub-deck of the one the tables were built for
// (a new game); exact.js kept it, but positions of different games practically never coincide.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const SRC = process.env.TWENTYONE_SRC || require('path').join(__dirname, '../../../engine/twentyone-solver/src');
    let K = null; try { K = require(SRC + '/exact2_kernel.wasm.js'); } catch (e) {}
    module.exports = factory(require(SRC + '/engine.js'), K);
  } else root.TwentyOneExact = factory(root.TwentyOne, root.TwentyOneExactKernel || null);
})(typeof self !== 'undefined' ? self : this, function (E, KERNEL) {
let wasmModule = null, wasmTried = false;
const kernelBytes = () => (typeof Buffer !== 'undefined' ? Buffer.from(KERNEL.base64, 'base64') : Uint8Array.from(atob(KERNEL.base64), (c) => c.charCodeAt(0)));
function getWasmModule() {
  if (wasmTried) return wasmModule; wasmTried = true;
  try { if (KERNEL && typeof WebAssembly !== 'undefined') wasmModule = new WebAssembly.Module(kernelBytes()); } catch (e) { wasmModule = null; }
  return wasmModule;
}
// Browsers may refuse to compile a module synchronously on the main thread: call (and await) this once at start-up
// and createExact() will then use the WebAssembly kernel; without it the page may fall back to JavaScript.
function ready() {
  if (wasmTried || !KERNEL || typeof WebAssembly === 'undefined') return Promise.resolve(!!wasmModule);
  return WebAssembly.compile(kernelBytes()).then((m) => { wasmModule = m; wasmTried = true; return true; }, () => { wasmTried = true; return false; });
}

function createExact(rules, opts) {
  opts = opts || {};
  const cfg = rules.cfg, NC = cfg.numCols, SB = rules.sb, maxPrev = SB.length - 1, perfect = cfg.perfectBonus, maxBusts = cfg.maxBusts;
  if (NC > 4) throw new Error('at most 4 columns');
  const sbs = cfg.stayBreaksStreak ? 1 : 0, NU = 4 - NC, NS = cfg.maxStays + 1, NP = maxPrev + 1, NCOMBO = maxBusts * NS * NP;
  // ---- dense raw column ids (same closure as exact.js) ----
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
  const PC = new Int32Array(NID * 11), pvals = [];
  // ---- memory: one buffer, addressed in 32-bit words ----
  //  header: [1] next free word  [2] positions stored  [3] positions stored in this call  [4] budget (0 = none)
  //          [5] max positions   [16..47] free-list heads by table size  [48..58] deck
  //          [64..74] local deck multipliers  [80..87] streak bonus   then PT, NX (NID*11 each), then the pool:
  //  pool:   SLOT[local deck index] -> deck block (0 = not built), deck blocks and tables
  //  deck block: NID bytes class of each raw id, NID bytes "can score with one more card", then per (busts, stays,
  //              streak): word0 = table offset, word1 = count << 5 | log2(slots)
  //  table:  slots of 2 words: key (0 = empty), float32 value
  const H_BUMP = 1, H_COUNT = 2, H_FRESH = 3, H_BUDGET = 4, H_MAX = 5, FL = 16, DK = 48, LM = 64, SBO = 80;
  const PTO = 96, NXO = PTO + NID * 11, P0 = NXO + NID * 11, RW = (2 * NID + 3) >> 2, BLK = RW + NCOMBO * 2;
  const logCap = opts.logCap || 24, cap = 1 << logCap, END = P0 + cap * 3;
  // measurement only (src/z_ablate.js): opts.ablate = { classes: false, stayCap: false, prevDrop: false } switches a
  // reduction off; any of them forces the JavaScript kernel
  const AB = opts.ablate || null, abClasses = !!AB && AB.classes === false, abPrev = !!AB && AB.prevDrop === false, STAYCAP = !(AB && AB.stayCap === false);
  // restricted-action search (NOT exact; src of the "exact-endgame-deeper" experiment): opts.restrict = { noBust, greedyScore, stayForced }
  //   noBust      never place a card where it busts a column when a non-busting placement exists
  //   greedyScore when some placement clears a column, consider only clearing placements (and no Stay)
  //   stayForced  a Stay is considered only when every plain placement busts
  const RS = opts.restrict || null, RS_NB = !!RS && !!RS.noBust, RS_GS = !!RS && !!RS.greedyScore, RS_SF = !!RS && !!RS.stayForced, RSON = RS_NB || RS_GS || RS_SF;
  const useWasm = opts.wasm !== false && !AB && !RSON && getWasmModule() !== null;
  let memory = null, buf;
  if (useWasm) { memory = new WebAssembly.Memory({ initial: Math.ceil(END * 4 / 65536) }); buf = memory.buffer; } else buf = new ArrayBuffer(END * 4);
  const U = new Uint32Array(buf), F = new Float32Array(buf), U8 = new Uint8Array(buf), I = new Int32Array(buf);
  const deck = new Int32Array(buf, DK * 4, 11), lmult = new Int32Array(buf, LM * 4, 11);
  for (let q = 0; q < NID; q++) for (let v = 1; v <= 10; v++) {
    const k = codes[q] * 11 + v, p = rules.pts[k]; I[PTO + q * 11 + v] = p; I[NXO + q * 11 + v] = p === 0 ? idOf[canon(rules.next[k])] : 0;
    if (p !== 0) { let i = pvals.indexOf(p); if (i < 0) { i = pvals.length; pvals.push(p); } PC[q * 11 + v] = NID + i; }
    if (q === 0 && p !== 0) throw new Error('a single card must not clear or bust a column');
  }
  for (let i = 0; i < SB.length; i++) { if (i > 7) throw new Error('streak table too long'); I[SBO + i] = SB[i]; }
  const CW = NID + pvals.length;
  U[H_BUMP] = P0; U[H_MAX] = opts.maxStates || 0x7fffffff;
  const ABORT = { abort: true }, FULL = { full: true };
  let rem = 0, lidx = 0;
  const bdeck = new Int32Array(11).fill(-1);
  const cls = new Int32Array(NID), stamp = new Int32Array((NID + 1) * CW), cmap = new Int32Array((NID + 1) * CW), repOf = new Int32Array(NID); let gen = 0;

  function reset() { U.fill(0, P0, U[H_BUMP]); U.fill(0, FL, FL + 32); U[H_BUMP] = P0; U[H_COUNT] = 0; bdeck.fill(-1); }
  function rebase(d) {
    reset();
    let n = 1; for (let v = 1; v <= 10; v++) { bdeck[v] = d[v]; lmult[v] = n; n *= d[v] + 1; if (n > (1 << 26)) break; }
    if (n > cap) { bdeck.fill(-1); throw new Error('deck too large for this table'); }
    U[H_BUMP] = P0 + n;
  }
  // deck block for the deck currently in deck[] (local index li); builds the blocks of its sub-decks first
  function buildRow(li) {
    for (let v = 1; v <= 10; v++) if (deck[v] > 0 && U[P0 + li - lmult[v]] === 0) { deck[v]--; buildRow(li - lmult[v]); deck[v]++; }
    const blk = U[H_BUMP]; if (blk + BLK > END) throw FULL;
    U[H_BUMP] = blk + BLK; U[P0 + li] = blk;
    const ro = blk << 2, so = ro + NID;
    cls.fill(0); let ncls = 1;
    for (let v = 1; v <= 10; v++) {
      if (deck[v] <= 0) continue;
      const co = U[P0 + li - lmult[v]] << 2; gen++; let n2 = 0;
      for (let c = 0; c < NID; c++) {
        const kk = c * 11 + v, p = I[PTO + kk], key = cls[c] * CW + (p !== 0 ? PC[kk] : U8[co + I[NXO + kk]]);
        if (stamp[key] !== gen) { stamp[key] = gen; cmap[key] = n2++; }
        cls[c] = cmap[key];
        if (p > 0 || abPrev) U8[so + c] = 1;
      }
      ncls = n2;
    }
    repOf.fill(-1, 0, ncls);
    for (let c = 0; c < NID; c++) { const k = cls[c]; if (repOf[k] < 0) repOf[k] = c; U8[ro + c] = abClasses ? c : repOf[k]; }
    return blk;
  }
  function fail(code) { throw code === 1 ? FULL : ABORT; }

  // ------------------------------------------------------------------------------------------------------------
  // JavaScript kernel (the WebAssembly kernel, src/z_kernel.ts, is a line-by-line translation of this block)
  // ------------------------------------------------------------------------------------------------------------
  function talloc(l) {
    const words = 2 << l, head = U[FL + l];
    if (head !== 0) { U[FL + l] = U[head]; U.fill(0, head, head + words); return head; }
    const off = U[H_BUMP]; if (off + words > END) fail(1);
    U[H_BUMP] = off + words; return off;
  }
  function insert(m, key, val) {
    let off = U[m], info = U[m + 1], l = info & 31, cnt = info >>> 5;
    if (off === 0) { l = 2; off = talloc(l); U[m] = off; }
    else if ((cnt + 1) * 4 > (3 << l)) {
      const noff = talloc(l + 1), nmask = (2 << l) - 1, n = 1 << l;
      for (let i = 0; i < n; i++) {
        const k = U[off + 2 * i]; if (k === 0) continue;
        let h = Math.imul(k, 0x9E3779B1); h = (h ^ (h >>> 15)) & nmask;
        while (U[noff + 2 * h] !== 0) h = (h + 1) & nmask;
        U[noff + 2 * h] = k; U[noff + 2 * h + 1] = U[off + 2 * i + 1];
      }
      U[off] = U[FL + l]; U[FL + l] = off;
      off = noff; l++; U[m] = off;
    }
    const mask = (1 << l) - 1;
    let h = Math.imul(key, 0x9E3779B1); h = (h ^ (h >>> 15)) & mask;
    while (U[off + 2 * h] !== 0) h = (h + 1) & mask;
    U[off + 2 * h] = key; F[off + 2 * h + 1] = val;
    U[m + 1] = ((cnt + 1) << 5) | l; U[H_COUNT]++;
  }
  // value of the position a <= b <= c <= d (class ids for the current deck, whose block is blk); rem > 0
  function kChild(a, b, c, d, busts, stays, prev, blk) {
    if (STAYCAP && stays > 0) { const mx = rem + NU - (a === 0 ? b === 0 ? c === 0 ? d === 0 ? 4 : 3 : 2 : 1 : 0); if (stays > mx) stays = mx > 0 ? mx : 0; }
    const so = (blk << 2) + NID;
    if (prev > 0 && (U8[so + a] | U8[so + b] | U8[so + c] | U8[so + d]) === 0) prev = 0;
    if (rem === 1) return V(a, b, c, d, busts, stays, prev, 0, 0);
    const key = ((a | (b << 8) | (c << 16) | (d << 24)) + 1) >>> 0, m = blk + RW + ((busts * NS + stays) * NP + prev) * 2, off = U[m];
    if (off !== 0) {
      const mask = (1 << (U[m + 1] & 31)) - 1;
      let h = Math.imul(key, 0x9E3779B1); h = (h ^ (h >>> 15)) & mask;
      for (;;) {
        const e = U[off + 2 * h];
        if (e === key) return F[off + 2 * h + 1];
        if (e === 0) break;
        h = (h + 1) & mask;
      }
    }
    return V(a, b, c, d, busts, stays, prev, key, m);
  }
  // insert x into the sorted triple and evaluate
  function ins(x, t1, t2, t3, busts, stays, prev, blk) {
    if (x <= t2) return x <= t1 ? kChild(x, t1, t2, t3, busts, stays, prev, blk) : kChild(t1, x, t2, t3, busts, stays, prev, blk);
    return x <= t3 ? kChild(t1, t2, x, t3, busts, stays, prev, blk) : kChild(t1, t2, t3, x, busts, stays, prev, blk);
  }
  // best of: card v on the column with raw id x (others t1 <= t2 <= t3), or Stay on it and v on the emptied column
  // mode bit0: evaluate the plain placement, bit1: evaluate the Stay option (restricted search only; exact search passes 3)
  function col(x, t1, t2, t3, v, busts, stays, prev, blk, xs, mode) {
    const kk = x * 11 + v, p = I[PTO + kk]; let val = -1;
    if (mode & 1) {
      if (p < 0) val = busts + 1 >= maxBusts ? 0 : kChild(0, t1, t2, t3, busts + 1, stays, 0, blk);
      else if (p > 0) val = p + I[SBO + prev] + kChild(0, t1, t2, t3, busts, stays, prev < maxPrev ? prev + 1 : prev, blk);
      else val = ins(U8[(blk << 2) + I[NXO + kk]], t1, t2, t3, busts, stays, 0, blk);
    }
    if (xs >= 0 && (mode & 2)) { const w = ins(xs, t1, t2, t3, busts, stays - 1, 0, blk); if (w > val) val = w; }
    return val;
  }
  // a <= b <= c <= d are class ids for the current deck; m = 0: do not store
  function V(a, b, c, d, busts, stays, prev, key, m) {
    let sum = 0;
    const canStay = stays > 0 && (NU === 0 ? a : NU === 1 ? b : NU === 2 ? c : d) !== 0;
    if (rem === 1) {
      const base = busts === 0 ? perfect : 0, sc = I[SBO + prev] + base;
      for (let v = 1; v <= 10; v++) {
        if (deck[v] === 0) continue;
        let p = I[PTO + d * 11 + v], best = p > 0 ? p + sc : p < 0 ? 0 : base, val;
        if (NU < 3) { p = I[PTO + c * 11 + v]; val = p > 0 ? p + sc : p < 0 ? 0 : base; if (val > best) best = val; }
        if (NU < 2) { p = I[PTO + b * 11 + v]; val = p > 0 ? p + sc : p < 0 ? 0 : base; if (val > best) best = val; }
        if (NU < 1) { p = I[PTO + a * 11 + v]; val = p > 0 ? p + sc : p < 0 ? 0 : base; if (val > best) best = val; }
        if (canStay && base > best) best = base;
        return best;
      }
    }
    for (let v = 1; v <= 10; v++) {
      const cnt = deck[v]; if (cnt === 0) continue;
      deck[v]--; rem--; lidx -= lmult[v];
      let blk = U[P0 + lidx]; if (blk === 0) blk = buildRow(lidx);
      const ro = blk << 2;
      let s0 = (U8[ro + a] << 8) | a, s1 = (U8[ro + b] << 8) | b, s2 = (U8[ro + c] << 8) | c, s3 = (U8[ro + d] << 8) | d, t;
      if (s0 > s1) { t = s0; s0 = s1; s1 = t; } if (s2 > s3) { t = s2; s2 = s3; s3 = t; }
      if (s0 > s2) { t = s0; s0 = s2; s2 = t; } if (s1 > s3) { t = s1; s1 = s3; s3 = t; } if (s1 > s2) { t = s1; s1 = s2; s2 = t; }
      const r0 = s0 >> 8, r1 = s1 >> 8, r2 = s2 >> 8, r3 = s3 >> 8, xs = canStay ? U8[ro + I[NXO + v]] : -1;
      let best = -1, val;
      if (!RSON) {
        best = col(s3 & 255, r0, r1, r2, v, busts, stays, prev, blk, xs, 3);
        if (NU < 3 && s2 !== s3) { val = col(s2 & 255, r0, r1, r3, v, busts, stays, prev, blk, xs, 3); if (val > best) best = val; }
        if (NU < 2 && s1 !== s2) { val = col(s1 & 255, r0, r2, r3, v, busts, stays, prev, blk, xs, 3); if (val > best) best = val; }
        if (NU < 1 && s0 !== s1) { val = col(s0 & 255, r1, r2, r3, v, busts, stays, prev, blk, xs, 3); if (val > best) best = val; }
      } else {
        const o2 = NU < 3 && s2 !== s3, o1 = NU < 2 && s1 !== s2, o0 = NU < 1 && s0 !== s1;
        const q3 = I[PTO + (s3 & 255) * 11 + v], q2 = o2 ? I[PTO + (s2 & 255) * 11 + v] : 0, q1 = o1 ? I[PTO + (s1 & 255) * 11 + v] : 0, q0 = o0 ? I[PTO + (s0 & 255) * 11 + v] : 0;
        const anyScore = q3 > 0 || q2 > 0 || q1 > 0 || q0 > 0, anyNonBust = q3 >= 0 || (o2 && q2 >= 0) || (o1 && q1 >= 0) || (o0 && q0 >= 0);
        const useStay = canStay && (!RS_SF || !anyNonBust) && !(RS_GS && anyScore);
        const al = (q) => (RS_GS && anyScore ? q > 0 : RS_NB && anyNonBust ? q >= 0 : true);
        const md = (q) => (al(q) ? 1 : 0) | (useStay ? 2 : 0);
        let m3 = md(q3);
        if (m3) best = col(s3 & 255, r0, r1, r2, v, busts, stays, prev, blk, xs, m3);
        if (o2) { m3 = md(q2); if (m3) { val = col(s2 & 255, r0, r1, r3, v, busts, stays, prev, blk, xs, m3); if (val > best) best = val; } }
        if (o1) { m3 = md(q1); if (m3) { val = col(s1 & 255, r0, r2, r3, v, busts, stays, prev, blk, xs, m3); if (val > best) best = val; } }
        if (o0) { m3 = md(q0); if (m3) { val = col(s0 & 255, r1, r2, r3, v, busts, stays, prev, blk, xs, m3); if (val > best) best = val; } }
      }
      deck[v]++; rem++; lidx += lmult[v];
      sum += cnt * best;
    }
    const r = sum / rem;
    if (m === 0) return r;
    if (U[H_COUNT] >= U[H_MAX]) fail(1);
    if (U[H_BUDGET] !== 0 && ++U[H_FRESH] > U[H_BUDGET]) fail(2);
    insert(m, key, r);
    return r;
  }
  // entry point: columns x0..x3 are class ids for the current deck in any order
  function jsRoot(x0, x1, x2, x3, busts, stays, prev, rem_, lidx_, blk) {
    rem = rem_; lidx = lidx_; let t;
    if (x0 > x1) { t = x0; x0 = x1; x1 = t; } if (x2 > x3) { t = x2; x2 = x3; x3 = t; }
    if (x0 > x2) { t = x0; x0 = x2; x2 = t; } if (x1 > x3) { t = x1; x1 = x3; x3 = t; } if (x1 > x2) { t = x1; x1 = x2; x2 = t; }
    return kChild(x0, x1, x2, x3, busts, stays, prev, blk);
  }
  // ------------------------------------------------------------------------------------------------------------
  let kRoot = jsRoot;
  if (useWasm) {
    const inst = new WebAssembly.Instance(getWasmModule(), { env: { memory, buildRow, fail, abort() { throw new Error('wasm abort'); } } });
    inst.exports.init(NID, NU, NS, NP, maxBusts, maxPrev, perfect, PTO, NXO, P0, RW, END);
    kRoot = inst.exports.root;
  }

  const raw = new Int32Array(4);      // raw ids of the engine columns; with fewer than 4 columns the unused ones stay 0
  let crem = 0, clidx = 0;            // the loaded position's card count and local deck index
  function load(st) {
    if (st.horizon !== Infinity && st.horizon - st.played < st.rem) throw new Error('card timer not supported');
    let sub = true; for (let v = 1; v <= 10; v++) if (st.deck[v] > bdeck[v]) sub = false;
    if (!sub) rebase(st.deck);
    crem = 0; clidx = 0;
    for (let v = 1; v <= 10; v++) { deck[v] = st.deck[v]; clidx += lmult[v] * deck[v]; crem += deck[v]; }
    raw.fill(0);
    for (let i = 0; i < NC; i++) raw[i] = idOf[canon(st.cols[i])];
  }
  // value of the position with raw column ids x0..x3 for the deck in deck[] (n cards, local index li)
  function valueRaw(x0, x1, x2, x3, busts, stays, prev, n, li) {
    if (busts >= maxBusts) return 0;
    if (n === 0) return busts === 0 ? perfect : 0;
    const blk = U[P0 + li] || buildRow(li), ro = blk << 2;
    return kRoot(U8[ro + x0], U8[ro + x1], U8[ro + x2], U8[ro + x3], busts, stays, prev, n, li, blk);
  }
  function value(st) { load(st); return valueRaw(raw[0], raw[1], raw[2], raw[3], st.busts, st.stays, st.prev, crem, clidx); }
  // value of one action (stay on si or -1, card v on column j) from the loaded position
  function act(st, v, si, j) {
    const x = [raw[0], raw[1], raw[2], raw[3]]; let ps = st.prev, stays = st.stays, busts = st.busts, add = 0, prev;
    if (si >= 0) { x[si] = 0; stays--; if (sbs) ps = 0; }
    const kk = x[j] * 11 + v, p = I[PTO + kk];
    if (p < 0) { busts++; x[j] = 0; prev = 0; }
    else if (p > 0) { x[j] = 0; prev = ps < maxPrev ? ps + 1 : ps; add = p + SB[ps]; }
    else { x[j] = I[NXO + kk]; prev = 0; }
    deck[v]--;
    let val;
    try { val = add + valueRaw(x[0], x[1], x[2], x[3], busts, stays, prev, crem - 1, clidx - lmult[v]); }
    finally { for (let w = 1; w <= 10; w++) deck[w] = st.deck[w]; }
    return val;
  }
  // exact value of each action for card v (engine column indices; duplicates by symmetry are all listed)
  function q(st, v) {
    load(st); const out = [];
    for (let j = 0; j < NC; j++) out.push({ stay: -1, col: j, value: act(st, v, -1, j) });
    if (st.stays > 0) for (let i = 0; i < NC; i++) if (raw[i] !== 0) for (let j = 0; j < NC; j++) out.push({ stay: i, col: j, value: act(st, v, i, j) });
    return out;
  }
  // actions that can be optimal: the card on each distinct column class; Stay i + card on i (no empty column only)
  function qBest(st, v) {
    load(st); const out = [], ro = (U[P0 + clidx] || buildRow(clidx)) << 2, seen = [];
    let anyEmpty = false;
    for (let j = 0; j < NC; j++) { const r = U8[ro + raw[j]]; if (r === 0) anyEmpty = true; if (seen.indexOf(r) < 0) { seen.push(r); out.push({ stay: -1, col: j, value: 0 }); } }
    if (st.stays > 0 && !anyEmpty) { seen.length = 0; for (let j = 0; j < NC; j++) { const r = U8[ro + raw[j]]; if (seen.indexOf(r) < 0) { seen.push(r); out.push({ stay: j, col: j, value: 0 }); } } }
    for (const a of out) a.value = act(st, v, a.stay, a.col);
    return out;
  }
  function clear() { reset(); }
  function guarded(maxNew, fn) {
    U[H_BUDGET] = maxNew; U[H_FRESH] = 0;
    try { return fn(); } catch (e) { if (e === FULL) { clear(); return FULL; } if (e === ABORT) return ABORT; throw e; } finally { U[H_BUDGET] = 0; }
  }
  // policy interface: plays exactly from the given position on
  // maxNew (optional): give up (return null) once this many new positions had to be solved; solved ones are kept
  function choose(st, v, maxNew) {
    let list;
    if (maxNew) { list = guarded(maxNew, () => qBest(st, v)); if (list === FULL || list === ABORT) return null; }
    else { try { list = qBest(st, v); } catch (e) { if (e === FULL) { clear(); throw new Error('exact table full'); } throw e; } }
    let best = list[0];
    for (const a of list) if (a.value > best.value + 1e-9) best = a;
    return { stay: best.stay, col: best.col, value: best.value, scores: list, exact: true };
  }
  // work on the position in the background: solve up to maxNew new positions (solved ones are kept).
  // returns 1 once the position's value is known, 0 if there is more to do, -1 if the table filled up (it is emptied)
  function ponder(st, maxNew) {
    const r = guarded(maxNew, () => value(st));
    return r === FULL ? -1 : r === ABORT ? 0 : 1;
  }
  const wrap = (fn) => function () { try { return fn.apply(null, arguments); } catch (e) { if (e === FULL) { clear(); throw new Error('exact table full'); } throw e; } };
  return { value: wrap(value), q: wrap(q), choose, clear, ponder, states: () => U[H_COUNT], cap: () => cap, kernel: () => (useWasm ? 'wasm' : 'js'), bytes: () => (U[H_BUMP] - P0) * 4 };
}
// Shipped wrapper: `base` policy until xK cards remain, then an exact solve of the rest of the game for each move,
// capped at `budget` new positions; if the cap is hit that move uses `base` (solved positions are kept for later moves).
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
return { createExact, withExactEnd, ready };
});
