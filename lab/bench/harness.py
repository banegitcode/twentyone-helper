"""Shared harness: shuffle sets (hash-verified), engine specs (native / py / cmd), parallel runners, statistics.

Engine spec grammar (--a / --b / --engine):
  native:random | native:greedy | native:expect1      built-in C baselines (hot loop in native/bench21)
  py:<file.py|module>:<ClassName>                      in-process Python Engine subclass (no-arg constructor)
  cmd:<command line>                                   subprocess, line-delimited JSON protocol (see README.md)
  random | greedy | expect1                            shorthand for native:*
"""
import hashlib, importlib, importlib.util, json, math, multiprocessing as mp, os, shlex, subprocess, sys, time

BENCH = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BENCH)
from engine_api import Obs, Engine, normalize_action   # noqa: E402
import refsim                                           # noqa: E402

SHUF = os.path.join(BENCH, "shuffles")
NATIVE_BIN = os.path.join(BENCH, "native", "bench21")
DEV_SETS = {"dev200"}


# ---------------------------------------------------------------- shuffle sets
def set_path(name):
    return name if os.path.exists(name) else os.path.join(SHUF, name + ".txt")


def verify_set(name):
    """Check sha256 against MANIFEST.sha256; abort if a shuffle file was altered."""
    p = set_path(name)
    base = os.path.basename(p)
    man = {}
    with open(os.path.join(SHUF, "MANIFEST.sha256")) as f:
        for line in f:
            if line.strip():
                h, n = line.split()
                man[n] = h
    h = hashlib.sha256(open(p, "rb").read()).hexdigest()
    if man.get(base) != h:
        sys.exit(f"SHUFFLE SET TAMPERED OR UNKNOWN: {base} sha256={h} manifest={man.get(base)}")
    return h


def load_set(name):
    with open(set_path(name)) as f:
        return [list(map(int, line.split())) for line in f if line.strip()]


def ensure_native():
    if not os.path.exists(NATIVE_BIN) or os.path.getmtime(NATIVE_BIN) < max(
            os.path.getmtime(os.path.join(BENCH, "native", x)) for x in ("sim.h", "engines.h", "bench21.c")):
        subprocess.check_call([os.path.join(BENCH, "native", "build.sh")])


# ---------------------------------------------------------------- engine specs
def canon(spec):
    return "native:" + spec if spec in ("random", "greedy", "expect1") else spec


def spec_label(spec):
    s = canon(spec)
    kind, _, rest = s.partition(":")
    if kind == "native":
        return rest
    if kind == "py":
        return os.path.splitext(os.path.basename(rest.split(":")[0]))[0] + "." + rest.split(":")[-1]
    return "cmd_" + os.path.basename(shlex.split(rest)[-1]).split(".")[0]


def load_py_engine(rest):
    target, _, cls = rest.rpartition(":")
    if target.endswith(".py") or os.sep in target:
        path = os.path.abspath(target)
        sys.path.insert(0, os.path.dirname(path))
        sp = importlib.util.spec_from_file_location("engine_mod_" + os.path.basename(path)[:-3], path)
        mod = importlib.util.module_from_spec(sp)
        sp.loader.exec_module(mod)
    else:
        mod = importlib.import_module(target)
    return getattr(mod, cls)()


class CmdEngine(Engine):
    """Subprocess engine speaking line-delimited JSON. The deck never crosses the pipe."""

    def __init__(self, cmdline):
        self.proc = subprocess.Popen(shlex.split(cmdline), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     text=True, bufsize=1)
        self.game = -1

    def new_game(self, seed):
        self.game += 1
        self._send({"type": "new_game", "game": self.game, "seed": seed})

    def _send(self, d):
        self.proc.stdin.write(json.dumps(d, separators=(",", ":")) + "\n")
        self.proc.stdin.flush()

    def decide(self, obs):
        self._send({"type": "decide", "state": obs.to_json_dict()})
        line = self.proc.stdout.readline()
        if not line:
            raise RuntimeError("engine process closed stdout (crashed?)")
        r = json.loads(line)
        return r.get("stay"), r["place"]

    def game_over(self, score):
        self._send({"type": "game_over", "score": score})

    def close(self):
        try:
            self._send({"type": "quit"})
            self.proc.stdin.close()
            self.proc.wait(timeout=10)
        except Exception:
            self.proc.kill()


def make_engine(spec):
    kind, _, rest = canon(spec).partition(":")
    if kind == "py":
        return load_py_engine(rest)
    if kind == "cmd":
        return CmdEngine(rest)
    raise ValueError(spec)


# ---------------------------------------------------------------- runners (return rows: idx, score, busts, perfect, ncards)
def _run_native(args):
    eng, setname, start, count, seed, spc, params = args
    cmd = [NATIVE_BIN, "play", "--engine", eng, "--shuffles", set_path(setname), "--start", str(start),
           "--count", str(count), "--seed", str(seed), "--spc", str(spc)]
    for p in params:
        cmd += ["--param", p]
    t0 = time.time()
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError("native failed: " + r.stderr)
    rows = [tuple(int(x) for x in ln.split(",")) for ln in r.stdout.splitlines()]
    cpu = float(r.stderr.strip().split("elapsed_s=")[1])
    return rows, cpu, time.time() - t0


def _run_py(args):
    spec, setname, start, count, seed, spc = args
    decks = load_set(setname)[start:start + count]
    eng = make_engine(spec)
    rows = []
    t0 = time.time()
    try:
        for k, d in enumerate(decks):
            idx = start + k
            sc, b, p, n = refsim.play(d, eng, seed=seed * 1000003 + idx, max_stays_per_card=spc)
            if hasattr(eng, "game_over"):
                eng.game_over(sc)
            rows.append((idx, sc, b, p, n))
            _pf = os.environ.get("BENCH_PROGRESS")
            if _pf:                                   # stream each finished game (survives a stopped run)
                with open(_pf, "a") as _f:
                    _f.write(f"{idx},{sc},{b},{p},{n}\n")
    finally:
        if hasattr(eng, "close"):
            eng.close()
    dt = time.time() - t0
    return rows, dt, dt


def _cache_path(spec, setname, seed, spc, limit):
    key = json.dumps([spec, hashlib.sha256(open(set_path(setname), "rb").read()).hexdigest(), seed, spc, limit])
    d = os.path.join(BENCH, "results", "cache")
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, hashlib.sha256(key.encode()).hexdigest()[:20] + ".json"), key


def run_engine(spec, setname, workers, seed=1, spc=1, params=(), limit=None, cache=False):
    """Play `spec` on the whole set. Returns dict(rows sorted by idx, wall, cpu).
    cache=True: reuse/store the per-game rows under results/cache (opt-in; only safe for deterministic engines whose
    code has not changed -- delete results/cache after changing an engine)."""
    spec = canon(spec)
    if cache:
        if limit is not None:                      # a full-set cache entry also serves a --limit prefix
            fp, _ = _cache_path(spec, setname, seed, spc, None)
            if os.path.exists(fp):
                c = json.load(open(fp))
                c["rows"] = [tuple(r) for r in c["rows"]][:limit]
                c["from_cache"] = True
                return c
        cp, key = _cache_path(spec, setname, seed, spc, limit)
        if os.path.exists(cp):
            c = json.load(open(cp))
            c["rows"] = [tuple(r) for r in c["rows"]]
            c["from_cache"] = True
            return c
        res = run_engine(spec, setname, workers, seed, spc, params, limit, cache=False)
        json.dump({"key": key, **res}, open(cp, "w"))
        return res
    kind, _, rest = spec.partition(":")
    n = len(load_set(setname)) if limit is None else limit
    nchunks = max(1, min(n, workers * 4))
    bounds = [(i * n // nchunks, (i + 1) * n // nchunks) for i in range(nchunks)]
    if kind == "native":
        ensure_native()
        tasks = [(rest, setname, a, b - a, seed, spc, params) for a, b in bounds if b > a]
        fn = _run_native
    else:
        tasks = [(spec, setname, a, b - a, seed, spc) for a, b in bounds if b > a]
        fn = _run_py
    t0 = time.time()
    if workers > 1:
        with mp.Pool(workers) as pool:
            out = pool.map(fn, tasks, chunksize=1)
    else:
        out = [fn(t) for t in tasks]
    wall = time.time() - t0
    rows = sorted(r for o in out for r in o[0])
    assert [r[0] for r in rows] == list(range(n)), "missing games"
    return {"rows": rows, "wall": wall, "cpu": sum(o[1] for o in out)}


# ---------------------------------------------------------------- statistics
def mean_se(xs):
    n = len(xs)
    m = sum(xs) / n
    sd = math.sqrt(sum((x - m) ** 2 for x in xs) / (n - 1)) if n > 1 else float("nan")
    return m, sd / math.sqrt(n) if n > 1 else float("nan"), sd


def summarize(res):
    rows = res["rows"]
    n = len(rows)
    sc = [r[1] for r in rows]
    m, se, sd = mean_se(sc)
    return {"n": n, "mean": m, "se": se, "sd": sd,
            "busts_per_game": sum(r[2] for r in rows) / n,
            "bust_game_rate": sum(1 for r in rows if r[2] > 0) / n,
            "three_bust_rate": sum(1 for r in rows if r[2] >= 3) / n,
            "perfect_rate": sum(r[3] for r in rows) / n,
            "games_per_sec_wall": n / res["wall"] if res["wall"] > 0 else float("inf"),
            "games_per_sec_per_core": n / res["cpu"] if res["cpu"] > 0 else float("inf"),
            "wall_s": res["wall"], "cpu_s": res["cpu"]}


def verdict(n, diff, se, set_name):
    if set_name in DEV_SETS:
        return "DEV SET - NOT ELIGIBLE FOR ACCEPTANCE"
    if n < 1000:
        return "REJECTED (n < 1000)"
    if se > 0 and diff > 2 * se:
        return "ACCEPTED"
    if diff <= 0:
        return "REJECTED"
    return "NOISE"


def default_workers():
    return max(1, os.cpu_count() or 1)
