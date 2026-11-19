#!/usr/bin/env python3
"""Future-order audit.

Dynamic audit (deterministic engines; stochastic engines MUST derive all randomness from the seed passed to
new_game(seed) -- the audit replays with the same seed, and an engine using time/os-entropy shows up as NONDETERMINISTIC):
  1. play the engine on shuffle S (twice -> determinism control)
  2. for each decision point t: build alternative decks that share S[0..t] (so the observable state at t is IDENTICAL)
     but with the unseen cards S[t+1..] randomly re-shuffled; replay the engine from the start of the game up to t.
  3. any change of the decision at an identical observable state => FUTURE-DEPENDENT (FAIL).
Static audit: grep engine sources for deck/order internals, shuffle files, harness introspection, wall-clock, RNG (see PATTERNS).

  python3 audit.py --engine py:baselines/greedy_py.py:GreedyPy --set dev200 --games 20 --perms 3
  python3 audit.py --engine "cmd:node champion/champion_adapter.js --config nn5" --games 2 --stride 6 --perms 2
  python3 audit.py --static champion/champion_adapter.js ../engine/twentyone-solver/src/engine.js
  (--engine and --static can be combined; exit code 1 if anything fails)
Native built-ins (native:random|greedy|expect1) receive only a copy of the observable struct (no deck array exists in
their scope) and are audited statically via native/engines.h; use their py ports for the dynamic audit.
"""
import argparse, os, random, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
import refsim
from engine_api import normalize_action

SEVERE, REVIEW = "HIGH", "REVIEW"
PATTERNS = [
    (SEVERE, r"shuffles[/\\]|set1000|set5000|dev200|MANIFEST\.sha256", "reads/mentions the benchmark shuffle files"),
    (SEVERE, r"\b_deck\b|\._max_spc|\bGame\b\s*[(.]|isinstance\([^)]*\bGame\b", "touches harness deck/Game internals"),
    (REVIEW, r"from\s+refsim|import\s+refsim|refsim\.", "imports the reference simulator (OK if only rule helpers like evaluate/score_column; never Game)"),
    (SEVERE, r"gc\.get_(objects|referrers|referents)|sys\._getframe|inspect\.(stack|currentframe|getouterframes)|__globals__|f_back|f_locals", "harness introspection (frames/gc)"),
    (SEVERE, r"bench21|native[/\\]sim\.h|harness\.py|compare\.py", "references the harness/native simulator"),
    (SEVERE, r"\bshuffledDeck\b|\bopts\.deck\b|\bdeck_codes\b|\bplayGame\b", "deck-order construction / harness game runner"),
    (REVIEW, r"\bdeck\b", "word 'deck' (fine if it means remaining-card COUNTS; check by eye)"),
    (REVIEW, r"Math\.random|random\.|rand\(\)|srand|os\.urandom|getrandom|thread_rng|rand::", "unseeded randomness (stochastic engines must use new_game seed)"),
    (REVIEW, r"Date\.now|performance\.now|time\.time|time\.perf_counter|clock_gettime|Instant::now|SystemTime", "wall-clock use (decisions may become time-dependent)"),
    (REVIEW, r"mulberry32|default_rng|RandomState|Random\(", "seeded RNG (OK only if seeded from the new_game seed / used to sample the unseen multiset)"),
    (REVIEW, r"require\(['\"]fs['\"]\)|open\(|fopen|child_process|subprocess|socket|process\.env|os\.environ|getenv", "file/process/env access"),
]
EXTS = {".py", ".js", ".mjs", ".ts", ".c", ".h", ".cc", ".cpp", ".hpp", ".rs", ".go"}


def static_scan(paths):
    files = []
    for p in paths:
        if os.path.isdir(p):
            for r, _, fs in os.walk(p):
                files += [os.path.join(r, f) for f in fs if os.path.splitext(f)[1] in EXTS and not f.startswith("._")]
        else:
            files.append(p)
    high = 0
    for f in files:
        try:
            lines = open(f, errors="replace").read().splitlines()
        except OSError:
            continue
        for sev, pat, why in PATTERNS:
            rx = re.compile(pat)
            for i, ln in enumerate(lines, 1):
                if rx.search(ln):
                    print(f"  [{sev}] {f}:{i}: {why}\n         {ln.strip()[:150]}")
                    high += sev == SEVERE
    print(f"static scan: {len(files)} files, {high} HIGH hits (REVIEW hits need a human look)")
    return high == 0


def run_game(eng, deck, seed, upto=None):
    """play with refsim; return list of (obs, action) up to decision `upto` inclusive (None = whole game)"""
    g = refsim.Game.from_codes(deck)
    eng.new_game(seed)
    rec = []
    while not g.over:
        o = g.obs()
        a = normalize_action(eng.decide(o))
        rec.append((o, a))
        if upto is not None and len(rec) > upto:
            break
        g.step(*refsim._split(a))
    return rec


class _Fresh:
    """engine factory wrapper: a NEW engine instance/process per replayed game (--fresh). Needed for engines that keep
    solver tables across games: the replays share their prefix, so a reused table changes how much of a position budget is used."""
    def __init__(self, spec):
        self.spec = spec
        self.cur = None
    def _new(self):
        if self.cur is not None and hasattr(self.cur, "close"):
            self.cur.close()
        self.cur = H.make_engine(self.spec)
    def new_game(self, seed):
        self._new()
        self.cur.new_game(seed)
    def decide(self, o):
        return self.cur.decide(o)
    def close(self):
        if self.cur is not None and hasattr(self.cur, "close"):
            self.cur.close()


def dynamic_audit(spec, setname, games, perms, stride, seed, fresh=False):
    decks = H.load_set(setname)[:games]
    eng = _Fresh(spec) if fresh else H.make_engine(spec)
    rng = random.Random(seed)
    nondet = future = checked = 0
    try:
        for gi, deck in enumerate(decks):
            r1 = run_game(eng, deck, seed)
            r2 = run_game(eng, deck, seed)
            if [(o, a) for o, a in r1] != [(o, a) for o, a in r2]:
                nondet += 1
                print(f"  NONDETERMINISTIC: game {gi}: same deck + same seed gave different play (cannot audit; expose a seed)")
                continue
            for t in range(0, len(r1), stride):
                for _ in range(perms):
                    rest = deck[t + 1:]
                    alt = rest[:]
                    rng.shuffle(alt)
                    if alt == rest:
                        continue
                    r3 = run_game(eng, deck[:t + 1] + alt, seed, upto=t)
                    o_alt, a_alt = r3[t]
                    o0, a0 = r1[t]
                    checked += 1
                    if o_alt != o0:
                        future += 1
                        print(f"  DIVERGED: game {gi} decision {t}: replay with re-shuffled unseen cards reached a different observable state "
                              f"(an earlier decision changed; with a stateful engine try --fresh)")
                        if future >= 5:
                            return False
                        continue
                    if a_alt != a0:
                        future += 1
                        print(f"  FUTURE-DEPENDENT: game {gi} decision {t}: same observable state, hidden order changed the action {a0} -> {a_alt}")
                        if future >= 5:
                            return False
    finally:
        if hasattr(eng, "close"):
            eng.close()
    print(f"dynamic audit of {spec}: {len(decks)} games, {checked} (decision, reshuffle) pairs checked, "
          f"{future} future-dependent, {nondet} nondeterministic games")
    return future == 0 and nondet == 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--engine")
    ap.add_argument("--set", default="dev200")
    ap.add_argument("--games", type=int, default=20)
    ap.add_argument("--perms", type=int, default=3, help="reshuffles of the unseen cards per decision point")
    ap.add_argument("--stride", type=int, default=1, help="audit every k-th decision point (slow engines)")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--fresh", action="store_true", help="new engine instance/process for every replayed game (use for engines that keep tables/caches across games)")
    ap.add_argument("--static", nargs="*", help="files/dirs to grep for deck-order internals")
    a = ap.parse_args()
    ok = True
    if a.static:
        ok &= static_scan(a.static)
    if a.engine:
        if H.canon(a.engine).startswith("native:"):
            print("native built-ins: dynamic audit not applicable (see docstring); run --static native/engines.h")
        else:
            ok &= dynamic_audit(a.engine, a.set, a.games, a.perms, a.stride, a.seed, a.fresh)
    print("AUDIT", "PASSED" if ok else "FAILED")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
