"""Scoring parity with the champion's engine.js (read-only): exhaustive single-column outcome table (44,640 card
sequences) + replay of identical shuffles/action sequences. Skipped if node or engine/ is missing."""
import json, os, shutil, subprocess, sys, tempfile, unittest
BENCH = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BENCH)
import refsim, harness as H
ENGINE = os.path.join(os.path.dirname(BENCH), "engine", "twentyone-solver", "src", "engine.js")
PAR = os.path.join(BENCH, "champion", "parity.js")
ok = shutil.which("node") and os.path.exists(ENGINE)

@unittest.skipUnless(ok, "node or engine/twentyone-solver missing")
class TestEngineJsParity(unittest.TestCase):
    def test_exhaustive_column_table(self):
        js = json.loads(subprocess.run(["node", PAR, "columns"], capture_output=True, text=True, check=True).stdout)
        out = {}
        def dfs(seq):
            for v in range(1, 11):
                s = seq + [v]; k, p = refsim.score_column(s)
                out[",".join(map(str, s))] = f"{k}:{p}"
                if k == "keep": dfs(s)
        dfs([])
        self.assertEqual(len(js), len(out))
        self.assertEqual(js, out)
    def test_replay_native_traces_through_enginejs(self):
        H.ensure_native()
        with tempfile.TemporaryDirectory() as d:
            for eng in ("random", "greedy", "expect1"):
                tf = os.path.join(d, eng + ".txt")
                subprocess.run([H.NATIVE_BIN, "play", "--engine", eng, "--shuffles", H.set_path("set1000"), "--seed", "7",
                                "--trace", tf], capture_output=True, check=True)
                r = subprocess.run(["node", PAR, "replay", H.set_path("set1000"), tf], capture_output=True, text=True)
                self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

if __name__ == "__main__":
    unittest.main()
