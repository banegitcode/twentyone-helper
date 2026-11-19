import json,glob,csv,collections,statistics as st
R={int(r['game']):r for r in csv.DictReader(open('../../bench/results/20261118_140459_cmd_shipped52_vs_cmd_exact13.csv'))}
dec=collections.defaultdict(dict)
for l in open('s1k_champ_all.jsonl'):
    d=json.loads(l)
    if d['t']=='dec': dec[d['g']][d['step']]=d
ex={}
for f in glob.glob('s1kex*_[0-9].jsonl'):
    for l in open(f):
        r=json.loads(l)
        if 'failed' not in r and r['rem']==13: ex[r['g']]=r
se=lambda x: st.stdev(x)/len(x)**.5
A=[];B=[];C=[]
for g,r in ex.items():
    d=dec[g][r['step']]; s13=d['score']; b=int(R[g]['b_score']); a=int(R[g]['a_score'])
    A.append(b-s13-r['best']); B.append(b-r['best']); C.append(a-s13-(r['best']-r['regret']))
n=len(A)
print('n',n)
print('exact13 realized final - (score13 + best13): mean %.1f +- %.1f'%(st.mean(A),se(A)))
print('exact13 realized final - best13 (if best already total): mean %.1f +- %.1f'%(st.mean(B),se(B)))
print('champ realized - (score13 + value of its 13-card move): %.1f +- %.1f'%(st.mean(C),se(C)))
print('mean score13 %.0f, mean best13 %.0f'%(st.mean(dec[g][r['step']]['score'] for g,r in ex.items()),st.mean(r['best'] for r in ex.values())))
