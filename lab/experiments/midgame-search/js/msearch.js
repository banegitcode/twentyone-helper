'use strict';
// midgame-search: deterministic, node-budgeted deeper search over a selectable network leaf.
// A re-implementation of the champion's engine.js createSearcher choose() (depth-1 root list + selective deepening of the top candidates),
// with extra knobs.  With cfg.deep === 0 / cfg.extra off it is the champion's algorithm and must give the same moves (tests/equiv.js).
// Observable state only (cols, deck counts, busts, stays, prev, score): the order of the remaining cards is never available here.
//
// cfg (all optional; defaults = champion shipped52):
//   depth    chance plies of the root list (champion 1)
//   dm,dk,dd champion's selective deepening: margin, topK, depth (150, 3, 2)
//   xd       EXTRA deeper pass depth (0 = off). Candidates: within xm points of the best champion-deepened value, at most xk of them
//   xm,xk    extra-pass margin / topK (defaults dm, dk)
//   bm       beam: at an inner decision node whose child has >= bd chance plies left, expand only the bm best actions by (reward + leaf) (0 = all)
//   bd       minimum child chance depth for the beam to apply (default 2)
//   cap      max NN evaluations the extra pass may use in one move (abort -> keep the champion-deepened choice).  Deterministic (a count, not time)
//   pool     NN evaluations per game for all extra passes; per-move allowance = min(cap, pool_left / max(1, mid moves left) * spread)
//   spread   default 3
//   scope    'mine' (default): extra pass only where the decision has >=1 empty column and no Stay left (st.stays == 0); 'all': every decision
//   nnLeaf   network object {layers:[{nIn,nOut,W,b}], scale, feat?}  (dist networks are not supported)
const E = require('./common.js').E;
const ABORT = { abort: true };
function create(rules, base, cfg) {
  cfg = cfg || {};
  const NC = rules.cfg.numCols, NEXT = rules.next, PTS = rules.pts, SB = rules.sb, maxPrev = SB.length - 1, perfect = rules.cfg.perfectBonus, maxBusts = rules.cfg.maxBusts;
  const depth = cfg.depth != null ? cfg.depth : 1, dm = cfg.dm != null ? cfg.dm : 150, dk = cfg.dk || 3, dd = cfg.dd || 2;
  const xd = cfg.xd || 0, xm = cfg.xm != null ? cfg.xm : dm, xk = cfg.xk || dk, bm = cfg.bm || 0, bd = cfg.bd || 2;
  const cap = cfg.cap != null ? cfg.cap : Infinity, pool0 = cfg.pool != null ? cfg.pool : Infinity, spread = cfg.spread || 3, from = cfg.from || 17;
  const scope = cfg.scope === 'all' || cfg.scope === 1 ? 'all' : 'mine';   // mine: extra pass only with >=1 empty column and no Stay left; all: every decision
  const nn = cfg.nnLeaf; if (!nn) throw new Error('msearch: no leaf network');
  if (nn.dist) throw new Error('msearch: distribution networks are not supported');
  const FEAT2 = nn.feat === 2;
  const NN = nn.layers.map((l) => ({ nIn: l.nIn, nOut: l.nOut, W: Float64Array.from(l.W), b: Float64Array.from(l.b) }));
  const nnScale = nn.scale || 1000, nnW = Math.max(128, ...NN.map((l) => Math.max(l.nIn, l.nOut))), nnA = new Float64Array(nnW), nnB = new Float64Array(nnW);
  let S = null, cache = new Map(), leafCache = new Map(), drawHash = 0, evals = 0, evalLimit = Infinity, poolLeft = pool0;
  const stats = { inScope: 0, moves: 0, extraMoves: 0, extraAborted: 0, extraEvals: 0, baseEvals: 0, changed: 0, gameEvals: 0 };
  function nnLeaf() {
    evals++; if (evals > evalLimit) throw ABORT;
    if (FEAT2) E.featurize2(S.cols, S.deck, S.rem, S.H, S.busts, S.stays, S.prev, NC, nnA, PTS, SB); else E.featurize(S.cols, S.deck, S.rem, S.H, S.busts, S.stays, S.prev, NC, nnA);
    let x = nnA, y = nnB;
    for (let li = 0; li < NN.length; li++) {
      const L = NN[li], W = L.W, nIn = L.nIn, nOut = L.nOut, last = li === NN.length - 1;
      for (let o = 0, k = 0; o < nOut; o++) { let s = L.b[o]; for (let i = 0; i < nIn; i++, k++) s += W[k] * x[i]; y[o] = last || s > 0 ? s : 0; }
      const t = x; x = y; y = t;
    }
    return x[0] * nnScale;
  }
  const terminal = () => (S.busts === 0 ? perfect : 0);
  const isTerminal = () => S.busts >= maxBusts || S.H <= 0;
  function place(v, si, j) {
    if (si >= 0) { S.cols[si] = 0; S.stays--; if (rules.cfg.stayBreaksStreak) S.prev = 0; }
    const k = S.cols[j] * 11 + v, p = PTS[k];
    S.deck[v]--; S.rem--; S.H--;
    let r = 0;
    if (p < 0) { S.busts++; S.cols[j] = 0; S.prev = 0; }
    else if (p > 0) { r = p + SB[S.prev]; if (S.prev < maxPrev) S.prev++; S.cols[j] = 0; }
    else { S.cols[j] = NEXT[k]; S.prev = 0; }
    return r;
  }
  function forActions(withStays, fn) {
    const c = S.cols;
    for (let j = 0; j < NC; j++) { let dup = false; for (let k = 0; k < j; k++) if (c[k] === c[j]) { dup = true; break; } if (!dup) fn(-1, j); }
    if (withStays && S.stays > 0) {
      for (let i = 0; i < NC; i++) {
        if (c[i] === 0) continue;
        let dup = false; for (let k = 0; k < i; k++) if (c[k] === c[i]) { dup = true; break; }
        if (dup) continue;
        for (let j = 0; j < NC; j++) {
          const cj = j === i ? 0 : c[j]; let d2 = false;
          for (let k = 0; k < j; k++) { const ck = k === i ? 0 : c[k]; if (ck === cj) { d2 = true; break; } }
          if (!d2) fn(i, j);
        }
      }
    }
  }
  const FW = NC + 4, sv = new Int32Array(64 * FW);
  function save(sp) { const b = sp * FW; for (let i = 0; i < NC; i++) sv[b + i] = S.cols[i]; sv[b + NC] = S.busts; sv[b + NC + 1] = S.stays; sv[b + NC + 2] = S.prev; sv[b + NC + 3] = S.score; }
  function restore(sp, v) { const b = sp * FW; for (let i = 0; i < NC; i++) S.cols[i] = sv[b + i]; S.busts = sv[b + NC]; S.stays = sv[b + NC + 1]; S.prev = sv[b + NC + 2]; S.score = sv[b + NC + 3]; S.deck[v]++; S.rem++; S.H++; }
  const ZH = [0, 1, 7, 49, 343, 2401, 16807, 117649, 823543, 5764801, 40353607];
  // canonical key: columns sorted (4-element network), busts/stays/prev/d packed in one number (< 2^50), plus the multiset of cards drawn below the root
  function key(d) {
    let a = S.cols[0], b = S.cols[1], c = S.cols[2], e = S.cols[3], t;
    if (a > b) { t = a; a = b; b = t; } if (c > e) { t = c; c = e; e = t; } if (a > c) { t = a; a = c; c = t; } if (b > e) { t = b; b = e; e = t; } if (b > c) { t = b; b = c; c = t; }
    return ((((a * 1024 + b) * 1024 + c) * 1024 + e) * 1024 + (S.busts * 4 + S.stays) * 64 + S.prev * 8 + d) * 1 + '|' + drawHash;
  }
  let useBeam = false;
  function chance(d, sp) {
    if (isTerminal()) return terminal();
    if (d === 0) { const k0 = key(0), h0 = leafCache.get(k0); if (h0 !== undefined) return h0; const lv = nnLeaf(); leafCache.set(k0, lv); return lv; }
    const k = key(d), hit = cache.get(k); if (hit !== undefined) return hit;
    let sum = 0;
    for (let v = 1; v <= 10; v++) { const cnt = S.deck[v]; if (!cnt) continue; sum += cnt * decide(v, d, sp); }
    const r = sum / S.rem; cache.set(k, r); return r;
  }
  // stayInner 'forced': a Stay below the root is considered only when every plain placement busts (as the shipped52 spec)
  const _ba = new Int32Array(64 * 3), _bv = new Float64Array(64 * 2);
  function decide(v, d, sp) {
    let best = -Infinity;
    save(sp); drawHash += ZH[v];
    let ws = false;
    if (S.stays > 0) { ws = true; for (let i = 0; i < NC; i++) if (PTS[S.cols[i] * 11 + v] >= 0) { ws = false; break; } }
    if (useBeam && bm > 0 && d - 1 >= bd) {
      // move ordering: shallow value (reward + leaf after the placement); expand only the bm best actions deeper
      const list = [];
      forActions(ws, (si, j) => { const r = place(v, si, j); const sh = r + chance(0, sp + 1); restore(sp, v); list.push({ si, j, r, sh }); });
      list.sort((a, b) => b.sh - a.sh);
      const n = Math.min(bm, list.length);
      for (let q = 0; q < n; q++) { const a = list[q]; place(v, a.si, a.j); const val = a.r + chance(d - 1, sp + 1); restore(sp, v); if (val > best) best = val; }
    } else {
      forActions(ws, (si, j) => { const r = place(v, si, j); const val = r + chance(d - 1, sp + 1); restore(sp, v); if (val > best) best = val; });
    }
    drawHash -= ZH[v];
    return best;
  }
  let movesDone = 0;
  function choose(st, v) {
    S = { cols: Int32Array.from(st.cols), deck: Int32Array.from(st.deck), rem: st.rem, H: E.cardsLeftToPlay(st), busts: st.busts, stays: st.stays, prev: st.prev, score: st.score };
    drawHash = 0; cache = new Map(); leafCache = new Map(); evals = 0; evalLimit = Infinity; useBeam = false;
    const list = []; save(0);
    forActions(true, (si, j) => { const r = place(v, si, j); const val = r + chance(depth, 1); restore(0, v); list.push({ stay: si, col: j, value: val }); });
    let best = list[0]; for (const a of list) if (a.value > best.value + 1e-9) best = a;
    let champ = best, deepened = false;
    if (list.length > 1) {
      const cands = list.filter((a) => a.value >= best.value - dm).sort((a, b) => b.value - a.value).slice(0, dk);
      if (cands.length > 1) {
        deepened = true; cache = new Map(); let b2 = null;
        for (const a of cands) { const r = place(v, a.stay, a.col); a.deep = r + chance(dd, 1); restore(0, v); if (!b2 || a.deep > b2.deep + 1e-9) b2 = a; }
        best = champ = b2;
      }
    }
    stats.baseEvals += evals; stats.gameEvals += evals; stats.moves++;
    let inScope = true;
    if (scope === 'mine') { inScope = st.stays === 0; if (inScope) { inScope = false; for (let j = 0; j < NC; j++) if (st.cols[j] === 0) { inScope = true; break; } } }
    if (inScope) stats.inScope++;
    if (xd > 0 && inScope && list.length > 1 && st.rem >= from) {
      // extra pass: candidates within xm of the best depth-1 value (xk best), re-scored xd plies deep (optionally beam-pruned inside)
      const c2 = list.filter((a) => a.value >= list[0].value - 1e9).sort((a, b) => b.value - a.value);   // all, sorted by depth-1 value
      const top1 = c2[0].value;
      const cands = c2.filter((a) => a.value >= top1 - xm).slice(0, xk);
      const movesLeft = Math.max(1, st.rem - from + 1);
      const allow = Math.min(cap, Math.floor(poolLeft / movesLeft * spread));
      if (cands.length > 1 && allow > 0) {
        cache = new Map(); useBeam = bm > 0; evals = 0; evalLimit = allow; drawHash = 0;
        let ok = true, b3 = null;
        try {
          for (const a of cands) { save(0); const r = place(v, a.stay, a.col); const val = r + chance(xd, 1); restore(0, v); a.xdeep = val; if (!b3 || val > b3.xdeep + 1e-9) b3 = a; }
        } catch (e) { if (e !== ABORT) throw e; ok = false; S.cols.set(sv.subarray(0, NC)); S.busts = sv[NC]; S.stays = sv[NC + 1]; S.prev = sv[NC + 2]; S.score = sv[NC + 3]; }
        const used = Math.min(evals, allow); poolLeft -= used; stats.extraEvals += used; stats.gameEvals += used; stats.extraMoves++;
        if (ok) { if (b3.stay !== champ.stay || b3.col !== champ.col) stats.changed++; best = b3; } else stats.extraAborted++;
        useBeam = false;
      }
    }
    return { stay: best.stay, col: best.col, value: best.value, scores: list, deepened };
  }
  function reset() { poolLeft = pool0; }
  function game() { const g = Object.assign({}, stats); for (const k in stats) stats[k] = 0; return g; }
  return { choose, reset, stats, game };
}
module.exports = { create };
