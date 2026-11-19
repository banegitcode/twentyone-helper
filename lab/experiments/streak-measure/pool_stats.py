#!/usr/bin/env python3
"""Pool for phase 2 (shipped52, dev200, cards left >=17): (a) Theorist's confirmed flips of the types no-empty-column / Stay; (b) how many decisions of those types were sampled (>=2 candidate classes) = runtime trigger rate and the reference-A cost."""
import json, glob, math, collections
RM='../regret_map/'
conf=[json.loads(l) for f in sorted(glob.glob(RM+'conf_[0-9].jsonl')) for l in open(f)]
conf=[r for r in conf if 'fresh' in r and r['rem']>=17]
def typ(r): return r['pf']['nEmpty']==0 or r['champ'].get('stay') or r['alt'].get('stay')
NG=195
def stat(rs,label):
    pg=collections.defaultdict(float)
    for r in rs: pg[r['g']]+=r['fresh']
    m=sum(pg.values())/NG; gs=list(pg.values())+[0.0]*(NG-len(pg)); sd=math.sqrt(sum((x-m)**2 for x in gs)/(NG-1))
    print(f"  {label:50s} n={len(rs):3d}  net gain {m:6.2f} +- {sd/math.sqrt(NG):5.2f} /game   (0.6x = {0.6*m:5.2f}, GUESS)")
print('Theorist fresh flips, reference A, rem>=17 (raw):')
stat(conf,'all flips'); stat([r for r in conf if typ(r)],'no-empty-col or Stay types (pool)')
stat([r for r in conf if r['pf']['nEmpty']==0],'  no empty column'); stat([r for r in conf if r['champ'].get('stay') or r['alt'].get('stay')],'  Stay involved (champion or alt)')
stat([r for r in conf if not typ(r)],'other types (not in scope)')
# trigger rates from the sampling pass
S=[json.loads(l) for f in sorted(glob.glob(RM+'samp_[0-9].jsonl')) for l in open(f)]
games={r['g'] for r in S}; print('games in samp',len(games))
ev=[r for r in S if r.get('n') and r['rem']>=17]; 
tev=[r for r in ev if r['pf']['nEmpty']==0 or r['champ'].get('stay') or r['alt'].get('stay')]
allc=[r for r in S if r['rem']>=17]
print(f"decisions with >=2 candidate classes within 100 pts and sampled (rem>=17): {len(ev)} ({len(ev)/len(games):.2f}/game); of which pool types {len(tev)} ({len(tev)/len(games):.2f}/game); mean ref-A ms {sum(r['ms'] for r in ev)/len(ev):.0f}, pool types {sum(r['ms'] for r in tev)/len(tev):.0f} ms; mean rollouts n {sum(r['n'] for r in tev)/len(tev):.0f}")
print(f"  (not sampled by hash, PSAMP=1 means all): notSampled {sum(1 for r in S if r.get('notSampled'))}, single-class {sum(1 for r in S if r.get('single'))}")
