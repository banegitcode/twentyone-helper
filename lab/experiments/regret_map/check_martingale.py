import json,glob,csv,collections,statistics as st
R={int(r['game']):int(r['a_score']) for r in csv.DictReader(open('../../bench/results/20261118_140459_cmd_shipped52_vs_cmd_exact13.csv'))}
dec=collections.defaultdict(dict)
for l in open('s1k_champ_all.jsonl'):
    d=json.loads(l)
    if d['t']=='dec': dec[d['g']][d['step']]=d
ex={}
for f in glob.glob('s1kex*_[0-9].jsonl'):
    for l in open(f):
        r=json.loads(l)
        if 'failed' not in r: ex[(r['g'],r['step'])]=r
se=lambda x: st.stdev(x)/len(x)**.5
print('per-step martingale residual: (score_{t+1}+V*(s_{t+1})) - (score_t + Q*(s_t,a_t)); expected 0 if exact2 matches the engine')
tot=0
allres=collections.defaultdict(list)
for (g,s),r in ex.items():
    d=dec[g][s]; nxt=dec[g].get(s+1)
    if nxt is not None:
        if (g,s+1) not in ex: continue
        after=nxt['score']+ex[(g,s+1)]['best']
    else: after=R[g]
    allres[r['rem']].append((after)-(d['score']+r['best']-r['regret']))
for rem in sorted(allres):
    x=allres[rem]; print('rem %2d n %4d mean %7.2f +- %5.2f'%(rem,len(x),st.mean(x),se(x)))
