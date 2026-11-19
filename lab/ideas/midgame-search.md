# Idea: midgame-search (21 Search)

Status: **proposal + cost measurements + 40-game plumbing runs; no score claim.** Nothing here is ACCEPTED (Referee only).
Labels: **MEASURED** = produced on this box by code in `experiments/midgame-search/` (box shared and loaded, load average 6-7 on 8 cores; times are process CPU ms of the adapter, nice 19, 2 workers; Mac ~ box/1.5 is an estimate). **CALCULATED** = arithmetic on measured numbers. **GUESS** = opinion/extrapolation. **unverified (from repo)** = Landon's numbers, not used for conclusions.

## 1. What the champion does above 16 cards (read from the code)
`deeper:16` = shipped52 with `exact3` from 16 cards (3.2M new positions/move). Above 16 cards, and on the moves where the exact solve gives up (92.5% of rem-16 moves, 72.5% of rem-15, 35% of rem-14: Referee's tally), the move comes from `engine.js createSearcher` with the shipped52 spec:
- root: **all** actions (every placement, every Stay x placement), then **1 chance ply** (`depth: 1`): average over the 10 card values (weights = remaining counts) of the best reply, leaf = the 56-128-48-1 network (`nn`) -> a 2-ply search (my move, next card, my reply, leaf).
- below the root a Stay is only considered when every plain placement busts (`stayInner: 'forced'`); transposition cache (`cache`) keyed by sorted columns + busts/stays/streak + multiset of drawn cards.
- **selective deepening** (`deepen {depth 2, margin 150, topK 3}`, `budgetMs` forced 0 on the bench so it always runs): the (at most 3) root moves within 150 points of the best are re-scored with **2** chance plies (a 3-ply search) and the best of those is played.
So the champion is already "2-ply everywhere + 3-ply on close calls". Cost MEASURED: about 18 ms/move (probe, 108 positions), 47,562 NN evaluations per game (40 dev200 games).

## 2. Prior attempts found (all **unverified (from repo)**; per CHARTER an old failure is a hint, not a ban)
| source | what | result | note |
|---|---|---|---|
| EXPERIMENTS.md prior rows | 3-ply everywhere: -1; 2-ply everywhere + 3 on close calls: -4 +- 56; extra bust penalties etc. | rejected | SE 50+ cannot see a +25 gain |
| engine/.../results/x_d3.log | "Three cards ahead on every move + exact end", n=1500: 8,810 vs shipped 8,811, **-1 +- 50**, 2.4 s/move | rejected | the shipped baseline there already had selective deepening; SE 50 |
| engine/.../results/headroom.log, README | "Deeper everywhere (3 ahead, 4 on close calls)", n=1000: 8,800 vs 8,776, **+27 +- 56**, 883 ms/move | "none of these beat the shipped player" | z = 0.5: a +27 gain is not excluded |
| README | "shipped + 100 rollouts on close calls" n=800: **-37 +- 97**; 4x larger network: -16 +- 35 | rejected | |
| 21 lead study (EXPERIMENTS.md, measured on our bench) | NN greedy + truncated CRN rollouts (depth 8, M 150, K 3), no exact endgame: +453 +- 44 vs NN greedy, **+50 +- 42 vs NN 1-ply expectimax**, -141 +- 41 vs the champion | rollouts as stand-alone rejected | gain of search shrinks with a stronger base; evaluator is the lever |
| my own ideas/exact-endgame-deeper.md 4.3 | restricted-action (noBust / greedyScore) EXACT search | lost 76-200 points | applies to exact search; my beam below is move ordering by the network's own 1-ply value, a different mechanism, and it is only used inside the extra pass |
**New reasons to retry:** (1) every old deeper-search test had SE 50-56, so none could resolve a gain below ~+100; none *showed* depth does not help. (2) The champion's endgame changed: exact play now starts at 16 cards, so search above 16 is the weakest remaining stretch; Theorist's regret map (ideas/regret-map.md) re-checked decisions above 16 cards against a sampled reference that shares the champion's network (so it mostly measures *lookahead* leaks) and found net flips worth about +24 +- 6 per game (CALCULATED by Theorist, lower bound for that reference, not bench-confirmed; ~21 of it in no-empty-column positions, ~13 in Stay decisions). Lead's discount for realised gains is about 0.6x (GUESS, from set1000), i.e. ~+14 per game is the most that fixing *all* of those flips could be worth. (3) The 3-minute clock is pooled (Landon) and deeper:16 uses only ~9 s mean, so ~150 s/game are unused; the old tests were limited by a per-move desktop budget (13 ms/move in the shipped design).

## 3. The algorithm (`experiments/midgame-search/js/msearch.js`)
A re-implementation of the champion's `choose()` plus one extra pass. **With the extra pass off it returns the champion's exact root list and move** (tests/equiv.js: 108 positions, 0 move differences, 0 root-value differences).
1. Champion step unchanged: depth-1 root list for all actions; champion deepening (`dm` 150, `dk` 3, `dd` 2) gives the champion's move `champ`.
2. **Extra pass** (on if `xd` > 0, cards left >= `from` = 17 and the decision is in `scope`): candidates = the `xk` best root moves within `xm` of the best depth-1 value (needs >= 2). Each is re-scored with `xd` chance plies (xd = 3: 4-ply; xd = 4: 5-ply) through the same network leaf and cache; the best by that value is played. (A candidate set that includes the champion's candidates and more when xm > dm or xk > dk.)
3. **Beam (optional, `bm`)**: inside the extra pass at decision nodes whose child still has >= `bd` (default 2) chance plies, compute reward + leaf for every action (cheap, cached) and expand only the `bm` best deeper. Move ordering by the network's 1-ply value; no rule restriction.
4. **Budget (deterministic, a count of network evaluations, never wall time)**: the extra pass may use at most `min(cap, pool_left / (cards_left_above_16) * spread)` NN evaluations in a move (`spread` default 3; `pool` = evaluations per game). If it would exceed that it is **abandoned and the champion's move is played** (nothing partial is used; cache entries are only written for completed nodes). Evaluations used (also aborted ones) are subtracted from the pool.
5. Leaf cache survives all passes of one move (leaf value depends only on position + drawn multiset); chance cache is reset between passes.
6. At <= 16 cards (`rem < from`) the champion-style search `E.createSearcher` is used for the exact solver's give-up moves, and the exact solver is `exact3`/`hybrid` copied unchanged from the frozen exact-endgame-deeper (same sha256: exact3.js 0d74b9e6..., hybrid.js 2a786d4e..., common.js 715ada32...). So play at <= 16 cards is deeper:16's.
Not built, with reason: **sparse sampling of chance nodes**. There are only 10 outcomes and 9 of them have equal probability (tens carry 31%), so a deterministic subset saves little and adds variance; the beam over *actions* is where branching can be cut. **Reuse across moves**: solved-subtree reuse is already inside the exact part; for the NN search the cache is per move because the draw-multiset key is relative to the root deck (cross-move reuse would need re-rooting; GUESS: ~1.3x saving, not worth the risk).

## 4. Config names and leaf selection (for 21 Learner)
Adapter: `experiments/midgame-search/adapter.js --config midsearch:<params>[:leaf=<name>][:leaflow=<name>]`; `<params>` = comma list `k=v`.
| key | default | meaning |
|---|---|---|
| `xd` | 0 | extra pass depth in chance plies (0 = off); 3 = 4-ply, 4 = 5-ply |
| `xk`, `xm` | 3, 150 | extra-pass candidates: at most `xk`, within `xm` points of the best depth-1 value |
| `bm`, `bd` | 0, 2 | beam width (0 = all actions), minimum child depth for the beam |
| `cap`, `pool`, `spread` | inf, inf, 3 | NN evaluations: per-move cap, per-game pool, spreading factor |
| `scope` | `mine` | `mine` = extra pass only for decisions with >= 1 empty column and no Stay left (`st.stays == 0`); `all` = every decision (bundled tests). Scope split per lead (21 Streak owns no-empty-column and Stay-possible decisions above 16 cards). Out-of-scope decisions play the champion's own default choice unchanged |
| `from` | 17 | midsearch used when cards left (incl. current) >= from |
| `dm`, `dk`, `dd` | 150, 3, 2 | champion's deepening (kept at the shipped values) |
| `xK`, `xb`, `xl` | 16, 3200000, 25 | exact endgame start, new positions per move, logCap (deeper:16) |
| `champ` | 0 | 1 = use the champion's own searcher above 16 (reproduces deeper:16 exactly; test aid) |
**Leaf selection.** `leaf=<name>` loads `experiments/midgame-search/nets/<name>.json` (nothing outside this folder is read) and uses it as the network leaf for every search at >= `from` cards; `leaflow=<name>` (default = `leaf`) for the champion-style search used below `from` (the exact solver's give-up moves at 14-16 cards). Default `ship_nn` = a copy of `results/shipped_policies.json["52"].nn` (same weights as ship_nn.json). Two file formats are accepted:
- engine format: `{"scale":1000,"layers":[{"nIn":56,"nOut":128,"W":[...row-major nOut x nIn...],"b":[...]}, ...], "feat":2?}` (any layer sizes; `feat: 2` uses the 88-input features);
- Learner format (as in `learner-v2a/models/*.json`): `{"W":[[rows layer0],[rows layer1],[rows layer2]],"b":[[...],[...],[...]],"scale"?}` on the champion's 56-128-48-1 architecture.
Distribution (`nn.dist`) networks are not supported (error). Leaf names are `[A-Za-z0-9_.-]+` only. **scope applies to the extra pass only**; a new net given by `leaf=` replaces the leaf everywhere (all decisions above `from`, scope or not). **To test a new net alone**: put `nets/<name>.json`, run `midsearch::leaf=<name>[:leaflow=<name>]` (xd=0: it replaces the leaf of the champion search at all depths above 16). **Combined with deeper search**: `midsearch:xd=3,xk=3,cap=100000,pool=3000000,scope=all:leaf=<name>`. **Control**: `midsearch:` (or `midsearch:champ=1`) must equal deeper:16 move for move. A net trained only for the 14-16 band should go in `leaflow`, not `leaf`.

## 5. Cost model
Per position, NN evaluations E = (distinct leaves reached). MEASURED probe (champion trajectories, dev200 games 0-2, 108 positions with >= 17 cards, uncapped, nice 19; ~15 us per evaluation including overhead):
| extra pass | extra-pass positions (>=2 candidates) | NN evals/position mean / p95 / max | CPU ms/position mean / p95 / max | CPU s per game (36 positions) | moves changed vs champion |
|---|---|---|---|---|---|
| xd=3, xk=3, xm=150 | 59/108 | 11,721 / 33,994 / 40,950 | 178 / 520 / 614 | 6.4 | 10/108 (9.3%) |
| xd=3, xk=3, xm=150, bm=2 | 59/108 | 9,892 / 27,483 / 34,076 | 148 / 409 / 486 | 5.3 | 10/108 |
| xd=3, xk=3, xm=400 | 91/108 | 18,403 / 39,041 / 43,373 | 272 / 591 / 661 | 9.8 | 10/108 |
| xd=4, xk=3, xm=150 | 59/108 | 121,340 / 364,775 / 479,432 | 1,848 / 5,457 / 7,498 | 66.5 | 8/108 |
| xd=4, xk=3, xm=150, bm=2 | 59/108 | 86,712 / 251,657 / 313,851 | 1,256 / 3,592 / 4,588 | 45.2 | 8/108 |
scope=mine probe (6 games, 216 positions, 21 in scope): xd=3 0.9 s/game, xd=4 xk=3 bm=2 2.7 s, xd=4 xk=4 xm=300 bm=2 3.7 s, xd=5 xk=3 bm=2 14.1 s (max move 18.3 s, 1.15M evals); changed 3, 3, 3, 2 of 216 positions. Each extra ply multiplies cost by ~10 (CALCULATED from the table: 11.7k -> 121k). The beam at bm=2 saves only ~30% at xd=4 (it only prunes the two outermost levels). xd=5 was started and abandoned as too slow (>10x of xd=4; not measured).
Memory: leaf/chance cache of one move only; RSS is dominated by the exact table (see timing below).

## 6. Pre-registered expected gain (GUESS) -- for the default `scope=mine`
Scope change (lead, 4:48 PM PT): the default applies the extra pass only to decisions above 16 cards with >= 1 empty column and no Stay left. MEASURED on champion trajectories (dev200 games 0-5, 216 positions with >= 17 cards): **21/216 = 9.7% of the positions are in scope**, 9 of them have >= 2 candidates, and the extra pass changed the champion's move in **2-3 of the 216 positions (about 0.3-0.5 moves per game)**; cost per game (CPU s, nice 19): xd=3 0.9; xd=4 bm=2 2.7; xd=4 xk=4 xm=300 bm=2 3.7; xd=5 bm=2 14.1 (one move up to 18 s, 1.15M evaluations).
- Config **mine5** = `midsearch:xd=5,xk=3,xm=150,bm=2,cap=1500000,pool=3000000` (scope=mine by default): **+1 point per game (GUESS; plausible range -3 .. +6)**. Same for **mine4w** = `midsearch:xd=4,xk=4,xm=300,bm=2,cap=300000,pool=1500000`: +1 (range -3 .. +5).
- Reasoning (GUESS): 0.3-0.5 changed moves per game x a few points per changed move (+1..+5 if the deeper network value is right more often than not) = +0.5..+2.5. Regret-map ceiling for reference: Theorist's sampled estimate for all decisions above 16 cards is ~+24, and the lead's realised discount is ~0.6x (GUESS) = ~+14; of that, the no-empty-column and Stay-possible decisions (~21 and ~13 of her 24, overlapping) are 21 Streak's, so what is left in *my* scope is the small residual (<= ~+3 even if everything in it were fixed). In scope=mine the positions have few legal choices left (an empty column absorbs the card), so a deeper look has little to resolve.
- Bundled **scope=all** configs (the dev40 runs below, = `xd=3` / `xd=4,bm=2`): pre-registered earlier at **+5 (range -10 .. +20)** for `midsearch:xd=3,xk=3,xm=150,cap=100000,pool=3000000,scope=all` and **+8 (range -15 .. +30)** for `midsearch:xd=4,xk=3,xm=150,bm=2,cap=250000,pool=4000000,scope=all`; reasoning: 1.9-2.1 changed moves/game (MEASURED, 40 dev200 games), a few points each; old deeper-search results (-1 +- 50, +27 +- 56) point to ~0; the same 0.6x discounted regret ceiling of ~+14 is the most they could reach, and the Stay-decision share is out of reach for a search that (like the champion) only considers a Stay below the root when every plain placement busts.
**Detectability:** the Referee reports that evaluator/midgame-type changes measure a paired SE of ~13-15 on set1000, so **acceptance (> 2 SE) needs about +30**; nothing in this file is expected to get near that (best guess +1 for scope=mine, +5..+8 for scope=all). My own dev run agrees on the direction: the paired diff of a mid-game change had sd ~750-880 per game on 40 dev200 games (SE 27 at n=1000 by that estimate, i.e. worse than the Referee's 13-15; n=40 sd is noisy). Lab rule: <= 1,000 games per test, set1000 only.

## 7. Plumbing / smoke (MEASURED, NOT evidence; the dev40 runs predate the scope switch and are scope=all)
Correctness:
- tests/equiv.js: msearch with extra pass off vs the champion's `createSearcher`: 108 positions (dev200 games 0-2, >= 17 cards), 0 move differences, 0 root-value differences.
- Game level, dev200 games 0-4 (compare.py, 1 worker): `midsearch:champ=1` and `midsearch:` (my re-implementation, extra off) both give paired diff +0.0 +- 0.0 vs frozen deeper:16 (mean 9410.0 on both sides). Logs: `experiments/midgame-search/results/smoke/`.
- tests/leaf_format.js: engine-format and Learner-format nets load; paths / unknown names rejected. Static scan (`audit.py --static`): 0 HIGH hits. The dynamic `audit.py --fresh` has not been run (Referee to do before any acceptance).

### 7.1 Timing (MEASURED; adapter process CPU, box, nice 19, 2 workers, box shared and loaded; `tests/timing_table.py`; Mac ~ box/1.5 is an estimate; "extra" = on top of deeper:16, whose own measured mean is 8.7 s / max 26.3 s on 60 set1000 games)
| config | games | think CPU s/game mean / median / p95 / max | slowest move | RSS max | extra-pass moves/game | aborted/game | changed moves/game | NN evals/game extra (+champion search) |
|---|---|---|---|---|---|---|---|---|
| **mine5** `xd=5,xk=3,xm=150,bm=2,cap=1500000,pool=3000000` (scope=mine, the default) | dev200 0-19 | 14.1 / 10.5 / 41.0 / 41.0 | 16.4 s (rem 22, a mid-search move) | 750 MB | 0.8 | 0.10 | 0.05 | 364,050 (+50,759) |
| scope=all `xd=3,xk=3,xm=150,cap=100000,pool=3000000` | dev200 0-39 | 17.8 / 15.0 / 50.2 / 64.1 | 42.6 s (rem 16) and 40.8 s (rem 29), see note | 449 MB | 21.2 | 0.00 | 1.9 | 457,829 (+47,562) |
| scope=all `xd=4,xk=3,xm=150,bm=2,cap=250000,pool=4000000` | dev200 0-39 | 53.2 / 54.5 / 72.6 / 72.9 | 3.9 s (rem 14) | 562 MB | 21.2 | 2.60 | 2.05 | 3,220,115 (+48,127) |
Worst game seen 72.9 s box CPU (~49 s Mac estimate), far under the 150 s Mac / 180 s box target. The pool (3-4M evaluations ~ 45-60 s) is what bounds the worst game: worst = deeper:16's worst (~26 s) + pool seconds, i.e. <= ~90 s box. Note on the 42.6 s / 40.8 s moves in the scope=all/xd=3 run (both are "game 2" of two different 5-game chunks, i.e. global games 22 and 27): an in-process replay of dev200 games 20-29 in one process with the same config did NOT reproduce them (max single move 4.1 s, max game 27.8 s; `results/dev40/replay_*.txt`), so I read them as box stalls (CPU time includes page-fault system time under memory pressure), not deterministic cost. Not proven. mine5 is deterministic in evaluations; only the exact part of a move can exceed a few seconds.
### 7.2 Dev200 paired scores vs frozen deeper:16 (plumbing ONLY, not evidence; n = 20 / 40, the SE is ~120-140)
| config | n | deeper:16 mean | midsearch mean | paired diff +- SE | sd of diff |
|---|---|---|---|---|---|
| mine5 (scope=mine) | 20 (games 0-19) | 9027.5 | 9027.5 | +0.0 +- 0.0 (all 20 games identical; 1 move changed in 20 games, no score effect) | 0 |
| scope=all xd=3 | 40 (0-39) | 8808.8 | 8886.2 | +77.5 +- 138.8 (z 0.56) | 878 |
| scope=all xd=4,bm=2 | 40 (0-39) | 8808.8 | 8870.0 | +61.2 +- 119.0 (z 0.51) | 753 |
These are consistent with anything from -200 to +350; they say the code plays legal, sane games and that scope=all changes moves (hence the 750-880 paired sd) while scope=mine rarely does. Games used for this idea in total: probes 6 games x 4 trajectories (positions only), smoke 5 x 2 x 2, dev40 2 x (40 + 40), dev20 20 + 20, replay 10: **~250 games played, far below the 1,000-game cap**.

## 8. Recommendation
- **scope=mine alone: do not ask the Referee for a slot.** Expected gain +1 (GUESS), in scope for 4.7-9.7% of positions, 0.05-0.5 changed moves/game; against a paired SE of 13-15 and an acceptance bar of ~+30 the test could not succeed. It costs nothing to keep as a component.
- **scope=all (the bundled variants)**: expected +5..+8 (GUESS), also far below +30 and it overlaps 21 Streak's scope; not worth a slot on its own either. If a slot is ever spent on it, `midsearch:xd=3,xk=3,xm=150,cap=100000,pool=3000000,scope=all` costs ~+9 s/game over deeper:16 (set1000 ~ 5 CPU-hours total).
- **Useful as a bundle**: the adapter is the plug for a new leaf net (`leaf=`/`leaflow=`) with or without the extra pass, so Learner's net can be tested alone (`midsearch::leaf=<name>`) or together (`midsearch:xd=3,...,scope=all:leaf=<name>`), and with the control `midsearch:` == deeper:16 move for move.
- Honest limit: with the champion's network as the leaf, a deeper look mostly re-reads the same biased evaluator (value-to-go bias +50..+300, flat across moves); the lever is the evaluator, as the lead's rollout study also found.
- Open (not built): `stayInner: smart` (Stay below the root) is the one search change aimed at 21 Streak's Stay decisions; ~5x the cost per the engine README (unverified); left to 21 Streak.
