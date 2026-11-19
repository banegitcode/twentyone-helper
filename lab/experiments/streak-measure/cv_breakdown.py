#!/usr/bin/env python3
"""Clairvoyant bound (NOT a legal policy; uses the full future order) breakdown from /workspace/21sol/cv_set1000_st1.txt: columns id score clears streakbonus zerobust (300 shuffles = set1000 games 1-300).
Compared with the shipped52 champion on the same 300 games (regret_map log; games 0..299 = ids 1..300).  Only totals per game exist, so no max-streak histogram for the bound."""
import json, math, collections
def ms(xs):
    n=len(xs); m=sum(xs)/n; return m, math.sqrt(sum((x-m)**2 for x in xs)/(n-1)/n)
rows=[tuple(map(int,l.split())) for l in open('/workspace/21sol/cv_set1000_st1.txt') if l.strip()]
print('rows',len(rows))
sc=[r[1] for r in rows]; cl=[r[2] for r in rows]; sb=[r[3] for r in rows]; zb=[r[4] for r in rows]
perf=[1000*z for z in zb]; base=[a-b-c for a,b,c in zip(sc,sb,perf)]
f=lambda xs:'%.1f +- %.1f'%ms(xs)
out=['CLAIRVOYANT (hindsight bound, one Stay/card), 300 shuffles:','  score '+f(sc),'  base clears '+f(base),'  streak bonus '+f(sb),'  perfect '+f(perf),'  clears/game '+f(cl),'  zero-bust share %.1f%%'%(100*sum(zb)/len(zb))]
# champion same games
import sys; sys.path.insert(0,'.')
from analyze_streaks import load, SB
G=load('../regret_map/s1k_champ_all.jsonl'); G={g:(d,e) for g,d,e in G}
cs=[];cb=[];cc=[]
for gi in range(300):
    d,e=G[gi]; bonus=sum(SB[min(x['prev'],4)] for x in d if x['pts']>0); ncl=sum(1 for x in d if x["pts"]>0)
    cs.append(e['score']); cb.append(bonus); cc.append(ncl)
out+=['CHAMPION shipped52, same 300 games:','  score '+f(cs),'  streak bonus '+f(cb),'  clears/game '+f(cc),
 'gap clairvoyant - champion (paired): score %.0f +- %.0f, streak bonus %.0f +- %.0f, clears %.2f +- %.2f'%(*ms([a-b for a,b in zip(sc,cs)]),*ms([a-b for a,b in zip(sb,cb)]),*ms([a-b for a,b in zip(cl,cc)]))]
# bonus multiples: how many 1750-units
out.append('  bonus/1750 mean (4-runs equivalent) %.2f; bonus values are multiples of 250: %s'%(sum(sb)/len(sb)/1750, all(x%250==0 for x in sb)))
open('cv_breakdown.txt','w').write('\n'.join(out)+'\n'); print('\n'.join(out))
