# Exact and near-exact solving of single-player chance games, and state abstraction (for the 21-solitaire solver)

Reading notes: "Cited Findings" are facts taken from a source fetched or surfaced in this session (search-snippet-level where marked "snippet"). "Inferences" are my own reasoning or background knowledge that was NOT verified against a source in this session; treat them as hypotheses. About 20 tool calls were used; several primary PDFs (Glenn's Yahtzee TR, the Can't Stop papers, Hauk et al. full text, Neller's Pig paper) could not be opened, so their internal numbers are gaps.

## 1. Published optimal solvers for comparable games (Yahtzee, Can't Stop, Pig/Farkle, blackjack CA, 21-style column solitaire)

### Takeaway
Solitaire Yahtzee (optimal 254.59) and small Can't Stop variants are solved exactly by layered dynamic programming / retrograde analysis over a state space made small by a good canonical state definition; blackjack is solved exactly per deck composition by combinatorial analysis. I found no published solver, strategy analysis with numbers, or open-source bot for Catch 21 / Simply 21 / 21 Blitz style column solitaire: this solver appears to be in unpublished territory.

### Cited Findings
- Solitaire Yahtzee optimal expected score is 254.5896, standard deviation 59.6117 (variance 3553.52), median 248 over one million simulated games — [Verhoeff, Optimal Solitaire Yahtzee Player: Trivia](https://www-set.win.tue.nl/~wstomv/misc/yahtzee/trivia.html)
- The exact per-category expectations/variances on that page were computed in 2017 with Mathematica on a single Core i7-4770K (16 GB RAM) in "about 5 days" (this is a statistics computation in a slow environment, not the minimal solve time) — [Verhoeff trivia page](https://www-set.win.tue.nl/~wstomv/misc/yahtzee/trivia.html)
- Glenn's report is "An Optimal Strategy for Yahtzee", Loyola College in Maryland CS-TR-0002, May 2006; it uses dynamic programming over every decision point — [Glenn publications page](http://www.cs.loyola.edu/~jglenn/Papers/index.html); [Yahtzee Manifesto summary](https://www.yahtzeemanifesto.com/an-optimal-strategy-for-yahtzee.php)
- A later RL paper describes the optimised Yahtzee DP as exploiting symmetries with a reachable state space of about 5.3e8 states (snippet; attributed to Glenn's follow-up work, not checked in the primary) — [arXiv 2601.00007](https://arxiv.org/html/2601.00007v1)
- Follow-up: Glenn, "Computer Strategies for Solitaire Yahtzee", IEEE CIG 2007, pp. 132-139 — [DBLP](https://dblp.uni-trier.de/rec/conf/cig/Glenn07.html)
- Conflict to note: one demo's code comment quotes 245.87 as the optimal score "as per the paper (section 6)"; this appears to be the variant without Yahtzee bonuses/jokers, versus 254.59 for the full rules — [HF demo source](https://huggingface.co/spaces/simonjegou/yahtzee/blob/main/app.py); [Verhoeff](https://www-set.win.tue.nl/~wstomv/misc/yahtzee/trivia.html)
- Multi-player Yahtzee: optimal play for more players "is not possible with the use of the current technology"; only near-optimal play is achieved by building on the solitaire solution — [Pawlewicz, Nearly Optimal Computer Play in Multi-player Yahtzee](https://link.springer.com/chapter/10.1007/978-3-642-17928-0_23)
- One-player Can't Stop: the position graph is cyclic; Glenn, Fang and Kruskal prove existence and uniqueness of the solution and solve it by combining retrograde analysis with Newton's method; results reported are for small versions of the game — [Springer chapter abstract, CG 2006 / LNCS 4630](https://www.springerprofessional.de/a-retrograde-approximation-algorithm-for-one-player-can-t-stop/2891308)
- "Solving the original game [Can't Stop] is infeasible with current techniques and technology"; the largest solved solitaire variant is (5,2) Can't Stop; solved databases map positions to optimal moves — [Glenn and Aloi, A Generalized Heuristic for Can't Stop (AAAI/FLAIRS)](https://cdn.aaai.org/ocs/123/123-2430-1-PB.pdf)
- Pig: Neller and Presser solved 2-player Pig by value iteration over (player score, opponent score, turn total) — [Science News](https://www.sciencenews.org/article/playing-pig-optimally); [Gettysburg project page](https://cs.gettysburg.edu/projects/pig/index.html)
- Farkle: Busche and Neller (ACG 2017) solve the optimality equations for 2-player Farkle and also compute the expected-score-maximising strategy, plus a human-playable approximation whose gap to optimal is "small" — [Cupola record](https://cupola.gettysburg.edu/csfac/38)
- Blackjack: Thorp noted a single deck has "about 3.4 x 10^7 subsets which are distinguishable under the rules of blackjack" and judged per-subset optimal strategy impractical at the time — [Thorp, A Favorable Strategy for Twenty-One](https://web.williams.edu/Mathematics/sjmiller/public_html/342/handouts/Thorpe_FavorableStrategy21.pdf)
- Eric Farmer's open-source engine computes exact probabilities and expected values for an arbitrary shoe composition (v4.0+), with exact split EVs for CDZ- and CDP strategies up to 4 hands, and repeated refactors of the dealer-probability computation for speed — [possibly-wrong/blackjack README](https://github.com/possibly-wrong/blackjack)
- Other exact blackjack CA code: MGP's BJ CA (exact including splits and insurance) — [GitHub fork](https://github.com/chriswaters78/MGPs-BJ-CA); a Rust composition analyser that brute-forces exact odds for every decision given the remaining cards — [joshuaprince/blackjack_composition](https://github.com/joshuaprince/blackjack_composition); Nairn's exact recursive pair-splitting EVs — [arXiv 1909.13710](https://arxiv.org/pdf/1909.13710.pdf)
- Catch 21 (WorldWinner): 52-card draw pile placed one card at a time into four columns, a column clears at exactly 21; the only strategy material found is unquantified heuristic tips (e.g. build foundations such as 6+5, 7+4 or a lone Ace; do not park every column in the high teens) — [WorldWinner Catch 21 page](https://www.playworldwinner.com/games/catch-21/). Scoring rules on that page were not extracted and differ between apps; do not assume they match this solver's rules (five-card, three-7s, streak bonuses, 2 Stay tokens).

### Inferences
- Thorp's 3.4e7 figure matches the deck model here: compositions of 9 ranks with 0-4 copies and one rank with 0-16 number 5^9 x 17 = 33,203,125 (computed locally). By cards remaining n, the number of distinct deck compositions is: n=4: 715; 8: 22,330; 12: 192,950; 14: 405,350; 16: 710,675; 20: 1,404,815; 26: 1,868,755 (peak). So the deck dimension is small; the 1e12-1e15 estimate must be dominated by the board (four columns x busts x Stays x streak) times deck, and much of that product is unreachable because deck composition and board contents are coupled (cards on the board are missing from the deck).
- The Yahtzee lesson (background knowledge, not re-verified here): the solve became trivial once the between-turn state was reduced to a minimal sufficient statistic (categories used + capped upper total + bonus flag) and the within-turn roll/keep graph was computed once and reused. The analogue here is to define each column by the minimal statistic that determines future scoring (total, soft-ace flag, card count, count of 7s only while three-7s is still achievable), and nothing else.
- Can't Stop needed Newton iteration only because of cycles (a failed turn returns to the same position). The 21 solitaire is acyclic (one card consumed per step), so plain one-pass backward induction by cards remaining is exact; no iteration is needed.
- No public solver for 21-style column solitaire was found in three differently worded searches, so there is no external optimum to validate against; validation has to come from internal consistency (exact endgame vs. earlier approximations).

### Gaps
- Could not open Glenn's CS-TR-0002 or the CIG 2007 paper to confirm exact state counts, the roll-state graph size, or solve time. The 5.3e8 reachable-state figure is second-hand.
- Could not open the Can't Stop papers (one-player CG 2006, two-player CGW 2007, multi-player CG 2008): position counts, disk/memory and runtime for the solved variants are missing. A search snippet gave "10.74 turns" for optimal (5,2) Can't Stop and "9.12 turns" for a heuristic over 250,000 games; a heuristic cannot beat the optimum on the same game, so these refer to different games or measures and should not be used without reading the paper.
- Exact state count for Pig and the Farkle state count/gap were not retrieved.
- Farmer's blog posts describing the algorithm (subset enumeration, dealer-probability caching) were not found by search; only the README was read. Griffin's and Cacarulo's work was not retrieved at all.
- No analysis of Simply 21 / 21 Blitz / Catch 21 with numbers exists in what I could find; absence of evidence only.

## 2. State-space reduction: symmetry, dominance, bucketing, abstraction, bounds and pruning

### Takeaway
The sourced evidence supports three levers: canonicalisation by symmetry (2048, Yahtzee), partitioning the space by a monotone "clock" variable so only a few layers are live at once (2048's "age"), and *-minimax style bound-based pruning at chance nodes (Star2 took backgammon from depth 3 to depth 5 full-width). Lossy poker-style abstraction and expected-deck approximations are plausible here but I found no source applying them to a single-player card-placement game.

### Cited Findings
- 2048-4x3 normalises each state to the minimum ID over board symmetries and removes duplicates by sort-and-merge — [Kaneko and Yamashita, Strongly Solving 2048 4x3, arXiv 2510.04580](https://arxiv.org/html/2510.04580v1)
- 2048-4x3 partitions states by "age" (sum of tiles), which never decreases; forward enumeration keeps only three consecutive ages in memory, backward value computation runs in decreasing age; at most about 297.8 million states exist in any one age out of 1.15e12 total — [arXiv 2510.04580](https://arxiv.org/html/2510.04580v1)
- The same paper stores values on afterstates (after the player's move, before the chance event): 739,648,886,170 afterstates versus 1,152,817,492,752 states, a 36% reduction — [arXiv 2510.04580](https://arxiv.org/html/2510.04580v1)
- Action-value gaps between best and second-best move in 2048-4x3 are "relatively large" on average and peak at particular stages, which the authors link to the value of stage-specific evaluation functions — [arXiv 2510.04580](https://arxiv.org/html/2510.04580v1)
- *-Minimax (Ballard's Star1/Star2) gives alpha-beta-like cutoffs in trees with chance nodes; with good move ordering and probing, Star2 "considerably outperforms Expectimax" and allows depth-5 full-width backgammon search (up from 3) under tournament conditions without forward pruning — [Hauk, Buro, Schaeffer, *-Minimax Performance in Backgammon](https://papersdb.cs.ualberta.ca/~papersdb/view_publication.php?pub_id=824)
- The same authors conclude that with strong evaluation functions, good backgammon checker play "does not require deep searches" — [same record](https://papersdb.cs.ualberta.ca/~papersdb/view_publication.php?pub_id=824)
- "Compressed Game Solving" represents position sets as compressed string sets and reports empirical storage of roughly n^0.5 to n^0.7 for sets of n positions (demonstrated on Breakthrough, a deterministic game) — [arXiv 2411.07273](https://arxiv.org/abs/2411.07273)
- Blackjack practice treats exact per-composition strategy as tractable today: engines recompute exact EV and optimal strategy for the current depleted shoe before each hand — [possibly-wrong/blackjack](https://github.com/possibly-wrong/blackjack)

### Inferences
- Layering: "cards remaining" is this game's "age". Values with n cards left depend only on values with n-1 left, so a full retrograde solve needs only two adjacent layers resident, and each layer can be sharded by deck composition (at most 1.87 million compositions per layer). This is the single most transferable trick.
- Afterstates: storing values on (board after placement, deck) rather than (board, deck, card in hand) removes the factor of up to 10 for the drawn card. If the current memo is keyed on the drawn card, this alone is up to a 10x reduction.
- Symmetry: the four columns are interchangeable, so sort the column descriptors (up to 24x reduction, less with repeated/empty columns). Empty and just-cleared columns are identical.
- Coupling: given the deck composition and the number of cards removed, the board must use a subset of the missing cards. Enumerating forward from the start (as 2048 did) rather than indexing the full Cartesian product keeps only reachable states; the 1e12-1e15 estimate should be re-measured this way for layers 14, 16, 18 to get the true growth rate.
- Dominance pruning (not sourced): placements that are provably no better than another (e.g. two columns with identical descriptors; placing on a column where the card busts while a non-busting placement with identical resulting descriptor exists) can be dropped at move generation.
- Bound-based pruning: Star1/Star2 need upper and lower bounds on node values. Here a cheap admissible upper bound exists (max score obtainable if every remaining card could be chosen freely, or a per-column relaxation) and a lower bound from any heuristic rollout. In a pure memoised full solve pruning does not help (every state's exact value is needed), but in the forward search that sits above the endgame database it can cut most of the 10 chance branches x 4-5 moves. Background knowledge, not verified this session: Star1 uses the value range [L,U] to derive per-child windows; Star2 adds a cheap probing phase of one child per chance outcome.
- Poker-style lossy abstraction (background knowledge, not sourced this session): bucket deck compositions by features that drive value (count of tens, aces, low cards, cards remaining), solve the abstract MDP exactly, and use its value as an evaluator. Imperfect-recall abstraction corresponds to forgetting exact rank counts and keeping only bucket counts. Risk: abstraction pathologies; quality must be measured against the exact 12-card endgame.
- Expected-deck / infinite-deck approximation (not sourced): treating draws as i.i.d. from the current rank frequencies removes the deck from the state for a subtree, leaving only board x cards-remaining. That gives a small table per frequency vector and is a natural cheap leaf evaluator, most accurate early when the deck is large.
- Per-column value decomposition (not sourced): columns interact only through the shared card stream, the bust counter, Stay tokens and the streak bonus. A sum of single-column values is therefore a relaxation, not exact, but single-column tables are tiny and make good features or bounds.

### Gaps
- Full text of Hauk et al. (node-count reductions, how bounds are chosen) not read; only abstract-level claims.
- No source was retrieved on poker card abstraction (Waugh et al., Johanson et al.) or on Griffin's effects-of-removal linear approximation; all statements about them above are unverified background.
- No source found on transposition tables specifically for chance nodes, or on deck-composition bucketing in a solitaire setting.
- No evidence on how lossy an expected-deck approximation is for a placement game; it must be measured against the exact endgame table.

## 3. External-memory retrograde solving, compressed value tables, and compute for about 1e12 states

### Takeaway
A 1.15e12-state stochastic single-player game (2048 on 4x3) was strongly solved in 2025 on one 16-core desktop CPU with about 32 GiB RAM in roughly 65 hours, using a few TiB of SSD; so 1e12 is a desktop-scale job if the space is layered, while 1e15 is not.

### Cited Findings
- 2048-4x3: 1,152,817,492,752 reachable states and 739,648,886,170 afterstates, solved on an AMD Ryzen 9 7950X (16 cores) with about 32 GiB RAM; about 25 hours forward enumeration plus about 40 hours backward value pass — [arXiv 2510.04580](https://arxiv.org/html/2510.04580v1)
- Storage: afterstate IDs take about 4.4 TiB naive (48-bit) and about 1.4 TiB with an Elias-Fano-style encoding (about 22% of in-memory size); values as 16-bit-fraction fixed point take about 2.56 TiB, or about 1.89 TiB at 2^-8 precision — [arXiv 2510.04580](https://arxiv.org/html/2510.04580v1)
- A play-only table (optimal move per state, not values) fits in under 300 GiB, about 1.9 bits per state, using a BuRR/Ribbon retrieval structure — [arXiv 2510.04580](https://arxiv.org/html/2510.04580v1)
- The authors say the full value function is reproducible with "about 4 TiB ssds and few days of computation with a modern CPU" (the paper's conclusion prints "44 TiB", which conflicts with the body figures and looks like a typo) — [arXiv 2510.04580 abstract/summary](https://arxiv.org/abs/2510.04580v1)
- Integrity: SHA-256 digests on files and three independent full runs that agreed — [arXiv 2510.04580](https://arxiv.org/html/2510.04580v1)
- Predecessor: 3x3 "Mini2048" has 48,713,519 states and was strongly solved in 2022 — [arXiv 2510.04580](https://arxiv.org/html/2510.04580v1)
- Checkers: the 10-piece endgame databases hold about 39 trillion positions compressed to about 237 GB, an average of 154 positions per byte (win/loss/draw values only) — [IEEE Spectrum, Checkers Solved](https://spectrum.ieee.org/checkers-solved)

### Inferences
- Throughput implied by 2048-4x3: 7.4e11 afterstates in about 40 h on 16 cores is about 5e6 values per second overall, about 3e5 per core-second. The 21 solver's own rate on the 12-card endgame should be compared with this; at a similar rate 1e12 states is a few days, 1e13 about a month, 1e15 out of reach on one machine.
- Checkers' 0.05 bits per position (8/154, my arithmetic) is only possible for 3-valued data with long runs; real-valued expected scores compress far less. The 2048 figures (about 2-3.5 bytes per state including index) are the relevant benchmark: 1e12 states is roughly 2-4 TB.
- If only the first-move value and online play are needed, values for early layers need not be stored: keep the deepest solvable layers on disk as a tablebase and run expectimax above them. Alternatively store only optimal moves (about 2 bits per state in 2048) for layers that are solved but too big to keep as values.
- With 16-bit fixed-point values, rounding error accumulates over layers; 2048 used 2^-16 precision and still offered 2^-8 as usable. For this game, scores are small integers so 16-bit fixed point with a known scale should be adequate, but the error bound should be tracked.
- Practical extension target: growth of 10x per 2 cards from 4e6 (typical) at 12 cards gives about 4e9 at 18 cards and about 4e11 at 22 cards for a single starting line; a full layer (all reachable boards and decks at n cards left) is a different and larger count that needs measuring by forward enumeration.

### Gaps
- No numbers recovered for Can't Stop databases (size, disk, time).
- No source read on generic external-memory retrograde frameworks (e.g. sort-based duplicate elimination beyond what 2048-4x3 describes) or on cluster-scale solves.
- The 2048 paper's disk requirement is internally inconsistent (4 vs 44 TiB); body figures (1.4 TiB IDs + 2.56 TiB values) support about 4 TiB.

## 4. Using an exactly solved endgame as training labels for an approximate evaluator earlier in the game

### Takeaway
I found no published result that trains an evaluator on exact tablebase values for a stochastic single-player game and measures the gain; the idea is discussed for chess engines and is consistent with stage-wise evaluation in 2048, but for this solver it is an untested, reasonable hypothesis.

### Cited Findings
- Leela Chess Zero contributors proposed ending self-play games on reaching a tablebase position and substituting the exact result as the training label, and separately proposed supervised training on tablebase positions; these are proposals in an issue tracker, not measured results — [leela-chess issue 378](https://github.com/glinscott/leela-chess/issues/378)
- A published challenge frames training networks on specific chess endgames and benchmarking them against sub-8-man tables as open research — [Haworth et al., Chess endgame news: An endgame challenge for neural nets](https://www.researchgate.net/publication/334102949_Chess_endgame_news_An_endgame_challenge_for_neural_nets)
- The 2048-4x3 authors offer their exact value table as a baseline for evaluating learned agents and note action gaps vary by stage, supporting stage-specific evaluators; they did not train on it — [arXiv 2510.04580](https://arxiv.org/html/2510.04580v1)
- Stochastic MuZero learns afterstate dynamics and chance codes for 2048 and backgammon (learning-based, no exact labels) — [Wikipedia: MuZero](https://en.wikipedia.org/wiki/MuZero)

### Inferences
- A workable recipe (not sourced): (a) sample reachable positions with 12-14 cards left by playing the current engine from the start, (b) label each with the exact expectimax value, (c) fit a compact model on features such as cards remaining, tens/aces/low-card fractions, per-column total/soft/count descriptors, busts, Stays, streak, (d) use that model as the leaf evaluator for a depth-limited search from 16 cards, generate new labels there by search-plus-model, and repeat backward two cards at a time. This is fitted value iteration run backward in time; errors compound per stage, so each stage should be validated where exact values are still affordable (14, 16 cards).
- The distribution of endgame positions matters: labels must come from positions the engine actually reaches, not uniformly random states, or the model spends capacity on irrelevant boards.
- Because the game is acyclic and the layer index is known, a separate model per cards-remaining band (as stage-wise 2048 evaluators do) is likely better than one global model.
- The exact table also gives a free, unbiased measure of any heuristic's loss: play the heuristic from sampled 12-card positions and compare with the exact value.

### Gaps
- No quantitative evidence found on how well endgame-trained evaluators generalise to earlier stages in any stochastic game. Backgammon bear-off database literature was not retrieved.
- No source on error compounding rates for backward fitted value iteration in card games.

## 5. How much score is left between a strong heuristic and optimal (percent gap)

### Takeaway
In the comparable solved games, good hand-built or learned strategies sit roughly 4-5.5% below optimal expected score (Yahtzee) or 1-4% below optimal win rate (Pig), so a few percent is the realistic prize for exact or near-exact play over a strong heuristic.

### Cited Findings
- Yahtzee: heuristic 240.67, "better heuristic" 244.87, optimal 254.59 (slides summarising Glenn 2006); that is 5.5% and 3.8% below optimal — [UC Davis presentation](https://research.engineering.ucdavis.edu/biosport/wp-content/uploads/sites/24/2014/06/Yahtzee-Presentation-03-1.pdf)
- Yahtzee RL (A2C, self-play): median 241.78 over 100,000 games, "within 5.0%" of 254.59; agents under-learn the long-horizon upper-bonus strategy — [arXiv 2601.00007](https://arxiv.org/abs/2601.00007)
- Pig: the "hold at 25" style rule has a 4.2% disadvantage against optimal play, and "end race or keep pace" 0.9% (snippet from a passage that also covers two-dice variants; variant attribution uncertain) — [Wikipedia: Pig (dice game)](https://en.wikipedia.org/wiki/Pig_(dice_game))
- Farkle: a mentally computable strategy is reported with a "small" gap to optimal (figure not retrieved) — [Busche and Neller](https://cupola.gettysburg.edu/csfac/38)
- 2048-4x3: optimal expected score from the standard start is about 50,724.26; the paper gives no heuristic comparison — [arXiv 2510.04580](https://arxiv.org/html/2510.04580v1)

### Inferences
- The Yahtzee RL comparison mixes a median (241.78) with a mean (254.59); Verhoeff reports the optimal median as 248, so on a like-for-like basis that agent may be only about 2.5% behind. Treat "5%" as an upper estimate.
- This solver already plays the last 12 of 52 cards exactly, so its remaining gap is confined to the first 40 placements, where decisions are individually lower-stakes but include bust and Stay-token commitments. A gap of low single-digit percent of mean score is the plausible range by analogy; it is not evidence about this game.
- The gap can be measured directly without a full solve: compare the engine with "same engine + exact solve from 14 or 16 cards" on common random decks. If moving the exact horizon from 12 to 16 changes mean score by under 0.1%, deeper exact solving has little left to give and effort is better spent on the early-game evaluator.

### Gaps
- No heuristic-vs-optimal figures for any card-placement solitaire, and none for Can't Stop that could be trusted (see section 1 gap).
- Pig percentages come from a Wikipedia snippet, not the Neller-Presser papers.
