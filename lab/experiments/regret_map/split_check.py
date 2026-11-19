import json,glob,csv,collections,statistics as st
rows={int(r['game']):int(r['diff']) for r in csv.DictReader(open('../../bench/results/20261118_140459_cmd_shipped52_vs_cmd_exact13.csv'))}
dec=collections.defaultdict(dict)
for l in open('s1k_champ_all.jsonl'):
    d=json.loads(l)
    if d['t']=='dec': dec[d['g']][d['step']]=d
ex={}
for f in glob.glob('s1kex*_[0-9].jsonl'):
    for l in open(f):
        r=json.loads(l);k=(r['g'],r['step'])
        if 'failed' not in r or k not in ex: ex[k]=r
E={}
for g in dec:
    need=[(g,s) for s,a in dec[g].items() if a['rem']<=13]
    if all(k in ex and 'failed' not in ex[k] for k in need): E[g]=sum(ex[k]['regret'] for k in need)
for lo,hi in [(0,200),(200,400),(400,600),(600,800),(800,1000)]:
    G=[g for g in E if lo<=g<hi]; e=[E[g] for g in G]; d=[rows[g] for g in G]
    gap=[b-a for a,b in zip(e,d)]
    print(lo,hi,len(G),'expected %.1f realized %.1f gap %.1f +- %.1f'%(st.mean(e),st.mean(d),st.mean(gap),st.stdev(gap)/len(G)**.5))
# per-rem breakdown of expected regret
by=collections.defaultdict(float)
for g in E:
    for s,a in dec[g].items():
        if a['rem']<=13: by[a['rem']]+=ex[(g,s)]['regret']
print({r:round(by[r]/len(E),1) for r in sorted(by,reverse=True) if by[r]>0})
# heavy tail: largest per-game regrets and their realized diffs
top=sorted(E,key=lambda g:-E[g])[:10]
print([(g,round(E[g]),rows[g]) for g in top])
print('sd of regret',st.pstdev(E.values()),'sd of diff',st.pstdev([rows[g] for g in E]))
