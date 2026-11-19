'use strict';
// Pooled-clock exact endgame.  The 3-minute clock is pooled over the whole game (Landon, 2026-11-18), the exact endgame costs ONE big first move
// (every later move is a table lookup, measured: results/reuse), so one move may spend most of the unused clock.
//   const policy = withPooledExact(rules, baseChoosePolicy, { xK: 17, logCap: 26, clockSec: 180, reserveSec: 20, clock: 'cpu'|'wall', slice: 1e6 });
// choose(st, v), rem = cards still to place incl. the current one:
//   rem > xK -> base.choose (champion search), its cost is timed and feeds the estimate of what the rest of the game needs.
//   rem <= xK -> exact solve in slices of `slice` new table positions; between slices check
//        (a) memory: table positions > maxPositions (default 0.70 * 2^logCap; the table is cleared when truly full, so stay below)   -> give up THIS move
//        (b) clock: elapsed-in-this-move > allowed, allowed = clockSec - used - reserveSec - estBase * rem   (estBase = running mean of the base search's
//            ms per move, 150 ms until measured; rem moves are charged at full base price = worst case that the exact solve never finishes) -> give up THIS move
//        cumulative solve time per game is capped at maxSolveSec (default 100 s; in the same clock units); once used up only 20k-position slices are tried (to pick up answers already in the table)
//        after 2 memory give-ups in one game the exact solver is no longer tried (opts.maxMemRetries)
//        give up = base.choose for this move; solved positions are kept, so the next move (whose position is a child of the aborted root) resumes cheaply.
//   `used` = sum of this game's think time (all decide calls), measured with process.cpuUsage ('cpu', default for the bench: independent of box load) or wall clock ('wall': use on the real clock).
// Per-game statistics: policy.game() -> { thinkMs, thinkWallMs, maxMoveMs, exactMoves, giveUpMemory, giveUpClock, baseMoves, firstExactMs, firstExactPositions, peakPositions }.
const path = require('path'); const E3 = require('./exact3.js'); const C = require('./common.js'); const E = C.E;
const cpuMs = () => { const c = process.cpuUsage(); return (c.user + c.system) / 1000; };
function withPooledExact(rules, base, o) {
  const logCap = o.logCap || 26, K = o.xK, slice = o.slice || 1e6, clockMs = (o.clockSec || 180) * 1000, reserveMs = (o.reserveSec == null ? 20 : o.reserveSec) * 1000;
  const maxPos = o.maxPositions || Math.floor(0.70 * 2 ** logCap), now = o.clock === 'wall' ? () => performance.now() : cpuMs;
  const X = E3.createExact(rules, { logCap, wasm: o.wasm });
  const solveCapMs = (o.maxSolveSec == null ? 100 : o.maxSolveSec) * 1000;
  let g, estSum = 0, estN = 0;
  const fresh = () => ({ thinkMs: 0, thinkWallMs: 0, maxMoveMs: 0, exactMoves: 0, giveUpMemory: 0, giveUpClock: 0, solveMs: 0, baseMoves: 0, firstExactMs: null, firstExactPositions: null, peakPositions: 0, lastExactSeen: false });
  g = fresh();
  const hist = [];
  function choose(st, v) {
    const t0 = now(), w0 = performance.now(); let m = null, isBase = true;
    if (st.rem <= K && E.cardsLeftToPlay(st) === st.rem && g.giveUpMemory < (o.maxMemRetries == null ? 2 : o.maxMemRetries)) {
      const estBase = estN ? estSum / estN : 150, allowed = Math.min(clockMs - g.thinkMs - reserveMs - estBase * st.rem, solveCapMs - g.solveMs); const ts = now(); const sl = allowed <= 0 ? 20000 : slice;   // exhausted: only a tiny slice to pick up answers already in the table
      for (;;) {
        m = X.choose(st, v, sl);
        const pos = X.states(); if (pos > g.peakPositions) g.peakPositions = pos;
        if (m) break;
        if (pos > maxPos) { g.giveUpMemory++; X.clear(); break; }   // the partial table cannot finish in this memory: free it, retry at the next (cheaper) move
        if (allowed <= 0 || now() - ts > allowed) { g.giveUpClock++; break; }
      }
      g.solveMs += now() - ts;
      if (m) { isBase = false; g.exactMoves++; if (g.firstExactMs === null) { g.firstExactMs = now() - ts; g.firstExactPositions = X.states(); } }
    }
    if (!m) m = base.choose(st, v);
    const dt = now() - t0; if (isBase && st.rem > K) { estSum += dt; estN++; }
    if (isBase) g.baseMoves++;
    g.thinkMs += dt; g.thinkWallMs += performance.now() - w0; if (dt > g.maxMoveMs) g.maxMoveMs = dt;
    return m;
  }
  return { choose, reset() { if (g.baseMoves + g.exactMoves) hist.push(g); g = fresh(); if (base.reset) base.reset(); }, game: () => g, history: () => hist.concat(g.baseMoves + g.exactMoves ? [g] : []), X };
}
module.exports = { withPooledExact };
