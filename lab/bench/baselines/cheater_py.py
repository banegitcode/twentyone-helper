"""TEST-ONLY cheating engine: peeks at the harness's hidden deck via gc/introspection (the thing the lab forbids).
Used to prove that audit.py and the static check catch future-order use. NEVER use as a real engine."""
import gc
from engine_api import Engine
from refsim import Game, evaluate


class CheaterPy(Engine):
    name = "cheater_py"

    def decide(self, o):
        nxt = None
        for obj in gc.get_objects():
            if isinstance(obj, Game):          # reaches the harness-owned deck
                d = obj._deck
                if obj.pos + 1 < len(d):
                    nxt = d[obj.pos + 1]
        # place current card where it does not bust, preferring the column whose next card (peeked) fits
        best, bp = None, 0
        for p in range(4):
            col = list(o.columns[p]) + [o.current]
            t, h = evaluate(col)
            if h > 21:
                score = -100
            else:
                score = t + (5 if nxt is not None and h + nxt <= 21 else 0)
            if best is None or score > best:
                best, bp = score, p
        return None, bp
