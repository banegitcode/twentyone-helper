# deeper16-guard (21 Search)

Champion `deeper:16` plus a hard per-move work cap so a single exact decision cannot run long in Landon's browser. Score change expected ≈ 0 (the default cap sits above every normal move measured on dev200 games 0–9). Design, interface, measurements: `ideas/deeper16-guard.md`.

```
adapter.js           node adapter.js --config deeper16g[:visitCap]              visit-counter only (CPU off)
                     node adapter.js --config deeper16g[:visitCap]:cpu=5000     plus CPU backstop
                     node adapter.js --config deeper16g --mac                   same as :cpu=5000
                     [--timelog F] [--movelog F]
js/exact3g.js        reusable guarded solver (same interface as exact3.js + visitCap/cpuMs). Copy this file
                     and js/exact3g_kernel.wasm.js (and js/z_kernel_g.ts if you need to rebuild) verbatim.
js/defaults.js       VISIT_CAP 80,000,000; CPU_MS_MAC 5000 (opt-in only)
js/{common,hybrid,policy}.js
tests/kernel_parity.js   JS vs WASM visit counts + tiny visitCap abort
tests/fallback.js        tiny visitCap / cpuMs: fallback works, game completes legally
tests/measure_visits.js  visit census on dev200
tests/parity_play.js     frozen | guard | guardcpu play for move/score compare
results/                 measurements, unit-test log, parity logs
```

Defaults: xK 16, budget 3,200,000 new positions/move, logCap 25 (identical to deeper:16). The visit cap is a deterministic count of kChild + insert + buildRow. The CPU guard is off unless `:cpu=MS` or `--mac` is given; a bare third number is not treated as cpuMs. Guard trips (visit or cpu, not budget ABORTs) go to stderr and `--timelog` with seed, move number, and CPU ms.

No existing lab file was edited. The exact table is not cleared on `new_game` (deeper:16 does not; a clear could change moves when two games share a remainder).
