// 21 Lab reference game core (native). Implements /workspace/21lab/RULES.md directly
// (explicit hard/soft arithmetic, NOT table-driven, so it is an independent check on other simulators).
// See bench/README.md for every interpretation made.
#ifndef SIM21_H
#define SIM21_H
#include <stdint.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

typedef struct { int8_t n, hard, ace, all7; } Col;  // n cards, hard sum (aces=1), has ace, every card is a 7
typedef struct {
  Col c[4];
  int busts, stays, streak, score;   // streak = consecutive scoring placements immediately before the current card
  int8_t cnt[11];                    // remaining (unseen, EXCLUDING current) cards per rank value 1..10 (10 = T/J/Q/K)
  int left;                          // cards left in deck, excluding current
  int dealt;                         // cards dealt so far INCLUDING current
  int cur;                           // current card value 1..10
  int dead;                          // 3rd bust happened
} St;
typedef struct { int8_t nstay; int8_t stay[2]; int8_t place; } Act;

static inline int col_soft(const Col*c){ return (c->ace && c->hard + 10 <= 21) ? c->hard + 10 : c->hard; }
static inline int streak_bonus(int k){ /* k = index of this scoring card in the run (1-based) */
  return k < 2 ? 0 : k == 2 ? 250 : k == 3 ? 500 : k == 4 ? 1000 : 2000; }

static void st_init(St*s){
  memset(s, 0, sizeof *s); s->stays = 2;
  for (int v = 1; v <= 10; v++) s->cnt[v] = (v == 10) ? 16 : 4;
  s->left = 52;
}
static inline int card_value(int code){ int r = code % 13 + 1; return r > 10 ? 10 : r; }  // code 0..51; rank0 0=A,..,12=K

// Place card r in column j. Returns points gained (incl. streak bonus). Sets *bust=1 on bust. Updates streak/busts/dead/score.
// Does NOT touch cnt/left/dealt/cur (the harness does).
static inline int st_place(St*s, int j, int r, int*bust){
  Col*c = &s->c[j]; *bust = 0;
  c->all7 = (c->n == 0) ? (r == 7) : (c->all7 && r == 7);
  c->n++; c->hard += r; if (r == 1) c->ace = 1;
  int pts = 0, scored = 0;
  if (c->hard > 21) {                      // bust (even with every ace as 1)
    *bust = 1; s->busts++; if (s->busts >= 3) s->dead = 1;
    memset(c, 0, sizeof *c);
  } else {
    int soft = col_soft(c);
    if (soft == 21) { pts = (c->n == 3 && c->all7) ? 600 : (c->n == 5 ? 1000 : 400); scored = 1; }
    else if (c->n == 5) { pts = 800; scored = 1; }
    if (scored) memset(c, 0, sizeof *c);
  }
  if (scored) { s->streak++; pts += streak_bonus(s->streak); } else s->streak = 0;
  s->score += pts; return pts;
}
static inline int st_stay(St*s, int j){            // returns 0 if illegal
  if (s->stays <= 0 || j < 0 || j > 3) return 0;   // Stay on an EMPTY column is legal (wastes the Stay), as in engine.js
  memset(&s->c[j], 0, sizeof(Col)); s->stays--; return 1;
}

// splitmix64
static inline uint64_t sm64(uint64_t*x){ uint64_t z = (*x += 0x9E3779B97F4A7C15ULL);
  z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL; z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL; return z ^ (z >> 31); }
static inline uint32_t sm_below(uint64_t*x, uint32_t n){ return (uint32_t)(((sm64(x) >> 32) * (uint64_t)n) >> 32); }

// Engine callback: given observable state (a private COPY), return an action.
typedef void (*EngineFn)(const St*obs, Act*out, void*ctx);

typedef struct { int score, busts, perfect, ncards; } GameResult;

// Play one game on a deck of 52 card codes. max_spc = max stays per card (default 1).
// trace (optional): array of 52 Act filled with the chosen actions; per-step points optional.
static int play_game(const int*deck_codes, EngineFn fn, void*ctx, int max_spc, GameResult*res, Act*trace, int*steppts){
  St s; st_init(&s);
  
  int i;
  for (i = 0; i < 52; i++) {
    int r = card_value(deck_codes[i]);
    s.cur = r; s.cnt[r]--; s.left = 51 - i; s.dealt = i + 1;
    St obs = s; Act a; memset(&a, 0, sizeof a); a.place = -1;
    fn(&obs, &a, ctx);
    if (trace) trace[i] = a;
    if (a.nstay < 0 || a.nstay > max_spc || a.nstay > 2 || a.place < 0 || a.place > 3) {
      fprintf(stderr, "ILLEGAL action at card %d (nstay=%d place=%d)\n", i, a.nstay, a.place); return -1; }
    int before = s.score;
    for (int k = 0; k < a.nstay; k++) if (!st_stay(&s, a.stay[k])) {
      fprintf(stderr, "ILLEGAL stay col %d at card %d\n", a.stay[k], i); return -1; }
    int b; st_place(&s, a.place, r, &b);
    if (steppts) steppts[i] = s.score - before;
    if (s.dead) { i++; break; }
  }
  res->ncards = i; res->busts = s.busts; res->perfect = (s.busts == 0);
  if (s.busts == 0) s.score += 1000;
  res->score = s.score;
  return 0;
}
#endif
