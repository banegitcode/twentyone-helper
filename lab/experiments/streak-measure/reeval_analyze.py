#!/usr/bin/env python3
"""Compare the stronger reference (champion-tail rollouts, horizon 16, 64 fresh pairs) with the Theorist's reference-A fresh values on the SAME flagged decisions.
gain/game = sum over decisions / 195 games; SE = sqrt(sum of per-decision SE^2)/195 (decisions independent given the rollouts; selection of the flagged set is conditioned on)."""
import json, glob, math, collections
R=[json.loads(l) for f in sorted(glob.glob('raw/reeval_strong_*.jsonl')) for l in open(f)]
NG=195; n=len(R)
def agg(rs,key,sek):
    s=sum(r[key] for r in rs); se=math.sqrt(sum(r[sek]**2 for r in rs)); return s/NG, se/NG
out=[f'pool: {n} decisions (of 71 flagged, rem>=17, no-empty-column or Stay types; dev200, shipped52)']
def line(label,rs):
    if not rs: return
    a=agg(rs,'theoristFresh','theoristFreshSe'); b=agg(rs,'strong','strongSe')
    dd=[r['strong']-r['theoristFresh'] for r in rs]; 
    conf=sum(1 for r in rs if r['strong']/r['strongSe']>2); pos=sum(1 for r in rs if r['strong']>0)
    out.append(f"  {label:44s} n={len(rs):3d} | ref A fresh {a[0]:6.2f} +- {a[1]:4.2f} /game | STRONG {b[0]:6.2f} +- {b[1]:4.2f} /game (0.6x {0.6*b[0]:5.2f}, GUESS) | decisions >0: {pos}, z>2: {conf}")
line('all pool',R)
line('no empty column',[r for r in R if r['pf']['nEmpty']==0])
line('Stay involved',[r for r in R if r['champ'].get('stay') or r['alt'].get('stay')])
line('champion Stays, alt no Stay',[r for r in R if r['champ'].get('stay') and not r['alt'].get('stay')])
line('no Stay involved (no-empty-col only)',[r for r in R if not r['champ'].get('stay') and not r['alt'].get('stay')])
line('rem >=33',[r for r in R if r['rem']>=33]); line('rem 17-32',[r for r in R if r['rem']<33])
# per-decision paired difference strong - ref A
d=[r['strong']-r['theoristFresh'] for r in R]; m=sum(d)/n; sd=math.sqrt(sum((x-m)**2 for x in d)/(n-1)); se=math.sqrt(sum(r['strongSe']**2+r['theoristFreshSe']**2 for r in R))/n
out.append(f"  mean per decision: ref A {sum(r['theoristFresh'] for r in R)/n:.1f}, STRONG {sum(r['strong'] for r in R)/n:.1f}; difference {m:.1f} +- {se:.1f} (measurement SE, rollouts only)")
ms=sorted(r['ms'] for r in R); out.append(f"  cost of the strong label (64 pairs, champion tail, box loaded): mean {sum(ms)/n/1000:.1f} s, median {ms[n//2]/1000:.1f} s, max {ms[-1]/1000:.1f} s per decision")
open('reeval_summary.txt','w').write('\n'.join(out)+'\n'); print('\n'.join(out))
