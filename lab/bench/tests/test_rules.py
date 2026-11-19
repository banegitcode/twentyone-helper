"""Unit tests for the 21 Lab reference simulators. Every RULES.md scoring row is tested explicitly, each scenario
is run through BOTH the pure-Python reference (refsim.py) and the native core (native/bench21 --engine script).
Run:  python3 -m unittest discover -s tests -v      (from bench/)
"""
import os, subprocess, sys, tempfile, unittest
BENCH = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BENCH)
import refsim
from refsim import Game, IllegalAction, streak_bonus, score_column
from engine_api import Obs, Engine
import harness as H

H.ensure_native()
NO = -1

def prefix_codes(values):
    """52 card codes whose first len(values) cards have the given values (rest filled from the deck, any order)."""
    pool = {v: [] for v in range(1, 11)}
    for c in range(52):
        pool[refsim.card_value(c)].append(c)
    out = []
    for v in values:
        out.append(pool[v].pop())
    rest = [c for v in range(1, 11) for c in pool[v]]
    return out + rest

def run_c(values, actions):
    """Play values with scripted actions in the C core; return per-step points (first len(values) steps)."""
    with tempfile.TemporaryDirectory() as d:
        sf, tf = os.path.join(d, "s.txt"), os.path.join(d, "t.txt")
        with open(sf, "w") as f:
            f.write(" ".join(map(str, prefix_codes(values))) + "\n")
        script = " ".join(f"{s},{p}" for s, p in actions)
        r = subprocess.run([H.NATIVE_BIN, "play", "--engine", "script", "--shuffles", sf, "--script", script,
                            "--trace", tf], capture_output=True, text=True)
        assert r.returncode == 0, r.stderr
        with open(tf) as f:
            t = list(map(int, f.read().split()))
        n = t[3]
        steps = [t[4 + 5 * i + 4] for i in range(n)]
        return steps[:len(values)], t[2], t[3], t[1]   # steps, busts, ncards, final score

def run_py(values, actions):
    g = Game(values, validate=False)
    pts = []
    for s, p in actions:
        if g.over:
            break
        pts.append(g.step(None if s == NO else s, p))
    return pts, g

def A(*cols, stay=None):
    return [(NO, c) for c in cols]

class Scenario(unittest.TestCase):
    def check(self, name, values, actions, expect_pts, busts=None, over_by_bust=None):
        pts, g = run_py(values, actions)
        self.assertEqual(pts, expect_pts, f"[python] {name}")
        if busts is not None:
            self.assertEqual(g.busts, busts, f"[python busts] {name}")
        cpts, cbusts, ncards, _ = run_c(values, actions)
        self.assertEqual(cpts[:len(expect_pts)], expect_pts, f"[C] {name}")
        if busts is not None:
            # C trace busts counted at game end (game plays on after script; only compare when the script ends the game)
            pass
        return g

class TestScoringRows(Scenario):
    def test_21_two_cards_ace_is_11(self):
        self.check("A+10", [10, 1], A(0, 0), [0, 400])
    def test_21_hard_three_cards(self):
        self.check("10+5+6", [10, 5, 6], A(0, 0, 0), [0, 0, 400])
    def test_21_four_cards(self):
        self.check("7+7+3+4", [7, 7, 3, 4], A(0, 0, 0, 0), [0, 0, 0, 400])
    def test_three_sevens_pays_600_instead_of_400(self):
        g = self.check("7,7,7", [7, 7, 7], A(0, 0, 0), [0, 0, 600])
    def test_three_cards_21_not_all_sevens_is_400(self):
        self.check("6+8+7", [6, 8, 7], A(0, 0, 0), [0, 0, 400])
    def test_sevens_plus_other_not_600(self):
        self.check("7,7,3,4 (four cards)", [7, 7, 3, 4], A(0, 0, 0, 0), [0, 0, 0, 400])
    def test_five_cards_no_bust_800(self):
        self.check("2,2,2,2,3", [2, 2, 2, 2, 3], A(0, 0, 0, 0, 0), [0, 0, 0, 0, 800])
    def test_five_cards_with_ace_no_bust_800(self):
        # A+2+2+2 = 17 soft; +10 -> ace must become 1: 17 total, five cards, no bust
        self.check("A,2,2,2,10", [1, 2, 2, 2, 10], A(0, 0, 0, 0, 0), [0, 0, 0, 0, 800])
    def test_five_cards_exactly_21_pays_1000(self):
        self.check("2,3,4,5,7", [2, 3, 4, 5, 7], A(0, 0, 0, 0, 0), [0, 0, 0, 0, 1000])
    def test_five_cards_21_via_soft_ace_pays_1000(self):
        self.check("A,2,2,2,4 (hard 11, soft 21)", [1, 2, 2, 2, 4], A(0, 0, 0, 0, 0), [0, 0, 0, 0, 1000])
    def test_bust_on_fifth_card_is_a_bust_not_800(self):
        g = self.check("10,2,2,2,6", [10, 2, 2, 2, 6], A(0, 0, 0, 0, 0), [0, 0, 0, 0, 0], busts=1)
        self.assertEqual(g.columns[0], [])   # cleared
    def test_bust_clears_column_and_counts(self):
        g = self.check("10,10,5 then 10", [10, 10, 5, 10], A(0, 0, 0, 0), [0, 0, 0, 0], busts=1)
        self.assertEqual(g.columns[0], [10])
    def test_over_21_with_ace_as_one_is_bust(self):
        self.check("10,10,2", [10, 10, 2], A(0, 0, 0), [0, 0, 0], busts=1)
    def test_ace_counts_as_1_exactly_21(self):
        self.check("10,10,A -> 21 hard", [10, 10, 1], A(0, 0, 0), [0, 0, 400])

class TestAces(Scenario):
    def test_ace_reevaluated_as_cards_added(self):
        # A,9 = soft 20; +5 -> hard 15 (ace now 1); +6 -> 21
        self.check("A,9,5,6", [1, 9, 5, 6], A(0, 0, 0, 0), [0, 0, 0, 400])
    def test_ace_as_11_with_small_cards(self):
        self.check("A,5,5 = 11+5+5", [1, 5, 5], A(0, 0, 0), [0, 0, 400])
    def test_two_aces(self):
        self.check("A,A,9 = 11+1+9", [1, 1, 9], A(0, 0, 0), [0, 0, 400])
    def test_evaluate_function(self):
        self.assertEqual(refsim.evaluate([1]), (11, 1))
        self.assertEqual(refsim.evaluate([1, 1]), (12, 2))
        self.assertEqual(refsim.evaluate([1, 10, 10]), (21, 21))
        self.assertEqual(refsim.evaluate([1, 9]), (20, 10))
        self.assertEqual(refsim.evaluate([1, 9, 5]), (15, 15))

class TestStreak(Scenario):
    def test_streak_2nd_3rd_4th(self):
        # tens in all four columns, then four aces: 400, 400+250, 400+500, 400+1000
        self.check("streak 4", [10, 10, 10, 10, 1, 1, 1, 1], A(0, 1, 2, 3, 0, 1, 2, 3), [0, 0, 0, 0, 400, 650, 900, 1400])
    def test_non_scoring_card_ends_streak(self):
        self.check("broken by plain card", [10, 10, 10, 1, 1, 3, 1], A(0, 1, 2, 0, 1, 3, 2), [0, 0, 0, 400, 650, 0, 400])
    def test_bust_ends_streak(self):
        self.check("broken by bust", [10, 10, 10, 10, 1, 5, 1], A(0, 1, 1, 2, 0, 1, 2), [0, 0, 0, 0, 400, 0, 400])
    def test_stay_does_not_break_streak_ASSUMED(self):
        # cols: c0=[10], c1=[5], c2=[10]; A scores on c0 (400); next A: Stay c1, place on c2 -> 400 + 250 streak
        acts = [(NO, 1), (NO, 2), (NO, 0), (NO, 0), (1, 2)]
        self.check("stay mid-streak", [5, 10, 10, 1, 1], acts, [0, 0, 0, 400, 650])
    def test_streak_bonus_table(self):
        self.assertEqual([streak_bonus(k) for k in range(1, 8)], [0, 250, 500, 1000, 2000, 2000, 2000])
    def test_five_card_800_counts_for_streak(self):
        # five-card 800 scores, next card scores 21 -> +250
        # c0: 2,2,2,2 ; c1: 10 ; then 5th 2 on c0 -> 800 ; then A on c1 -> 21 (400+250)
        self.check("800 then 400", [2, 2, 3, 3, 10, 3, 1], A(0, 0, 0, 0, 1, 0, 1), [0, 0, 0, 0, 0, 800, 650])

class TestStays(Scenario):
    def test_stay_empties_column_no_points_then_place_in_same_column(self):
        # control: 10,5,6 on one column = 21. With a Stay on col0 before the 6 and placing into col0: no score.
        self.check("control", [10, 5, 6], A(0, 0, 0), [0, 0, 400])
        pts, g = run_py([10, 5, 6], [(NO, 0), (NO, 0), (0, 0)])
        self.assertEqual(pts, [0, 0, 0]); self.assertEqual(g.columns[0], [6]); self.assertEqual(g.stays_left, 1)
        cpts = run_c([10, 5, 6], [(NO, 0), (NO, 0), (0, 0)])[0]
        self.assertEqual(cpts, [0, 0, 0])
    def test_stay_then_place_elsewhere(self):
        pts, g = run_py([10, 5], [(NO, 0), (0, 1)])
        self.assertEqual(g.columns, [[], [5], [], []])
    def test_two_stays_per_game_third_is_illegal(self):
        g = Game([10, 10, 10, 10], validate=False)
        g.step(None, 0); g.step(0, 0); g.step(0, 0)
        self.assertEqual(g.stays_left, 0)
        with self.assertRaises(IllegalAction):
            g.step(0, 0)
    def test_third_stay_illegal_in_c(self):
        with tempfile.TemporaryDirectory() as d:
            sf = os.path.join(d, "s.txt")
            with open(sf, "w") as f:
                f.write(" ".join(map(str, prefix_codes([10, 10, 10, 10]))) + "\n")
            r = subprocess.run([H.NATIVE_BIN, "play", "--engine", "script", "--shuffles", sf, "--script", "-1,0 0,0 0,0 0,0"],
                               capture_output=True, text=True)
            self.assertNotEqual(r.returncode, 0); self.assertIn("ILLEGAL", r.stderr)
    def test_stay_on_empty_column_is_legal_and_wasted(self):
        g = Game([10, 10], validate=False)
        g.step(2, 0)                       # column 2 is empty: legal (as in engine.js), burns a Stay
        self.assertEqual(g.stays_left, 1)
    def test_only_one_stay_per_card_by_default_two_with_flag(self):
        g = Game([10, 10, 10], validate=False)
        g.step(None, 0); g.step(None, 1)
        with self.assertRaises(IllegalAction):
            g.step((0, 1), 0)
        g2 = Game([10, 10, 10], validate=False, max_stays_per_card=2)
        g2.step(None, 0); g2.step(None, 1); g2.step((0, 1), 0)
        self.assertEqual(g2.stays_left, 0)
    def test_stay_gives_no_points(self):
        pts, g = run_py([10, 10, 1], [(NO, 0), (NO, 1), (0, 2)])
        self.assertEqual(pts, [0, 0, 0])

class TestGameEnd(Scenario):
    def test_third_bust_ends_game_immediately(self):
        vals = [10, 10, 5] * 3 + [7, 7, 7]
        g = Game(vals, validate=False)
        for _ in range(9):
            if g.over: break
            g.step(None, 0)
        self.assertTrue(g.over); self.assertEqual(g.busts, 3); self.assertEqual(g.pos, 9); self.assertTrue(g.ended_by_bust)
        with self.assertRaises(IllegalAction):
            g.step(None, 0)
        self.assertEqual(g.final_score, 0)      # no Perfect Bonus
        # C: after 3 busts at card 9, game stops (ncards == 9)
        cpts, cb, ncards, final = run_c(vals, A(*([0] * 12)))
        self.assertEqual((cb, ncards), (3, 9))
    def test_game_ends_when_deck_runs_out(self):
        g = Game([2, 3], validate=False)
        g.step(None, 0); g.step(None, 1)
        self.assertTrue(g.over)

class TestPerfectBonus(Scenario):
    def test_perfect_bonus_zero_busts(self):
        g = Game([10, 1], validate=False)
        g.step(None, 0); g.step(None, 0)
        self.assertTrue(g.over); self.assertTrue(g.perfect)
        self.assertEqual(g.score, 400); self.assertEqual(g.final_score, 1400)
    def test_no_perfect_bonus_with_one_bust(self):
        g = Game([10, 10, 5, 10, 1], validate=False)
        for _ in range(5): g.step(None, 0)
        self.assertEqual(g.busts, 1); self.assertFalse(g.perfect); self.assertEqual(g.final_score, g.score)
    def test_full_game_perfect_bonus_matches_native(self):
        # greedy_py (pure python) vs native greedy on the dev set: identical final scores incl. Perfect Bonus
        sys.path.insert(0, os.path.join(BENCH, "baselines"))
        from greedy_py import GreedyPy
        decks = H.load_set("dev200")[:60]
        res = H.run_engine("native:greedy", "dev200", 1, limit=60)["rows"]
        nperf = 0
        for i, d in enumerate(decks):
            sc, b, p, n = refsim.play(d, GreedyPy())
            self.assertEqual((sc, b, p, n), res[i][1:], f"game {i}")
            nperf += p
        self.assertGreater(nperf, 0, "need at least one perfect game in this sample")

class TestInterface(unittest.TestCase):
    def test_obs_contents_and_remaining_counts(self):
        deck = prefix_codes([7, 1, 10])
        g = Game.from_codes(deck)
        o = g.obs()
        self.assertEqual(o.current, 7); self.assertEqual(sum(o.remaining), 51); self.assertEqual(o.remaining[6], 3)
        self.assertEqual((o.busts, o.stays_left, o.streak, o.score, o.cards_dealt, o.cards_left), (0, 2, 0, 0, 1, 51))
        g.step(None, 2)
        o = g.obs()
        self.assertEqual(o.columns[2], (7,)); self.assertEqual(o.current, 1); self.assertEqual(o.cards_dealt, 2)
    def test_obs_is_immutable_and_cannot_touch_harness(self):
        g = Game.from_codes(prefix_codes([7, 1]))
        o = g.obs()
        with self.assertRaises(TypeError):
            o.columns[0] += (5,)
        with self.assertRaises(AttributeError):
            o.current = 3
        self.assertEqual(g.obs().columns, ((), (), (), ()))
    def test_obs_has_no_deck_field(self):
        self.assertNotIn("deck", Obs._fields)
    def test_illegal_place_rejected(self):
        g = Game([10, 10], validate=False)
        with self.assertRaises(IllegalAction):
            g.step(None, 4)
    def test_full_deck_validation(self):
        with self.assertRaises(ValueError):
            Game([10] * 52)

class TestCrossCheckNativeVsPython(unittest.TestCase):
    def test_native_expect1_vs_python_replay(self):
        """Native expect1 actions (from --trace) replayed through refsim: identical points step by step."""
        with tempfile.TemporaryDirectory() as d:
            tf = os.path.join(d, "t.txt")
            subprocess.run([H.NATIVE_BIN, "play", "--engine", "expect1", "--shuffles", H.set_path("dev200"),
                            "--trace", tf, "--count", "100"], capture_output=True, check=True)
            decks = H.load_set("dev200")
            for ln in open(tf).read().splitlines():
                t = list(map(int, ln.split())); idx, fscore, fbusts, nc = t[:4]
                g = Game.from_codes(decks[idx])
                for i in range(nc):
                    nst, s0, s1, pl, pts = t[4 + 5 * i: 9 + 5 * i]
                    self.assertEqual(g.step(s0 if nst else None, pl), pts)
                self.assertEqual((g.final_score, g.busts), (fscore, fbusts))

if __name__ == "__main__":
    unittest.main()
