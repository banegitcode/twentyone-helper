// WebAssembly kernel of experiments/deeper16-guard/js/exact3g.js (AssemblyScript).
// Copy of engine/twentyone-solver/src/z_kernel.ts plus a deterministic visit counter (tick on kChild and insert;
// buildRow is counted on the JS side) and a periodic checkCpu() import for the optional CPU backstop.
// Build: node js/z_build_kernel_g.js  ->  js/exact3g_kernel.wasm.js
@external("env", "buildRow") declare function buildRow(li: i32): i32;
@external("env", "fail") declare function fail(code: i32): void;
@external("env", "checkCpu") declare function checkCpu(): void;

// header fields as byte addresses
// [6]=H_VISITS (word 6, byte 24), [7]=H_VCAP (word 7, byte 28): deterministic work counter + cap (0 = off)
const H_BUMP: i32 = 4, H_COUNT: i32 = 8, H_FRESH: i32 = 12, H_BUDGET: i32 = 16, H_MAX: i32 = 20, H_VISITS: i32 = 24, H_VCAP: i32 = 28, FL: i32 = 64, DK: i32 = 192, LM: i32 = 256, SBO: i32 = 320;

// One visit = one child-table lookup (kChild), one table insert, or one class-row build (buildRow, counted in JS).
function tick(): void {
  const vis = load<i32>(H_VISITS) + 1;
  store<i32>(H_VISITS, vis);
  const cap = load<i32>(H_VCAP);
  if (cap != 0 && <u32>vis > <u32>cap) fail(2);
  if ((vis & 16383) == 0) checkCpu();
}
let NID: i32 = 0, NU: i32 = 0, NS: i32 = 0, NP: i32 = 0, MAXB: i32 = 0, MAXP: i32 = 0, PT: i32 = 0, NX: i32 = 0, P0: i32 = 0, RW: i32 = 0, END: i32 = 0;
let PERFECT: f64 = 0;
let rem: i32 = 0, lidx: i32 = 0;

export function init(nid: i32, nu: i32, ns: i32, np: i32, maxBusts: i32, maxPrev: i32, perfect: f64, pto: i32, nxo: i32, p0: i32, rw: i32, end: i32): void {
  NID = nid; NU = nu; NS = ns; NP = np; MAXB = maxBusts; MAXP = maxPrev; PERFECT = perfect; PT = pto << 2; NX = nxo << 2; P0 = p0 << 2; RW = rw; END = end;
}

function talloc(l: i32): i32 {
  const words = 2 << l, head = load<i32>(FL + (l << 2));
  if (head != 0) { store<i32>(FL + (l << 2), load<i32>(head << 2)); memory.fill(head << 2, 0, words << 2); return head; }
  const off = load<i32>(H_BUMP); if (off + words > END) fail(1);
  store<i32>(H_BUMP, off + words); return off;
}
function insert(m: i32, key: i32, val: f32): void {
  tick();
  let off = load<i32>(m), info = load<i32>(m + 4), l = info & 31, cnt = info >>> 5;
  if (off == 0) { l = 2; off = talloc(l) << 2; store<i32>(m, off >>> 2); }
  else {
    off <<= 2;
    if ((cnt + 1) * 4 > (3 << l)) {
      const noff = talloc(l + 1) << 2, nmask = (2 << l) - 1, n = 1 << l;
      for (let i = 0; i < n; i++) {
        const k = load<i32>(off + (i << 3)); if (k == 0) continue;
        let h = k * 0x9E3779B1; h = (h ^ (h >>> 15)) & nmask;
        while (load<i32>(noff + (h << 3)) != 0) h = (h + 1) & nmask;
        store<i32>(noff + (h << 3), k); store<i32>(noff + (h << 3) + 4, load<i32>(off + (i << 3) + 4));
      }
      store<i32>(off, load<i32>(FL + (l << 2))); store<i32>(FL + (l << 2), off >>> 2);
      off = noff; l++; store<i32>(m, off >>> 2);
    }
  }
  const mask = (1 << l) - 1;
  let h = key * 0x9E3779B1; h = (h ^ (h >>> 15)) & mask;
  while (load<i32>(off + (h << 3)) != 0) h = (h + 1) & mask;
  store<i32>(off + (h << 3), key); store<f32>(off + (h << 3) + 4, val);
  store<i32>(m + 4, ((cnt + 1) << 5) | l); store<i32>(H_COUNT, load<i32>(H_COUNT) + 1);
}
// value of the position a <= b <= c <= d (class ids for the current deck, whose block is at byte address blk); rem > 0
function kChild(a: i32, b: i32, c: i32, d: i32, busts: i32, stays: i32, prev: i32, blk: i32): f64 {
  tick();
  if (stays > 0) { const mx = rem + NU - (a == 0 ? b == 0 ? c == 0 ? d == 0 ? 4 : 3 : 2 : 1 : 0); if (stays > mx) stays = mx > 0 ? mx : 0; }
  if (prev > 0) { const so = blk + NID; if ((load<u8>(so + a) | load<u8>(so + b) | load<u8>(so + c) | load<u8>(so + d)) == 0) prev = 0; }
  if (rem == 1) return V(a, b, c, d, busts, stays, prev, 0, 0);
  const key = (a | (b << 8) | (c << 16) | (d << 24)) + 1, m = blk + ((RW + ((busts * NS + stays) * NP + prev) * 2) << 2), off = load<i32>(m) << 2;
  if (off != 0) {
    const mask = (1 << (load<i32>(m + 4) & 31)) - 1;
    let h = key * 0x9E3779B1; h = (h ^ (h >>> 15)) & mask;
    for (;;) {
      const e = load<i32>(off + (h << 3));
      if (e == key) return <f64>load<f32>(off + (h << 3) + 4);
      if (e == 0) break;
      h = (h + 1) & mask;
    }
  }
  return V(a, b, c, d, busts, stays, prev, key, m);
}
// insert x into the sorted triple and evaluate
// @ts-ignore
@inline
function ins(x: i32, t1: i32, t2: i32, t3: i32, busts: i32, stays: i32, prev: i32, blk: i32): f64 {
  if (x <= t2) return x <= t1 ? kChild(x, t1, t2, t3, busts, stays, prev, blk) : kChild(t1, x, t2, t3, busts, stays, prev, blk);
  return x <= t3 ? kChild(t1, t2, x, t3, busts, stays, prev, blk) : kChild(t1, t2, t3, x, busts, stays, prev, blk);
}
// best of: card v on the column with raw id x (others t1 <= t2 <= t3), or Stay on it and v on the emptied column
function col(x: i32, t1: i32, t2: i32, t3: i32, v: i32, busts: i32, stays: i32, prev: i32, blk: i32, xs: i32): f64 {
  const kk = (x * 11 + v) << 2, p = load<i32>(PT + kk); let val: f64;
  if (p < 0) val = busts + 1 >= MAXB ? 0 : kChild(0, t1, t2, t3, busts + 1, stays, 0, blk);
  else if (p > 0) val = <f64>(p + load<i32>(SBO + (prev << 2))) + kChild(0, t1, t2, t3, busts, stays, prev < MAXP ? prev + 1 : prev, blk);
  else val = ins(<i32>load<u8>(blk + load<i32>(NX + kk)), t1, t2, t3, busts, stays, 0, blk);
  if (xs >= 0) { const w = ins(xs, t1, t2, t3, busts, stays - 1, 0, blk); if (w > val) val = w; }
  return val;
}
// @ts-ignore
@inline
function last(x: i32, v: i32, sc: f64, base: f64): f64 { const p = load<i32>(PT + ((x * 11 + v) << 2)); return p > 0 ? <f64>p + sc : p < 0 ? 0 : base; }
// a <= b <= c <= d are class ids for the current deck; m = 0: do not store
function V(a: i32, b: i32, c: i32, d: i32, busts: i32, stays: i32, prev: i32, key: i32, m: i32): f64 {
  let sum: f64 = 0;
  const canStay = stays > 0 && (NU == 0 ? a : NU == 1 ? b : NU == 2 ? c : d) != 0;
  if (rem == 1) {
    const base: f64 = busts == 0 ? PERFECT : 0, sc: f64 = <f64>load<i32>(SBO + (prev << 2)) + base;
    for (let v = 1; v <= 10; v++) {
      if (load<i32>(DK + (v << 2)) == 0) continue;
      let best = last(d, v, sc, base), val: f64;
      if (NU < 3) { val = last(c, v, sc, base); if (val > best) best = val; }
      if (NU < 2) { val = last(b, v, sc, base); if (val > best) best = val; }
      if (NU < 1) { val = last(a, v, sc, base); if (val > best) best = val; }
      if (canStay && base > best) best = base;
      return best;
    }
  }
  for (let v = 1; v <= 10; v++) {
    const cnt = load<i32>(DK + (v << 2)); if (cnt == 0) continue;
    const lm = load<i32>(LM + (v << 2));
    store<i32>(DK + (v << 2), cnt - 1); rem--; lidx -= lm;
    let blk = load<i32>(P0 + (lidx << 2)); if (blk == 0) blk = buildRow(lidx);
    blk <<= 2;
    let s0 = (<i32>load<u8>(blk + a) << 8) | a, s1 = (<i32>load<u8>(blk + b) << 8) | b, s2 = (<i32>load<u8>(blk + c) << 8) | c, s3 = (<i32>load<u8>(blk + d) << 8) | d, t: i32;
    if (s0 > s1) { t = s0; s0 = s1; s1 = t; } if (s2 > s3) { t = s2; s2 = s3; s3 = t; }
    if (s0 > s2) { t = s0; s0 = s2; s2 = t; } if (s1 > s3) { t = s1; s1 = s3; s3 = t; } if (s1 > s2) { t = s1; s1 = s2; s2 = t; }
    const r0 = s0 >> 8, r1 = s1 >> 8, r2 = s2 >> 8, r3 = s3 >> 8, xs: i32 = canStay ? <i32>load<u8>(blk + load<i32>(NX + (v << 2))) : -1;
    let best = col(s3 & 255, r0, r1, r2, v, busts, stays, prev, blk, xs), val: f64;
    if (NU < 3 && s2 != s3) { val = col(s2 & 255, r0, r1, r3, v, busts, stays, prev, blk, xs); if (val > best) best = val; }
    if (NU < 2 && s1 != s2) { val = col(s1 & 255, r0, r2, r3, v, busts, stays, prev, blk, xs); if (val > best) best = val; }
    if (NU < 1 && s0 != s1) { val = col(s0 & 255, r1, r2, r3, v, busts, stays, prev, blk, xs); if (val > best) best = val; }
    store<i32>(DK + (v << 2), cnt); rem++; lidx += lm;
    sum += <f64>cnt * best;
  }
  const r = sum / <f64>rem;
  if (m == 0) return r;
  if (<u32>load<i32>(H_COUNT) >= <u32>load<i32>(H_MAX)) fail(1);
  const bud = load<i32>(H_BUDGET);
  if (bud != 0) { const f = load<i32>(H_FRESH) + 1; store<i32>(H_FRESH, f); if (<u32>f > <u32>bud) fail(2); }
  insert(m, key, <f32>r);
  return r;
}
// entry point: columns x0..x3 are class ids for the current deck in any order; blk is the deck block's word index
export function root(x0: i32, x1: i32, x2: i32, x3: i32, busts: i32, stays: i32, prev: i32, rem_: i32, lidx_: i32, blk: i32): f64 {
  rem = rem_; lidx = lidx_; let t: i32;
  if (x0 > x1) { t = x0; x0 = x1; x1 = t; } if (x2 > x3) { t = x2; x2 = x3; x3 = t; }
  if (x0 > x2) { t = x0; x0 = x2; x2 = t; } if (x1 > x3) { t = x1; x1 = x3; x3 = t; } if (x1 > x2) { t = x1; x1 = x2; x2 = t; }
  return kChild(x0, x1, x2, x3, busts, stays, prev, blk << 2);
}
