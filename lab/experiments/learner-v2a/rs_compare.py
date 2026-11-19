#!/usr/bin/env python3
"""paired comparison of regret_search.js outputs: python3 rs_compare.py base.jsonl cand.jsonl  -> per-k mean regret and paired reduction (SE clustered by game), Referee give-up-weighted gain (UPPER PROXY: bench gains have come in at ~1/2 to 1/2.7 of regret predictions)"""
import sys, json, numpy as np
def load(f): return {(r['pid'], r['v']): r for r in map(json.loads, open(f)) if True}
A, B = load(sys.argv[1]), load(sys.argv[2]); keys = [k for k in A if k in B]
GIVE = {16: 0.925, 15: 0.725, 14: 0.35, 13: 0.15, 12: 0.025}; tot = 0; var = 0
print('pairs %d' % len(keys))
for k in range(12, 17):
    ks = [x for x in keys if A[x]['k'] == k]
    if not ks: continue
    # per decision position: n_v-weighted regret
    pos = {}
    for x in ks: pos.setdefault(x[0], []).append(x)
    da = []; db = []; gm = []
    for p, xs in pos.items():
        w = np.array([A[x]['n'] for x in xs], float); w /= w.sum(); da.append(sum(w[i] * A[x]['regret'] for i, x in enumerate(xs))); db.append(sum(w[i] * B[x]['regret'] for i, x in enumerate(xs)))
    d = np.array(da) - np.array(db); se = d.std(ddof=1) / np.sqrt(len(d)); tot += GIVE[k] * d.mean(); var += (GIVE[k] * se) ** 2
    print('k=%d n=%d base %.2f cand %.2f  reduction %+.2f ± %.2f' % (k, len(d), np.mean(da), np.mean(db), d.mean(), se))
print('upper-proxy gain/game (sum giveup_k x reduction_k): %+.2f ± %.2f' % (tot, var ** 0.5))
