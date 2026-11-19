# Replay the champion actions logged by play_log.js through the bench reference simulator (bench/refsim.py) and compare final scores.
import json, sys
sys.path.insert(0, '/workspace/21lab/bench')
import refsim
decks = [list(map(int, l.split())) for l in open('/workspace/21lab/bench/shuffles/dev200.txt') if l.strip()]
acts, end = {}, {}
for l in open('data_dev200_champion_all.jsonl'):
    d = json.loads(l)
    if d['t'] == 'dec': acts.setdefault(d['g'], []).append((d['stay'] if d['stay'] >= 0 else None, d['col']))
    else: end[d['g']] = d['score']
bad = 0
for g, a in acts.items():
    G = refsim.Game.from_codes(decks[g]); i = 0
    while not G.over:
        s, c = a[i]; i += 1; G.step(s, c)
    if G.final_score != end[g]: bad += 1
print('games', len(acts), 'score mismatches vs bench refsim:', bad)
