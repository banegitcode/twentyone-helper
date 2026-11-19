#!/usr/bin/env python3
"""Streak audit analysis (21 Streak).  usage: analyze_streaks.py <log.jsonl> <label> <out_prefix>
Input = per-decision champion log (regret_map/s1k_champ_all.jsonl [shipped52, set1000] or raw/d16_*.jsonl [deeper:16, training seeds]).
MEASURED = counted from the played games.  HINDSIGHT labels (OFFLINE ONLY, use the real future order of the game, never a policy input):
  Lreach(t) = longest chain of consecutive SCORING placements reachable from the real pre-state at decision t with the real next cards.
Outputs <out_prefix>.json and <out_prefix>.txt."""
import sys, json, math, collections, functools
T = json.load(open(__file__.rsplit('/',1)[0] + '/rules_tables.json')) if '/' in __file__ else json.load(open('rules_tables.json'))
PTS, NEXT, SB = T['pts'], T['next'], T['sb']
def sc_pts(code, v): return PTS[code*11+v]
def mean_se(xs):
    n=len(xs); 
    if n<2: return (xs[0] if xs else float('nan'), float('nan'))
    m=sum(xs)/n; var=sum((x-m)**2 for x in xs)/(n-1); return m, math.sqrt(var/n)
def fmt(xs, d=1): m,s=mean_se(xs); return f"{m:.{d}f} +- {s:.{d}f}"
def phase(rem): return '52-33' if rem>=33 else ('32-17' if rem>=17 else '16-1')
PH=['52-33','32-17','16-1']

def load(path):
    games=collections.OrderedDict(); ends={}
    for l in open(path):
        l=l.strip()
        if not l: continue
        d=json.loads(l)
        if d['t']=='dec': games.setdefault(d['g'],[]).append(d)
        elif d['t']=='end': ends[d['g']]=d
    gs=[g for g in games if g in ends]
    return [(g,games[g],ends[g]) for g in gs]

def moves(cols, stays):
    """distinct legal (stay, col) with the resulting column codes"""
    out=[]
    for c in range(4): out.append((-1,c))
    if stays>0:
        for s in range(4):
            for c in range(4): out.append((s,c))
    return out

def scoring_moves(cols, stays, v):
    """list of (stay,col) whose placement scores; stay on s then card on c!=s (empty column cannot score with one card)"""
    r=[]
    for c in range(4):
        if sc_pts(cols[c],v)>0: r.append((-1,c))
    if stays>0:
        for s in range(4):
            if cols[s]==0: continue
            for c in range(4):
                if c!=s and sc_pts(cols[c],v)>0: r.append((s,c))
    return r

def apply_score(cols, stays, v, mv):
    s,c=mv; cols=list(cols)
    if s>=0: cols[s]=0; stays-=1
    cols[c]=0   # scored -> cleared
    return tuple(cols), stays

@functools.lru_cache(maxsize=None)
def reach(cols, stays, vs):
    """longest all-scoring chain over cards vs (tuple), from column codes cols."""
    if not vs: return 0
    best=0
    for mv in scoring_moves(cols, stays, vs[0]):
        nc, ns = apply_score(cols, stays, vs[0], mv)
        best=max(best, 1+reach(nc, ns, vs[1:]))
        if best==len(vs): break
    return best

def live_cols(cols, deck):
    """columns where at least one unseen card value (incl. the current card) would score"""
    k=0
    for c in range(4):
        if cols[c]==0: continue
        if any(deck[u]>0 and sc_pts(cols[c],u)>0 for u in range(1,11)): k+=1
    return k

def kind_of(d):
    if d['bust']: return 'bust'
    if d['pts']>0: return 'score'
    if d['stay']>=0: return 'stay-nonscore'
    return 'build'

def analyze(path, label, outp):
    G=load(path); n=len(G); R={'label':label,'games':n,'source':path}
    L=[]
    pg=collections.defaultdict(list)       # per-game metrics
    maxhist=collections.Counter(); runhist_total=collections.Counter(); endcause=collections.Counter(); endcause_avail=collections.Counter()
    bph=collections.Counter(); cph=collections.Counter()
    for g,decs,end in G:
        vs=tuple(d['v'] for d in decs)
        # --- realized runs
        runs=[]; cur=0; base=0; bonus=0
        for d in decs:
            sc = d['pts']>0
            if sc:
                sbv = SB[min(d['prev'],len(SB)-1)] if d['prev']>0 else 0
                # prev is the streak counter before the move; stay doesn't reset it (rules). bonus = SB[prev]
                sbv = SB[min(d['prev'],len(SB)-1)]
                tot = d['pts'] if 'sb' not in d else d['pts']+d['sb']   # shipped log: pts already includes streak; deeper log: pts=base, sb=streak
                d['_sb']=sbv; d['_base']=tot-sbv; bonus+=sbv; base+=tot-sbv; cur+=1; bph[phase(d['rem'])]+=sbv; cph[phase(d['rem'])]+=1
            else:
                if cur:
                    runs.append(cur); endcause[(min(cur,4),kind_of(d))]+=1
                    endcause_avail[(min(cur,4),kind_of(d))]+= len(scoring_moves(tuple(d['cols']),d['stays'],d['v']))>0
                cur=0
        if cur: runs.append(cur); endcause[(min(cur,4),'game-end')]+=1
        mx=max(runs) if runs else 0
        perfect = end['score']-base-bonus
        maxhist[mx]+=1
        for r in runs: runhist_total[r]+=1
        pg['score'].append(end['score']); pg['base'].append(base); pg['bonus'].append(bonus); pg['perfect'].append(perfect)
        pg['busts'].append(end['busts']); pg['maxstreak'].append(mx)
        pg['clears'].append(sum(runs)); pg['n2'].append(sum(1 for r in runs if r==2)); pg['n3'].append(sum(1 for r in runs if r==3)); pg['n4'].append(sum(1 for r in runs if r>=4))
        pg['n2plus'].append(sum(1 for r in runs if r>=2)); pg['n3plus'].append(sum(1 for r in runs if r>=3)); pg['run1'].append(sum(1 for r in runs if r==1))
        pg['zerobust'].append(1 if end['busts']==0 else 0)
    R['score']=fmt(pg['score'],0)
    R['points_per_game']={k:fmt(pg[k],1) for k in ['base','bonus','perfect']}
    R['points_check']='base+bonus+perfect = score (per game, exact identity): '+str(all(abs(a+b+c-s)<1e-6 for a,b,c,s in zip(pg['base'],pg['bonus'],pg['perfect'],pg['score'])))
    R['max_streak_hist']={str(k):maxhist.get(k,0) for k in range(0,6)}
    R['max_streak_share']={str(k):f"{100*maxhist.get(k,0)/n:.1f}%" for k in range(0,6)}
    R['runs_per_game']={k:fmt(pg[k],3) for k in ['clears','run1','n2','n3','n4','n2plus','n3plus']}
    R['mean_busts']=fmt(pg['busts'],3); R['zero_bust_share']=fmt([100*x for x in pg['zerobust']],1)
    R['bonus_per_game_by_phase']={p:round(bph[p]/n,1) for p in PH}; R['clears_per_game_by_phase']={p:round(cph[p]/n,2) for p in PH}
    R['run_end_cause']={f'len{k[0]}/{k[1]}':dict(n=v, scoring_move_was_available=int(endcause_avail[k])) for k,v in sorted(endcause.items())}
    # --- decision-level
    dec_tbl=collections.defaultdict(lambda: collections.Counter())
    margin_rows=[]   # (phase, kind, margin, immediate, exactflag)
    setup=collections.defaultdict(lambda: collections.Counter()); setup2=collections.defaultdict(lambda: collections.Counter())
    missed=[]        # hindsight lost-window events
    live_pg=collections.defaultdict(lambda: collections.defaultdict(float))
    for g,decs,end in G:
        vs=tuple(d['v'] for d in decs)
        N=len(decs)
        # realized run length from t (consecutive scoring decisions)
        rr=[0]*(N+1)
        for t in range(N-1,-1,-1): rr[t]= rr[t+1]+1 if decs[t]['pts']>0 else 0
        LR=[0]*N
        for t,d in enumerate(decs):
            cols=tuple(d['cols']); LR[t]=reach(cols, d['stays'], vs[t:t+4])   # chain capped at 4
        # decision-level streak-live stats
        for t,d in enumerate(decs):
            ph=phase(d['rem']); cols=tuple(d['cols']); v=d['v']; prev=d['prev']
            sm=scoring_moves(cols,d['stays'],v)
            k=kind_of(d)
            has=len(sm)>0
            key=('live' if prev>0 else 'fresh')
            if prev>=2: 
                c2=dec_tbl[('prev>=2',ph)]; c2['n']+=1
                if has: 
                    c2['score_avail']+=1; c2['took' if k=='score' else 'declined_'+k]+=1
            c=dec_tbl[(key,ph)]
            c['n']+=1
            if has:
                c['score_avail']+=1
                c['took' if k=='score' else 'declined_'+k]+=1
                live_pg[(key,ph)]['avail'] += 1
                if k!='score': live_pg[(key,ph)]['decl'] += 1
                # champion's own value margin: best scoring candidate vs chosen candidate (same 'value' field)
                if d['scores']:
                    vm={ (a['stay'],a['col']):a for a in d['scores']}
                    chosen=(d['stay'],d['col'])
                    # candidates list holds distinct classes; map scoring to any listed move that scores
                    def scr(a): 
                        s,cc=a['stay'],a['col']; cs=list(cols)
                        if s>=0: cs[s]=0
                        return sc_pts(cs[cc],v)>0
                    best_sc=[a for a in d['scores'] if scr(a)]
                    ch=[a for a in d['scores'] if a['stay']==d['stay'] and a['col']==d['col']]
                    if k!='score' and best_sc and ch:
                        m=max(a['value'] for a in best_sc)-ch[0]['value']
                        imm=max((sc_pts(cols[a['col']] if a['stay']<0 or a['stay']!=a['col'] else 0, v)+SB[min(prev,len(SB)-1)]) for a in best_sc)
                        margin_rows.append((ph,k,key,m,imm,bool(d.get('exact')),g))
            # setups
            kl=live_cols(cols,d['deck']); kk=min(kl,4)
            s=setup[(kl,prev>0)]
            s['n']+=1; s['real_run_ge1']+= rr[t]>=1; s['real_run_ge2']+= rr[t]>=2; s['real_run_ge3']+= rr[t]>=3; s['real_run_ge4']+= rr[t]>=4
            s['reach_ge1']+= LR[t]>=1; s['reach_ge2']+= LR[t]>=2; s['reach_ge3']+= LR[t]>=3; s['reach_ge4']+= LR[t]>=4
            s['sum_real']+=rr[t]
            dk=list(d['deck']); dk[v]-=1; rem2=sum(dk[1:])
            strong=0
            for c in range(4):
                if cols[c]==0 or rem2<=0: continue
                q=sum(dk[u] for u in range(1,11) if sc_pts(cols[c],u)>0)/rem2
                if q>=0.15: strong+=1
            s2=setup2[(strong,prev>0)]; s2['n']+=1
            for K_ in (1,2,3,4): s2[f'real_run_ge{K_}']+= rr[t]>=K_; s2[f'reach_ge{K_}']+= LR[t]>=K_
            s2['sum_real']+=rr[t]
        # lost-window events (hindsight): potential total = prev+LR[t]>=3 and realized run from t < LR[t]
        t=0
        while t<N:
            d=decs[t]; pot=d['prev']+min(LR[t],4-d['prev'] if d['prev']<4 else 0) if d['prev']<4 else d['prev']
            if d['prev']+LR[t]>=3 and rr[t]<LR[t] and LR[t]>=1:
                # first deviation decision d2 within the window
                dv=t+rr[t]; dd=decs[dv]
                scoring_avail=len(scoring_moves(tuple(dd['cols']),dd['stays'],dd['v']))>0
                kind=kind_of(dd)
                sbpot = sum(SB[min(d['prev']+i,4)] for i in range(LR[t]))
                sbreal= sum(SB[min(d['prev']+i,4)] for i in range(rr[t]))
                cap=lambda x: min(x,4)
                missed.append(dict(g=g,t=t,rem=d['rem'],prev=d['prev'],Lreach=LR[t],real=rr[t],pot_total=min(d['prev']+LR[t],4),real_total=d['prev']+rr[t],
                    bonus_gap=sbpot-sbreal,dev_step=dv,dev_kind=kind,scoring_avail_at_dev=scoring_avail,dev_rem=dd['rem'],dev_busts_before=dd['busts'],
                    dev_is_bust=dd['bust'],dev_stays=dd['stays'],dev_stay_used=dd['stay']>=0, later_bust_in_next5=any(decs[u]['bust'] for u in range(dv,min(N,dv+5)))))
                t=dv+1
            else: t+=1
    # ---- reporting
    R['decision_table']={}
    for (key,ph),c in sorted(dec_tbl.items()):
        R['decision_table'][f"{key}/{ph}"]=dict(c)
    R['declined_margin']={}
    grp=collections.defaultdict(list)
    for ph,k,key,m,imm,ex,g in margin_rows: grp[(key,ph,k)].append((m,imm,ex))
    for (key,ph,k),xs in sorted(grp.items()):
        R['declined_margin'][f"{key}/{ph}/{k}"]=dict(n=len(xs),mean_champ_value_gap=round(sum(x[0] for x in xs)/len(xs),1),median_champ_value_gap=round(sorted(x[0] for x in xs)[len(xs)//2],1),mean_immediate_pts_forgone=round(sum(x[1] for x in xs)/len(xs),1),n_exact_flag=sum(1 for x in xs if x[2]))
    R['setups']={}
    for (kl,live),s in sorted(setup.items()):
        nn=s['n']; R['setups'][f"live_cols={kl},streak_live={live}"]=dict(n=nn, per_game=round(nn/n,2), **{k:round(v/nn,4) for k,v in s.items() if k not in('n','sum_real')}, mean_real_run=round(s['sum_real']/nn,3))
    R['setups_strong']={}
    for (kl,live),s_ in sorted(setup2.items()):
        nn=s_['n']; R['setups_strong'][f"strong_cols(next-card scoring prob>=0.15)={kl},streak_live={live}"]=dict(n=nn, per_game=round(nn/n,2), **{k:round(v/nn,4) for k,v in s_.items() if k not in('n','sum_real')}, mean_real_run=round(s_['sum_real']/nn,3))
    mc=collections.Counter()
    for m in missed: mc[(m['pot_total'],m['real_total'])]+=1
    R['missed_windows']=dict(n_windows=len(missed), per_game=round(len(missed)/n,3), games_with_any=len({m['g'] for m in missed}),
        by_potential_total=dict(collections.Counter(m['pot_total'] for m in missed)),
        by_dev_kind=dict(collections.Counter(m['dev_kind'] for m in missed)),
        by_dev_kind_when_scoring_avail=dict(collections.Counter(m['dev_kind'] for m in missed if m['scoring_avail_at_dev'])),
        dev_without_scoring_move_available=sum(1 for m in missed if not m['scoring_avail_at_dev']),
        dev_is_bust=sum(1 for m in missed if m['dev_is_bust']),
        mean_bonus_gap=round(sum(m['bonus_gap'] for m in missed)/max(1,len(missed)),1),
        bonus_gap_per_game=fmt([sum(m['bonus_gap'] for m in missed if m['g']==g) for g,_,_ in G],1),
        by_phase={ph:sum(1 for m in missed if phase(m['dev_rem'])==ph) for ph in PH})
    # missed windows with prev==0 vs prev>0
    R['missed_windows']['bonus_gap_per_game_by_dev_phase']={ph:round(sum(m['bonus_gap'] for m in missed if phase(m['dev_rem'])==ph)/n,1) for ph in PH}
    R['missed_windows']['dev_with_stay_available_and_nonscore_stay_used']=sum(1 for m in missed if m['dev_stay_used'])
    R['missed_windows']['prev_live']=sum(1 for m in missed if m['prev']>0)
    # bonus gap split by dev kind
    R['missed_windows']['bonus_gap_by_dev_kind_per_game']={k:round(sum(m['bonus_gap'] for m in missed if m['dev_kind']==k)/n,1) for k in ['bust','build','stay-nonscore','score']}
    json.dump(dict(R, missed_list=missed[:2000]), open(outp+'.json','w'), indent=1)
    # text
    lines=[f"== {label}: {n} games ({path})", f"score {R['score']}", "points/game (base clears / streak bonus / perfect bonus): "+' | '.join(f"{k} {v}" for k,v in R['points_per_game'].items()), R['points_check'],
      "max streak per game histogram (0..4): "+str(R['max_streak_hist'])+"  share "+str(R['max_streak_share']),
      "runs per game (consecutive scoring placements): "+str(R['runs_per_game']), f"busts/game {R['mean_busts']}, zero-bust % {R['zero_bust_share']}", '']
    lines.append('-- streak bonus per game by cards-left phase: '+str(R['bonus_per_game_by_phase'])+'  scoring placements per game by phase: '+str(R['clears_per_game_by_phase']))
    lines.append("-- how realized runs END (next non-scoring decision kind; scoring_move_was_available = a scoring placement existed there)")
    for k,v in R['run_end_cause'].items(): lines.append(f"  {k}: {v}")
    lines.append("-- decision table (streak live = previous card scored; fresh = not)")
    for k,v in R['decision_table'].items(): lines.append(f"  {k}: {v}")
    lines.append("-- declined scoring placement: champion's OWN value gap (best scoring cand. minus chosen, same search field), immediate pts forgone (base+bonus)")
    for k,v in R['declined_margin'].items(): lines.append(f"  {k}: {v}")
    lines.append("-- setups: live_cols = columns where some unseen card (incl. current) scores; real_run_geK = realized consecutive scoring placements from this decision >=K; reach_geK = HINDSIGHT (future order) reachable")
    for k,v in R['setups'].items(): lines.append(f"  {k}: {v}")
    lines.append("-- strong setups: columns whose scoring-card share of the unseen next card is >=15% (current card excluded)")
    for k,v in R['setups_strong'].items(): lines.append(f"  {k}: {v}")
    lines.append("-- hindsight lost windows (3+/4 streak reachable by scoring-only chain from a real state, realized shorter)")
    lines.append("  "+json.dumps(R['missed_windows']))
    open(outp+'.txt','w').write('\n'.join(lines)+'\n')
    print('\n'.join(lines))
if __name__=='__main__':
    analyze(sys.argv[1], sys.argv[2], sys.argv[3])
