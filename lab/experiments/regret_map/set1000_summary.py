import json,glob,collections,statistics as st
dec=collections.defaultdict(dict)
for l in open('s1k_champ_all.jsonl'):
    d=json.loads(l)
    if d['t']=='dec': dec[d['g']][d['step']]=d
ex={};fail=collections.Counter()
for f in glob.glob('s1kex*_[0-9].jsonl'):
    for l in open(f):
        r=json.loads(l)
        if 'failed' in r:
            if (r['g'],r['step']) not in ex: ex[(r['g'],r['step'])]=r
        else: ex[(r['g'],r['step'])]=r
for k,r in ex.items():
    if 'failed' in r: fail[r['rem']]+=1
G=sorted(dec); se=lambda x: st.stdev(x)/len(x)**.5
print('decisions failed (solver table overflow at LOGCAP 25):',dict(fail),'; games affected', len({k[0] for k,r in ex.items() if 'failed' in r}))
print('| cards left | regret/game over all 1000 games (failed solves counted 0) | SE | games with regret>0.01 |')
tot=[0]*1000;per={}
for rem in range(13,0,-1):
    x=[]
    for g in G:
        s=sum(ex[(g,t)]['regret'] for t,a in dec[g].items() if a['rem']==rem and (g,t) in ex and 'failed' not in ex[(g,t)])
        x.append(s)
    for i,v in enumerate(x): tot[i]+=v
    if sum(x)>0: print('| %d | %.1f | %.1f | %d |'%(rem,st.mean(x),se(x),sum(1 for v in x if v>0.01)))
print('total <=13: %.1f +- %.1f (failed solves counted as 0); 9-12: %.1f'%(st.mean(tot),se(tot),0))
# by champion decision kind, regret>0.01
C=collections.defaultdict(float);N=collections.Counter()
for (g,s),r in ex.items():
    if 'failed' in r or r['regret']<=0.01: continue
    c=r['champ']; k=('stay-move' if c['stay'] else 'no-stay')+' / '+c['kind']+('  / bust-before' if dec[g][s]['busts']>0 else '')
    C[k]+=r['regret']; N[k]+=1
T=sum(C.values())
print('\n| champion move class (rem<=13, regret>0.01) | regret/game | share | decisions |')
for k,v in sorted(C.items(),key=lambda kv:-kv[1])[:8]: print('| %s | %.1f | %.0f%% | %d |'%(k,v/1000,100*v/T,N[k]))
