# deeper16-guard report (21 Search)

2026-11-18 evening America/Los_Angeles. No existing lab file was edited. New files live only under `experiments/deeper16-guard/` and `ideas/deeper16-guard.md`. The policy never received the future card order.

## Files
```
experiments/deeper16-guard/
  adapter.js                 bench JSON-lines adapter
  js/exact3g.js              reusable solver (exact3 interface + visitCap/cpuMs)
  js/exact3g_kernel.wasm.js  WASM kernel with the same visit ticks
  js/z_kernel_g.ts, z_build_kernel_g.js
  js/defaults.js             VISIT_CAP=80000000, CPU_MS_MAC=5000
  js/policy.js, common.js, hybrid.js
  tests/kernel_parity.js, fallback.js, measure_visits.js, parity_play.js, compare_parity.js
  results/                   visit census, unit log, parity JSONL, this report
ideas/deeper16-guard.md      design, interface, measured vs guessed, expected gain ≈ 0
```

## Config and defaults
- Bench config: `deeper16g[:visitCap]` — visit counter only, **CPU guard off**.
- Opt-in CPU: `deeper16g[:visitCap]:cpu=5000` or `--mac` (5000 ms). A bare third number is not cpuMs.
- Unchanged from deeper:16: xK=16, budget=3,200,000 new positions/move, logCap=25, `deepen.budgetMs=0`.
- Default visitCap **80,000,000**, from a 10-game dev200 census (games 0–9): max normal visits 63,320,660; max exact move 3,880 ms; 3× max would be ~11.3 s and was not used; 80M ≈ 4.7 s at 16.9M visits/s (target ≲5 s box CPU).
- Table is not cleared on `new_game` (deeper:16 does not; a clear can change moves).

## Parity (dev200 games 0–19, nice 10)
Frozen `exact-endgame-deeper@90c2d73f938b` `deeper:16` vs `deeper16g:80000000`: **20/20 games identical moves and scores, paired diff exactly 0.**

## Guard trips
- Visit-only run (`deeper16g`): **0 visit-cap trips**, 0 CPU trips, 47 ordinary budget ABORTs.
- CPU-guard run (`deeper16g:80000000:cpu=5000`), same 20 games: **0 visit-cap trips, 0 CPU trips**, same 47 budget ABORTs, still identical to frozen.

## Timing (process CPU, wasm, this box)
| run | per-game mean / max | max single decision |
|---|---|---|
| frozen deeper:16 | 8,243 / 13,890 ms | 3,974 ms |
| deeper16g (CPU off) | 8,490 / 14,366 ms | 4,211 ms |
| deeper16g + cpu=5000 | 9,041 / 14,858 ms | 4,024 ms |

## Unit test
`tests/fallback.js`: `visitCap=100` (wasm and js) and `cpuMs=1` each tripped, fell back to the base policy, and finished dev200 game 0 legally (52 legal placements, ended `deck`). `tests/kernel_parity.js`: JS and WASM visit counts match; `visitCap=10` aborts at 11 visits.

## Freeze (not run)
Referee/bench command, do not run from the candidate side unless asked:

```
cd /workspace/21lab/bench
./freeze.sh deeper16-guard ../experiments/deeper16-guard
```

`freeze.sh` copies the candidate tree and `engine/twentyone-solver` (minus bulky dirs such as `scratch/`) into a read-only `bench/frozen/deeper16-guard@<shortsha>/` with the lab-root layout so relative requires work, writes `MANIFEST.json`, `chmod a-w`, and points `bench/frozen/deeper16-guard` at the snapshot. Then, e.g.:

```
cmd:node bench/frozen/deeper16-guard@<shortsha>/experiments/deeper16-guard/adapter.js --config deeper16g
```
