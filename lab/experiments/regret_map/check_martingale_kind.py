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
se=lambda x: st.stdev(x)/len(x)**.5 if len(x)>1 else 0
G=collections.defaultdict(list)
for (g,s),r in ex.items():
    d=dec[g][s]; nxt=dec[g].get(s+1)
    if nxt is not None:
        if (g,s+1) not in ex: continue
        after=nxt['score']+ex[(g,s+1)]['best']
    else: after=R[g]
    x=after-(d['score']+r['best']-r['regret'])
    c=r['champ']; 
    G['all'].append(x)
    G['kind=%s stay=%s'%(c['kind'],c['stay'])].append(x)
    G['bust move' if d['bust'] else 'no bust'].append(x)
    G['cleared' if d['cleared'] else 'not cleared'].append(x)
    G['busts_before=%d'%d['busts']].append(x)
    G['stays_left=%d'%d['stays']].append(x)
    G['regret>0.01' if r['regret']>0.01 else 'regret=0'].append(x)
for k in sorted(G):
    x=G[k]; print('%-28s n %6d  mean %7.2f +- %5.2f  sum/1000games %7.1f'%(k,len(x),st.mean(x),se(x),sum(x)/1000))
