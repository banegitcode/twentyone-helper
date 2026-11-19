#!/usr/bin/env python3
"""Evaluator calibration by AFTERSTATE setup (MEASURED, no hindsight labels beyond the realized game outcome): for each logged decision,
  dev = (final score - score before the move) - V_chosen,  V_chosen = champion's own search value of the chosen move (deep value if the move was re-scored deeper, else value;
  it is points-to-come incl. the immediate points and the Perfect Bonus).  mean(dev) by category of the position AFTER the chosen move, relative to the phase mean ('excess').
  A category whose excess is persistently <0 is OVER-valued by the champion's search, >0 UNDER-valued.  (Optimizer's-curse bias is common to categories.)
usage: calib.py <log.jsonl> <label>"""
import sys, json, math, collections
from analyze_streaks import load, PTS, NEXT, SB, phase, PH
path,label=sys.argv[1],sys.argv[2]
G=load(path); 
recs=[]   # (g, ph, keys, dev)
def cluster(d):
    gs=list(d.values()); N=sum(n for s,n in gs); S=sum(s for s,n in gs); m=S/N; Gn=len(gs)
    var=sum((s-m*n)**2 for s,n in gs)/N**2*Gn/(Gn-1) if Gn>1 else float('nan'); return m, math.sqrt(var), N
for g,decs,end in G:
    final=end['score']
    for d in decs:
        if d.get('exact'): continue    # exact-solver decisions have V exact by construction; calibrate only search/NN-valued decisions
        v=d['v']; cols=list(d['cols']); s,c=d['stay'],d['col']
        ch=[a for a in d['scores'] if a['stay']==s and a['col']==c]
        if not ch: continue
        V=ch[0].get('deep') if ch[0].get('deep') is not None else ch[0]['value']
        dev=final-d['score']-V
        if s>=0: cols[s]=0
        code=cols[c]*11+v; p=PTS[code]
        scored=p>0; newc = 0 if p!=0 else NEXT[code]; cols[c]=newc
        dk=list(d['deck']); dk[v]-=1; rem2=sum(dk[1:])
        strong=0; live=0
        if rem2>0:
            for cc in range(4):
                if cols[cc]==0: continue
                q=sum(dk[u] for u in range(1,11) if PTS[cols[cc]*11+u]>0)/rem2
                if q>=0.15: strong+=1
                if q>0: live+=1
        ph=phase(d['rem'])
        keys=[(ph,'ALL'),(ph,f'strong={min(strong,3)}'),(ph,f'scored_now={scored}'),(ph,f'scored_now={scored},strong={min(strong,3)}'),(ph,f'bust={d["bust"]}'),(ph,f'stay_used={s>=0}'),(ph,f'busts_so_far={min(d["busts"],1)}'),(ph,f'prev_live={d["prev"]>0}'),(ph,f'prev_live={d["prev"]>0},scored_now={scored}')]
        recs.append((g,ph,keys,dev,d['rem']))
gm=collections.defaultdict(lambda:[0.0,0])   # cell mean by exact cards-left (same for all games): removes the time trend inside a phase
for g,ph,keys,dev,rem in recs: x=gm[rem]; x[0]+=dev; x[1]+=1
cats=collections.defaultdict(lambda: collections.defaultdict(lambda:[0.0,0]))   # key -> game -> [sum of within-game-demeaned dev, n]
raw=collections.defaultdict(lambda: collections.defaultdict(lambda:[0.0,0]))
for g,ph,keys,dev,rem in recs:
    mean_gp=gm[rem][0]/gm[rem][1]
    for key in keys:
        x=cats[key][g]; x[0]+=dev-mean_gp; x[1]+=1
        y=raw[key][g]; y[0]+=dev; y[1]+=1
out=[f'== calibration of the champion search value ({label}; {len(G)} games; non-exact decisions only)']
for ph in PH:
    base=cluster(raw[(ph,'ALL')]); out.append(f'-- cards left {ph}: all decisions dev (realized - V) = {base[0]:.1f} +- {base[1]:.1f} (n={base[2]})   [excess = mean of dev minus the all-game mean at the same cards-left; game-clustered SE]')
    for key in sorted(k for k in cats if k[0]==ph and k[1]!='ALL'):
        m,se,N=cluster(cats[key]); mr=cluster(raw[key])[0]
        out.append(f'   {key[1]:40s} n={N:6d}  raw dev {mr:7.1f}   excess {m:7.1f} +- {se:5.1f}  ({m/se if se>0 else 0:+.1f} SE)')
open(f'calib_{label.split()[0]}.txt','w').write('\n'.join(out)+'\n'); print('\n'.join(out))
