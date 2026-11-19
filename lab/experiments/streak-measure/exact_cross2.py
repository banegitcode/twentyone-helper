#!/usr/bin/env python3
"""Lead's question (shipped52, set1000, exact labels at <=13 cards): the leak 'champion stacks a card on a 1-card column (-> 2 cards)'.
How much of it happens while a streak is live / a setup exists, and how much traces to a lost 3/4-streak window or a bust (realized outcome in the next 5 decisions)?"""
import json, glob, collections, math
import analyze_streaks as A
D='../regret_map/'
dec={}; G={}
for l in open(D+'s1k_champ_all.jsonl'):
    d=json.loads(l)
    if d['t']=='dec': G.setdefault(d['g'],[]).append(d); dec[(d['g'],d['step'])]=d
ex={}
for pat in ['s1kexB_*.jsonl','s1kex12_*.jsonl','s1kex13_*.jsonl']:
    for f in sorted(glob.glob(D+pat)):
        for l in open(f):
            r=json.loads(l)
            if 'failed' not in r: ex.setdefault((r['g'],r['step']),r)
cnt=collections.Counter(g for g,s in ex); Fg={g for g in cnt if cnt[g]>=12}
# lost-window decisions (hindsight) per game: set of steps t..dv in a window
lost=collections.defaultdict(set)
for g in Fg:
    decs=G[g]; N=len(decs); vs=tuple(d['v'] for d in decs)
    rr=[0]*(N+1)
    for t in range(N-1,-1,-1): rr[t]=rr[t+1]+1 if decs[t]['pts']>0 else 0
    LR=[A.reach(tuple(d['cols']),d['stays'],vs[t:t+4]) for t,d in enumerate(decs)]
    t=0
    while t<N:
        d=decs[t]
        if d['prev']+LR[t]>=3 and rr[t]<LR[t] and LR[t]>=1:
            dv=t+rr[t]; lost[g]|=set(range(t,dv+1)); t=dv+1
        else: t+=1
def se(dct):
    xs=[dct.get(g,0.0) for g in Fg]; n=len(xs); m=sum(xs)/n; return m, math.sqrt(sum((x-m)**2 for x in xs)/(n-1)/n)
cats=collections.defaultdict(lambda: collections.defaultdict(float)); ns=collections.Counter()
for (g,s),r in ex.items():
    if g not in Fg: continue
    d=dec[(g,s)]; c=r['champ']; reg=max(0.0,r['regret']); pf=r['pf']
    stack1 = (c['kind']=='build' and c['n']==2 and not c['stay'])
    base='ALL decisions'
    keys=[base]
    if stack1:
        keys.append('champion stacks onto a 1-card column')
        keys.append('  ... streak live (prev>0)' if pf['prev']>0 else '  ... no streak live')
        keys.append('  ... a column scores with the current card (nScoreCols>=1)' if pf['nScoreCols']>=1 else '  ... no column scores now')
        nxt=G[g][s+1:s+6]
        if any(x['bust'] for x in nxt): keys.append('  ... a bust follows within 5 decisions')
        if s in lost[g]: keys.append('  ... inside a hindsight lost 3/4-streak window')
        if reg>0.01: keys.append('  [regret>0.01 only]')
    for k in keys:
        cats[k][g]+=reg; ns[k]+=1
out=[f'shipped52 set1000, exact labels at <=13 cards, {len(Fg)} games: exact regret (points/game, mean +- SE) in decisions where the champion stacks onto a 1-card column']
for k in cats:
    m,s_=se(cats[k]); out.append(f'  {k:62s} {m:6.2f} +- {s_:5.2f} /game   decisions {ns[k]}')
open('exact_cross2_stack1.txt','w').write('\n'.join(out)+'\n'); print('\n'.join(out))
