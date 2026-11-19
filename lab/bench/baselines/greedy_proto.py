#!/usr/bin/env python3
"""Reference SUBPROCESS engine (line-delimited JSON over stdin/stdout). Copy this skeleton for C/C++/Rust/NN/JS engines.
Wraps GreedyPy only to show the protocol; the deck never reaches this process."""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from engine_api import Obs
from greedy_py import GreedyPy

eng = GreedyPy()
for line in sys.stdin:
    msg = json.loads(line)
    t = msg["type"]
    if t == "new_game":
        eng.new_game(msg["seed"])
    elif t == "decide":
        stay, place = eng.decide(Obs.from_json_dict(msg["state"]))
        sys.stdout.write(json.dumps({"stay": stay, "place": place}) + "\n")
        sys.stdout.flush()
    elif t == "quit":
        break
    # "game_over": nothing to do
