#!/usr/bin/env python3
"""Does the champion's search value price the forced-bust hazard correctly? (MEASURED; non-exact decisions, cards left >=13)
hazard(after) = P(the next card busts every column) for the chosen afterstate with NO empty column and NO Stay left (a forced bust).
dev = final score - score before the move - V_chosen (as calib.py); excess = dev minus the all-game mean at the same cards-left; game-clustered SE.
If the network under-prices hazard, excess falls as hazard rises.  usage: hazard_calib.py <log> <label>"""
import sys, math, collections
from analyze_streaks import load, PTS, NEXT
G=load(sys.argv[1]); recs=[]
for g,decs,end in G:
    for d in decs:
        if d.get('exact') or d['rem']<13: continue
        v=d['v']; s,c=d['stay'],d['col']
        ch=[a for a in d['scores'] if a['stay']==s and a['col']==c]
        if not ch: continue
        V=ch[0].get('deep') if ch[0].get('deep') is not None else ch[0]['value']
        dev=end['score']-d['score']-V
        cs=list(d['cols'])
        if s>=0: cs[s]=0
        code=cs[c]*11+v; p=PTS[code]; cs[c]=0 if p!=0 else NEXT[code]
        sa=d['stays']-(1 if s>=0 else 0)
        dk=list(d['deck']); dk[v]-=1; rem2=sum(dk[1:])
        if rem2<=0: continue
        if 0 in cs or sa>0: cat='has empty col or Stay left'; h=0.0
        else:
            h=sum(dk[u] for u in range(1,11) if all(PTS[cs[j]*11+u]<0 for j in range(4)))/rem2
            cat='no empty, no Stay: hazard 0' if h==0 else ('no empty, no Stay: hazard (0,5%]' if h<=0.05 else ('no empty, no Stay: hazard (5,15%]' if h<=0.15 else 'no empty, no Stay: hazard >15%'))
        recs.append((g,d['rem'],cat,dev,h,d['bust']))
cell=collections.defaultdict(lambda:[0.0,0])
for g,rem,cat,dev,h,b in recs: x=cell[rem]; x[0]+=dev; x[1]+=1
agg=collections.defaultdict(lambda: collections.defaultdict(lambda:[0.0,0,0.0]))
for g,rem,cat,dev,h,b in recs:
    r=dev-cell[rem][0]/cell[rem][1]; x=agg[cat][g]; x[0]+=r; x[1]+=1; x[2]+=h
print(f"== hazard calibration {sys.argv[2]}: {len(G)} games, non-exact decisions with >=13 cards left")
for cat in sorted(agg):
    gs=list(agg[cat].values()); N=sum(n for s,n,h in gs); S=sum(s for s,n,h in gs); m=S/N; Gn=len(G)
    var=sum((s-m*n)**2 for s,n,h in gs)/N**2*Gn/(Gn-1)
    print(f"  {cat:40s} n={N:6d} mean hazard {sum(h for s,n,h in gs)/N:.3f}  excess dev {m:7.1f} +- {math.sqrt(var):5.1f}")
