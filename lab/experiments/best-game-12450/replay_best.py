#!/usr/bin/env python3
"""Replay set1000 game 943 (official deeper:16 score 12,450) with frozen deeper:16
and shipped52. Logs every card, Stay, clear, streak, and bust. Never sends the
deck order to the engine.
"""
import csv, json, os, sys, time

BENCH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'bench'))
sys.path.insert(0, BENCH)
import harness as H
import refsim
from engine_api import normalize_action

OUT = os.path.dirname(os.path.abspath(__file__))
FROZEN_D16 = os.path.join(BENCH, 'frozen', 'exact-endgame-deeper@90c2d73f938b')
TRACE_ADAPTER = os.path.join(BENCH, 'results', 'integrity_1245', 'trace_adapter.js')
CHAMP_ADAPTER = os.path.join(BENCH, 'champion', 'champion_adapter.js')
FROZEN_CHAMP = os.path.join(BENCH, 'frozen', 'champion@76a84987c25c', 'engine', 'twentyone-solver')
# Official shipped52 used the live champion dir via champion_adapter default.
LIVE_CHAMP = os.path.join(BENCH, '..', 'engine', 'twentyone-solver')

RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
SUITS = ['C', 'D', 'H', 'S']  # code//13; suit is cosmetic only (play uses values)
IDX = 943
BATCH_SEED = 1
GAME_SEED = BATCH_SEED * 1000003 + IDX
KIND_LABEL = {
    '21': '21 = 400',
    '777': 'three 7s = 600',
    '5card': '5-card = 800',
    '5card21': '5-card 21 = 1000',
    'bust': 'bust',
    'keep': 'keep (no score)',
}


def card_name(code):
    return RANKS[code % 13] + SUITS[code // 13]


def col_view(cards):
    total, hard = refsim.evaluate(cards)
    soft = 1 in cards and hard + 10 <= 21
    return {
        'cards': list(cards),
        'n': len(cards),
        'hard': hard,
        'total': total,
        'soft': soft,
        'text': 'empty' if not cards else (
            ' '.join(str(c) if c != 1 else 'A' for c in cards)
            + f"  total {total}" + (f" (soft, hard {hard})" if soft else '')
        ),
    }


def event_kind(cards_after_place):
    kind, pts = refsim.score_column(cards_after_place)
    if kind == 'bust':
        return 'bust', 0
    if kind == 'keep':
        return 'keep', 0
    total, hard = refsim.evaluate(cards_after_place)
    n = len(cards_after_place)
    if total == 21 and n == 3 and all(c == 7 for c in cards_after_place):
        return '777', 600
    if total == 21 and n == 5:
        return '5card21', 1000
    if total == 21:
        return '21', 400
    if n == 5:
        return '5card', 800
    return 'keep', 0


def immediate_outcomes(columns, current, stays_left):
    """Legal immediate results of every (stay, place), no future cards."""
    out = []
    stay_opts = [None]
    if stays_left > 0:
        stay_opts += [j for j in range(4) if columns[j]]
    for stay in stay_opts:
        cols = [list(c) for c in columns]
        if stay is not None:
            cols[stay] = []
        for place in range(4):
            if len(cols[place]) >= 5:
                continue
            trial = cols[place] + [current]
            kind, base = event_kind(trial)
            tot, hard = refsim.evaluate(trial)
            out.append({
                'stay': stay, 'place': place, 'kind': kind, 'base': base,
                'total': tot, 'n': len(trial),
            })
    return out


def play_logged(deck_codes, engine, seed, trace_map=None):
    g = refsim.Game.from_codes(deck_codes, max_stays_per_card=1)
    engine.new_game(seed)
    log = []
    while not g.over:
        o = g.obs()
        pre_cols = [list(c) for c in g.columns]
        pre_stays = g.stays_left
        pre_streak = g.streak
        pre_score = g.score
        pre_busts = g.busts
        code = deck_codes[g.pos]
        card_v = g._deck[g.pos]
        dealt = g.pos + 1  # 1-based including current
        rem_incl = 52 - g.pos  # including current
        alts = immediate_outcomes(pre_cols, card_v, pre_stays)

        a = engine.decide(o)
        stays, place = normalize_action(a)
        stay = stays[0] if stays else None
        emptied = None
        if stay is not None:
            emptied = {'column': stay, 'before': col_view(pre_cols[stay])}

        # apply stay then place ourselves via Game.step, capturing mid-state
        mid_cols = [list(c) for c in pre_cols]
        if stay is not None:
            mid_cols[stay] = []
        placed_col_before = list(mid_cols[place])
        placed_after = placed_col_before + [card_v]
        kind, base_pts = event_kind(placed_after)
        pts_gained = g.step(stay, place)  # includes streak bonus; mutates g
        post_streak = g.streak
        bonus = 0
        if kind not in ('bust', 'keep'):
            bonus = refsim.streak_bonus(post_streak)
            if pts_gained != base_pts + bonus:
                raise SystemExit(
                    f"pts mismatch: gained={pts_gained} base={base_pts} bonus={bonus} kind={kind}"
                )
        elif pts_gained != 0:
            raise SystemExit(f"non-clear gained {pts_gained} kind={kind}")

        tr = None
        if trace_map is not None:
            tr = trace_map.get(dealt)

        rec = {
            'card_index': dealt,           # 1..52
            'cards_left_incl': rem_incl,
            'cards_left_excl': rem_incl - 1,
            'code': code,
            'card': card_name(code),
            'value': card_v,
            'stay': stay,
            'emptied': emptied,
            'place': place,
            'column_before': col_view(placed_col_before),
            'column_after': col_view(placed_after) if kind == 'keep' else col_view(placed_after),
            'columns_after_turn': [col_view(c) for c in g.columns],
            'event': kind,
            'event_label': KIND_LABEL[kind],
            'base_points': base_pts,
            'streak_after': post_streak if kind not in ('bust', 'keep') else 0,
            'streak_before': pre_streak,
            'streak_bonus': bonus,
            'points_this_card': pts_gained,
            'running_score': g.score,  # without Perfect Bonus
            'busts': g.busts,
            'stays_left': g.stays_left,
            'trace': tr,
            'alts_scoring': [
                a for a in alts
                if a['kind'] not in ('keep', 'bust') and not (a['stay'] == stay and a['place'] == place)
            ],
            'alts_bust': [
                a for a in alts
                if a['kind'] == 'bust' and not (a['stay'] == stay and a['place'] == place)
            ],
        }
        # If they declined a scoring placement, note it
        rec['declined_scoring'] = bool(rec['alts_scoring']) and kind in ('keep', 'bust')
        log.append(rec)
    if hasattr(engine, 'game_over'):
        engine.game_over(g.final_score)
    return {
        'final_score': g.final_score,
        'score_without_perfect': g.score,
        'busts': g.busts,
        'perfect': int(g.perfect),
        'ncards': g.pos,
        'ended_by_bust': g.ended_by_bust,
        'clears': g.clears,
        'log': log,
    }


def summarize(result):
    log = result['log']
    by_event = {}
    for r in log:
        k = r['event']
        by_event.setdefault(k, {'n': 0, 'base': 0, 'bonus': 0})
        by_event[k]['n'] += 1
        by_event[k]['base'] += r['base_points']
        by_event[k]['bonus'] += r['streak_bonus']
    # streak run lengths (consecutive scoring placements)
    runs, cur = [], 0
    for r in log:
        if r['event'] not in ('keep', 'bust'):
            cur += 1
        else:
            if cur:
                runs.append(cur)
            cur = 0
    if cur:
        runs.append(cur)
    bonus_by_len = {2: 0, 3: 0, 4: 0}
    # bonus is paid on the k-th card of a run
    for r in log:
        if r['streak_bonus']:
            bonus_by_len[r['streak_after']] = bonus_by_len.get(r['streak_after'], 0) + r['streak_bonus']
    stays = [r for r in log if r['stay'] is not None]
    return {
        'final_score': result['final_score'],
        'base_clears': sum(r['base_points'] for r in log),
        'streak_bonus_total': sum(r['streak_bonus'] for r in log),
        'perfect_bonus': 1000 if result['perfect'] else 0,
        'by_event': by_event,
        'n_clears': result['clears'],
        'n_busts': result['busts'],
        'runs': runs,
        'max_streak': max(runs) if runs else 0,
        'n_2streaks': sum(1 for x in runs if x == 2),
        'n_3streaks': sum(1 for x in runs if x == 3),
        'n_4streaks': sum(1 for x in runs if x == 4),
        'n_runs_ge2': sum(1 for x in runs if x >= 2),
        'n_runs_ge3': sum(1 for x in runs if x >= 3),
        'bonus_by_len': bonus_by_len,
        'stays': [
            {
                'card_index': r['card_index'],
                'card': r['card'],
                'column': r['stay'],
                'emptied': r['emptied'],
                'cards_left_incl': r['cards_left_incl'],
                'placed_on': r['place'],
                'event': r['event'],
            }
            for r in stays
        ],
        'n_stays_used': len(stays),
        'declined_scoring_cards': [
            {
                'card_index': r['card_index'], 'card': r['card'],
                'chosen': r['event'], 'place': r['place'],
                'alts': r['alts_scoring'],
            }
            for r in log if r['declined_scoring']
        ],
    }


def load_trace(path):
    m = {}
    games = []
    if not os.path.exists(path):
        return m, games
    # decisions don't have card_index; we'll zip by order
    decisions = []
    for line in open(path):
        if not line.strip():
            continue
        o = json.loads(line)
        if o.get('type') == 'decision':
            decisions.append(o)
        elif o.get('type') == 'game':
            games.append(o)
    return decisions, games


def attach_trace(result, decisions):
    if not decisions:
        return
    if len(decisions) != len(result['log']):
        # still attach by index up to min
        pass
    for i, rec in enumerate(result['log']):
        if i < len(decisions):
            rec['trace'] = decisions[i]


def make_d16(trace_path):
    if os.path.exists(trace_path):
        os.remove(trace_path)
    champ = os.path.join(FROZEN_D16, 'engine', 'twentyone-solver')
    src = os.path.join(champ, 'src')
    spec = (
        f"cmd:env FROZEN_ROOT={FROZEN_D16} CHAMPION_DIR={champ} TWENTYONE_SRC={src} "
        f"node {TRACE_ADAPTER} --config deeper:16 --trace {trace_path}"
    )
    return H.make_engine(spec)


def make_shipped52():
    # Match the official run: bench/champion/champion_adapter.js --config shipped52
    # with default CHAMPION_DIR = engine/twentyone-solver (live tree). Frozen
    # champion snapshot is the same sha the official adapter used at the time.
    spec = f"cmd:node {CHAMP_ADAPTER} --config shipped52"
    return H.make_engine(spec)


def set1000_stats():
    path = os.path.join(BENCH, 'results', '20261118_134014_cmd_shipped52_vs_cmd_deeper_16.csv')
    rows = []
    with open(path) as f:
        for r in csv.DictReader(f):
            rows.append({k: int(v) for k, v in r.items()})
    b = [r['b_score'] for r in rows]
    a = [r['a_score'] for r in rows]
    b.sort()
    n = len(b)

    def pct(xs, p):
        # nearest-rank
        k = min(n - 1, max(0, int(round(p / 100.0 * (n - 1)))))
        return xs[k]

    ge11 = sum(1 for x in b if x >= 11000)
    ge12450 = sum(1 for x in b if x >= 12450)
    same = sum(1 for r in rows if r['a_score'] == r['b_score'])
    return {
        'n': n,
        'd16_mean': sum(x['b_score'] for x in rows) / n,
        'd16_sd': (sum((x['b_score'] - 8926.35) ** 2 for x in rows) / (n - 1)) ** 0.5,
        'd16_min': min(x['b_score'] for x in rows),
        'd16_max': max(x['b_score'] for x in rows),
        'd16_p50': pct(b, 50),
        'd16_p90': pct(b, 90),
        'd16_p99': pct(b, 99),
        'd16_ge11000': ge11,
        'd16_ge12450': ge12450,
        'd16_perfect': sum(r['b_perfect'] for r in rows),
        'd16_busts_sum': sum(r['b_busts'] for r in rows),
        'd16_zero_bust': sum(1 for r in rows if r['b_busts'] == 0),
        'shipped_mean': sum(x['a_score'] for x in rows) / n,
        'shipped_same_score_count': same,
        'this_game': next(r for r in rows if r['game'] == IDX),
        'rank_of_12450': n - ge12450 + 1,  # 1 = best, ties share the top of the tie
    }


def main():
    H.verify_set('set1000')
    decks = H.load_set('set1000')
    deck = decks[IDX]
    names = [card_name(c) for c in deck]
    values = [refsim.card_value(c) for c in deck]
    print(f"set1000[{IDX}] seed={GAME_SEED}")
    print('cards:', ' '.join(names))
    print('values:', ' '.join(str(v) for v in values))
    open(os.path.join(OUT, 'shuffle.json'), 'w').write(json.dumps({
        'index': IDX, 'set': 'set1000', 'batch_seed': BATCH_SEED,
        'game_seed': GAME_SEED,
        'codes': deck, 'names': names, 'values': values,
    }, indent=2))

    stats = set1000_stats()
    open(os.path.join(OUT, 'set1000_stats.json'), 'w').write(json.dumps(stats, indent=2))
    print('official CSV game 943:', stats['this_game'])
    print(f"d16 set1000: mean {stats['d16_mean']:.2f} max {stats['d16_max']} "
          f">=11k {stats['d16_ge11000']}/1000  >=12450 {stats['d16_ge12450']}/1000  "
          f"perfect {stats['d16_perfect']}  same-score-as-shipped {stats['shipped_same_score_count']}")

    # deeper:16 replay
    trace_path = os.path.join(OUT, 'deeper16.trace.jsonl')
    t0 = time.time()
    eng = make_d16(trace_path)
    try:
        r16 = play_logged(deck, eng, GAME_SEED)
    finally:
        if hasattr(eng, 'close'):
            eng.close()
    decisions, games = load_trace(trace_path)
    attach_trace(r16, decisions)
    r16['wall_s'] = time.time() - t0
    r16['summary'] = summarize(r16)
    r16['engine'] = 'deeper:16 frozen exact-endgame-deeper@90c2d73f938b'
    r16['trace_game'] = games
    print(f"deeper:16 replay: score={r16['final_score']} busts={r16['busts']} "
          f"perfect={r16['perfect']} clears={r16['clears']} wall={r16['wall_s']:.1f}s "
          f"match_12450={r16['final_score']==12450}")

    # shipped52 replay
    t1 = time.time()
    eng52 = make_shipped52()
    try:
        r52 = play_logged(deck, eng52, GAME_SEED)
    finally:
        if hasattr(eng52, 'close'):
            eng52.close()
    r52['wall_s'] = time.time() - t1
    r52['summary'] = summarize(r52)
    r52['engine'] = 'shipped52 via bench/champion/champion_adapter.js'
    print(f"shipped52 replay: score={r52['final_score']} busts={r52['busts']} "
          f"perfect={r52['perfect']} clears={r52['clears']} wall={r52['wall_s']:.1f}s")

    # move comparison
    same_moves = True
    diffs = []
    for a, b in zip(r16['log'], r52['log']):
        if a['stay'] != b['stay'] or a['place'] != b['place']:
            same_moves = False
            diffs.append({
                'card_index': a['card_index'], 'card': a['card'],
                'd16': {'stay': a['stay'], 'place': a['place'], 'event': a['event']},
                'shipped52': {'stay': b['stay'], 'place': b['place'], 'event': b['event']},
            })
    cmp = {
        'same_move_sequence': same_moves and len(r16['log']) == len(r52['log']),
        'n_move_diffs': len(diffs),
        'diffs': diffs,
        'same_score': r16['final_score'] == r52['final_score'],
    }
    print('move comparison:', cmp['same_move_sequence'], 'diffs', cmp['n_move_diffs'])

    # exact/giveup tally for d16
    give = {'attempted': 0, 'exact': 0, 'giveup': 0, 'by_rem': {}}
    for rec in r16['log']:
        tr = rec.get('trace') or {}
        rem = rec['cards_left_incl']
        if rem <= 16:
            give['by_rem'].setdefault(rem, {'exact': 0, 'giveup': 0, 'no_attempt': 0})
            if tr.get('exact'):
                give['exact'] += 1
                give['attempted'] += 1
                give['by_rem'][rem]['exact'] += 1
            elif tr.get('giveup'):
                give['giveup'] += 1
                give['attempted'] += 1
                give['by_rem'][rem]['giveup'] += 1
            else:
                give['by_rem'][rem]['no_attempt'] += 1
    r16['exact_tally'] = give
    print('exact tally rem<=16:', give)

    def slim(res):
        # keep logs but drop bulky identical alt lists if needed; keep all for markdown
        out = dict(res)
        return out

    open(os.path.join(OUT, 'deeper16_replay.json'), 'w').write(json.dumps(slim(r16), indent=2))
    open(os.path.join(OUT, 'shipped52_replay.json'), 'w').write(json.dumps(slim(r52), indent=2))
    open(os.path.join(OUT, 'comparison.json'), 'w').write(json.dumps(cmp, indent=2))
    print('wrote logs to', OUT)
    return 0 if r16['final_score'] == 12450 else 1


if __name__ == '__main__':
    sys.exit(main())
