#!/usr/bin/env python3
"""Unmeasured-lever audit: existing logs only, no new full games.
All per-game means use game-clustered SE = sd/sqrt(n).
"""
from __future__ import annotations
import csv, json, math, os, glob, statistics
from collections import Counter, defaultdict

ROOT = "/workspace/21lab"
OUT = os.path.join(ROOT, "experiments/unmeasured-levers")
PTS = json.load(open(os.path.join(OUT, "pts.json")))  # index col*11+v

BONUS = {0: 0, 1: 250, 2: 500, 3: 1000, 4: 2000}

def se(xs):
    n = len(xs)
    if n == 0:
        return float("nan"), float("nan"), 0
    m = sum(xs) / n
    if n == 1:
        return m, float("nan"), 1
    var = sum((x - m) ** 2 for x in xs) / (n - 1)
    return m, math.sqrt(var / n), n

def fmt(m, s, nd=1):
    if s != s:
        return f"{m:.{nd}f}"
    return f"{m:.{nd}f} ± {s:.{nd}f}"

def load_jsonl(paths):
    rows = []
    if isinstance(paths, str):
        paths = sorted(glob.glob(paths)) if any(c in paths for c in "*?[]") else [paths]
    for p in paths:
        with open(p) as f:
            for line in f:
                line = line.strip()
                if line:
                    rows.append(json.loads(line))
    return rows

def outcome(col, v):
    if v is None:
        return 0
    return PTS[int(col) * 11 + int(v)]

def base_kind(pts, prev, bust, cleared):
    if bust:
        return "bust", 0, 0
    if not cleared or not pts:
        return "build", 0, 0
    bonus = BONUS.get(int(prev), 2000)
    base = int(pts) - bonus
    kind = {400: "c21", 600: "c777", 800: "c5", 1000: "c521"}.get(base, f"other{base}")
    return kind, base, bonus

def games_from_log(rows):
    """Group decision rows + end row by g."""
    by = defaultdict(lambda: {"decs": [], "end": None})
    for r in rows:
        g = r.get("g")
        if r.get("t") == "end":
            by[g]["end"] = r
        elif r.get("t") == "dec" or "rem" in r and r.get("rem", 0) > 0:
            by[g]["decs"].append(r)
    for g, d in by.items():
        d["decs"].sort(key=lambda r: (r.get("step", 0), -r.get("rem", 0)))
    return by

def analyze_policy(name, by, official_n=None):
    """Per-game scoring anatomy, leftover stays, busts, late Perfect situations."""
    games = sorted(by)
    bad_base = 0
    per = []
    # for lookback
    bust_events = []  # dicts
    unused_stay_games = []
    late_vol_bust_b0 = []  # voluntary bust while busts_before=0
    stay_used_then_bust = []

    for g in games:
        decs = by[g]["decs"]
        end = by[g]["end"]
        counts = Counter()
        base_pts = 0
        bonus_pts = 0
        stays_used = 0
        vol_busts = 0
        forced_busts = 0
        last_stay_step = None
        last_stay_rem = None
        last_empty_step = None
        stays_at_end = None
        stays_at_rem = {}  # rem -> stays before move
        kinds_by_band = Counter()
        unused_stay_at_rem13 = None
        unused_stay_at_rem16 = None
        vol_bust_b0_late = 0
        stay_wasted_end = 0
        played = None
        reason = None
        final = None
        end_busts = None
        identity_ok = True
        prev_nempty = None

        for r in decs:
            rem = r["rem"]
            stays = r["stays"]
            busts_before = r["busts"]
            v = r["v"]
            cols = r["cols"]
            stay = r.get("stay", -1)
            used_stay = stay is not None and stay >= 0
            if used_stay:
                stays_used += 1
                last_stay_step = r["step"]
                last_stay_rem = rem
            n_empty = sum(1 for c in cols if not c)
            # after stay, that column becomes empty before place; n_empty before the placement action
            if used_stay and stay < 4 and cols[stay] != 0:
                n_empty_place = n_empty + 1
            else:
                n_empty_place = n_empty
            if n_empty > 0:
                last_empty_step = r["step"]
            stays_at_rem[rem] = stays

            # legality of placements without stay
            p_plain = [outcome(cols[j], v) for j in range(4)]
            any_safe = any(p >= 0 for p in p_plain)
            # if a stay is used, the emptied column is safe (empty takes any card)
            kind, base, bonus = base_kind(r.get("pts", 0), r.get("prev", 0), r.get("bust", False), r.get("cleared", False))
            if r.get("cleared") and not r.get("bust") and kind.startswith("other"):
                bad_base += 1
                identity_ok = False
            counts[kind] += 1
            base_pts += base
            bonus_pts += bonus
            band = "52-33" if rem >= 33 else ("32-17" if rem >= 17 else ("16-13" if rem >= 13 else "12-1"))
            if kind in ("c21", "c777", "c5", "c521", "bust"):
                kinds_by_band[f"{kind}|{band}"] += 1

            if rem == 16:
                unused_stay_at_rem16 = stays - (1 if used_stay else 0)
            if rem == 13:
                unused_stay_at_rem13 = stays - (1 if used_stay else 0)

            if r.get("bust"):
                forced = not any_safe
                # if they had a stay and didn't use it, not forced
                if stays > 0 and not used_stay:
                    forced = False
                if forced:
                    forced_busts += 1
                else:
                    vol_busts += 1
                if busts_before == 0 and rem <= 16 and not forced:
                    vol_bust_b0_late += 1
                bust_events.append({
                    "g": g, "rem": rem, "step": r["step"], "forced": forced,
                    "busts_before": busts_before, "stays_before": stays,
                    "used_stay": used_stay, "any_safe": any_safe,
                    "n_empty": n_empty, "last_stay_step": last_stay_step,
                    "last_stay_rem": last_stay_rem,
                    "gap_steps": (None if last_stay_step is None else r["step"] - last_stay_step),
                    "gap_cards": (None if last_stay_rem is None else last_stay_rem - rem),
                    "band": band, "kind": kind,
                })

            stays_after = stays - (1 if used_stay else 0)
            stays_at_end = stays_after  # last move wins

        if end:
            final = end.get("score")
            end_busts = end.get("busts")
            played = end.get("played")
            reason = end.get("reason")
            # if end has counts (d16), prefer those for types as a check
        perfect = 1 if (end_busts == 0 and reason == "deck") else (1 if end_busts == 0 and (played is None or played == 52) else 0)
        if end_busts == 0 and reason == "bust3":
            perfect = 0
        leftover = stays_at_end if stays_at_end is not None else 0
        if leftover > 0:
            stay_wasted_end = leftover

        # fill rem13/16 if those rem were skipped (early end)
        if unused_stay_at_rem13 is None:
            # stays entering rem<=13
            for r in decs:
                if r["rem"] <= 13:
                    unused_stay_at_rem13 = r["stays"]
                    break
        if unused_stay_at_rem16 is None:
            for r in decs:
                if r["rem"] <= 16:
                    unused_stay_at_rem16 = r["stays"]
                    break

        per.append({
            "g": g, "final": final, "busts": end_busts, "perfect": perfect,
            "played": played, "reason": reason, "base": base_pts, "bonus": bonus_pts,
            "c21": counts["c21"], "c777": counts["c777"], "c5": counts["c5"], "c521": counts["c521"],
            "bust_events": counts["bust"], "stays_used": stays_used, "leftover": leftover,
            "forced_busts": forced_busts, "vol_busts": vol_busts,
            "stay_at_13": unused_stay_at_rem13 if unused_stay_at_rem13 is not None else leftover,
            "stay_at_16": unused_stay_at_rem16 if unused_stay_at_rem16 is not None else leftover,
            "vol_bust_b0_late": vol_bust_b0_late,
            "identity_ok": identity_ok,
            "kinds_by_band": kinds_by_band,
        })
        if leftover > 0:
            unused_stay_games.append(per[-1])

    def col(key):
        return [p[key] for p in per if p[key] is not None]

    out = {"name": name, "n": len(per), "bad_base": bad_base, "bust_events": bust_events, "per": per}
    keys = ["final", "base", "bonus", "perfect", "busts", "c21", "c777", "c5", "c521",
            "stays_used", "leftover", "forced_busts", "vol_busts", "stay_at_13", "stay_at_16",
            "vol_bust_b0_late", "played"]
    stats = {}
    for k in keys:
        xs = col(k)
        m, s, n = se(xs)
        stats[k] = (m, s, n)
    # rates
    n = len(per)
    leftover_share = sum(1 for p in per if p["leftover"] > 0) / n
    leftover2 = sum(1 for p in per if p["leftover"] >= 2) / n
    leftover0b = sum(1 for p in per if p["leftover"] > 0 and p["busts"] == 0)
    leftover_with_bust = sum(1 for p in per if p["leftover"] > 0 and p["busts"] and p["busts"] > 0)
    stats["leftover_share"] = leftover_share
    stats["leftover2_share"] = leftover2
    stats["leftover_and_bust_n"] = leftover_with_bust
    stats["zero_bust"] = sum(p["perfect"] for p in per) / n  # perfect == zero bust & finished? careful: 3-bust no perfect; unfinished?
    # reason
    reasons = Counter(p["reason"] for p in per)
    out["stats"] = stats
    out["reasons"] = reasons
    out["leftover_share"] = leftover_share
    out["leftover2_share"] = leftover2
    out["leftover_with_bust"] = leftover_with_bust
    # leftover vs perfect identity: leftover stay should imply 0 busts if all busts happen at 0 stays
    out["leftover_with_bust_games"] = [p["g"] for p in per if p["leftover"] > 0 and p["busts"] and p["busts"] > 0]
    # 5-card total and 777 points
    c5_all = [p["c5"] + p["c521"] for p in per]
    out["stats"]["c5_any"] = se(c5_all)
    out["stats"]["c521_pts"] = se([p["c521"] * 1000 for p in per])  # just rate*1000
    out["stats"]["c777_premium"] = se([p["c777"] * 200 for p in per])  # premium over 400
    return out


def print_policy(tag, A):
    S = A["stats"]
    lines = []
    def row(k, label=None, nd=2):
        m, s, n = S[k]
        lines.append(f"  {label or k}: {fmt(m,s,nd)}  (n={n})")
    lines.append(f"== {tag}  n={A['n']} games, bad_base_decode={A['bad_base']} ==")
    for k in ["final", "base", "bonus", "perfect", "busts", "c21", "c777", "c5", "c521",
              "stays_used", "leftover", "forced_busts", "vol_busts", "stay_at_16", "stay_at_13",
              "vol_bust_b0_late"]:
        nd = 1 if k in ("final", "base", "bonus") else 3
        row(k, nd=nd)
    m, s, n = S["c5_any"]
    lines.append(f"  five-card clears (c5+c521): {fmt(m,s,3)}")
    m, s, n = S["c777_premium"]
    lines.append(f"  three-7s premium vs plain 21 (200*count): {fmt(m,s,2)} pts/game")
    lines.append(f"  share games leftover Stay>0: {A['leftover_share']*100:.1f}%  leftover>=2: {A['leftover2_share']*100:.1f}%")
    lines.append(f"  leftover Stay AND busts>0: {A['leftover_with_bust']} games {A['leftover_with_bust_games'][:8]}")
    lines.append(f"  end reasons: {dict(A['reasons'])}")
    return "\n".join(lines)


# ---------------- load logs ----------------
print("loading logs...")
champ_rows = load_jsonl(os.path.join(ROOT, "experiments/regret_map/s1k_champ_all.jsonl"))
champ = games_from_log(champ_rows)
A = analyze_policy("shipped52 set1000", champ)
print(print_policy("shipped52 set1000", A))

ex13_rows = load_jsonl(os.path.join(ROOT, "experiments/regret_map/s1k_exact13_*.jsonl"))
ex13 = games_from_log(ex13_rows)
B = analyze_policy("exact13 set1000 prefix", ex13)
print(print_policy("exact13 set1000 prefix", B))

d16_rows = load_jsonl(os.path.join(ROOT, "experiments/streak-measure/raw/d16_seed3500000001.jsonl"))
d16 = games_from_log(d16_rows)
C = analyze_policy("deeper:16 train150", d16)
print(print_policy("deeper:16 train150", C))

dev_ex_rows = load_jsonl(os.path.join(ROOT, "experiments/regret_map/data_dev200_exact13_*.jsonl"))
dev_ex = games_from_log(dev_ex_rows)
D = analyze_policy("exact13 dev200", dev_ex)
print(print_policy("exact13 dev200", D))

dev_ch_rows = load_jsonl(os.path.join(ROOT, "experiments/regret_map/data_dev200_champion_all.jsonl"))
dev_ch = games_from_log(dev_ch_rows)
E = analyze_policy("shipped52 dev200", dev_ch)
print(print_policy("shipped52 dev200", E))


def paired(Aper, Bper, keys, label):
    Am = {p["g"]: p for p in Aper}
    Bm = {p["g"]: p for p in Bper}
    common = sorted(set(Am) & set(Bm))
    lines = [f"== paired {label}  n={len(common)} =="]
    for k in keys:
        diffs = [Bm[g][k] - Am[g][k] for g in common if Am[g][k] is not None and Bm[g][k] is not None]
        m, s, n = se(diffs)
        lines.append(f"  Δ {k} (B-A): {fmt(m,s,3 if abs(m)<10 else 2)}  (n={n})")
    # leftover change table
    both = Counter()
    for g in common:
        both[(Am[g]["leftover"], Bm[g]["leftover"])] += 1
    lines.append(f"  leftover stays (A,B) counts: {dict(both)}")
    # scoring type diffs when they differ in leftover
    return "\n".join(lines), common

keys_p = ["final", "base", "bonus", "perfect", "busts", "c21", "c777", "c5", "c521",
          "stays_used", "leftover", "forced_busts", "vol_busts", "vol_bust_b0_late"]
t, common13 = paired(A["per"], B["per"], keys_p, "exact13 vs shipped52, same set1000 games")
print(t)
t2, common_dev = paired(E["per"], D["per"], keys_p, "exact13 vs shipped52, same dev200 games")
print(t2)

# ---------------- official bench CSVs ----------------
def load_csv(path):
    rows = []
    with open(os.path.join(ROOT, path)) as f:
        r = csv.DictReader(f)
        for row in r:
            rows.append({k: (int(v) if v and v.lstrip("-").isdigit() else v) for k, v in row.items()})
    return rows

print("\n== official bench CSVs (set1000) ==")
for name, path in [
    ("deeper:16 vs shipped52", "bench/results/20261118_134014_cmd_shipped52_vs_cmd_deeper_16.csv"),
    ("exact13 vs shipped52", "bench/results/20261118_140459_cmd_shipped52_vs_cmd_exact13.csv"),
    ("exact14 vs shipped52", "bench/results/20261118_140319_cmd_shipped52_vs_cmd_exact14.csv"),
    ("deeper:13 vs shipped52", "bench/results/20261118_142023_cmd_shipped52_vs_cmd_deeper_13.csv"),
]:
    rows = load_csv(path)
    n = len(rows)
    for key, ak, bk in [
        ("score", "a_score", "b_score"),
        ("busts", "a_busts", "b_busts"),
        ("perfect", "a_perfect", "b_perfect"),
    ]:
        a = [r[ak] for r in rows]
        b = [r[bk] for r in rows]
        d = [bb - aa for aa, bb in zip(a, b)]
        ma, sa, _ = se(a)
        mb, sb, _ = se(b)
        md, sd, _ = se(d)
        print(f"  {name} {key}: A {fmt(ma,sa,3 if key!='score' else 1)}  B {fmt(mb,sb,3 if key!='score' else 1)}  Δ {fmt(md,sd,3 if key!='score' else 2)}  n={n}")
    # 3-bust
    a3 = sum(1 for r in rows if r["a_busts"] >= 3) / n
    b3 = sum(1 for r in rows if r["b_busts"] >= 3) / n
    print(f"    3-bust rate A {a3*100:.2f}% B {b3*100:.2f}%")


# ---------------- leftover Stay details (shipped52) ----------------
print("\n== leftover Stay anatomy, shipped52 set1000 ==")
# leftover by busts, by stays at rem 16, late use
by_bust = defaultdict(list)
for p in A["per"]:
    by_bust[p["busts"]].append(p)
for b, ps in sorted(by_bust.items()):
    lo = [x["leftover"] for x in ps]
    used = [x["stays_used"] for x in ps]
    print(f"  busts={b} n={len(ps)}  leftover {fmt(*se(lo)[:2],3)}  stays_used {fmt(*se(used)[:2],3)}  leftover>0 {sum(1 for x in lo if x>0)/len(ps)*100:.1f}%")

# Did exact13 use leftover stays that shipped52 held at rem=13?
print("\n== Stay use in last 13 cards, paired set1000 prefix ==")
# stays entering rem=13 should match (same mid-game)
mismatch_entry = 0
use_ex = []
use_ch = []
ex_used_ch_left = 0
ch_used_ex_left = 0
for g in common13:
    a = next(p for p in A["per"] if p["g"] == g)
    b = next(p for p in B["per"] if p["g"] == g)
    # stays used in rem<=13
    def used_late(by, g, rem_cut=13):
        n = 0
        entry = None
        leftover = None
        for r in by[g]["decs"]:
            if r["rem"] <= rem_cut:
                if entry is None:
                    entry = r["stays"]
                if r.get("stay", -1) >= 0:
                    n += 1
        # leftover after last
        return n, entry
    ua, ea = used_late(champ, g)
    ub, eb = used_late(ex13, g)
    if ea != eb:
        mismatch_entry += 1
    use_ch.append(ua)
    use_ex.append(ub)
    if ub > ua:
        ex_used_ch_left += 1
    if ua > ub:
        ch_used_ex_left += 1
print(f"  entry-stays mismatch at rem=13: {mismatch_entry} / {len(common13)} (expect 0 if mid-game identical)")
print(f"  Stays used at rem<=13: shipped52 {fmt(*se(use_ch)[:2],3)}  exact13 {fmt(*se(use_ex)[:2],3)}  Δ {fmt(*se([b-a for a,b in zip(use_ch,use_ex)])[:2],3)}")
print(f"  games exact13 used more late Stays: {ex_used_ch_left}; shipped52 used more: {ch_used_ex_left}")

# same at rem<=16 for d16 vs... not paired with set1000.
print("\n== Stay use rem<=16, deeper:16 train150 (unpaired) ==")
use16 = []
entry16 = []
left16 = []
for g, d in d16.items():
    n = 0
    entry = None
    for r in d["decs"]:
        if r["rem"] <= 16:
            if entry is None:
                entry = r["stays"]
            if r.get("stay", -1) >= 0:
                n += 1
    use16.append(n)
    entry16.append(entry if entry is not None else 0)
print(f"  stays entering rem<=16: {fmt(*se(entry16)[:2],3)}")
print(f"  stays used rem<=16: {fmt(*se(use16)[:2],3)}")
print(f"  leftover at end: {fmt(*C['stats']['leftover'][:2],3)}  share>0 {C['leftover_share']*100:.1f}%")


# ---------------- forced-bust lookback (multi-move Stay conservation) ----------------
print("\n== forced-bust lookback, shipped52 set1000 ==")
be = A["bust_events"]
print(f"  bust events {len(be)}  forced {sum(1 for x in be if x['forced'])}  voluntary {sum(1 for x in be if not x['forced'])}")
# all stays_before
print(f"  busts with stays_before>0: {sum(1 for x in be if x['stays_before']>0)}  (expect 0 per streak audit)")
forced = [x for x in be if x["forced"]]
vol = [x for x in be if not x["forced"]]
# gap from last stay
gaps = [x["gap_cards"] for x in forced if x["gap_cards"] is not None]
no_stay_ever = sum(1 for x in forced if x["gap_cards"] is None)
print(f"  forced busts with no Stay ever used: {no_stay_ever} / {len(forced)}")
if gaps:
    print(f"  cards between last Stay and forced bust: mean {fmt(*se(gaps)[:2],2)}  median {statistics.median(gaps)}")
    for cut in (2, 4, 8, 16):
        print(f"    last Stay within {cut} cards: {sum(1 for d in gaps if d<=cut)} / {len(forced)} forced")

# For each forced bust, inspect decisions from last stay (or 8 cards) to bust:
# was the last Stay in a position that samp/conf flagged?

# voluntary busts at b=0 (Perfect still on the table)
v0 = [x for x in be if not x["forced"] and x["busts_before"] == 0]
print(f"  voluntary busts with Perfect still available (busts_before=0): {len(v0)}  ({len(v0)/1000:.3f}/game)")
print(f"    of which rem<=16: {sum(1 for x in v0 if x['rem']<=16)}  rem<=12: {sum(1 for x in v0 if x['rem']<=12)}  rem>16: {sum(1 for x in v0 if x['rem']>16)}")
v1 = [x for x in be if not x["forced"] and x["busts_before"] == 1]
print(f"  voluntary busts at busts_before=1: {len(v1)}  rem<=16 {sum(1 for x in v1 if x['rem']<=16)}")

# late Perfect: games that still have 0 busts at rem=16 / rem=8 and then bust later
def still_perfect_then_bust(by, rem_cut):
    n_at = 0
    later_bust = 0
    later_vol = 0
    for g, d in by.items():
        rows = [r for r in d["decs"] if r["rem"] == rem_cut]
        if not rows:
            continue
        r = rows[0]
        if r["busts"] == 0:
            n_at += 1
            endb = d["end"]["busts"] if d["end"] else None
            if endb and endb > 0:
                later_bust += 1
    return n_at, later_bust

for cut in (16, 13, 8, 4, 2):
    n_at, later = still_perfect_then_bust(champ, cut)
    print(f"  shipped52: 0-bust at rem={cut}: {n_at}/1000 games, of which later bust: {later}")


# ---------------- 300-game clairvoyant residual ----------------
print("\n== clairvoyant residual, set1000 games 0-299 ==")
# champion on 0-299
ch300 = [p for p in A["per"] if p["g"] < 300]
print(f"  shipped52 n={len(ch300)} score {fmt(*se([p['final'] for p in ch300])[:2],1)} base {fmt(*se([p['base'] for p in ch300])[:2],1)} bonus {fmt(*se([p['bonus'] for p in ch300])[:2],1)} perfect {fmt(*se([p['perfect'] for p in ch300])[:2],3)}")
print(f"  c21 {fmt(*se([p['c21'] for p in ch300])[:2],3)} c777 {fmt(*se([p['c777'] for p in ch300])[:2],3)} c5 {fmt(*se([p['c5'] for p in ch300])[:2],3)} c521 {fmt(*se([p['c521'] for p in ch300])[:2],3)}")
# published CV: score 13193.7, base 6878.7, streak 5331.7, perfect 983.3, clears 15.5
# gap
cv = dict(score=13193.7, base=6878.7, bonus=5331.7, perfect=983.3/1000.0, clears=15.5)
# SE from file: score 35.0, base 16.9, bonus 32.5, perfect 7.4 (points), clears 0.0
ch_score, ch_s, _ = se([p["final"] for p in ch300])
ch_base, ch_bs, _ = se([p["base"] for p in ch300])
ch_bon, ch_bons, _ = se([p["bonus"] for p in ch300])
ch_pf, ch_pfs, _ = se([p["perfect"] for p in ch300])
print(f"  gap score {13193.7-ch_score:.1f}  base {6878.7-ch_base:.1f}  bonus {5331.7-ch_bon:.1f}  perfect_pts {983.3-ch_pf*1000:.1f}")
print(f"  measured legal remaining pools (given, not re-derived): 13-16 fallback 28.6 + above16 12.5 = 41.1 raw")
print(f"  leftover gap after those pools (NOT a legal bound; mostly order info): {(13193.7-ch_score) - 41.1:.1f}")


# ---------------- reference A vs strong ----------------
print("\n== (b) reference A vs strong, overlapping decisions ==")
conf = load_jsonl(os.path.join(ROOT, "experiments/regret_map/conf_*.jsonl"))
strong = load_jsonl(os.path.join(ROOT, "experiments/streak-measure/raw/reeval_strong_*.jsonl"))
print(f"  conf {len(conf)}  strong {len(strong)}")

def stay_pat(r):
    ch = r.get("champ") or {}
    al = r.get("alt") or {}
    return bool(ch.get("stay")), bool(al.get("stay")), ch.get("kind"), al.get("kind")

# per-game sums
# conf: use 'fresh' as the unbiased flip gain (Theorist's confirmation)
# strong: 'strong' field, and theoristFresh

def per_game_sum(rows, valkey, n_games=200, rem_min=17, rem_max=99, pred=None):
    byg = defaultdict(float)
    n_dec = 0
    for r in rows:
        rem = r.get("rem")
        if rem is None or rem < rem_min or rem > rem_max:
            continue
        if pred and not pred(r):
            continue
        v = r.get(valkey)
        if v is None:
            continue
        byg[r["g"]] += v
        n_dec += 1
    xs = [byg[g] for g in range(n_games)]  # include zeros
    return se(xs) + (n_dec,)

# detect conf rem>16
print("  conf rem hist", Counter(r["rem"]//1 for r in conf if True).most_common()[:3], "min", min(r["rem"] for r in conf), "max", max(r["rem"] for r in conf))

# Stay patterns on conf rem>16 with fresh gain
for label, pred in [
    ("all conf", None),
    ("rem>16", lambda r: r["rem"] > 16),
    ("rem>=16", lambda r: r["rem"] >= 16),
    ("stay over-use (champ stay, alt not)", lambda r: r["rem"] > 16 and stay_pat(r)[0] and not stay_pat(r)[1]),
    ("stay under-use (champ not, alt stay)", lambda r: r["rem"] > 16 and (not stay_pat(r)[0]) and stay_pat(r)[1]),
    ("both stay", lambda r: r["rem"] > 16 and stay_pat(r)[0] and stay_pat(r)[1]),
    ("neither stay", lambda r: r["rem"] > 16 and (not stay_pat(r)[0]) and (not stay_pat(r)[1])),
]:
    m, s, n, nd = per_game_sum(conf, "fresh", 200, 1, 99, pred)
    print(f"  conf fresh {label}: {fmt(m,s,2)} /game  decisions={nd}")

# strong
for label, pred in [
    ("all strong (already rem 17-48)", None),
    ("stay over-use", lambda r: stay_pat(r)[0] and not stay_pat(r)[1]),
    ("stay under-use", lambda r: (not stay_pat(r)[0]) and stay_pat(r)[1]),
    ("both stay", lambda r: stay_pat(r)[0] and stay_pat(r)[1]),
    ("neither stay", lambda r: (not stay_pat(r)[0]) and (not stay_pat(r)[1])),
]:
    mS, sS, nS, ndS = per_game_sum(strong, "strong", 200, 1, 99, pred)
    mA, sA, nA, ndA = per_game_sum(strong, "theoristFresh", 200, 1, 99, pred)
    print(f"  strong {label}: strong-ref {fmt(mS,sS,2)}  refA-on-same {fmt(mA,sA,2)}  dec={ndS}")

# paired decision-level shrink
paired_d = []
key = {}
for r in strong:
    key[(r["g"], r["step"])] = r
n_match = 0
shrink_rows = []
for r in conf:
    s = key.get((r["g"], r["step"]))
    if not s:
        continue
    n_match += 1
    shrink_rows.append((r, s))
print(f"  conf∩strong decisions: {n_match}")
# decision-level means
if shrink_rows:
    # game clustered
    bygA, bygS = defaultdict(float), defaultdict(float)
    for r, s in shrink_rows:
        bygA[r["g"]] += r.get("fresh") or 0
        bygS[r["g"]] += s.get("strong") or 0
    xsA = [bygA[g] for g in range(200)]
    xsS = [bygS[g] for g in range(200)]
    xsD = [a-b for a,b in zip(xsA, xsS)]
    print(f"  on overlap, per game: refA(fresh) {fmt(*se(xsA)[:2],2)}  strong {fmt(*se(xsS)[:2],2)}  refA-strong {fmt(*se(xsD)[:2],2)}")
    # how often sign agrees and strong < A
    same_pos = sum(1 for r,s in shrink_rows if (r.get("fresh") or 0) > 0 and (s.get("strong") or 0) > 0)
    Apos_Sneg = sum(1 for r,s in shrink_rows if (r.get("fresh") or 0) > 0 >= (s.get("strong") or 0))
    Aneg_Spos = sum(1 for r,s in shrink_rows if (r.get("fresh") or 0) <= 0 < (s.get("strong") or 0))
    print(f"  sign: both>0 {same_pos}  A>0≥S {Apos_Sneg}  A<=0<S {Aneg_Spos}  of {len(shrink_rows)}")
    # stay under-use overlap
    for lab, pred in [
        ("over", lambda r,s: stay_pat(s)[0] and not stay_pat(s)[1]),
        ("under", lambda r,s: (not stay_pat(s)[0]) and stay_pat(s)[1]),
    ]:
        sub = [(r,s) for r,s in shrink_rows if pred(r,s)]
        if not sub:
            print(f"  overlap {lab}: 0"); continue
        bygA, bygS = defaultdict(float), defaultdict(float)
        for r,s in sub:
            bygA[r["g"]] += r.get("fresh") or 0
            bygS[r["g"]] += s.get("strong") or 0
        xsA = [bygA[g] for g in range(200)]
        xsS = [bygS[g] for g in range(200)]
        print(f"  overlap Stay {lab} (n_dec={len(sub)}): refA {fmt(*se(xsA)[:2],2)}  strong {fmt(*se(xsS)[:2],2)}")


# ---------------- consecutive flips (multi-move along champ path) ----------------
print("\n== (a) consecutive confirmed flips, rem>16, dev200 ==")
# conf flips rem>16 per game, consecutive steps
byg = defaultdict(list)
for r in conf:
    if r["rem"] > 16 and (r.get("fresh") or 0) > 0:
        byg[r["g"]].append(r)
n_games = 200
n_with2 = 0
sum_all = []
sum_consec_pairs = []  # games: sum of flips that have a neighbor flip within 2 cards
max_single = []
for g in range(n_games):
    rows = sorted(byg[g], key=lambda r: r["step"])
    tot = sum(r["fresh"] for r in rows)
    sum_all.append(tot)
    mx = max((r["fresh"] for r in rows), default=0)
    max_single.append(mx)
    pair_sum = 0
    if len(rows) >= 2:
        n_with2 += 1
        for i, r in enumerate(rows):
            # neighbor within 2 steps
            close = False
            for j, o in enumerate(rows):
                if i != j and abs(r["step"] - o["step"]) <= 2:
                    close = True
            if close:
                pair_sum += r["fresh"]
    sum_consec_pairs.append(pair_sum)
print(f"  games with a rem>16 conf flip: {sum(1 for x in sum_all if x>0)} / {n_games}")
print(f"  games with 2+ such flips: {n_with2}")
print(f"  sum of rem>16 conf fresh/game: {fmt(*se(sum_all)[:2],2)}")
print(f"  of which in a consecutive-pair (Δstep<=2): {fmt(*se(sum_consec_pairs)[:2],2)}")
print(f"  max single flip/game: {fmt(*se(max_single)[:2],2)}")
# steps between flips
gaps = []
for g, rows in byg.items():
    rows = sorted(rows, key=lambda r: r["step"])
    for i in range(len(rows)-1):
        gaps.append(rows[i+1]["step"] - rows[i]["step"])
if gaps:
    print(f"  gaps between flips in same game: n={len(gaps)} mean {fmt(*se(gaps)[:2],2)}  share<=2 {sum(1 for d in gaps if d<=2)/len(gaps)*100:.1f}%")


# ---------------- scoring types at rem<=16: shipped52 vs exact13 ----------------
print("\n== (d) scoring types at rem<=16 / <=13, paired ==")

def late_counts(by, g, rem_cut):
    c = Counter()
    for r in by[g]["decs"]:
        if r["rem"] <= rem_cut:
            kind, base, bonus = base_kind(r.get("pts", 0), r.get("prev", 0), r.get("bust", False), r.get("cleared", False))
            c[kind] += 1
            c["_base"] += base
            c["_bonus"] += bonus
    return c

for cut, common, byA, byB, labA, labB in [
    (13, common13, champ, ex13, "shipped52", "exact13"),
    (16, common13, champ, ex13, "shipped52", "exact13"),
    (13, common_dev, dev_ch, dev_ex, "shipped52-dev", "exact13-dev"),
    (16, common_dev, dev_ch, dev_ex, "shipped52-dev", "exact13-dev"),
]:
    print(f"  -- rem<={cut}  {labB} vs {labA} n={len(common)} --")
    for k in ["c21", "c777", "c5", "c521", "bust", "_base", "_bonus"]:
        d = []
        a_s = []
        b_s = []
        for g in common:
            a = late_counts(byA, g, cut)
            b = late_counts(byB, g, cut)
            a_s.append(a[k]); b_s.append(b[k]); d.append(b[k]-a[k])
        print(f"    {k}: {labA} {fmt(*se(a_s)[:2],3)}  {labB} {fmt(*se(b_s)[:2],3)}  Δ {fmt(*se(d)[:2],3)}")

# d16 late scoring (unpaired)
print("  -- deeper:16 train150 rem<=16 (unpaired) --")
for k in ["c21", "c777", "c5", "c521"]:
    xs = []
    for g in d16:
        xs.append(late_counts(d16, g, 16)[k])
    print(f"    {k}: {fmt(*se(xs)[:2],3)}")
print("  -- shipped52 set1000 rem<=16 --")
for k in ["c21", "c777", "c5", "c521"]:
    xs = [late_counts(champ, g, 16)[k] for g in champ]
    print(f"    {k}: {fmt(*se(xs)[:2],3)}")


# ---------------- end-of-deck: last 1-2 cards, leftover 4-card columns, unused stay ----------------
print("\n== end-of-deck anatomy, shipped52 set1000 ==")
# at rem=1 and rem=2: stays, empties, whether scored, leftover 4-card column unused, etc.
def col_n(c):
    if not c:
        return 0
    return (c >> 6) & 7

last_stats = defaultdict(list)
n4_left = []  # 4-card columns still standing at rem=1 (missed 5-card)
stay_at_1 = []
scored_last = []
for g, d in champ.items():
    decs = d["decs"]
    if not decs:
        continue
    last = decs[-1]
    rem1 = next((r for r in decs if r["rem"]==1), None)
    if rem1:
        n4 = sum(1 for c in rem1["cols"] if col_n(c)==4)
        n4_left.append(n4)
        stay_at_1.append(rem1["stays"])
        scored_last.append(1 if rem1.get("cleared") and not rem1.get("bust") else 0)
    # 3-bust early end
    if d["end"] and d["end"].get("reason") == "bust3":
        last_stats["bust3_played"].append(d["end"].get("played"))

print(f"  at rem=1: n={len(stay_at_1)}  stays left {fmt(*se(stay_at_1)[:2],3)}  4-card columns standing {fmt(*se(n4_left)[:2],3)}")
print(f"    share with >=1 four-card column at rem=1: {sum(1 for x in n4_left if x>=1)/len(n4_left)*100:.1f}%")
print(f"    scored the last card: {fmt(*se(scored_last)[:2],3)}")
print(f"    leftover Stay at rem=1: share>0 {sum(1 for x in stay_at_1 if x>0)/len(stay_at_1)*100:.1f}%")
# If a 4-card column stands at rem=1 and they didn't place on it, did they bust or place elsewhere?
missed5 = 0
missed5_games = 0
for g, d in champ.items():
    rem1 = next((r for r in d["decs"] if r["rem"]==1), None)
    if not rem1:
        continue
    cols, v, col = rem1["cols"], rem1["v"], rem1["col"]
    # 4-card columns that would have taken this card without bust (5-card or 5-21)
    candidates = [j for j in range(4) if col_n(cols[j])==4 and outcome(cols[j], v) >= 0]
    if candidates and rem1["col"] not in candidates and not (rem1.get("cleared") and col_n(cols[col])==4):
        # they didn't take an available 5-card
        missed5 += 1
        missed5_games += 1
print(f"  rem=1 available 5-card not taken: {missed5} games")
# how often last card has a 5-card available and it's taken
took5 = 0
avail5 = 0
for g, d in champ.items():
    rem1 = next((r for r in d["decs"] if r["rem"]==1), None)
    if not rem1: continue
    cols, v, col = rem1["cols"], rem1["v"], rem1["col"]
    candidates = [j for j in range(4) if col_n(cols[j])==4 and outcome(cols[j], v) > 0]
    if candidates:
        avail5 += 1
        if rem1["col"] in candidates and rem1.get("cleared"):
            took5 += 1
print(f"  rem=1 five-card available: {avail5}/games, taken {took5}")

# exact13 same at rem=1
def rem1_5(by, games):
    avail=took=missed=n4s=stay=0; n=0
    for g in games:
        rem1 = next((r for r in by[g]["decs"] if r["rem"]==1), None)
        if not rem1: continue
        n += 1
        cols,v,col=rem1["cols"],rem1["v"],rem1["col"]
        n4s += sum(1 for c in cols if col_n(c)==4)
        stay += rem1["stays"]
        cands=[j for j in range(4) if col_n(cols[j])==4 and outcome(cols[j],v)>0]
        if cands:
            avail += 1
            if rem1["col"] in cands and rem1.get("cleared"):
                took += 1
            else:
                missed += 1
    return n, avail, took, missed, n4s/n, stay/n

print("  rem=1 five-card, exact13 set1000 prefix:", rem1_5(ex13, common13))
print("  rem=1 five-card, shipped52 same games:", rem1_5(champ, common13))
print("  rem=1 five-card, deeper:16 train150:", rem1_5(d16, list(d16)))


# ---------------- mid-game 4-card / 5-card chase already in pools; report rate only ----------------
# Frequency of three-7s opportunities declined?
print("\n== three-7s opportunities (columns already two 7s, current is 7) ==")

def is_two7s(c):
    # all7 flag: not7 bit at >>9, n<=3, and n==2, hard==14?
    if not c:
        return False
    h = c & 31
    n = (c >> 6) & 7
    not7 = (c >> 9) & 1
    return (not not7) and n == 2 and h == 14

def seven_ops(by, games, rem_cut=None):
    # per game: opportunities, taken, declined
    opp=[]; took=[]; decl=[]
    for g in games:
        o=t=d=0
        for r in by[g]["decs"]:
            if rem_cut and r["rem"] > rem_cut:
                continue
            if r["v"] != 7:
                continue
            cols=r["cols"]
            # a stay could empty then not be two 7s
            has = any(is_two7s(c) for c in cols)
            if not has:
                continue
            o += 1
            kind, base, bonus = base_kind(r.get("pts",0), r.get("prev",0), r.get("bust",False), r.get("cleared",False))
            if kind == "c777":
                t += 1
            else:
                d += 1
        opp.append(o); took.append(t); decl.append(d)
    return opp, took, decl

for tag, by, games in [
    ("shipped52 set1000", champ, list(champ)),
    ("exact13 prefix", ex13, list(ex13)),
    ("deeper16-150", d16, list(d16)),
]:
    o,t,d = seven_ops(by, games)
    print(f"  {tag}: opp/game {fmt(*se(o)[:2],3)}  taken {fmt(*se(t)[:2],3)}  declined {fmt(*se(d)[:2],3)}")
    o13,t13,d13 = seven_ops(by, games, rem_cut=13)
    print(f"    rem<=13: opp {fmt(*se(o13)[:2],3)} taken {fmt(*se(t13)[:2],3)} declined {fmt(*se(d13)[:2],3)}")


# ---------------- Stay under/over at end vs mid: value bound ----------------
# Games with leftover stays: if we *must* use a leftover Stay at some late forced-bust-like moment that never came,
# the option value was already priced. Bound the scoring-use of a leftover Stay:
# In exact13 vs shipped52, Δ stays leftover and Δ score when leftover differs.
print("\n== exact13 vs shipped52 when leftover Stay differs (last 13 only) ==")
diffs_when = defaultdict(list)
for g in common13:
    a = next(p for p in A["per"] if p["g"]==g)
    b = next(p for p in B["per"] if p["g"]==g)
    diffs_when[(a["leftover"], b["leftover"])].append(b["final"]-a["final"])
for k, xs in sorted(diffs_when.items()):
    if len(xs) >= 1:
        print(f"  leftover (shipped, exact13)={k} n={len(xs)}  Δscore {fmt(*se(xs)[:2],2)}")


# save a compact json of key numbers
summary = {
    "shipped52_n": A["n"],
    "shipped52_leftover_share": A["leftover_share"],
    "shipped52_leftover_mean": A["stats"]["leftover"],
    "shipped52_c777": A["stats"]["c777"],
    "shipped52_c5": A["stats"]["c5"],
    "shipped52_c521": A["stats"]["c521"],
    "shipped52_c21": A["stats"]["c21"],
    "exact13_paired_n": len(common13),
}
with open(os.path.join(OUT, "summary.json"), "w") as f:
    json.dump(summary, f, indent=2)
print("\nWrote summary.json")
