#!/usr/bin/env python3
"""Mispricing of an unused Stay by the shipped network, from raw/stay_labels*.jsonl (paired CRN labels, champion-search tail).
For each decision: label_diff = E[return | best Stay move] - E[return | best no-Stay move] (rollouts, includes immediate points), net_diff = (dpts + NN afterstate value) of the Stay move minus the same for the
no-Stay move (raw network, no search), search_diff = the champion's own root-search values.  The two afterstates differ in stays left (Stay move: one fewer) and in columns.
mispricing = label_diff - net_diff   (> 0: the network UNDERPRICES the Stay move, i.e. over-values keeping the Stay).  Mean +- empirical SE over decisions (includes sampling of positions).
Also: per-afterstate bias (label v - nn) by stays left.  Labels at 17-24 cards left are free of network leaf contamination (rollouts reach the exact solve inside the 16-ply horizon); above 24 the 16-ply leaf shares the network's bias."""
import json, glob, math, collections, sys
D=[];C=[]
for f in sorted(glob.glob('raw/stay_labels_[0-9].jsonl')):
    for l in open(f):
        r=json.loads(l); (D if r['kind']=='D' else C).append(r)
Cd={r['id']:r for r in C}
POOL={'0:1:0':221,'0:1:1':19,'0:2:0':205,'0:2:1':17,'1:1:0':233,'1:1:1':18,'1:2:0':277,'1:2:1':27,'2:1:0':146,'2:1:1':14,'2:2:0':360,'2:2:1':22,'3:1:0':20,'3:1:1':2,'3:2:0':568,'3:2:1':26}   # decisions per cell in the pool (|search diff|<=300), from stay_label.js PRINT_POOL
def cell(r):
    c=r['cards_left_incl_current']; b=0 if c<=24 else 1 if c<=32 else 2 if c<=40 else 3
    return f"{b}:{r['stays']}:{1 if r['champion_used_stay'] else 0}"
cnt=collections.Counter(cell(r) for r in D)
for r in D: r['w']=POOL[cell(r)]/cnt[cell(r)]
def wms(xs,ws):
    sw=sum(ws); m=sum(x*w for x,w in zip(xs,ws))/sw; n=len(xs)
    if n<2: return m,float('nan'),n
    # weighted SE (linearization): sqrt(sum w^2 (x-m)^2)/sw
    return m, math.sqrt(sum((w*(x-m))**2 for x,w in zip(xs,ws)))/sw, n
def ms(xs):
    n=len(xs)
    if n<2: return (xs[0] if xs else float('nan'), float('nan'), n)
    m=sum(xs)/n; return m, math.sqrt(sum((x-m)**2 for x in xs)/(n-1)/n), n
def bucket(c): return '17-24' if c<=24 else '25-32' if c<=32 else '33-40' if c<=40 else '41-52'
out=[f'decisions labeled: {len(D)} (rollout pairs per decision: mean {sum(r["n_pairs"] for r in D)/max(1,len(D)):.0f}; label_diff SE per decision: median {sorted(r["label_diff_se"] for r in D)[len(D)//2]:.0f})']
def table(title, keyf, rows):
    out.append(title); g=collections.defaultdict(list)
    for r in rows: g[keyf(r)].append(r)
    out.append('  bin | n | label_diff | net_diff (raw NN) | search_diff (champion) | MISPRICING label-net | label-search')
    for k in sorted(g):
        rs=g[k]; L=ms([r['label_diff_stay_minus_nostay'] for r in rs]); N=ms([r['net_diff_nn_plus_dpts'] for r in rs]); S=ms([r['champion_search_diff'] for r in rs])
        M=ms([r['label_diff_stay_minus_nostay']-r['net_diff_nn_plus_dpts'] for r in rs]); MS=ms([r['label_diff_stay_minus_nostay']-r['champion_search_diff'] for r in rs])
        out.append(f"  {k} | {len(rs)} | {L[0]:7.1f} +- {L[1]:5.1f} | {N[0]:7.1f} | {S[0]:7.1f} | {M[0]:7.1f} +- {M[1]:5.1f} ({M[0]/M[1] if M[1] else 0:+.1f} SE) | {MS[0]:7.1f} +- {MS[1]:5.1f}")
table('ALL decisions', lambda r:'all', D)
rw=wms([r['label_diff_stay_minus_nostay']-r['net_diff_nn_plus_dpts'] for r in D],[r['w'] for r in D]); lw=wms([r['label_diff_stay_minus_nostay'] for r in D],[r['w'] for r in D]); nw=wms([r['net_diff_nn_plus_dpts'] for r in D],[r['w'] for r in D])
out.append(f"POOL-WEIGHTED (undoes the oversampling of Stay-used decisions; pool = {sum(POOL.values())} decisions above 16 cards with a Stay and |search diff|<=300): label_diff {lw[0]:.1f} +- {lw[1]:.1f}, net_diff {nw[0]:.1f}, MISPRICING {rw[0]:.1f} +- {rw[1]:.1f}")
# calibration slope of label diff on net diff (weighted least squares)
xs=[r['net_diff_nn_plus_dpts'] for r in D]; ys=[r['label_diff_stay_minus_nostay'] for r in D]; ws=[r['w'] for r in D]; sw=sum(ws); mx=sum(w*x for w,x in zip(ws,xs))/sw; my=sum(w*y for w,y in zip(ws,ys))/sw
sl=sum(w*(x-mx)*(y-my) for w,x,y in zip(ws,xs,ys))/sum(w*(x-mx)**2 for w,x in zip(ws,xs)); out.append(f"weighted slope of label_diff on net_diff: {sl:.2f} (1.0 = calibrated; <1 = network differences too spread, noise in x attenuates this; see search_diff version below)")
xs2=[r['champion_search_diff'] for r in D]; mx2=sum(w*x for w,x in zip(ws,xs2))/sw; sl2=sum(w*(x-mx2)*(y-my) for w,x,y in zip(ws,xs2,ys))/sum(w*(x-mx2)**2 for w,x in zip(ws,xs2)); out.append(f"weighted slope of label_diff on champion search_diff: {sl2:.2f}")
table('by cards left (incl. current card)', lambda r:bucket(r['cards_left_incl_current']), D)
table('by stays left before the move', lambda r:f"stays={r['stays']}", D)
table('by cards left x stays left', lambda r:f"{bucket(r['cards_left_incl_current'])} stays={r['stays']}", D)
table('by whether the champion used the Stay', lambda r:'champion used Stay' if r['champion_used_stay'] else 'champion kept Stay', D)
table('by cards left x champion used Stay', lambda r:f"{bucket(r['cards_left_incl_current'])} {'used' if r['champion_used_stay'] else 'kept'}", D)
# per-afterstate bias by stays left
out.append('per-afterstate: bias = labeled v - raw NN value, by stays left AFTER the move and cards left after the move')
g=collections.defaultdict(list)
for r in C: g[(bucket(r['left']+1), r['stays'])].append(r['v']-r['nn'])
for k in sorted(g): m=ms(g[k]); out.append(f"  cards {k[0]} stays_after={k[1]}: n={m[2]} bias {m[0]:7.1f} +- {m[1]:5.1f}")
out.append('  difference of bias (stays_after=s) - (stays_after=s-1) within a cards bucket = network error of one extra Stay (paired by position is the MISPRICING table above)')
# leaf contamination
out.append('mean unused Stays at the 16-ply leaf / exact point, by arm: ' + ', '.join(f"{b}: Stay-arm {ms([r['leaf_stays_mean'] for r in C if r['uses_stay'] and bucket(r['left']+1)==b])[0]:.2f}, no-Stay arm {ms([r['leaf_stays_mean'] for r in C if not r['uses_stay'] and bucket(r['left']+1)==b])[0]:.2f}" for b in ['17-24','25-32','33-40','41-52']))
open('stay_mispricing.txt','w').write('\n'.join(out)+'\n'); print('\n'.join(out))
