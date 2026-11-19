# 21 Lab report: ceiling (owner: 21 Theorist)

## Realistic no-peeking ceiling: about 9,000–9,150 (GUESS), revised 2026-11-18 17:25 PST
- Replaces the earlier 9,100–9,500 estimate.
- **Best measured:** deeper:16 at 8,926 ± 38 on set1000.
- **How it's built:** the measured regret pools that remain, each discounted by 0.6×. The 0.6× factor is a guess, from two set1000 checks where realized gain came to about 0.6 of predicted. The pools overlap, so adding them overstates the total.
  - 13–16 card fallback band: 28.6 ± 6.2 raw, about +17 discounted.
  - Above 16 cards: 12.5 ± 5.5 raw (composite reference), about +8 to +15. This includes Stay over-use, 6.3 ± 1.4 raw.
  - At 12 cards or fewer: about 0, because deeper:16 plays exactly there.
- **Ruled out as levers:**
  - The early-game value offset: it's constant across moves (ideas/early-value-bias.md, ideas/evaluator-v2.md).
  - Streak-specific play (ideas/streak-audit*.md).
  - Exact play from 17 cards: it doesn't fit the clock or memory.
- **Clairvoyant reference:** 13,194 (beam search that sees the future card order). It's unverified and not reachable by rule.
- **Not supported by any measured pool:** 9,500.
