"""Pure-Python reference implementation of RULES.md. See README.md for every interpretation made.
Independent of the C core (native/sim.h): the two are cross-checked by tests/test_crosscheck.py.
"""
from engine_api import Obs, normalize_action

STREAK_BONUS = {2: 250, 3: 500, 4: 1000}   # 5th and later: 2000 (assumed for 6th+)
FULL_COUNTS = (4, 4, 4, 4, 4, 4, 4, 4, 4, 16)


class IllegalAction(Exception):
    pass


def card_value(code):
    """card code 0..51 (rank = code % 13: 0=A .. 9=10, 10=J, 11=Q, 12=K) -> value 1..10"""
    return min(code % 13 + 1, 10)


def streak_bonus(k):
    """bonus for the k-th consecutive scoring card (k>=1)"""
    return 0 if k < 2 else STREAK_BONUS.get(k, 2000)


def evaluate(cards):
    """Return (best_total, hard_total). Ace = 11 unless that busts, else 1; re-evaluated for the whole column."""
    hard = sum(cards)
    return (hard + 10 if (1 in cards and hard + 10 <= 21) else hard), hard


def score_column(cards):
    """Outcome of a column that has just received its last card.
    Returns ('bust',0) | ('clear', points) | ('keep',0)"""
    total, hard = evaluate(cards)
    if hard > 21:
        return "bust", 0
    n = len(cards)
    if total == 21:
        if n == 3 and all(c == 7 for c in cards):
            return "clear", 600            # three 7s: INSTEAD of the 400
        if n == 5:
            return "clear", 1000           # 5 cards totalling 21: INSTEAD of the 800
        return "clear", 400
    if n == 5:
        return "clear", 800
    return "keep", 0


class Game:
    """Harness-side game. Owns the deck. `deck` = list of card values 1..10 (or use Game.from_codes).
    A short deck (tests only) is allowed with validate=False; the game then ends when the deck runs out."""

    def __init__(self, deck, max_stays_per_card=1, validate=True):
        deck = list(deck)
        if validate and (len(deck) != 52 or sorted(deck) != sorted(
                [v for v in range(1, 10) for _ in range(4)] + [10] * 16)):
            raise ValueError("deck must be a full 52-card deck of values")
        self._deck = deck
        self._max_spc = max_stays_per_card
        self.columns = [[], [], [], []]
        self.busts = 0
        self.stays_left = 2
        self.streak = 0
        self.score = 0
        self.pos = 0                      # index of current card
        self.over = len(deck) == 0
        self.ended_by_bust = False
        self.clears = 0
        self._remaining = [0] * 10
        for v in deck:
            self._remaining[v - 1] += 1
        if not self.over:
            self._remaining[deck[0] - 1] -= 1

    @classmethod
    def from_codes(cls, codes, **kw):
        return cls([card_value(c) for c in codes], **kw)

    @property
    def perfect(self):
        return self.over and self.busts == 0

    @property
    def final_score(self):
        """Score incl. Perfect Bonus (only meaningful once over)."""
        return self.score + (1000 if self.over and self.busts == 0 else 0)

    @property
    def cards_played(self):
        return self.pos

    def obs(self):
        if self.over:
            return None
        return Obs(tuple(tuple(c) for c in self.columns), self._deck[self.pos], tuple(self._remaining),
                   self.busts, self.stays_left, self.streak, self.score, self.pos + 1,
                   len(self._deck) - self.pos - 1)

    def step(self, stay, place):
        """Apply optional Stay(s) then place the current card. Returns points gained on this step (incl. streak bonus)."""
        if self.over:
            raise IllegalAction("game over")
        stays, place = normalize_action((stay, place))
        if len(stays) > self._max_spc or len(stays) > self.stays_left:
            raise IllegalAction(f"too many stays: {stays}")
        if not 0 <= place <= 3:
            raise IllegalAction(f"bad place {place}")
        for j in stays:
            if not 0 <= j <= 3:
                raise IllegalAction(f"invalid stay column {j}")   # Stay on an empty column is legal (wasted), as in engine.js
            self.columns[j] = []
            self.stays_left -= 1
        r = self._deck[self.pos]
        col = self.columns[place]
        col.append(r)
        kind, pts = score_column(col)
        if kind == "bust":
            self.busts += 1
            self.columns[place] = []
            self.streak = 0
            if self.busts >= 3:
                self.over = self.ended_by_bust = True
        elif kind == "clear":
            self.columns[place] = []
            self.clears += 1
            self.streak += 1
            pts += streak_bonus(self.streak)
        else:
            self.streak = 0
        self.score += pts
        self.pos += 1
        if self.pos >= len(self._deck):
            self.over = True
        elif not self.over:
            self._remaining[self._deck[self.pos] - 1] -= 1
        return pts


def play(deck_codes, engine, seed=0, max_stays_per_card=1, record=None):
    """Play one full game of `engine` on a shuffle (52 card codes). Returns (final_score, busts, perfect, ncards)."""
    g = Game.from_codes(deck_codes, max_stays_per_card=max_stays_per_card)
    engine.new_game(seed)
    while not g.over:
        o = g.obs()
        a = engine.decide(o)
        if record is not None:
            record.append((o, a))
        g.step(*_split(a))
    return g.final_score, g.busts, int(g.perfect), g.pos


def _split(a):
    stays, place = normalize_action(a)
    return (stays if stays else None), place
