"""Pure-Python port of native greedy (integer arithmetic, identical tie-breaking). Used to prove that the
in-process API, the JSON subprocess protocol and the native core all agree (per-game scores must match exactly)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from engine_api import Engine
from refsim import score_column, evaluate, streak_bonus


def _place(cols, streak, busts, j, r):
    """simulate placing r in column j (cols = list of lists, copied). returns (pts, bust, dead, newcol_cards)"""
    c = cols[j] + [r]
    kind, pts = score_column(c)
    if kind == "bust":
        return 0, 1, int(busts + 1 >= 3), []
    if kind == "clear":
        return pts + streak_bonus(streak + 1), 0, 0, []
    return 0, 0, 0, c


def _key(cols, streak, busts, j, r, cost):
    pts, b, dead, newc = _place(cols, streak, busts, j, r)
    v = pts - (600 if b else 0) - (2500 if dead else 0) - cost
    tb = 0 if not newc else -evaluate(newc)[0]
    return v * 1000 + tb, v


class GreedyPy(Engine):
    name = "greedy_py"

    def decide(self, o):
        cols = [list(c) for c in o.columns]
        best, bestv, bp = -10 ** 9, 0, 0
        for p in range(4):
            k, v = _key(cols, o.streak, o.busts, p, o.current, 0)
            if k > best:
                best, bestv, bp = k, v, p
        if bestv >= 0 or o.stays_left <= 0:
            return None, bp
        stay = None
        for j in range(4):
            if cols[j]:
                for p in range(4):
                    c2 = [list(c) for c in cols]
                    c2[j] = []
                    k, v = _key(c2, o.streak, o.busts, p, o.current, 100)
                    if k > best:
                        best, stay, bp = k, j, p
        return stay, bp
