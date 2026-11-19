import json,glob,csv,collections,statistics as st
R={int(r['game']):int(r['b_score']) for r in csv.DictReader(open('../../bench/results/20261118_140459_cmd_shipped52_vs_cmd_exact13.csv'))}
dec=collections.defaultdict(dict);end={}
for f in glob.glob('s1k_exact13_*.jsonl'):
    for l in open(f):
        d=json.loads(l)
        if d['t']=='dec': dec[d['g']][d['step']]=d
        else: end[d['g']]=d
se=lambda x: st.stdev(x)/len(x)**.5
res=collections.defaultdict(list); first=[]
for g in end:
    for s,d in dec[g].items():
        if d['rem']>13 or not d['exact']: continue
        nxt=dec[g].get(s+1)
        after=(nxt['score']+nxt['mval']) if nxt else end[g]['score']
        res[d['rem']].append(after-(d['score']+d['mval']))
    d13=[d for d in dec[g].values() if d['rem']==13][0]
    first.append(end[g]['score']-d13['score']-d13['mval'])
print('games',len(end),'total realized - (score13+V13): %.1f +- %.1f'%(st.mean(first),se(first)))
tot=0
for rem in sorted(res,reverse=True):
    x=res[rem]; tot+=st.mean(x); print('rem %2d n %3d mean %7.2f +- %5.2f'%(rem,len(x),st.mean(x),se(x)))
print('sum of per-step means %.1f'%tot)
