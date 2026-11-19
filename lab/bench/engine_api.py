"""Engine interface for the 21 Lab benchmark.

The HARNESS owns the deck. An engine only ever receives an `Obs` (immutable, freshly built per decision) and
returns an action: (stay, place). It never sees the deck order. For a hard guarantee use the subprocess protocol
(see README.md): the deck never crosses the pipe at all.

Obs fields
  columns    : tuple of 4 tuples of card values (1..10; J/Q/K = 10; Ace = 1 here, the engine does soft/hard itself)
  current    : value of the card that must be placed now (1..10)
  remaining  : tuple of 10 ints; remaining[v-1] = number of UNSEEN cards of value v (current card already removed)
  busts, stays_left, streak (consecutive scoring placements just before this card), score (without Perfect Bonus),
  cards_dealt (including the current card), cards_left (unseen cards, excluding current)

Action: (stay, place)
  stay  : None | column index 0..3 | tuple/list of column indices (only if the harness allows >1 stay per card)
          Stay empties that column (must be non-empty, and stays_left > 0) BEFORE the current card is placed.
  place : column index 0..3 (after the stay; may be the column just emptied)
"""
from typing import NamedTuple, Optional, Tuple


class Obs(NamedTuple):
    columns: Tuple[Tuple[int, ...], ...]
    current: int
    remaining: Tuple[int, ...]
    busts: int
    stays_left: int
    streak: int
    score: int
    cards_dealt: int
    cards_left: int

    def to_json_dict(self):
        return {"columns": [list(c) for c in self.columns], "current": self.current,
                "remaining": list(self.remaining), "busts": self.busts, "stays_left": self.stays_left,
                "streak": self.streak, "score": self.score, "cards_dealt": self.cards_dealt,
                "cards_left": self.cards_left}

    @staticmethod
    def from_json_dict(d):
        return Obs(tuple(tuple(c) for c in d["columns"]), d["current"], tuple(d["remaining"]), d["busts"],
                   d["stays_left"], d["streak"], d["score"], d["cards_dealt"], d["cards_left"])


class Engine:
    """Subclass and implement decide(). new_game(seed) is called before each game; stochastic engines MUST
    derive all randomness from `seed` (so the future-order audit can replay them)."""
    name = "engine"

    def new_game(self, seed: int) -> None:
        pass

    def decide(self, obs: Obs):
        raise NotImplementedError


def normalize_action(act):
    """Accept (stay, place) | {"stay":..,"place":..}; return (tuple_of_stays, place)."""
    if isinstance(act, dict):
        stay, place = act.get("stay"), act["place"]
    else:
        stay, place = act
    if stay is None:
        stays = ()
    elif isinstance(stay, (list, tuple)):
        stays = tuple(int(x) for x in stay)
    else:
        stays = (int(stay),)
    return stays, int(place)
