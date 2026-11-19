#!/usr/bin/env python3
"""Cross of the Theorist's UNBIASED fresh-sample flip gains (experiments/regret_map/conf_*.jsonl; shipped52, dev200, sampled 'reference A' = deeper lookahead with the same network, NOT truth)
with streak context (pf.prev, pf.nScoreCols, champ/alt kinds).  gain/game = sum over flipped decisions of the fresh paired advantage (alt - champ) / 195 games (those are the games with sampling).
Decisions not flagged for a flip count 0 (as in the Theorist's net-flip estimate).  Buckets by cards left: >=33, 17-32, 13-16."""
import json, glob, math, collections
rows=[]
for f in sorted(glob.glob('../regret_map/conf_[0-9].jsonl')):
    for l in open(f):
        r=json.loads(l)
        if 'fresh' in r: rows.append(r)
NG=195
def ph(rem): return '>=33' if rem>=33 else ('17-32' if rem>=17 else '13-16')
def stat(sel, label):
    pg=collections.defaultdict(float); n=0
    for r in rows:
        if sel(r): pg[r['g']]+=r['fresh']; n+=1
    tot=sum(pg.values()); gs=list(pg.values())+[0.0]*(NG-len(pg))
    m=tot/NG; sd=math.sqrt(sum((x-m)**2 for x in gs)/(NG-1)); 
    return f"  {label:60s} n={n:4d} flips  net gain {m:6.2f} +- {sd/math.sqrt(NG):5.2f} /game"
out=[f"flip rows: {len(rows)}  (fresh-sample re-evaluations of flagged decisions)", stat(lambda r:True,'ALL flips (rem>=13)')]
for p in ['>=33','17-32','13-16']:
    out.append(f"-- cards left {p}")
    S=lambda f,p=p:(lambda r: ph(r['rem'])==p and f(r))
    out.append(stat(S(lambda r:True),'all'))
    out.append(stat(S(lambda r:r['pf']['prev']>0),'streak live (previous card scored)'))
    out.append(stat(S(lambda r:r['pf']['prev']==0),'no streak live'))
    out.append(stat(S(lambda r:r['pf']['nScoreCols']>=1),'some column scores with the current card'))
    out.append(stat(S(lambda r:r['pf']['nScoreCols']>=1 and r['champ']['pts']==0),'a scoring placement existed, champion did not take it'))
    out.append(stat(S(lambda r:r['pf']['nEmpty']==0),'no empty column'))
    out.append(stat(S(lambda r:r['pf']['nEmpty']==0 and r['pf']['prev']>0),'no empty column and streak live'))
    out.append(stat(S(lambda r:r['champ'].get('stay')),'champion uses a Stay'))
    out.append(stat(S(lambda r:r['champ'].get('stay') and r['pf']['prev']>0),'champion uses a Stay while streak live'))
    out.append(stat(S(lambda r:r['pf']['busts']>0),'after a bust'))
open('conf_cross_shipped52_dev200.txt','w').write('\n'.join(out)+'\n'); print('\n'.join(out))
