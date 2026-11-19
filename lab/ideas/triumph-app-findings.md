# Triumph Arcade "21 Blackjack": public findings (2026-11-18, 21)
- Landon plays Triumph Arcade (iPhone, App Store id1608987929): https://apps.apple.com/us/app/triumph-arcade/id1608987929. Cash modes: 1v1, 6-player group, Blitz, Streak Mode, leagues.
- No public official scoring page found. Rules in RULES.md are still from Landon's brief, unverified against the app.
- r/triumpharcade, Jan 2 2026 ("Cheating in 21 Blackjack"): a reproducible exploit gave "consistently high and unbeatable scores"; Triumph refunded victims and did not ban.
- r/triumpharcade, Jan 10 2026 ("Bugs and glitches", v2.91.1+): (1) streak bonuses misbehaving after a patch; (2) Ace added to a pile with an 11-Ace sometimes busts wrongly; (3) tapping a pile and pressing Stay simultaneously turns the pile into an infinite card sink that can't bust.
- Implication: very high opponent scores (11K averages, 14,050 top score) may come from exploits, not play. Do not raise realistic-ceiling estimates from opponent scores.
- Other similar apps (NOT Triumph; for contrast only): 21 Blitz has a 10 pts/s time bonus, wild black jacks, streaks to 6, undo. PlayZap/Spark variants have hold/undo/time bonus.

## Landon's end-of-game screen (2026-11-18, screenshot)
Lines shown: SCORE 7,000; PERFECT BONUS 0; 21's SCORED 13; CARDS USED 52; TOTAL 7,000.
- No time-bonus line, no undo/peek, no separate streak/combo line. Total = Score + Perfect Bonus, consistent with RULES.md.
- Streak values (250/500/1000) are folded into SCORE and still unverified; need a mid-game screenshot after a 3-4 streak.
- Hidden time bonus ruled out as the explanation for 11K opponent averages.
