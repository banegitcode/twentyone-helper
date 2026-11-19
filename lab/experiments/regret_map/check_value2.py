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
for rem in [1,2,3,4,5,6,7,8,9]:
    X=[]
    for (g,s),r in ex.items():
        if r['rem']!=rem: continue
        d=dec[g][s]; X.append(R[g]-d['score']-(r['best']-r['regret']))
    print('rem',rem,'n',len(X),'champ realized final - score_now - Q*(champ move): mean %.1f +- %.1f'%(st.mean(X),se(X)))
