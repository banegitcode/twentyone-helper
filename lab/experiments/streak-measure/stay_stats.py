#!/usr/bin/env python3
"""Stay usage by phase and streak context (MEASURED). usage: stay_stats.py <log> <label>"""
import sys, collections, math
from analyze_streaks import load, scoring_moves, phase, PH
G=load(sys.argv[1]); n=len(G); c=collections.Counter(); ng=collections.defaultdict(list)
for g,decs,end in G:
    k=collections.Counter()
    for d in decs:
        ph=phase(d['rem'])
        has_empty=any(x==0 for x in d['cols']); sm=scoring_moves(tuple(d['cols']),d['stays'],d['v'])
        direct=[1 for cc in range(4) if False]
        if d['prev']>0: k['live_decisions']+=1; k['live_with_empty_col']+= has_empty
        if d['stay']>=0:
            k[f'stay_{ph}']+=1; k['stay_total']+=1
            if d['prev']>0: k['stay_while_live']+=1
            if d['pts']>0: k['stay_then_scored']+=1
            if has_empty: k['stay_with_empty_col_available']+=1
    for key,v in k.items(): c[key]+=v
    ng['stay_total'].append(k['stay_total'])
m=sum(ng['stay_total'])/n; se=math.sqrt(sum((x-m)**2 for x in ng['stay_total'])/(n-1)/n)
print(f"== Stay stats {sys.argv[2]} ({n} games): stays/game {m:.3f} +- {se:.3f}")
for key in sorted(c): print(f"  {key}: {c[key]}  ({c[key]/n:.3f}/game)")
