#!/usr/bin/env python3
"""High-hazard choices (MEASURED): decisions (cards left >=13, non-exact) where the CHOSEN afterstate has no empty column, no Stay left and hazard>15% (P next card busts every column).
Which lower-hazard alternatives existed, and what did the champion's own search say they cost?  Also how many forced busts come from these decisions.  usage: hazard_alts.py <log> <label>"""
import sys, collections
from analyze_streaks import load, PTS, NEXT, phase
G=load(sys.argv[1]); n=len(G)
def after(d,s,c):
    v=d['v']; cs=list(d['cols'])
    if s>=0: cs[s]=0
    code=cs[c]*11+v; p=PTS[code]; cs[c]=0 if p!=0 else NEXT[code]
    sa=d['stays']-(1 if s>=0 else 0)
    dk=list(d['deck']); dk[v]-=1; rem2=sum(dk[1:])
    if rem2<=0: return None
    if 0 in cs or sa>0: return 0.0
    return sum(dk[u] for u in range(1,11) if all(PTS[cs[j]*11+u]<0 for j in range(4)))/rem2
tot=collections.Counter(); gaps=[]; forced_next=0; forced_total=0; phs=collections.Counter(); ex=[]
for g,decs,end in G:
    for i,d in enumerate(decs):
        if d['rem']<13 or d.get('exact'): continue
        h=after(d,d['stay'],d['col'])
        if h is None: continue
        if d['bust'] and d['stays']==0 and all(PTS[d['cols'][j]*11+d['v']]<0 for j in range(4)): forced_total+=1
        if h<=0.15: continue
        tot['n']+=1; phs[phase(d['rem'])]+=1
        # did next decision bust?
        if i+1<len(decs) and decs[i+1]['bust']: tot['next_card_bust']+=1
        ch=[a for a in d['scores'] if a['stay']==d['stay'] and a['col']==d['col']]
        if not ch: continue
        vch=ch[0]['value']
        alts=[(a,after(d,a['stay'],a['col'])) for a in d['scores']]
        low=[(a,hh) for a,hh in alts if hh is not None and hh<=0.05 and not (a['stay']==d['stay'] and a['col']==d['col'])]
        low_ns=[(a,hh) for a,hh in low if a['stay']<0]
        if low: tot['has_low_hazard_alt']+=1
        if low_ns: tot['has_low_hazard_alt_no_stay']+=1
        if low:
            gap=vch-max(a['value'] for a,hh in low); gaps.append(gap)
            if gap<60: tot['low_alt_within_60']+=1
            if gap<120: tot['low_alt_within_120']+=1
print(f"== high-hazard choices {sys.argv[2]} ({n} games): decisions {tot['n']} ({tot['n']/n:.3f}/game) by phase {dict(phs)}")
for k in sorted(tot): print(f"  {k}: {tot[k]}")
print(f"  forced busts (all 4 placements bust, no Stay left, cards left>=13, non-exact): {forced_total}")
if gaps: s=sorted(gaps); print(f"  champion's own value gap chosen - best low-hazard alt: n={len(s)} mean {sum(s)/len(s):.0f} median {s[len(s)//2]:.0f} p25 {s[len(s)//4]:.0f} (positive = chosen valued higher)")
