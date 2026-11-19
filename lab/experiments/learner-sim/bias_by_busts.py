#!/usr/bin/env python3
"""Bias (realized points-to-come - network value) split by busts used (after the placement) at matched cards-left bands.
python3 bias_by_busts.py 'results/biaslog_shipnn_set1000.*.jsonl'   -- per-game cluster SE (a game contributes ONE mean per cell)."""
import sys, glob, json, numpy as np
g = []
for f in sorted(glob.glob(sys.argv[1])): g += [json.loads(l) for l in open(f) if l.strip()]
bands = [(1, 8), (9, 16), (17, 24), (25, 32), (33, 40), (41, 51)]   # cards LEFT after the placement
print(f"{len(g)} games\n\n| cards left | busts | games | positions | mean pred | mean realized | bias (real-pred) | SE (cluster) |\n|---|---|---|---|---|---|---|---|")
cell = {}
for lo, hi in bands:
    for b in (0, 1, 2):
        per = []; npos = 0; mp = []; mg = []
        for x in g:
            ys = [(x['G'][i] - x['p'][i], x['p'][i], x['G'][i]) for i in range(x['n']) if x['p'][i] is not None and x['b'][i] == b and lo <= 52 - (i + 1) <= hi]
            if ys: per.append(np.mean([y[0] for y in ys])); npos += len(ys); mp.append(np.mean([y[1] for y in ys])); mg.append(np.mean([y[2] for y in ys]))
        cell[(lo, b)] = per
        if len(per) >= 2: print(f"| {lo}-{hi} | {b} | {len(per)} | {npos} | {np.mean(mp):.0f} | {np.mean(mg):.0f} | {np.mean(per):+.0f} | {np.std(per, ddof=1)/np.sqrt(len(per)):.0f} |")
        else: print(f"| {lo}-{hi} | {b} | {len(per)} | {npos} | - | - | - | - |")
print("\nDifference of biases (unpaired, games differ): b=1 minus b=0, b=2 minus b=1; a positive b2-b1 = network UNDER-prices the 2-bust state relative to the 1-bust state (= over-prices the 2nd bust).\n\n| cards left | b1-b0 | SE | b2-b1 | SE | n(b1) | n(b2) |\n|---|---|---|---|---|---|---|")
for lo, hi in bands:
    r = []
    for a, c in ((0, 1), (1, 2)):
        A, C = cell[(lo, a)], cell[(lo, c)]
        if len(A) >= 2 and len(C) >= 2: r += [f"{np.mean(C)-np.mean(A):+.0f}", f"{np.sqrt(np.var(A,ddof=1)/len(A)+np.var(C,ddof=1)/len(C)):.0f}"]
        else: r += ["-", "-"]
    print(f"| {lo}-{hi} | {r[0]} | {r[1]} | {r[2]} | {r[3]} | {len(cell[(lo,1)])} | {len(cell[(lo,2)])} |")
