# deeper:16 slow-decision diagnostic (3-game replay)

3-game diagnostic, not a scored test. No existing lab files were edited. New files live only in this directory. The policy never received the future card order (same JSON-lines protocol as the frozen adapter; only the observable state is sent).

Engine: frozen `exact-endgame-deeper@90c2d73f938b`, `--config deeper:16` (exact3, xK=16, budget 3,200,000 **new** positions/move, logCap 25, cap 33,554,432, `deepen.budgetMs=0`). Kernel in the official run and in these replays: wasm. Runs were `nice 10`, one process at a time.

Seeds map as in `bench/harness.py`: `seed = 1 * 1000003 + set5000_index`. So 1001694, 1002103, 1001292 are set5000 indices 1691, 2100, 1289. Those were games 25, 17, and 39 in their worker chunks (chunk starts 1666, 2083, 1250), logged in `bench/results/think_deeper16_set5000.jsonl`.

Times below are box CPU (user+system) unless noted, recorded 2026-11-18 evening Pacific (America/Los_Angeles).

## Replay verification

The stopped set5000 compare did not write per-game scores, so score cannot be checked against the log. Decision counts all match (52). Isolated and prefix replays of each target agreed with each other on score and on the exact/abort sequence after the table rebase.

| seed | idx | logged cpu / maxDec / wall | isolated cpu / maxDec / score | prefix (same chunk first) cpu / maxDec / score |
|------|-----|----------------------------|-------------------------------|------------------------------------------------|
| 1001694 | 1691 | 69,056 / 43,373 / 70,167 ms | 12,838 / 3,476 ms / **9500** | 11,969 / 3,296 ms / **9500** (26 games in-process) |
| 1002103 | 2100 | 46,111 / 43,025 / 46,259 ms | 5,650 / 2,652 ms / **9500** | 5,602 / 2,690 ms / **9500** (18 games) |
| 1001292 | 1289 | 51,246 / 42,395 / 51,618 ms | 10,916 / 3,323 ms / **10050** | 11,156 / 3,435 ms / **10050** (40 games) |

**The 42–43 s decisions were not reproduced**, neither from a fresh process nor after replaying the original worker-chunk prefix. A non-target neighbor in the 1001292 prefix did match the log closely (seed 1001283: prefix 17,894 ms cpu / 4,053 ms maxDec vs logged 18,853 / 4,260), so the replay engine is faithful on typical games.

## Where the time went (measured, on these shuffles)

All time in the long moves is in the **exact solver**, not the base/network search. After a budget abort, `base.choose` took 1–45 ms. `deepen.budgetMs` is already 0 (disabled); the fallback is cheap because it is the shipped depth-1 + selective deepen, not because a clock stopped it.

Exact path was attempted on every move with `rem <= 16` (16 moves/game). `cardsLeftToPlay` always equalled `rem` (horizon is Infinity). There was **no table FULL+clear** in any of these games, isolated or prefix. Peak occupancy was 12,800,000 stored positions (38% of cap) and about 50% of the 12*cap byte pool, on 1001694 after four successive 3.2M-position aborts.

Per-game exact sequence (isolated; prefix is the same after the first exact move):

- **1001694**: rem 16,15,14,13 all **budget ABORT** at exactly 3,200,000 new positions, 2.33 / 3.03 / 3.19 / 3.48 s exact CPU, then rem 12..1 **solved** as table lookups (~0.1 ms). Base fallback only on the four aborts.
- **1002103**: rem 16 **budget ABORT** (3,200,000 new, 2.63 s exact + 25 ms base). rem 15 **solved** after 2,107,700 new (2.23 s). rem 14..1 lookups (~0.1 ms).
- **1001292**: rem 16,15,14 **budget ABORT** (3,200,000 new, 2.26 / 2.70 / 3.32 s). rem 13 **solved** after 1,772,595 new (1.86 s). rem 12..1 lookups.

The 3.2M-new-position budget **did cap new inserts** on every abort (fresh count 3,200,000; about 1.0–1.4M new positions/s). What it does not cap is time spent on lookups, class `buildRow`, rebase/zeroing, or a solve that mostly hits already-stored positions and therefore never trips `H_FRESH`.

Prefix leftover: at `new_game`, the previous game's table was still in memory (6.4M–12.3M positions for these three targets). At the first exact move (`rem=16`) `load()` saw a deck that was not a sub-deck of `bdeck`, called `rebase()` (full table reset), then solved 3.2M new positions. `statesBefore` in the prefix log is the pre-rebase leftover; `statesAfter` is 3,200,000. Rebase+abort still finished in 2.2–2.7 s, so leftover occupancy was not the 43 s cost.

Across all 81 consecutive-game transitions in the three prefixes, **0** pairs shared the same 16-card remaining multiset, so rebase-skip (keeping the previous table into a new game's endgame) did not occur here.

JS-kernel calibration on seed 1002103 isolated: rem-16 abort 3.87 s vs wasm 2.63 s (~1.5×). JS is not slow enough to explain 43 s.

## Root cause

**Measured on these shuffles:** the long moves of a normal deeper:16 game are budget-ABORT exact solves of 3.2M new positions, taking about 2.2–3.5 s, then a cheap base fallback. Table FULL is not involved. The budget caps inserts, not CPU.

**The original 43.4 / 43.0 / 42.4 s decisions are unexplained by the shuffle + chunk prefix.** They formed a tight cluster (span 1.0 s) in 3 of 1,793 logged games (0.17%); p99 max decision in that log was 4.17 s, and only these three exceeded 20 s. Two of the three (1002103, 1001292) were followed by a 15.9 s / 15.6 s next-game max decision; 1001694 was not (next maxDec 3.9 s). For 1002103, logged game CPU minus maxDec is 3.1 s, which matches our replay of the *rest* of the game — as if a single exact move took 43 s instead of 2.7 s and everything else was normal.

**Guessed, not reproduced:** a solve that did a large amount of unbudgeted work (lookups of already-stored positions, or a budget bypass) of a fairly fixed size, ~43 s at wasm speed; or a transient runtime event. Random GC is a weaker fit to the tight 42.4–43.4 s cluster (guessed). We did not find a way to make these three shuffles take that path.

## Suggested fixes

1. **CPU-time (or visit) guard per exact move** — recommended. Abort the exact solve after a wall/CPU cap (for example 5 s, or a visit cap that counts lookups as well as inserts) and fall back to base, same as a budget ABORT.  
   - *Measured:* on these three shuffles, every abort already finished by 3.5 s and every solved exact move after that was a lookup or a ≤2.3 s finish. A 5 s guard would **not have changed any move** in our replays.  
   - *Guessed:* if an original 43 s move was already going to ABORT and then use base, a time guard only shortens it and **does not change the move**. If it was a late `solved` exact move, the guard would fall back to base and could change that one move. The 43 s event rate was 3/1793 games (measured), so at most about 0.17% of games could see a different move, and only under the un-reproduced “late exact solve” case (guessed).

2. **Clear the exact table on `new_game` (per-game pool).** `reset()` today does not call `X.clear()`. `load()` already rebases when the new 16-card remainder is not a sub-deck of the previous game's `bdeck`, which is the common case (0/81 same-remainder transitions measured here). A hard clear removes the known cross-game leakage (audit `--fresh`: a leftover table can finish a position-budgeted solve the original game could not).  
   - *Measured:* would not have changed these three target games (rebase already happened; scores and abort/solve sequences matched the isolated run).  
   - *Guessed:* move changes only when two consecutive games share a 16-card remainder (rare on independent shuffles) or when a leftover sub-deck lets a later move complete under budget. Frequency of changed games: small, not measured on set1000.

3. **High load-factor / pool-occupancy guard** (clear or give up around 70% of the pool, as pooled-clock mode already does).  
   - *Measured:* these games peaked at ~50% of the pool and never FULL-cleared, so a 70% guard would not have fired and would not have changed moves. It is still a cheap safety net if a table is kept across games or a solve fills toward cap (guessed).

Of the three, the time/visit guard is the one that actually bounds the failure mode the 3.2M-new-position cap does not cover.

## Files

- `diag_adapter.js` — frozen deeper:16 protocol + monkeypatched `createExact` / `withExactEndFallback` (does not modify `exact3.js`).
- `replay.py` — plays selected set5000 indices via `bench/refsim.py` (`--prefix` replays the original chunk first in the same process).
- `isolated/`, `prefix/`, `isolated_jskernel/` — per-game JSONL, summaries.
- `exact_moves.csv` — all exact (and slow) decisions from those runs.
