'use strict';
// DETERMINISTIC pooled exact endgame ("pooledp").  Same idea as js/pooled.js (one big exact solve at the first move with <= xK cards left; the later moves
// are table lookups) but EVERY limit is a count of NEW table positions, never a time, so decisions are identical on any machine / load / kernel (WASM or JS).
//   withPooledP(rules, baseChoosePolicy, { xK: 16, logCap: 26, maxPositions: 45e6, tailTotal: 28e6, tailMove: 14e6, tailK: 14, floorK: 12, floorMove: 2e6, slice: 1e6, wallGuardSec })
// Per game (the table is emptied by reset()), for a move with rem <= xK cards (incl. the current one) and a fully observed deck:
//   MAIN   until the first exact move succeeded or the main budget ended: solve in slices of `slice` new positions, at most `maxPositions` new positions in the game
//          (default 45M: just under the 70%-of-2^logCap memory rule, 46.98M at logCap 26).  Success -> all later moves are lookups (budget irrelevant, floorMove allowed).
//          The main budget ends by (a) maxPositions used  [giveUpPosCap]  or (b) table > 0.70 * 2^logCap positions: the table is cleared  [giveUpMemory].
//   TAIL   after the main budget ended, every later move with rem <= tailK (default 14; a solve from scratch at 15 cards needs ~20M+ positions: measured 14 cards 2-50M, 13 cards 1-12M) retries the exact solve with min(tailMove, tailLeft) new positions (tailTotal per game, default 28M; tailMove default 14M).
//          The table is EMPTIED when the main budget ends (clearOnCap, default; measured: with the 45M-position table kept, the tail solves hit the memory rule and were thrown away). Inside the tail a cap give-up keeps its table (the next move is a child: it resumes), a memory give-up empties it.
//   FLOOR  moves with rem <= floorK (default 12, a solve from scratch there costs <~0.3M positions, measured) always get floorMove (2M) new positions, NOT counted in
//          the tail pool, so the last cards are exact even when the pools are used up.
//   anything not solved within its budget is played by the base policy (champion network search; its own wall-clock deepening is switched off by the adapter).
//   (The shipped52 100,000-position budget is NOT used anywhere in this policy.)
// Optional wallGuardSec (LIVE PLAY ONLY; off on the bench because it makes decisions machine-dependent): a move's solve is also abandoned when this game's wall think time
//   + (running mean of the base search's wall ms per move) * rem would pass wallGuardSec  [giveUpWall].
// Stats: policy.game() -> { thinkMs (CPU), thinkWallMs, maxMoveMs, exactMoves, exactMain, exactTail, exactFloor, mainPos, tailPos, floorPos, newPositions, giveUpPosCap, giveUpMemory,
//   giveUpTail, giveUpWall, baseMoves, firstExactMs, firstExactPositions, peakPositions }.
const E3 = require('./exact3.js'); const C = require('./common.js'); const E = C.E;
const cpuMs = () => { const c = process.cpuUsage(); return (c.user + c.system) / 1000; };
function withPooledP(rules, base, o) {
  const logCap = o.logCap || 26, K = o.xK, slice = o.slice || 1e6, memPos = Math.floor(0.70 * 2 ** logCap);
  const M = o.maxPositions != null ? o.maxPositions : 45e6, tailTotal = o.tailTotal != null ? o.tailTotal : 28e6, tailMove = o.tailMove != null ? o.tailMove : 14e6, tailK = o.tailK != null ? o.tailK : 14;
  const floorK = o.floorK != null ? o.floorK : 12, floorMove = o.floorMove != null ? o.floorMove : 2e6, wallMs = o.wallGuardSec ? o.wallGuardSec * 1000 : 0;
  const clearOnCap = o.clearOnCap !== false;   // main budget used up: empty the table (a nearly full table cannot take the tail solves; measured: keeping it made the tail hit the memory rule and thrash)
  const X = E3.createExact(rules, { logCap, wasm: o.wasm });
  let g, estWSum = 0, estWN = 0, mainDone, solvedOnce;
  const fresh = () => { mainDone = false; solvedOnce = false; return { thinkMs: 0, thinkWallMs: 0, maxMoveMs: 0, exactMoves: 0, exactMain: 0, exactTail: 0, exactFloor: 0, mainPos: 0, tailPos: 0, floorPos: 0,
    newPositions: 0, giveUpPosCap: 0, giveUpMemory: 0, giveUpTail: 0, giveUpWall: 0, baseMoves: 0, firstExactMs: null, firstExactPositions: null, peakPositions: 0, solveMs: 0 }; };
  g = fresh(); const hist = [];
  function choose(st, v) {
    const t0 = cpuMs(), w0 = performance.now(); let m = null;
    if (st.rem <= K && E.cardsLeftToPlay(st) === st.rem) {
      const estW = estWN ? estWSum / estWN : 150;
      const wallLeft = () => (wallMs ? wallMs - (performance.now() - w0) - g.thinkWallMs - estW * st.rem : Infinity);
      const floor = st.rem <= floorK;
      let path = solvedOnce ? 'floor' : !mainDone ? 'main' : (st.rem <= tailK && tailTotal - g.tailPos > 0) ? 'tail' : 'floor';       // which budget is charged
      let budget = path === 'main' ? M - g.mainPos : path === 'tail' ? Math.min(tailMove, tailTotal - g.tailPos) : ((floor || solvedOnce) ? floorMove : 0);
      
      const ts = cpuMs(); let used = 0;
      while (budget > 0) {
        const sl = Math.min(slice, budget - used > 0 ? budget - used : 0); if (sl <= 0) break;
        const c0 = X.states(); m = X.choose(st, v, sl); const c1 = X.states(); used += c1 >= c0 ? c1 - c0 : c1;
        if (X.states() > g.peakPositions) g.peakPositions = X.states();
        if (m) break;
        if (X.states() > memPos) { g.giveUpMemory++; X.clear(); if (path === 'main') mainDone = true; break; }
        if (used >= budget) { if (path === 'main') { g.giveUpPosCap++; mainDone = true; if (clearOnCap) X.clear(); } else if (path === 'tail') g.giveUpTail++; break; }
        if (wallMs && wallLeft() <= 0) { g.giveUpWall++; break; }
      }
      g.newPositions += used; if (path === 'main') g.mainPos += used; else if (path === 'tail') g.tailPos += used; else g.floorPos += used;
      g.solveMs += cpuMs() - ts;
      if (m) { g.exactMoves++; if (path === 'main') { g.exactMain++; solvedOnce = true; } else if (path === 'tail') g.exactTail++; else g.exactFloor++;
        solvedOnce = true; if (g.firstExactMs === null) { g.firstExactMs = cpuMs() - ts; g.firstExactPositions = X.states(); } }
    }
    if (!m) { m = base.choose(st, v); g.baseMoves++; if (st.rem > K) { estWSum += performance.now() - w0; estWN++; } }
    const dt = cpuMs() - t0; g.thinkMs += dt; g.thinkWallMs += performance.now() - w0; if (dt > g.maxMoveMs) g.maxMoveMs = dt;
    return m;
  }
  return { choose, reset() { if (g.baseMoves + g.exactMoves) hist.push(g); g = fresh(); X.clear(); if (base.reset) base.reset(); }, game: () => g, history: () => hist.concat(g.baseMoves + g.exactMoves ? [g] : []), X };
}
module.exports = { withPooledP };
