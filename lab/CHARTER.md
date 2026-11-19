# 21 Lab charter
Single goal: raise the measured average score of the "21" solitaire engine as high as possible (target 9,500+).
Rules of the game: /workspace/21lab/RULES.md (copy of section 1 of the user's brief). Never use the future card order in a policy.

## Team
- 21 (lead): sets priorities, keeps LEADERBOARD.md and the champion, writes reports to Landon.
- 21 Referee: owns bench/ (fixed shuffle sets, paired comparison harness). Only the Referee marks an idea ACCEPTED.
- 21 Search: search-time methods (rollouts, expectimax, time budget, exact endgame solver, pruning, symmetry).
- 21 Learner: position evaluation (training targets, network, n-tuple tables, self-play / exact-endgame data).
- 21 Theorist: ceiling bounds, strategy (Stays, 5-card builds, three 7s, Perfect Bonus risk, post-bust play), literature.

## How the team learns
1. Before proposing anything, read EXPERIMENTS.md (every past attempt and its result) and the "already tried" list. No repeats without a new reason.
2. Every idea goes in ideas/<name>.md: hypothesis, why, expected gain, exact algorithm, cost.
3. Code goes in experiments/<name>/. The Referee runs it against the champion on the same shuffles (1,000 games on set1000 - the cap, see below - paired, report mean diff +- SE).
4. Result (win or loss) is appended to EXPERIMENTS.md with a one-line lesson. Losses are kept; they are the memory.
5. An idea is ACCEPTED only if the paired gain is > 2 SE. Accepted changes become the new champion in engine/, and LEADERBOARD.md is updated.
6. Say "best measured", never "optimal" without proof. Keep calculated and guessed numbers apart.

## Landon's instruction (2026-11-18): verify, don't inherit
Treat every number in engine/twentyone-solver (README, results/, research_notes/, the brief's "already tried" list) as an UNVERIFIED claim. Use his code as the champion to beat, but re-measure its score on our own bench, and recompute any prior result (clairvoyant ~12,657, rollouts -37, etc.) before relying on it. A past "no gain" is a hint, not a ban: retest it if there's a reason it may have been measured wrong or with a weak setup. Conclusions come only from our own measurements.

## Bench integrity rule (2026-11-18, from 21 Referee)
Every queued run uses a frozen snapshot of the candidate in bench/frozen/<name>@<sha>/. Editing experiments/ never changes a running test; a new version needs a new submission.

## New role (2026-11-18): 21 Streak
Streak strategy as a byproduct of bust avoidance (not streak chasing; pure chasing and soft streak bonuses are logged failures per Landon's own history). First task: streak audit of deeper:16 games -> ideas/streak-audit.md. Same rules: paired test vs current champion, accepted only at > 2 SE.

## Test size cap (2026-11-18 16:31 PST, Landon's rule, relayed by 21)
Every test is capped at 1,000 games total, and nothing new starts past that cap. set1000 is the acceptance set; set5000 is no longer used for new tests (dev200 stays for smoke tests). Anything that would have needed set5000 runs on set1000. A gain smaller than about 2 SE on set1000 (usually ~25-30 pts paired) cannot be accepted. bench/compare.py streams each finished game to bench/results/progress/ so a stopped run keeps its per-game scores.
