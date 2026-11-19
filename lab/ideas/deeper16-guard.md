# Idea: deeper16-guard (21 Search)

Status: **implemented and measured on dev200 games 0–19; no set1000 claim.** Nothing here is ACCEPTED (Referee only). The 1,000-game cap is left for the Referee's 100-game set1000 parity, which this work did not run.
Labels: **MEASURED** = produced on this box by code in `experiments/deeper16-guard/` (nice 10, 1–2 workers, process CPU ms, kernel = wasm unless noted; Mac ≈ box/1.5 is an estimate). **CALCULATED** = arithmetic on measured numbers. **GUESS** = opinion/extrapolation.

## 1. What, and why
The 3.2M-new-position budget on `deeper:16` caps inserts, not CPU. Lookups of already-stored positions, `buildRow`, and probes are free under that count (`diag_slow/REPORT.md`). A hard **deterministic visit counter** aborts the exact solve the same way a budget ABORT does (solved positions kept; that move uses the base policy) once the visit cap is crossed. An optional **CPU backstop** (off on the bench) is for Landon's Mac/browser build only.

Expected score change **≈ 0**. MEASURED: move-for-move and score-for-score identity with frozen `deeper:16` on 20/20 dev200 games (paired diff exactly 0), with 0 visit-cap trips. GUESS: also 0 on set1000 unless a rare unreproduced 43 s-style event was a *late exact solve* that the guard would now fall back (the set5000 CPU log had 3 such decisions in 1,793 games; those may already have been going to a budget ABORT, in which case the move would not change).

## 2. Algorithm
Inside the exact solver, a visit is one of: a child-table lookup (`kChild`), a table insert, or a class-row build (`buildRow`). The counter is reset at the start of each `choose`/`ponder`. When `visits > visitCap`, the call returns null (ABORT); hybrid fallback is unchanged. The 3.2M new-position budget is kept. The CPU backstop, when enabled, is checked every 16,384 visits, at `buildRow`, and at the end of the call: Node uses `process.cpuUsage()` (user+system ms); the browser uses `performance.now()` (wall ms). Trips (visit or cpu, not ordinary budget ABORTs) log seed, move number, and CPU ms to stderr and `--timelog`.

The exact table is **not** cleared on `new_game`. `deeper:16` already rebases when the new remainder is not a sub-deck of the previous `bdeck`; a hard clear could change a move when two consecutive games share a remainder, which would break parity.

## 3. Reusable module interface (`js/exact3g.js`)
Copy **verbatim** into another self-contained experiment (the planned bundled candidate: midgame-search + Learner leaf + Streak's piece): `js/exact3g.js` and `js/exact3g_kernel.wasm.js`. Rebuild the kernel only if you change it: `js/z_kernel_g.ts` + `js/z_build_kernel_g.js`.

Same exports as `exact3.js`: `createExact`, `withExactEnd`, `ready`.

```
createExact(rules, opts) -> X
  opts (in addition to exact3's logCap, restrict, wasm, ablate):
    visitCap  number  0 = off. Abort this call like a budget ABORT when visits exceed the cap.
    cpuMs     number  0 = off (DEFAULT). Optional CPU/wall backstop in ms.
  X.choose(st, v, maxNew, guard?)
    maxNew = new-position budget (same as exact3). Optional 4th arg {visitCap, cpuMs} overrides
    the instance defaults for this call only.
  X.ponder(st, maxNew, guard?)     same guards; return codes unchanged (1 / 0 / -1)
  X.value, X.q, X.clear, X.states, X.cap, X.kernel, X.bytes   unchanged
  X.lastMove() -> {visits, fresh, cpuMs, aborted, reason, kernel}
    reason is 'visit' | 'cpu' | 'budget' | null (null when the call finished)
  X.setGuard({visitCap, cpuMs})    changes instance defaults
withExactEnd(rules, base, o, shared)
  o.visitCap / o.cpuMs are passed into createExact when `shared` is omitted.
```

Visit counts are identical in the JS and WASM kernels (MEASURED: 54,747 on a rem-8 position; 2,306,126 and 27,474,578 on two budget-abort smokes). `hybrid.js` is the exact-endgame-deeper hybrid with `require('./exact3g.js')`; pass a shared `X` from `createExact` so guards are in force.

## 4. Config
Adapter: `experiments/deeper16-guard/adapter.js`.

| config | visit cap | CPU guard |
|---|---|---|
| `deeper16g` | 80,000,000 (default) | off |
| `deeper16g:<N>` | N | off |
| `deeper16g:<N>:cpu=5000` | N | 5000 ms |
| `deeper16g` + `--mac` | default | 5000 ms (`defaults.CPU_MS_MAC`) |

A bare third number is **not** treated as cpuMs. Everything else is deeper:16: xK 16, budget 3,200,000 new positions/move, logCap 25, `deepen.budgetMs=0`.

## 5. Default visitCap (MEASURED + CALCULATED)
On dev200 games 0–9, visitCap 0 (count only), wasm, same 3.2M budget (10 games, 160 exact moves):

- max visits of a normal move: **63,320,660** (game 8, rem 14, a *solved* move with only 2,887,519 new positions, 3,753 ms) — the case the insert budget does not cap
- max exact-move CPU: **3,880 ms** (game 7, rem 13, budget ABORT, 59,338,029 visits)
- median heavy-move rate (≥200 ms): **16,869,890 visits/s**
- 3 × max visits = 189,961,980 ≈ **11.3 s** at that rate — overshoots the ≲5 s box-CPU target, so 3× was not used
- 5 s at that rate = 84,349,450 visits (CALCULATED)

Default **80,000,000** = 1.26× measured max, CALCULATED ≈ 4.7 s at the median heavy rate, under the 5 s box-CPU target (Mac estimate ≈ 3.2 s). On the 20-game parity run the max was again 63,320,660 (0 moves ≥ 80M).

## 6. Verification (MEASURED, 2026-11-18 evening America/Los_Angeles)
Unit tests (`tests/kernel_parity.js`, `tests/fallback.js`): JS/WASM visit parity; `visitCap=10` aborts at 11 visits; `visitCap=100` and `cpuMs=1` each trip, fall back, and finish dev200 game 0 legally (engine `applyMove` accepts every move; 52 cards, reason `deck`).

Parity, frozen `exact-endgame-deeper@90c2d73f938b` `--config deeper:16` vs `deeper16g:80000000`, dev200 games 0–19, same shuffles, in-process (nice 10):

| run | visit trips | CPU trips | paired score/move diff | per-game CPU mean / max | max decision |
|---|---|---|---|---|---|
| frozen deeper:16 | n/a | n/a | — | 8,243 / 13,890 ms | 3,974 ms |
| `deeper16g` (CPU off) | **0** | 0 | **exactly 0** (20/20) | 8,490 / 14,366 ms | 4,211 ms |
| `deeper16g:80000000:cpu=5000` | **0** | **0** | **exactly 0** (20/20) | 9,041 / 14,858 ms | 4,024 ms |

47 budget ABORTs on each guarded 20-game run (ordinary deeper:16 path, not logged as guard trips).

## 7. Cost
One extra integer increment per lookup/insert/`buildRow`, plus a CPU check every 16,384 visits only when `cpuMs > 0`. No score-path change at the default cap. For Landon's phone, a visit-cap abort bounds a runaway exact move at about 4.7 s box / ~3.2 s Mac (CALCULATED) instead of the unreproduced 43 s cases.
