# Training methods for value/policy networks in single-player stochastic games (applied to the "21" solitaire solver)

Reading notes on sourcing: numbers below were read from the full text of the primary papers unless marked otherwise. Three items could NOT be read in primary form and are flagged where used: the Stochastic MuZero paper (OpenReview blocked; numbers come from Guei's dissertation, which cites it), Bjarnason et al. Klondike (abstract only), and Gumbel MuZero (described only via Guei). Anything under "Inferences" is my reasoning, not a sourced fact.

## 1. 2048 research: which tricks beat plain TD(0), by how much, and which transfer to a card game?

### Takeaway
In 2048 the largest sourced gains over plain TD came from (a) per-weight adaptive learning rates (TC: +77% at 1-ply, +41% at 3-ply), (b) stage-specific value functions with weight sharing/promotion (+19% at 3-ply), (c) redundant/extra features (+17% at 3-ply), (d) oversampling late-game states (carousel/restart, +5-10% at 3-ply), and (e) optimistic initialization (+17% at 1-ply on a large network, zero on a small one). Simply making the function approximator bigger helped 1-ply play but not searched play, which matches what the 21 solver already observed.

### Cited Findings

Baselines and progression
- Plain TD(0) n-tuple, 1M episodes: 100,178 avg (1-ply). TD(0) with 5M games and a 67M-weight network: 142,727; adding 3 game-stage networks plus 5-ply expectimax: 328,946; further refinement (Yeh et al.): 443,526. — [Jaśkowski 2016, Sec. III](https://arxiv.org/abs/1604.05085)
- All of this work learns an afterstate value V(s') (state after the player's move, before the random event), trained from tuples (s'_t, r, s'_{t+1}), so move selection needs no expectation over chance outcomes. — [Jaśkowski 2016, Sec. IV-D](https://arxiv.org/abs/1604.05085)

Adaptive learning rate (Temporal Coherence, TC) vs TD — same network, same 10^10-action budget
- TD(0.5), best alpha=1.0: 141,456 +/- 1,050 (1-ply), 237,026 +/- 8,081 (3-ply). TC(0.5), beta=1.0: 250,393 +/- 3,424 (1-ply), 333,010 +/- 2,856 (3-ply). Autostep, best mu: 171,396 (1-ply), 249,609 (3-ply). — [Jaśkowski 2016, Table I](https://arxiv.org/abs/1604.05085)
- TD was very sensitive to the learning rate: alpha=0.01 gave 41,085 vs 141,456 at alpha=1.0 (1-ply). — [Jaśkowski 2016, Table I](https://arxiv.org/abs/1604.05085)
- TC keeps, per weight, the sum of errors E and sum of absolute errors A, and uses |E|/A as that weight's learning rate (rate falls when error signs start to alternate). Cost: about 1.5x training time. — [Jaśkowski 2016, Sec. V-B](https://arxiv.org/abs/1604.05085)
- The author used lambda=0.5 with a 3-step update horizon for both TD and TC, chosen in "informal preliminary experiments"; no TD(0)-vs-TD(0.5) table is given. The "delayed" variant is a speed trick only: no statistically significant score difference, about 3x faster for TC. — [Jaśkowski 2016, Sec. V-B/V-C, Table II](https://arxiv.org/abs/1604.05085)

Multi-stage value functions and weight promotion (4x10^10 actions)
- 1 stage: 251,033 (1-ply) / 296,207 (3-ply). 16 stages WITHOUT weight promotion: 226,352 / 318,534 (worse at 1-ply: each stage learns from scratch). 16 stages WITH promotion (new stage's weights initialised from the previous stage): 267,544 / 400,124. 8 stages: 273,510 / 363,379. 32 stages: 250,051 / 355,413 ("overkill"). — [Jaśkowski 2016, Table III](https://arxiv.org/abs/1604.05085)
- Spending the same parameter budget on one bigger single-stage network (5 x 7-tuples, 1.34B weights) gave 284,657 at 1-ply but only 326,267 at 3-ply, i.e. better greedy play, worse searched play than the staged network (400,124). — [Jaśkowski 2016, Table III and Sec. V-D](https://arxiv.org/abs/1604.05085)
- Guei: 2-stage on top of optimistic TD+TC raised 1-ply from 370,194 to 404,288; removing multistage from the final 6-ply system dropped 625,377 to 574,150. — [Guei 2022, Table 11](https://arxiv.org/abs/2212.11087)

Redundant encoding and carousel shaping (16 stages + WP, 4x10^10 actions)
- Baseline 42-33 network: 265,435 (1-ply) / 393,289 (3-ply). Adding redundant smaller tuples (features already expressible by the larger ones): 319,433 / 469,779. Adding carousel shaping (start episodes from stored late-stage states so late stages are visited more): 311,426 / 491,398. Carousel alone: 258,616 / 432,701 (slightly worse 1-ply, +10% 3-ply). — [Jaśkowski 2016, Table IV](https://arxiv.org/abs/1604.05085)
- Cumulative ladder (3-ply): TD 237,026 -> TC 333,010 -> +stages/WP 400,124 -> +redundant encoding 469,779 -> +carousel 491,398. Final network: 324,710 (1-ply), 511,759 (3-ply), 609,104 (1000 ms/move). — [Jaśkowski 2016, Tables V, VII](https://arxiv.org/abs/1604.05085)
- A "restart strategy" (same idea as carousel shaping) is reported to work for deep networks too in Matsuzaki's DNN value-network study, whose best network reached 228,100 at 1-ply and 406,927 at 3-ply after 240 hours of training. — [Matsuzaki 2021](https://www.jstage.jst.go.jp/article/ipsjjip/29/0/29_336/_article)
- Matsuzaki also found mini-batch size mattered a lot for a DNN trained by TD: batch 1,024 gave 80,851 vs 56,486 for batch 64 in a short experiment. — [Matsuzaki 2021, Table 3](https://www.jstage.jst.go.jp/article/ipsjjip/29/0/29_336/_article)

Optimistic initialization (Guei et al.; 100M episodes per run, 5 runs each)
- Small 4x6-tuple network: optimistic TD gave no gain (251,920 at V_init=0 vs 254,784 best); optimistic TC gave 265,481 -> 280,281 (+5.6%) at V_init=320k. — [Guei 2022, Tables 1-2](https://arxiv.org/abs/2212.11087)
- Large 8x6-tuple network: TD 309,208 -> optimistic TD 369,172 (V_init=160k; +19%), and the 32768-tile rate went from 0% to about 22%. — [Guei 2022, Table 3](https://arxiv.org/abs/2212.11087)
- Too large an initial value hurt or failed to converge (640k: 339,492 on 8x6; 228,032 on 4x6). — [Guei 2022, Tables 1, 3](https://arxiv.org/abs/2212.11087)
- Two-phase schedule (fixed-rate optimistic TD, then TC for the last 10% of training): 370,907; using TC for 90% of training fell to 298,673, attributed to TC shrinking the learning rate too early and cutting exploration. — [Guei 2022, Table 6 and Sec. 3.3.1](https://arxiv.org/abs/2212.11087)
- Full ladder: TD 309,208 -> +OI 361,471 -> +TC fine-tune 370,194 -> +2-stage 404,288 -> +6-ply expectimax 586,583 -> +tile-downgrading 625,377 (72% 32768). Ablations from the final system: minus OI 592,390; minus TC 574,779; minus multistage 574,150; minus search 412,785. — [Guei 2022, Table 11](https://arxiv.org/abs/2212.11087)
- Caveat on those ablations: the 6-ply numbers are from 100 episodes with 95% CIs of roughly +/- 40,000 (625,377 +/- 40,936 vs 592,390 +/- 39,073), so the OI effect at 6-ply is inside the noise; it is clearly significant only at 1-ply. — [Guei 2022, Tables 10-11](https://arxiv.org/abs/2212.11087)
- Contradiction on exploration: Jaśkowski reports that epsilon-greedy, softmax and other exploration "significantly inhibits" learning in 2048 and that the game's randomness explores enough; Guei shows optimistic initialization (a different form of exploration) helps on large networks. — [Jaśkowski 2016, Sec. IV-D](https://arxiv.org/abs/1604.05085); partly contradicted by [Guei 2022, Ch. 3](https://arxiv.org/abs/2212.11087)

Tile-downgrading and weight averaging
- Tile-downgrading (map positions with very large, rarely-seen tiles onto equivalent positions with smaller tiles before evaluating) raised 1-ply from 404,288 to 412,785 and 6-ply from 586,583 to 625,377. It is a 2048-specific state-aliasing trick for under-trained regions. — [Guei 2022, Tables 9, 11](https://arxiv.org/abs/2212.11087)
- Averaging the weights of the last k training snapshots (SWA): a fixed-learning-rate network went from 283,734 to 361,075 (k=44); networks whose rate was already annealed by TC gained little (374,116 -> 380,025; 282,296 -> 283,632). A 1-stage network trained 400M episodes with SWA matched the 2-stage SOTA at 1-ply (415,945 vs 412,785). — [Guei 2022, Tables 12-13](https://arxiv.org/abs/2212.11087)

### Inferences
- Transfers directly to the 21 game: afterstate values (state after placing the card / using Stay, before the next card is drawn); stage-specific heads or networks keyed on cards remaining or busts used, initialised from the neighbouring stage; oversampling of rare-but-valuable regions (e.g. late positions with zero busts where the +1000 bonus is still alive, or long streaks) by restarting episodes from stored states; snapshot weight averaging; a TC-like per-parameter step size (for an MLP the practical analogue is Adam plus a decaying schedule, which is my analogy, not something these papers tested).
- Does not transfer as-is: n-tuple lookup tables themselves, tile-downgrading, and probably optimistic initialization (it relies on table entries that stay optimistic until visited; an MLP generalises the optimism away).
- The "bigger network helps 1-ply but not 3-ply" result in Table III is the closest published analogue to the solver's own observation that a 4x larger net on the same 56 inputs did not help. The 2048 gains came from changing what the approximator can represent per game phase (stages, extra redundant features), not from width.
- "Redundant encoding" suggests adding inputs that are derivable from the existing 56 (e.g. explicit per-column probability of hitting 21 or busting on the next card given the remaining deck) may speed and improve learning even though they add no expressiveness in principle.

### Gaps
- Yeh et al.'s and Wu et al.'s own papers were not read; their numbers are as reported by Jaśkowski.
- No source isolates TD(0) vs TD(lambda) with a table for 2048; lambda=0.5 was chosen informally.
- None of these tricks has a published test on a small MLP with handcrafted inputs; all gains are for lookup-table approximators.

## 2. AlphaZero-style / search-target training for stochastic single-player games (Stochastic MuZero, Gumbel MuZero, search-backed-up targets, TD(lambda), n-step, MC, TreeStrap/TD-leaf)

### Takeaway
Evidence that search-derived value targets beat 1-step TD in a single-player chance game is mixed: in 2048, replacing the TD target with an MCTS value helped only at small simulation counts (about 50-100) and got worse with more search, and Stochastic MuZero needed 10x the data of TD n-tuple methods to reach a similar score. The strongest positive result for search targets (TreeStrap, +1,089 Elo over TD-Leaf) is from deterministic chess, starting from random weights.

### Cited Findings
- Stochastic MuZero reached approximately 510,000 on 2048 using 100 simulations per move for data generation; at 10^10 training states it was at about 250,000 and needed about 10^11 states for the ~510,000 figure. — [Guei 2022, Sec. 2.7, 4.4.3 and Table 20](https://arxiv.org/abs/2212.11087), citing [Antonoglou et al. 2022](https://openreview.net/forum?id=X6D9bAHhBQ1) (primary paper not read; one Table 20 cell was garbled in text extraction and I rely on the prose figure)
- The paper's abstract-level claim is that Stochastic MuZero matched or exceeded the state of the art in 2048 and backgammon and strongly outperformed deterministic MuZero in stochastic environments. — [ICLR 2022 page](https://iclr.cc/virtual/2022/poster/6832)
- Combining Gumbel MuZero's root action selection with Stochastic MuZero: 359,721 with only 3 simulations in training and testing, 394,645 when tested with 50 simulations, at 10^10 states. Plain Stochastic MuZero "apparently cannot learn" with 2-4 simulations. — [Guei 2022, Sec. 4.4.3, Table 20](https://arxiv.org/abs/2212.11087)
- In the same experiments, training with more simulations (16 or 50) performed worse than training with n=m (2-4); the author calls this unexpected and unexplained. — [Guei 2022, Sec. 4.4.3-4.4.4](https://arxiv.org/abs/2212.11087)
- Sample-efficiency comparison: at 10^10 actions (about 10^6 episodes) the MuZero hybrid had 359,721 while n-tuple TD networks were below 240,000; but n-tuple TD eventually reaches higher final scores (625,377 with search). — [Guei 2022, Sec. 4.4.4, Table 10](https://arxiv.org/abs/2212.11087)
- Direct test of "search value as training target": n-tuple TC learning where the target is the MCTS value Q(s_{t+1}, a_{t+1}) instead of r + V(s'_{t+1}), 1M episodes, training simulation counts 1-800. Performance peaked at about 50-100 training simulations and then decreased as simulations increased; the networks' 1-ply/expectimax strength decreased as training simulations increased ("afterstate values trained by MCTS become inaccurate for direct comparison"); high exploration with either very few (20) or many (800) simulations "corrupts the network". The author states the reasons are open. — [Guei 2022, Sec. 4.3.4, Tables 16-18](https://arxiv.org/abs/2212.11087)
- Using a TD-trained value net inside MCTS at play time was no better than expectimax at equal node counts: with 4,400 nodes MCTS scored about 555,000 vs 558,938 for 3-ply expectimax. — [Guei 2022, Sec. 4.3.3, Table 15](https://arxiv.org/abs/2212.11087)
- Train/test search mismatch: networks trained with 1-ply targets "overfit to 1-ply": after about 10^10 actions the single-stage network's 3-ply score started to fall while its 1-ply score kept rising. — [Jaśkowski 2016, Sec. V-D](https://arxiv.org/abs/1604.05085)
- TD(0) beat Q-learning for 2048 both with n-tuple networks and with a deep CNN. — [Guei 2022, Sec. 4.4.1](https://arxiv.org/abs/2212.11087)
- TreeStrap (update every node in the search tree toward its own deep-search value) vs TD-Leaf, chess, self-play from random weights: TreeStrap(alpha-beta) 2157 +/- 31 Elo, TreeStrap(minimax) 1807 +/- 32, RootStrap 1362 +/- 59, TD-Leaf 1068 +/- 36, untrained 250. TreeStrap learned effective weights in about a thousand training games. — [Veness et al. 2009, Table 2](https://proceedings.nips.cc/paper_files/paper/2009/file/389bc7bb1e1c2a5e7e147703232a88f6-Paper.pdf) (adversarial, deterministic game)
- Multi-step returns vs value bootstrapping in Tetris (single-player, stochastic): a pure value-function method (lambda-PI) scored about 400 lines on the small board, while classification-based policy iteration using m-step rollouts scored about 3,400 (best at m=5 and m=10; m=1 gave poor action-value estimates); on the large board CBMPI reached 51,000,000 lines vs 31-36M for prior best policies. — [Gabillon et al. 2013, Sec. 4 and Table 1](https://papers.nips.cc/paper_files/paper/2013/file/7504adad8bb96320eb3afdd4df6e1f60-Paper.pdf)

### Inferences
- For the 21 solver, the cheapest search-target variant is a TreeStrap-style expectimax version: the engine already builds a 1-2 card expectimax tree, so regress the net (at the root, and at interior afterstates) toward the backed-up expectimax value rather than toward r + V(next). The 2048 evidence says to keep the training search shallow (the 2048 optimum was 50-100 simulations, roughly a 2-ply tree) and to evaluate at the same depth used in play, because of the 1-ply-overfitting effect. Whether it helps is uncertain: the only single-player-stochastic test I found was mixed.
- The solver has something 2048 lacks: an exact solver for the last 12 cards. Using exact values as regression targets for positions at the 12-13-card boundary (and bootstrapping earlier positions from there) is a stronger form of search target with zero bias. This is my suggestion; I found no paper that measured exact-endgame targets in a comparable game.
- Games here last at most 52 placements, so Monte Carlo returns and TD(lambda) with large lambda are computationally trivial. The risk is variance from the +1000 no-bust bonus and streak bonuses; the Tetris result (m-step rollouts beating pure bootstrapping, m=5-10 best) supports trying n-step or lambda in the 0.5-0.9 range rather than assuming TD(0) is best.
- A full Stochastic MuZero is not indicated: the rules and chance model are known exactly (so the learned-model part buys nothing), and it took about 10^11 states to match what table-based TD reached with far less.

### Gaps
- I could not read the Stochastic MuZero paper itself, so I have no primary numbers for backgammon (e.g. results vs GNUbg), its value-target horizon, or its AlphaZero-with-simulator comparison. A third-party leaderboard lists Stochastic MuZero 500,000 / AlphaZero 500,000 / MuZero 300,000 on 2048 ([Papers with Code mirror](https://astro.paperswithcode.com/paper/planning-in-stochastic-environments-with-a)), unverified.
- Gumbel MuZero's own paper was not read; claims about it are via Guei.
- No controlled TD(0) vs TD(lambda) vs Monte Carlo comparison was found for a single-player card game.
- No source tests TreeStrap with expectimax in a chance game.

## 3. Rollout / policy-improvement algorithms: measured gains over the base policy

### Takeaway
Rollouts are the most consistently documented way to beat a fixed value function in chance games: backgammon equity error fell 2.5-6.6x (including for a strong 80-hidden-unit TD net using truncated rollouts), and Klondike win rate went 13% -> 31% -> 48% -> 57% -> 61% -> 70% over five nested iterations. The cost is one to several orders of magnitude more compute per move per nesting level.

### Cited Findings
- Backgammon, full rollouts on linear base players (average equity loss per move on 800 test positions): random 0.330 -> 0.131 (2.5x); Lin-1 0.0400 -> 0.0124 (3.2x); Lin-2 0.0665 -> 0.0175 (3.8x); Lin-3 0.0291 -> 0.00749 (3.9x). In full games vs TD-Gammon 2.1 (1-ply), Lin-1 went from -0.52 to -0.01 points per game. — [Tesauro & Galperin 1996, Tables 1-2](https://arxiv.org/abs/2501.05407)
- Truncated rollouts (play a few steps with the base policy, then use the network's value) on multi-layer TD nets: 10 hidden units 0.0152 -> 0.00318 (4.8x, 11-step); 80 hidden units 0.0120 -> 0.00181 (6.6x, 7-step). For comparison, the same strong net with 2-ply search only improved from 0.0120 to 0.00843. — [Tesauro & Galperin 1996, Table 3 and text](https://arxiv.org/abs/2501.05407)
- Truncation gave "at least an order of magnitude" speed-up over full rollouts; decisions used on the order of tens of thousands of trials after pruning clearly inferior candidates; timings were 9-65 s/move on 32 parallel nodes of 1996 hardware. — [Tesauro & Galperin 1996](https://arxiv.org/abs/2501.05407)
- Klondike (thoughtful solitaire), iterated rollouts on a hand-made heuristic: heuristic 13.05% wins (0.021 s/game); 1 rollout 31.20% (0.67 s); 2 rollouts 47.60% (7.13 s); 3 rollouts 56.83% (1 min 36 s); 4 rollouts 60.51% (18 min, 1,000 games, +/- 4.0%); 5 rollouts 70.20% (1 h 45 min, 200 games, +/- 8.34%). Human expert: 36.6% over 2,000 games. — [Yan et al. 2004, results table](https://papers.nips.cc/paper_files/paper/2004/file/48c3ec5c3a93a9e294a8a6392ccedeb4-Paper.pdf)
- That version of solitaire was modelled as deterministic (all cards known), which is why iterated rollouts were affordable; the authors note computation grows exponentially with the number of iterations. — [Yan et al. 2004](https://papers.nips.cc/paper_files/paper/2004/file/48c3ec5c3a93a9e294a8a6392ccedeb4-Paper.pdf)
- Real (hidden-card) Klondike with Monte-Carlo planning (UCT, hindsight optimization, sparse sampling): a policy winning over 35% of games. — [Bjarnason et al. 2009, abstract](https://ojs.aaai.org/index.php/ICAPS/article/view/13363) (abstract only)
- Nested Monte-Carlo Search (deterministic single-player puzzles, random base policy): on the test problem level 1 beat level 0 by about 6 points, level 2 by a further 2, level 3 by a further 1 at equal time; in Morpion Solitaire the score distribution peak moved from 61 (level 1) to 66 (level 2) with memorization, and a level-4 search found an 80-move grid vs the best human 68. Each extra level costs about 200x in Morpion; nesting can be worse than a lower level when the best sequence is not memorized. — [Cazenave 2009](https://www.lamsade.dauphine.fr/~cazenave/papers/nested.pdf)
- Rollouts used inside training rather than only at play time: classification-based policy iteration with m-step truncated rollouts plus a value function at the end set the Tetris record (51M lines) with about 1/6 the samples of the cross-entropy method. — [Gabillon et al. 2013](https://papers.nips.cc/paper_files/paper/2013/file/7504adad8bb96320eb3afdd4df6e1f60-Paper.pdf)

### Inferences
- The Tesauro result is the most relevant single data point for the solver's situation ("deeper search with the same net gave nothing"): for an already-decent TD net, 2-ply search cut error by 1.4x while truncated rollouts cut it by 4.5-6.6x. Rollouts average over many complete random futures, so they correct systematic value-net bias that shallow expectimax inherits at its leaves.
- A concrete design for the 21 game: for each legal placement, sample N shuffles of the remaining deck, play each out with the current engine's fast 1-ply greedy policy (or 0-ply net-greedy), stop at 12 cards remaining and plug in the exact solver's value. This is a truncated rollout whose terminal value is exact rather than learned, so the only remaining error is the base policy's sub-optimality in the middle game. Using the same sampled shuffles for every candidate action (common random numbers) should reduce the variance of the comparison; that is standard practice but not something these papers measured.
- Rollout results can be distilled back: use rollout action values (or the rollout-improved value) as training targets for the net, then roll out again with the improved net. That is approximate policy iteration (the CBMPI/Tetris pattern, and what Yan et al. do without a learner). Expect diminishing returns per iteration, as in Klondike (+18, +16, +9, +4, +10 points with widening error bars).
- Because the 21 game has real chance nodes, nested (level 2+) rollouts are far more expensive than in deterministic Klondike; one level of rollout plus distillation is the realistic budget.

### Gaps
- No measurement exists for rollout gains in a short (52-step) stochastic solitaire with a strong learned base policy; the size of the gain here must be measured.
- Bertsekas' books were not consulted directly; his rollout framework is represented here only through the papers that cite it.
- Bjarnason et al.'s per-algorithm win rates were not retrieved.

## 4. Distributional or auxiliary targets (bust probability, final-score distribution)

### Takeaway
There is direct evidence that auxiliary prediction heads speed up value learning in board-game self-play (removing KataGo's ownership and score targets cost about 190 Elo, equivalent to 1.65x more training) and that training the value head as a classifier over binned returns beats MSE regression in deep RL, but I found no such experiment in a single-player chance game.

### Cited Findings
- KataGo ablation at about 2 days of self-play: baseline 1329 Elo; without auxiliary ownership and score targets 1139 (1.65x more training needed to catch up); without global pooling 1153 (1.60x); without game-specific features 1168 (1.55x); without playout cap randomization 1242 (1.37x); without auxiliary policy targets 1255 (1.30x). Factors are described by the authors as approximate, from shorter runs. — [Wu 2019, KataGo, Table 2](https://arxiv.org/abs/1902.10565) (adversarial game)
- Replacing MSE value regression with cross-entropy over a discretised value distribution (HL-Gauss) outperformed MSE and two-hot targets on Atari, also beat C51, and stayed stable over long offline training where MSE degraded; the authors attribute the gain mainly to robustness to noisy targets and non-stationarity. — [Farebrother et al. 2024](https://arxiv.org/abs/2403.03950) (general deep RL, not chance games specifically)

### Inferences
- The 21 game's return is strongly multi-modal (the +1000 zero-bust bonus, game-ending third bust), which is exactly the noisy-target setting where a categorical value head is claimed to help. A cheap version: predict a histogram of final score with an HL-Gauss or two-hot loss and read the expectation off it.
- Natural auxiliary heads, all of which have free labels from self-play: P(zero busts at game end), P(game ends by third bust), expected number of further busts, expected remaining streak length, and per-column P(reaches 21). The value can be partly decomposed as E[base points] + 1000 x P(zero busts), which gives the net an easier sub-problem. This is my proposal by analogy with KataGo's score/ownership heads.
- With only 128x48 hidden units the shared-trunk benefit may be smaller than in a deep ResNet; this needs an ablation.

### Gaps
- No published ablation of auxiliary or distributional value targets in 2048, backgammon, Tetris or a card solitaire was found.
- KataGo's and HL-Gauss's gains are from much larger networks and different domains.

## 5. Failure modes when the value net is already strong, and data scale used

### Takeaway
The documented plateaus are: bigger approximators that improve greedy play but not searched play, value functions that overfit to the search depth used in training, more search during training making things worse, exploration schedules decaying too early, and evaluation noise larger than the effect being measured. Successful 2048 systems used 10^6 to 4x10^8 self-play episodes.

### Cited Findings
Failure modes
- Bigger network, no search gain: the 1.34B-weight single-stage network beat the baseline at 1-ply (284,657 vs 251,033) but was far behind the staged network at 3-ply (326,267 vs 400,124) and also showed 1-ply overfitting. — [Jaśkowski 2016, Table III](https://arxiv.org/abs/1604.05085)
- 1-ply overfitting: 3-ply performance of the converged single-stage network declines with further training while 1-ply performance keeps improving; 1-ply and 3-ply scores "do not always positively correlate". — [Jaśkowski 2016, Sec. V-D, V-E](https://arxiv.org/abs/1604.05085)
- Splitting the approximator without sharing hurts: 16 stages without weight promotion was worse than 1 stage at 1-ply (226,352 vs 251,033). — [Jaśkowski 2016, Table III](https://arxiv.org/abs/1604.05085)
- Rare states under-trained: only a small fraction of episodes reach late stages; fixes are carousel shaping/restart. Without exploration, saturated networks never reached the 32768 tile (0%). — [Jaśkowski 2016, Sec. V-E](https://arxiv.org/abs/1604.05085); [Guei 2022, Tables 1-4](https://arxiv.org/abs/2212.11087)
- Adaptive step sizes can freeze learning too early: TC for 90% of training gave 298,673 vs 370,907 for TC in only the final 10%. — [Guei 2022, Table 6](https://arxiv.org/abs/2212.11087)
- More search in training is not monotone: MCTS-target training degraded beyond about 100 simulations, and MuZero-style training with 16-50 simulations was worse than with 2-4. — [Guei 2022, Sec. 4.3.4, 4.4.3](https://arxiv.org/abs/2212.11087)
- Very long training produced negative afterstate values that corrupted tree search and needed a workaround. — [Guei 2022, Sec. 3.4.1](https://arxiv.org/abs/2212.11087)
- Deeper search has diminishing returns on a fixed net: 1-ply 324,710; 2-ply 457,079; 3-ply 511,759; 5-ply 545,833; 1000 ms 609,104. — [Jaśkowski 2016, Table V](https://arxiv.org/abs/1604.05085)
- Evaluation noise: Jaśkowski's 1000 ms result is from 100 games (+/- 38,433); Guei's 6-ply result is from 100 episodes (+/- 40,936). Training-time evaluations used 1,000 games at 1-ply, 300 at 3-ply (Jaśkowski) or 100,000 test episodes per checkpoint (Guei). — [Jaśkowski 2016, Table V, Sec. V-A](https://arxiv.org/abs/1604.05085); [Guei 2022, Sec. 3.3, Table 10](https://arxiv.org/abs/2212.11087)
- TreeStrap's advantage was demonstrated from random initial weights; the paper notes earlier search-bootstrapping methods were mainly effective when weights were already reasonable. — [Veness et al. 2009](https://proceedings.nips.cc/paper_files/paper/2009/file/389bc7bb1e1c2a5e7e147703232a88f6-Paper.pdf)

Data scale
- Szubert & Jaśkowski TD(0): 1M episodes. Wu et al.: 5M games. — [Jaśkowski 2016, Sec. III](https://arxiv.org/abs/1604.05085)
- Jaśkowski: 10^10 actions per experiment (stated as about 10^7 episodes for the best algorithms), 4x10^10 for the final networks; 1-7 days per run on 24 cores; 5 repeats per configuration. — [Jaśkowski 2016, Sec. V-A](https://arxiv.org/abs/1604.05085). Guei describes the same 4x10^10 actions as "approximately 4M episodes or less" — [Guei 2022, Sec. 3.5](https://arxiv.org/abs/2212.11087) (the two episode-count conversions disagree; action counts are the reliable figure)
- Guei: 100M episodes per experimental run, 200M for the SOTA network (66 hours, C++, one Xeon E5-2698 v4), 400M for the SWA network. — [Guei 2022, Sec. 3.3, 3.5, 4.2.4](https://arxiv.org/abs/2212.11087)
- Stochastic MuZero: about 10^11 states at 100 simulations each for ~510,000. — [Guei 2022, Table 20](https://arxiv.org/abs/2212.11087) (secondary)
- Matsuzaki DNN value network: 240 hours of training. — [Matsuzaki 2021](https://www.jstage.jst.go.jp/article/ipsjjip/29/0/29_336/_article)
- Tetris CBMPI: 8-80 million generative-model samples per iteration, about 256M total on the large board vs 1.7B for cross-entropy. — [Gabillon et al. 2013](https://papers.nips.cc/paper_files/paper/2013/file/7504adad8bb96320eb3afdd4df6e1f60-Paper.pdf)

### Inferences
- The solver's symptom (4x net and deeper search both flat) fits two of the documented patterns: representation rather than capacity is binding (same 56 inputs), and the net was trained on shallower targets than the search it is used in. The published remedies are stage-conditioning, added or redundant features, late-state oversampling, and training/evaluating at the play-time search depth.
- Because a 21 game is at most 52 moves versus thousands to tens of thousands in 2048, 10^7-10^8 self-play games is cheap here; if the current net was trained on far fewer, data volume and learning-rate annealing (or snapshot averaging) are the first things to rule out before changing algorithms.
- Score variance per game is large (bonus of +1000, early termination), so differences of a few percent between engine variants need tens of thousands of games and paired evaluation on identical deck orders to be detectable. The 2048 papers' wide error bars at 100 games are a warning.
- Ranking by expected value per unit effort for this solver (my judgement): (1) one-level truncated rollouts ending in the exact 12-card solver, at play time and as training targets; (2) auxiliary/distributional heads for bust and bonus outcomes; (3) stage-conditioned network plus late-state oversampling; (4) expectimax-backed (TreeStrap-style) targets and n-step/lambda returns; (5) snapshot averaging. Full MuZero-style training is not worth it with a known model.

### Gaps
- I found no published work on this specific "21" solitaire or a close card-game analogue with learned values, so every transfer claim is an inference.
- No source quantifies how much of a plateau is input-representation-bound versus target-bound for a small MLP; this must be diagnosed empirically (e.g. measure value-net error against exact values at the 12-card boundary).
