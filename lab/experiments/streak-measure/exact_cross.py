#!/usr/bin/env python3
"""Exact-regret cross-tab (shipped52 on set1000, <=13 cards left; EXACT labels from experiments/regret_map/{s1kexB,s1kex12,s1kex13}_*.jsonl, one Stay/card)
crossed with streak context from the champion log regret_map/s1k_champ_all.jsonl.  Regret per decision = exact best value - exact value of the champion's move.
Per-game totals: mean +- SE over the games that have exact data (decisions without a label count 0; failed solves listed)."""
import json, glob, collections, math, sys
D='../regret_map/'
dec={}; ngames=set()
for l in open(D+'s1k_champ_all.jsonl'):
    d=json.loads(l)
    if d['t']=='dec': dec[(d['g'],d['step'])]=d
ex={}; fails=0; gseen=set()
for pat in ['s1kexB_*.jsonl','s1kex12_*.jsonl','s1kex13_*.jsonl']:
    for f in sorted(glob.glob(D+pat)):
        for l in open(f):
            r=json.loads(l)
            if 'failed' in r: fails+=1; continue
            ex.setdefault((r['g'],r['step']),r); gseen.add(r['g'])
# games with COMPLETE coverage of rem 13..1 labels
cnt=collections.Counter(); 
for (g,s),r in ex.items(): cnt[g]+=1
full=[g for g in gseen if cnt[g]>=12]
print('games with exact data',len(gseen),'with >=12 labeled decisions',len(full),'failed solves',fails)
Fg=set(full)
def bucket(rem): return '13' if rem==13 else ('12-9' if rem>=9 else '8-1')
cat=collections.defaultdict(lambda: collections.defaultdict(float)); ndec=collections.Counter()
pergame=collections.defaultdict(lambda: collections.defaultdict(float))
def classify(d,r):
    c=r['champ']; a=r['alt']; prev=d['prev']
    live='live' if prev>0 else 'fresh'
    champ_sc=c['pts']>0; best_sc=a['pts']>0
    if d['bust']: t='chose-bust'
    elif champ_sc and best_sc: t='both-score(diff col/clear type)'
    elif champ_sc and not best_sc: t='took-score-but-better-not-to'
    elif (not champ_sc) and best_sc: t='declined-score-but-better-to-take'
    else:
        t='neither-scores: '+('champ-Stay' if d['stay']>=0 else 'champ-noStay')+'/'+('best-Stay' if a['stay'] else 'best-noStay')
    return live,t
for (g,s),r in ex.items():
    if g not in Fg: continue
    d=dec.get((g,s)); 
    if d is None: continue
    live,t=classify(d,r); b=bucket(d['rem']); reg=max(0.0,r['regret'])
    cat[(live,t,b)]['reg']+=reg; cat[(live,t,b)]['n']+=1
    pergame[(live,t,b)][g]+=reg
    cat[('ALL','ALL',b)]['reg']+=reg; cat[('ALL','ALL',b)]['n']+=1; pergame[('ALL','ALL',b)][g]+=reg
    cat[(live,'ALL','ALL')]['reg']+=reg; pergame[(live,'ALL','ALL')][g]+=reg
    cat[('ALL','ALL','ALL')]['reg']+=reg; pergame[('ALL','ALL','ALL')][g]+=reg
    if reg>0.01: cat[(live,t,b)]['nreg']+=1
def se(dct,games):
    xs=[dct.get(g,0.0) for g in games]; n=len(xs); m=sum(xs)/n; sd=math.sqrt(sum((x-m)**2 for x in xs)/(n-1)); return m, sd/math.sqrt(n)
out=[]
out.append(f"shipped52 set1000, exact labels at <=13 cards; {len(Fg)} games; regret in points per game (mean +- SE over games)")
rows=[]
for k in sorted(pergame, key=lambda k:(k[2],k[0],k[1])):
    m,s_=se(pergame[k],Fg); rows.append((k,m,s_,cat[k]['n'],cat[k].get('nreg',0)))
for k,m,s_,n,nr in rows:
    out.append(f"  {k[0]:5s} | {k[1]:55s} | rem {k[2]:5s} | {m:6.2f} +- {s_:5.2f} /game | decisions {int(n)} (regret>0.01 in {int(nr)})")
open('exact_cross_shipped52.txt','w').write('\n'.join(out)+'\n'); print('\n'.join(out))
