#!/usr/bin/env python3
"""Append measured champion rows to ../EXPERIMENTS.md (append-only; each row is added once, keyed by its name).
Reads per-game rows from results/cache (shipped52 runs) and the compare JSON for exact14 vs shipped52.
  python3 append_experiments.py            # appends whatever is finished and not yet in the log"""
import glob, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H

LOG = os.path.join(os.path.dirname(H.BENCH), "EXPERIMENTS.md")
A = "cmd:node champion/champion_adapter.js --config shipped52"

def cached(setname):
    cp, _ = H._cache_path(A, setname, 1, 1, None)
    if not os.path.exists(cp):
        return None
    c = json.load(open(cp)); c["rows"] = [tuple(r) for r in c["rows"]]
    return c

rows = []
for s, n in (("set1000", 1000), ("set5000", 5000)):
    c = cached(s)
    if c:
        m = H.summarize(c)
        rows.append((f"champion baseline (shipped config), measured on bench, {s}",
                     f"| 2026-11-18 | champion baseline (shipped config), measured on bench, {s} | Referee | {n} | "
                     f"mean {m['mean']:.0f} +- {m['se']:.0f} (SE); 0-bust {m['perfect_rate']*100:.1f}%, >=1 bust {m['bust_game_rate']*100:.1f}%, "
                     f"3-bust end {m['three_bust_rate']*100:.1f}% | baseline | "
                     f"engine = shipped_policies.json['52'] (NN + expectimax + exact endgame from 13 cards, 100k budget) via bench/champion adapter, deepen.budgetMs=0; "
                     f"repo-reported 8,755 / 8,940-8,970 stay 'unverified (from repo)' |"))
for f in sorted(glob.glob(os.path.join(H.BENCH, "results", "*_cmd_champion_adapter_vs_cmd_champion_adapter.json"))) + sorted(glob.glob(os.path.join(H.BENCH, "results", "*vs*.json"))):
    try:
        d = json.load(open(f))
    except Exception:
        continue
    if d.get("a") == A and d.get("b", "").endswith("--config exact14") and d["set"] == "set1000":
        nm = "exact endgame 14 cards (complete solve) vs shipped config, set1000"
        rows.append((nm, f"| 2026-11-18 | {nm} | Referee | {d['n']} | {d['paired_diff_B_minus_A']:+.0f} +- {d['paired_se']:.0f} (z {d['z']:+.1f}); "
                     f"exact14 mean {d['B']['mean']:.0f} +- {d['B']['se']:.0f}, shipped {d['A']['mean']:.0f} +- {d['A']['se']:.0f} | {d['verdict']} | "
                     f"measured on bench (exact2 xK=14 logCap 26 unlimited budget, budgetMs=0); needs clean audit before the champion changes |"))
        break
import re
for f in sorted(glob.glob(os.path.join(H.BENCH, "results", "*vs*.json"))):
    try:
        d = json.load(open(f))
    except Exception:
        continue
    m = re.search(r"exact-endgame-deeper/adapter\.js --config (deeper:\d+|parity13)\b", d.get("b", ""))
    if d.get("a") == A and m and d["set"] == "set1000" and d["n"] >= 1000:
        nm = f"exact-endgame-deeper {m.group(1)}"
        sa, sb = d["A"], d["B"]
        sha = d.get("frozen_sha")
        sha_note = f"; frozen {d.get('frozen_name','candidate')}@{sha}" if sha else ""
        extra = " deeper:16 minus deeper:13 is the extra-depth gain (same 3.2M/move budget), which unlimited exact13 cannot isolate." if m.group(1) == "deeper:13" else ""
        # optional post-12:45 verification note is appended later if present
        vnote = (" " + d["verify_note"]) if d.get("verify_note") else ""
        rows.append((nm, f"| 2026-11-18 | {nm} | 21 Search | {d['n']} | {d['paired_diff_B_minus_A']:+.0f} +- {d['paired_se']:.0f} (z {d['z']:+.1f}); "
                     f"{m.group(1)} mean {sb['mean']:.0f} +- {sb['se']:.0f} vs shipped52 {sa['mean']:.0f} +- {sa['se']:.0f}; 0-bust {sb['perfect_rate']*100:.1f}% vs {sa['perfect_rate']*100:.1f}% | {d['verdict']} | "
                     f"measured on bench, set1000, paired; cost {sb['cpu_s']/d['n']:.1f} worker-s/game vs {sa['cpu_s']/d['n']:.1f} for shipped52 (loaded box, wall time inside workers, inflated); "
                     f"budget is a position count so scores are reproducible{sha_note}.{extra}{vnote} |"))

# ---- pooled:K:logCap rows (21 Search) and learner-e1 rows (21 Learner)
import statistics
def think_summary(path):
    try:
        rs = [json.loads(l) for l in open(path) if l.strip()]
    except Exception:
        return "no timelog"
    if not rs:
        return "no timelog"
    cpu = sorted(r["thinkMs"] / 1000 for r in rs); n = len(rs)
    p95 = cpu[min(n - 1, int(.95 * n))]
    capb = sum(r["solveMs"] >= 99000 for r in rs)
    return (f"per-game total think CPU (solve+rest, bench box CPU, not MacBook wall; {n} games logged): mean {statistics.mean(cpu):.0f}s "
            f"median {statistics.median(cpu):.0f}s p95 {p95:.0f}s max {cpu[-1]:.0f}s; >150s: {sum(x>150 for x in cpu)}, >180s: {sum(x>180 for x in cpu)}; "
            f"100s solve cap bound in {capb}/{n} games ({100*capb/n:.0f}%), clock give-ups {sum(r['giveUpClock']>0 for r in rs)} games, max single decision {max(r['maxMoveMs'] for r in rs)/1000:.0f}s")
for f in sorted(glob.glob(os.path.join(H.BENCH, "results", "*vs*.json"))):
    try:
        d = json.load(open(f))
    except Exception:
        continue
    if d.get("a") != A:
        continue
    sa, sb = d["A"], d["B"]
    m = re.search(r"exact-endgame-deeper/adapter\.js --config (pooled:\d+:\d+)(?: --timelog (\S+))?$", d.get("b", ""))
    if m:
        screen = d["n"] < 1000
        nm = f"exact-endgame-deeper {m.group(1)}" + (" (screen n=%d, not a verdict)" % d["n"] if screen else "")
        verdict = "screen only (not a verdict)" if screen else d["verdict"]
        tl = think_summary(os.path.join(H.BENCH, m.group(2))) if m.group(2) else "no timelog"
        rows.append((nm, f"| 2026-11-18 | {nm} | 21 Search | {d['n']} | {d['paired_diff_B_minus_A']:+.0f} +- {d['paired_se']:.0f} (z {d['z']:+.1f}); "
                     f"{m.group(1)} mean {sb['mean']:.0f} +- {sb['se']:.0f} vs shipped52 {sa['mean']:.0f} +- {sa['se']:.0f} on same first {d['n']} {d['set']} games | {verdict} | "
                     f"measured on bench, B uncached; CPU-clock pooled solver so decisions are load-independent unless the cap binds; {tl} |"))
    m = re.search(r"learner-e1/adapter\.js --config shipped52 --corr (\w+)$", d.get("b", ""))
    if m and m.group(1) != "none":
        corr = m.group(1)
        nm = f"learner-e1 corr:{corr} ({d['set']})"
        rows.append((nm, f"| 2026-11-18 | {nm} | 21 Learner | {d['n']} | {d['paired_diff_B_minus_A']:+.0f} +- {d['paired_se']:.0f} (z {d['z']:+.1f}); "
                     f"corr {corr} mean {sb['mean']:.0f} +- {sb['se']:.0f} vs shipped52 {sa['mean']:.0f} +- {sa['se']:.0f}; 0-bust {sb['perfect_rate']*100:.1f}% vs {sa['perfect_rate']*100:.1f}% | {d['verdict']} | "
                     f"measured on bench, paired, set {d['set']}"
                     + ("; NOTE phase was fit on set1000 so only set5000 counts" if d['set']=='set1000' and 'phase' in corr else "")
                     + "; control corr none matched shipped52 game-for-game on first 120 set1000 games; static+--fresh dynamic audit clean |"))

# ---- exact13 unlimited budget (owner 21 Theorist, regret-map suggestion)
def cpu_summary(path):
    try:
        rs = [json.loads(l) for l in open(path) if l.strip()]
    except Exception:
        return "no timelog"
    if not rs:
        return "no timelog"
    c = sorted(r["cpuMs"] / 1000 for r in rs); n = len(c)
    return (f"per-game CPU think (adapter process CPU, bench box CPU, not MacBook wall; {n} games logged): mean {statistics.mean(c):.1f}s median {statistics.median(c):.1f}s "
            f"p95 {c[min(n-1,int(.95*n))]:.1f}s max {c[-1]:.1f}s; max single decision {max(r['maxDecMs'] for r in rs)/1000:.1f}s; games >150s: {sum(x>150 for x in c)}, >180s: {sum(x>180 for x in c)}")
for f in sorted(glob.glob(os.path.join(H.BENCH, "results", "*vs*.json"))):
    try:
        d = json.load(open(f))
    except Exception:
        continue
    m = re.search(r"TIMELOG=(\S+) .*champion_adapter\.js --config exact13$", d.get("b", ""))
    if d.get("a") == A and m and d["set"] == "set1000" and d["n"] >= 1000:
        sa, sb = d["A"], d["B"]
        nm = "exact13 unlimited budget"
        sha = d.get("frozen_sha")
        sha_note = f"; frozen {d.get('frozen_name','champion')}@{sha}" if sha else " (started before freeze.sh; not a frozen snapshot)"
        rows.append((nm, f"| 2026-11-18 | {nm} | 21 Theorist | {d['n']} | {d['paired_diff_B_minus_A']:+.0f} +- {d['paired_se']:.0f} (z {d['z']:+.1f}); "
                     f"exact13 mean {sb['mean']:.0f} +- {sb['se']:.0f} vs shipped52 {sa['mean']:.0f} +- {sa['se']:.0f}; 0-bust {sb['perfect_rate']*100:.1f}% vs {sa['perfect_rate']*100:.1f}% | {d['verdict']} | "
                     f"measured on bench, set1000, paired; complete solve from 13 cards (exact2 xK=13, logCap 26, unlimited budget) vs shipped52's 100k-position budget; "
                     f"{cpu_summary(m.group(1))}.{sha_note} deeper:16 minus deeper:13 is the extra-depth gain (same 3.2M/move budget), which unlimited exact13 cannot isolate. |"))
# ---- deeper:16 vs shipped52 set5000 baseline (owner Referee)
for f in sorted(glob.glob(os.path.join(H.BENCH, "results", "*vs*.json"))):
    try:
        d = json.load(open(f))
    except Exception:
        continue
    m = re.search(r"TIMELOG=(\S+) .*exact-endgame-deeper/adapter\.js --config deeper:16\b", d.get("b", ""))
    if not m:
        m2 = re.search(r"exact-endgame-deeper/adapter\.js --config deeper:16\b", d.get("b", ""))
        tl = None
    else:
        m2 = m
        tl = m.group(1)
    if m2 and d.get("set") == "set5000" and d["n"] >= 5000:
        sa, sb = d["A"], d["B"]
        nm = "deeper:16 vs shipped52 set5000 baseline"
        sha = d.get("frozen_sha")
        sha_note = f"; frozen {d.get('frozen_name','exact-endgame-deeper')}@{sha}" if sha else ""
        sha_a = f"; A frozen {d.get('frozen_name_a','champion')}@{d['frozen_sha_a']}" if d.get("frozen_sha_a") else ""
        think = cpu_summary(tl) if tl else "no timelog"
        rows.append((nm, f"| 2026-11-18 | {nm} | Referee | {d['n']} | {d['paired_diff_B_minus_A']:+.0f} +- {d['paired_se']:.0f} (z {d['z']:+.1f}); "
                     f"deeper:16 mean {sb['mean']:.0f} +- {sb['se']:.0f} vs shipped52 {sa['mean']:.0f} +- {sa['se']:.0f}; 0-bust {sb['perfect_rate']*100:.1f}% vs {sa['perfect_rate']*100:.1f}% | {d['verdict']} | "
                     f"measured on bench, set5000, paired; B = frozen exact-endgame-deeper@90c2d73f938b --config deeper:16; A = frozen champion@76a84987c25c --config shipped52 (set5000 cache reused after a byte-identical check vs the freeze); "
                     f"{think}{sha_note}{sha_a}. |"))

cur = open(LOG).read()
add = [r for k, r in rows if k not in cur]
if add:
    with open(LOG, "a") as f:
        if not cur.endswith("\n"):
            f.write("\n")
        f.write("\n".join(add) + "\n")
print(f"appended {len(add)} row(s)")
