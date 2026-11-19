### results/biaslog_shipnn_set1000.*.jsonl
policy `results/biaslog_shipnn_set1000.*.jsonl` bench shuffle indices 0..83 (bench sim via harness), games 457; champion mean score 8784 ± 58 (SE); 3-bust games 1.3%

Network bias (realized points-to-come after the placement − network value of that position), by cards dealt:

| bins (cards dealt) | n games | mean predicted | mean realized | bias (realized−pred) | SE | search-value bias (realized from before move − q) | SE |
|---|---|---|---|---|---|---|---|
| 1-5 | 457 | 8450 | 8757 | **+307** | 57 | +305 | 57 |
| 6-13 | 457 | 7893 | 8178 | **+285** | 54 | +277 | 54 |
| 14-26 | 457 | 6377 | 6612 | **+236** | 46 | +226 | 46 |
| 1-26 | 457 | 7242 | 7506 | **+265** | 49 | +257 | 49 |
| 27-39 | 457 | 4398 | 4560 | **+162** | 33 | +151 | 33 |
| 40-52 | 456 | 2403 | 2267 | **+52** | 16 | +28 | 14 |
| 1-52 | 457 | 5385 | 5460 | **+182** | 37 | +167 | 36 |

Per-bin curve (every 3rd bin; full curve in the .csv):

| cards dealt | n | mean pred | mean realized | bias | SE |
|---|---|---|---|---|---|
| 1 | 457 | 8479 | 8784 | +305 | 58 |
| 4 | 457 | 8444 | 8752 | +308 | 57 |
| 7 | 457 | 8185 | 8490 | +305 | 57 |
| 10 | 457 | 7860 | 8140 | +280 | 55 |
| 13 | 457 | 7445 | 7710 | +265 | 53 |
| 16 | 457 | 7009 | 7262 | +253 | 51 |
| 19 | 457 | 6538 | 6790 | +252 | 49 |
| 22 | 457 | 6051 | 6277 | +226 | 46 |
| 25 | 457 | 5600 | 5806 | +206 | 44 |
| 26 | 457 | 5456 | 5654 | +198 | 43 |
| 27 | 457 | 5328 | 5508 | +180 | 42 |
| 28 | 457 | 5171 | 5368 | +196 | 40 |
| 31 | 456 | 4706 | 4902 | +195 | 37 |
| 34 | 456 | 4255 | 4406 | +151 | 34 |
| 37 | 456 | 3777 | 3921 | +144 | 31 |
| 39 | 456 | 3488 | 3603 | +115 | 29 |
| 40 | 456 | 3354 | 3468 | +114 | 28 |
| 43 | 455 | 2881 | 2973 | +91 | 24 |
| 46 | 455 | 2393 | 2438 | +45 | 20 |
| 49 | 454 | 1801 | 1805 | +8 | 11 |

First half (1-26 cards dealt) bias by state (per-position pooled mean, SE ignores within-game correlation, so is a lower bound):

| group | n positions | bias | SE(naive) |
|---|---|---|---|
| busts=0 | 11682 | +261 | 10 |
| busts=1 | 187 | +396 | 112 |
| stays left=2 | 8728 | +280 | 12 |
| stays left=1 | 2059 | +213 | 26 |
| stays left=0 | 1095 | +241 | 38 |
| streak=0 | 9076 | +272 | 12 |
| streak=1 | 2127 | +240 | 23 |
| streak=2 | 566 | +251 | 39 |
| streak=3 | 105 | +195 | 94 |

Share of moves made by the exact endgame solver: 7.6% of all moves (these are in the last ≤13 cards).

