#!/usr/bin/env python3
"""Bust anatomy (MEASURED). usage: bust_stats.py <log> <label>
For each bust: stays left, cards left, whether a non-bust move existed, whether a Stay would have avoided it, whether a streak was live, and the champion's own value gap
(best non-bust candidate minus the busting choice; same search field).  Plus 'bust exposure' of the chosen afterstate: probability that the NEXT card busts every column (forced bust when no Stay is left)."""
import sys, collections, math
from analyze_streaks import load, PTS, NEXT, phase, PH
G=load(sys.argv[1]); n=len(G); c=collections.Counter(); gaps=[]; expo=collections.defaultdict(lambda:[0,0,0.0])
busts_by=collections.Counter(); 
for g,decs,end in G:
    for d in decs:
        cols=list(d['cols']); v=d['v']; s,cc=d['stay'],d['col']; ph=phase(d['rem'])
        # exposure of the chosen afterstate
        cs=list(cols)
        if s>=0: cs[s]=0
        code=cs[cc]*11+v; p=PTS[code]; cs[cc]= 0 if p!=0 else NEXT[code]
        stays_after=d['stays']-(1 if s>=0 else 0)
        dk=list(d['deck']); dk[v]-=1; rem2=sum(dk[1:])
        if rem2>0 and not d['bust'] and 0 not in cs:
            pf=sum(dk[u] for u in range(1,11) if all(PTS[cs[j]*11+u]<0 for j in range(4)))/rem2
            e=expo[(ph,stays_after>0)]; e[0]+=1; e[1]+= pf>0; e[2]+=pf
            c[f'noempty_after_{ph}_stays{"0" if stays_after==0 else ">0"}']+=1
        if d['bust']:
            c['busts']+=1; busts_by[(ph,'stays>0' if d['stays']>0 else 'stays=0')]+=1
            if d['prev']>0: c['bust_while_streak_live']+=1
            # non-bust move existed?
            nb=[a for a in d['scores'] if PTS[(0 if a['stay']>=0 and a['stay']==a['col'] else cols[a['col']] if not (a['stay']>=0 and a['stay']==a['col']) else 0)*11+v]>=0] if d['scores'] else []
            def isbust(a):
                cs2=list(cols)
                if a['stay']>=0: cs2[a['stay']]=0
                return PTS[cs2[a['col']]*11+v]<0
            nbm=[a for a in d['scores'] if not isbust(a)]
            if nbm:
                c['bust_with_nonbust_option']+=1
                ch=[a for a in d['scores'] if a['stay']==s and a['col']==cc]
                if ch: gaps.append(ch[0]['value']-max(a['value'] for a in nbm))
            else: c['bust_forced_all_moves_bust']+=1
            if d['stays']>0: c['bust_with_stay_left']+=1
print(f"== bust anatomy {sys.argv[2]} ({n} games)")
for k in sorted(c): print(f"  {k}: {c[k]} ({c[k]/n:.3f}/game)")
print('  busts by (phase, stays):',dict(busts_by))
if gaps: print('  champion own value gap (bust choice minus best non-bust option), n=%d mean %.1f median %.1f (positive = champion valued the bust higher)'%(len(gaps),sum(gaps)/len(gaps),sorted(gaps)[len(gaps)//2]))
print('  exposure of chosen afterstate with NO empty column: (phase, stays_left>0) -> decisions, share with P(next card busts every column)>0, mean P:')
for k,(nn,npos,sp) in sorted(expo.items()): print(f'    {k}: n={nn} share_pos={npos/nn:.3f} meanP={sp/nn:.4f}')
