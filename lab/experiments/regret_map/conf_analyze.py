import json,glob,math,collections
R=[json.loads(l) for f in sorted(glob.glob('conf_?.jsonl')) for l in open(f)]
def category(rec):
    c, a = rec['champ'], rec['alt']
    if c['stay'] and not a['stay']: return 'Stay used, better move uses no Stay (over-use)'
    if (not c['stay']) and a['stay']: return 'Stay not used, better move uses a Stay (under-use)'
    if c['stay'] and a['stay']: return 'Stay used, but different Stay/placement is better'
    if c['kind'] == 'bust' and a['kind'] != 'bust': return 'Champion busts, better move avoids bust'
    if c['kind'] != 'bust' and a['kind'] == 'bust': return 'Champion avoids bust, better move busts a column'
    if c['kind'] == 'build' and a['kind'].startswith('c'): return 'Champion declines a clear, better move clears'
    if c['kind'].startswith('c') and a['kind'] == 'build': return 'Champion clears, better move builds instead'
    if c['kind'].startswith('c') and a['kind'].startswith('c'): return 'Both clear: different column/clear type'
    if c['kind'] == 'build' and a['kind'] == 'build':
        if c['n'] == 4 or a['n'] == 4: return 'Build: 4-card column (5-card chase) involved'
        if c['intoEmpty'] != a['intoEmpty']: return 'Build: empty column vs stacking on a live column'
        return 'Build: which live column (other)'
    return 'other'
def se_sum(xs, label):
    pg=collections.defaultdict(float)
    for r in xs: pg[r['g']]+=r['fresh']
    v=[pg.get(g,0) for g in range(200)]; m=sum(v)/200; se=math.sqrt(sum((x-m)**2 for x in v)/199/200); return m,se
for name,sel in (('rem>=16 (16-52)',lambda r:r['rem']>=16),('rem 13-15',lambda r:r['rem']<=15)):
    xs=[r for r in R if sel(r)]; m,se=se_sum(xs,name); print(name,'selected',len(xs),'net gain/game %.1f +- %.1f'%(m,se))
for name,sel in (('rem>=16',lambda r:r['rem']>=16),('rem 13-15',lambda r:r['rem']<=15)):
    print('\ncategories (fresh net gain per game), selection',name)
    cats=collections.defaultdict(list)
    for r in R:
        if sel(r): cats[category(r)].append(r)
    for c,xs in sorted(cats.items(),key=lambda kv:-se_sum(kv[1],'')[0]):
        m,se=se_sum(xs,''); print('| %s | %d | %.1f | %.1f |'%(c,len(xs),m,se))
def feat(name,f,sel):
    g=collections.defaultdict(list)
    for r in R:
        if sel(r): g[f(r)].append(r)
    print('\nby',name)
    for k in sorted(g,key=str):
        m,se=se_sum(g[k],''); print('| %s | %d | %.1f | %.1f |'%(k,len(g[k]),m,se))
feat('Stays left (rem>=16)',lambda r:r['pf']['stays'],lambda r:r['rem']>=16)
feat('busts (rem>=16)',lambda r:r['pf']['busts'],lambda r:r['rem']>=16)
feat('empty columns (rem>=16)',lambda r:min(2,r['pf']['nEmpty']),lambda r:r['rem']>=16)
feat('champion move class (rem>=16)',lambda r:('Stay' if r['champ']['stay'] else r['champ']['kind'] if r['champ']['kind']!='build' else 'build into empty' if r['champ']['intoEmpty'] else 'stack->%d'%r['champ']['n']),lambda r:r['rem']>=16)
print('\ntop examples rem>=16 by fresh z:')
for r in sorted([r for r in R if r['rem']>=16],key=lambda r:-r['fresh']/r['freshSe'])[:10]:
    print('-',r['g'],r['step'],r['rem'],'fresh %.0f +- %.0f first %.0f'%(r['fresh'],r['freshSe'],r['first']['naive']),'|',r['pf']['cols'],'card',r['pf']['v'],'stays',r['pf']['stays'],'busts',r['pf']['busts'],'streak',r['pf']['prev'],'| champ',r['champAct'],r['champ']['kind'],'| alt',r['altAct'],r['alt']['kind'])
