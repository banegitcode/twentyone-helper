# Leaderboard
| version | mean score | notes |
|---|---|---|
| v0 first engine | 7,275 | unverified (repo) |
| NN + 1/2-ply expectimax | ~8,840 | unverified (brief) |
| + exact endgame 14 cards | 8,940-8,970 | unverified (brief) |
| shipped52 (NN + expectimax + exact from 13) | 8,872 +- 38 | MEASURED, bench set1000, 2026-11-18. previous champion |
| deeper:16 (shipped52 + exact solve from 16 cards, 3.2M new positions per move, logCap 25; frozen exact-endgame-deeper@90c2d73f938b) | 8,926 +- 38 | MEASURED, bench set1000, 2026-11-18; paired +55 +- 15 (z 3.7) vs shipped52; 12:45 replay check passed (40/40 games identical). CPU about 6x shipped52 on the loaded 1000-game compare. Measured think (60 set1000 games, official chunk-0 prefix 0-59, 1 worker, frozen exact-endgame-deeper@90c2d73f938b, adapter process CPU): mean 8.7s median 8.6s p95 19.5s max 26.3s; longest single decision 5.1s; 0 games over 60/90/150 s. Mac estimate (box/1.5, Node kit only, not checked in a browser): mean 5.8s median 5.7s p95 13.0s max 17.6s. Update: 1,793 set5000 games (run stopped, CPU log only): max game 69.1 s box CPU (about 46 s Mac est.), max single decision 43.4 s, p95 14.9 s. CURRENT CHAMPION |
