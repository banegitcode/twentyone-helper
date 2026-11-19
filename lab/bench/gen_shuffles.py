#!/usr/bin/env python3
"""Generate the fixed shuffle sets deterministically (pure integer arithmetic, no library RNG => stable across
Python/numpy versions). One shuffle per line = 52 card codes 0..51 (code//13 = suit, code%13 = rank: 0=A,1=2..9=10,10=J,11=Q,12=K),
in DEAL ORDER (first number is the first card dealt).

Algorithm: splitmix64 stream seeded with SEED; for each game, Fisher-Yates from i=51 down to 1 with
j = ((next64 >> 32) * (i+1)) >> 32 over the identity deck [0..51].

Seeds (documented, never change):  set1000: 2101000 (1000 games)   set5000: 2105000 (5000 games)
                                   dev200 : 2100200 (200 games)  -- DEV ONLY, never used for acceptance
Run:  python3 gen_shuffles.py            (writes shuffles/*.txt and MANIFEST.sha256; refuses to overwrite a different file)
"""
import hashlib, os, sys
M = (1 << 64) - 1
SETS = {"set1000": (2101000, 1000), "set5000": (2105000, 5000), "dev200": (2100200, 200)}

def gen(seed, n):
    x = seed & M
    def nxt():
        nonlocal x
        x = (x + 0x9E3779B97F4A7C15) & M
        z = x
        z = ((z ^ (z >> 30)) * 0xBF58476D1CE4E5B9) & M
        z = ((z ^ (z >> 27)) * 0x94D049BB133111EB) & M
        return z ^ (z >> 31)
    for _ in range(n):
        d = list(range(52))
        for i in range(51, 0, -1):
            j = ((nxt() >> 32) * (i + 1)) >> 32
            d[i], d[j] = d[j], d[i]
        yield d

def main():
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shuffles")
    os.makedirs(here, exist_ok=True)
    man = []
    for name, (seed, n) in SETS.items():
        text = "".join(" ".join(map(str, d)) + "\n" for d in gen(seed, n))
        p = os.path.join(here, name + ".txt")
        if os.path.exists(p) and open(p).read() != text:
            sys.exit(f"REFUSING: {p} exists and differs from the documented generation")
        if not os.path.exists(p):
            open(p, "w").write(text)
        man.append(f"{hashlib.sha256(text.encode()).hexdigest()}  {name}.txt")
    mp = os.path.join(here, "MANIFEST.sha256")
    mtxt = "\n".join(man) + "\n"
    if os.path.exists(mp):
        if open(mp).read() != mtxt:
            sys.exit("REFUSING: MANIFEST.sha256 differs from the documented generation")
    else:
        open(mp, "w").write(mtxt)
    print("\n".join(man))

if __name__ == "__main__":
    main()
