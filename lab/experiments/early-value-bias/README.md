# early-value-bias (21 Theorist)

Measurement only: differential error of the shipped network above 16 cards left.
Writeup: `/workspace/21lab/ideas/early-value-bias.md`.

No new games. Replay of existing logs.

```
nice -n 10 node extract_afterstates.js
nice -n 10 python3 analyze.py | tee report.txt
```

`s1k_after_rem13plus.jsonl` is a derived file (after-state features + leaf `p` for every candidate with rem ≥ 13 in `regret_map/s1k_champ_all.jsonl`). It can be deleted and regenerated (~10 s).
