# mac_timing — per-game think-time kit (shipped52 vs pooled:16:26)

Plays **3 fixed games** (the first 3 shuffles of `bench/shuffles/dev200.txt`, stored in `games.json`) with
* `shipped52` (the champion: NN + expectimax + exact endgame from 13 cards, 100k positions/move), and
* `pooled:16:26` (21 Search's pooled-clock exact solve from 16 cards, 2^26 table, 180 s pool, 100 s solve cap, 20 s reserve),

and prints **per-game think time**: CPU (the engine process's own `process.cpuUsage`) and wall. Self-contained: everything it runs is vendored
in `vendor/` (unmodified copies; `vendor.sha256` lists their hashes). No npm install, no network, nothing outside this folder is touched.
Scores are printed too: they must match the box's (see below) unless the pooled 100 s cap binds differently on your machine.

## Node (primary; needs Node >= 16)
    cd mac_timing
    node run_timing.js                    # both engines, 3 games, pooled clock = CPU time (same as the bench runs)
    node run_timing.js --wall             # pooled clock = WALL time (what the real 180 s game does) -> compare cap behaviour
    node run_timing.js --engines shipped52 --games 1     # quick sanity run (a few seconds)
Output: one line per game + a summary table, and `results/<host>_<time>.json` (per-decision CPU times and the action list included).
`pooled:16:26` allocates up to ~800 MB; quit heavy apps first, plug in, and note the Mac's power mode. Do not run other jobs while it runs
(the pooled solve is single-threaded, ~1 core).

## Browser (wall time only; no CPU clock exists in a browser)
    cd mac_timing && python3 -m http.server 8000        # then open http://localhost:8000/browser/  and press Run
The page runs the **same unmodified adapters** inside a Web Worker via a small CommonJS shim (`browser/worker.js`); pooled uses the wall clock there.
Status: the shim was tested on the box in Node's `vm` (shipped52 game 1 gives the identical score 9050 as the Node kit); a real-Chrome run on the box is reported in RESULTS.md if it finished.
Safari/Chrome may refuse an 800 MB WebAssembly memory; if pooled errors out, that itself is a finding (the real game page has the same limit).

## Exact-solver rate (positions solved per second) for pooled:16:26
Per game and overall, in Node (CPU and wall) and in the browser page (wall only). Numerator = `newPositions`, the solver's own per-game counter of NEW table positions
(read from the adapter's existing `--timelog` option; vendor files untouched); denominator = CPU / wall time of the moves with <= 16 cards left (the exact phase), measured by the driver.
The solver's own clock (`solveMs`) is also in the JSON as `rate_new_positions_per_solver_clock_s`. This is the conversion factor for a position-capped config (pooledp).

## What to send back
The console output (or the `results/*.json`), the Mac model, macOS/Chrome/Node versions, and whether it was on battery.
Compare with box CPU times in `bench/RESULTS.md` ("Mac timing kit, box run"). **Box times are 'bench box CPU' (shared, Xeon x8, load ~25+): not MacBook wall.**

## Notes
* `cpu_hook.js` is preloaded into the engine child (`node -r`) and only appends the child's CPU clock to each reply line; decisions and protocol are untouched.
* `sim.js` is a 40-line JS port of the rules (RULES.md as in `bench/refsim.py`); the box run's action lists were replayed through `bench/refsim.py` to confirm identical scores.
* Per-decision CPU = child CPU between receiving the request and writing the reply (excludes process start-up and JIT warm-up before the first request).
