// Native baseline engines (VALIDATION ONLY). They see only the observable state `St` (a copy).
#ifndef ENGINES21_H
#define ENGINES21_H
#include "sim.h"

// tuning knobs (set from CLI --param i=v). Defaults are the frozen baseline definition.
static double P[8] = { 300.0 /*bust pen*/, 2500.0 /*3rd-bust pen*/, 15, 40, 100, 250 /*V[1..4]*/, 0, 0 }  /* frozen after a coarse look at the dev set only */;

// ---- random-legal: uniform over all legal (optional stay of a non-empty column) x (placement column) actions
typedef struct { uint64_t rng; } RandCtx;
static void eng_random(const St*s, Act*out, void*vctx){
  RandCtx*c = (RandCtx*)vctx;
  Act acts[20]; int n = 0;
  for (int p = 0; p < 4; p++) { acts[n].nstay = 0; acts[n].place = p; n++; }
  if (s->stays > 0) for (int j = 0; j < 4; j++) if (s->c[j].n > 0) for (int p = 0; p < 4; p++) {
    acts[n].nstay = 1; acts[n].stay[0] = j; acts[n].place = p; n++; }
  *out = acts[sm_below(&c->rng, n)];
}

// ---- greedy: maximise immediate points (bust -600, third bust -2500), tiny tie-break; stay only if every
//      no-stay option is negative (a bust) and a stay (cost 100) gives a strictly better result.
static void eng_greedy(const St*s, Act*out, void*ctx){
  (void)ctx;
  long best = -1000000000L, bestv = 0; int bp = 0;
  for (int p = 0; p < 4; p++) {
    St t = *s; int b; int pts = st_place(&t, p, s->cur, &b);
    long v = pts - (b ? 600 : 0) - (t.dead ? 2500 : 0);
    int tb = (t.c[p].n == 0) ? 0 : -col_soft(&t.c[p]);   // prefer to keep totals low (spread)
    long key = v * 1000 + tb;
    if (key > best) { best = key; bestv = v; bp = p; }
  }
  out->nstay = 0; out->place = bp;
  if (bestv >= 0 || s->stays <= 0) return;
  for (int j = 0; j < 4; j++) if (s->c[j].n > 0) for (int p = 0; p < 4; p++) {
    St t = *s; st_stay(&t, j); int b; int pts = st_place(&t, p, s->cur, &b);
    long v = pts - (b ? 600 : 0) - (t.dead ? 2500 : 0) - 100;
    int tb = (t.c[p].n == 0) ? 0 : -col_soft(&t.c[p]);
    long key = v * 1000 + tb;
    if (key > best) { best = key; out->nstay = 1; out->stay[0] = j; out->place = p; }
  }
}

// ---- expect1: 1-ply expectimax with simple heuristic. For each legal action a (optional stay x placement):
//   Q(a) = pts(a) - bustpen  +  E_{r ~ remaining multiset} [ max_{p2} ( pts(r,p2) - bustpen + H(columns after) ) ]
//   H(cols) = sum over non-empty columns V[n] * P(next card does not bust it), V = {15,40,100,250} (n=1..4); bustpen=300, 3rd-bust extra pen 2500.
//   The inner max uses placements only (no Stay) to stay cheap. Ties -> first in order (no-stay, col 0..3).
static double leafH(const St*s){
  double h = 0;
  for (int j = 0; j < 4; j++) { const Col*c = &s->c[j]; if (!c->n) continue;
    int safe = 0; for (int r = 1; r <= 10; r++) if (c->hard + r <= 21) safe += s->cnt[r];
    double ps = s->left > 0 ? (double)safe / s->left : 1.0;
    h += P[1 + c->n] * ps; }
  return h;
}
static void eng_expect1(const St*s, Act*out, void*ctx){
  (void)ctx;
  double bestq = -1e18; Act ba; memset(&ba, 0, sizeof ba);
  int nopt = 1 + ((s->stays > 0) ? 4 : 0);
  for (int o = 0; o < nopt; o++) {
    int sj = o - 1;                           // -1 = no stay
    if (sj >= 0 && s->c[sj].n == 0) continue;
    for (int p = 0; p < 4; p++) {
      St t = *s; if (sj >= 0) st_stay(&t, sj);
      int b; int pts = st_place(&t, p, s->cur, &b);
      double q = pts - (b ? P[0] : 0) - (t.dead ? P[1] : 0);
      if (!t.dead && s->left > 0) {
        double e = 0;
        for (int r = 1; r <= 10; r++) if (t.cnt[r] > 0) {
          double w = (double)t.cnt[r] / t.left, bq = -1e18;
          for (int p2 = 0; p2 < 4; p2++) {
            St u = t; u.cnt[r]--; u.left--;
            int b2; int pts2 = st_place(&u, p2, r, &b2);
            double v = pts2 - (b2 ? P[0] : 0) - (u.dead ? P[1] : 0) + (u.dead ? 0 : leafH(&u));
            if (v > bq) bq = v;
          }
          e += w * bq;
        }
        q += e;
      }
      if (q > bestq + 1e-9) { bestq = q; ba.nstay = (sj >= 0); ba.stay[0] = sj; ba.place = p; }
    }
  }
  *out = ba;
}

// ---- script: replays a fixed action list (for unit tests of the rules core). "s,p s,p ..." s=-1 no stay; after the
//      list ends: place in column 0 without Stay.
typedef struct { int n; int8_t s[64], p[64]; int i; } ScriptCtx;
static void eng_script(const St*st, Act*out, void*vctx){
  (void)st; ScriptCtx*c = (ScriptCtx*)vctx;
  if (c->i < c->n) { out->nstay = c->s[c->i] >= 0; out->stay[0] = c->s[c->i]; out->place = c->p[c->i]; c->i++; }
  else { out->nstay = 0; out->place = 0; }
}
#endif
