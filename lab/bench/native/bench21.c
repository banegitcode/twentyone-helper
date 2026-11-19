#define _POSIX_C_SOURCE 200809L
// bench21: native hot loop for the 21 Lab benchmark.
//   bench21 play --engine random|greedy|expect1 --shuffles FILE [--start S] [--count N] [--seed X] [--spc 1|2]
//                [--trace FILE] [--param i=v]
// stdout: one CSV line per game:  idx,score,busts,perfect,ncards     stderr: "# elapsed_s=..." (engine+sim only)
#include "sim.h"
#include "engines.h"
#include <time.h>

static int load_deck(FILE*f, int*deck){
  for (int i = 0; i < 52; i++) if (fscanf(f, "%d", &deck[i]) != 1) return 0;
  return 1;
}
int main(int argc, char**argv){
  const char*script = NULL, *eng = "greedy", *shf = NULL, *tracef = NULL; long start = 0, count = -1; uint64_t seed = 1; int spc = 1;
  for (int i = 2; i < argc; i++) {
    if (!strcmp(argv[i], "--engine")) eng = argv[++i];
    else if (!strcmp(argv[i], "--shuffles")) shf = argv[++i];
    else if (!strcmp(argv[i], "--start")) start = atol(argv[++i]);
    else if (!strcmp(argv[i], "--count")) count = atol(argv[++i]);
    else if (!strcmp(argv[i], "--seed")) seed = strtoull(argv[++i], 0, 10);
    else if (!strcmp(argv[i], "--spc")) spc = atoi(argv[++i]);
    else if (!strcmp(argv[i], "--script")) script = argv[++i];
    else if (!strcmp(argv[i], "--trace")) tracef = argv[++i];
    else if (!strcmp(argv[i], "--param")) { int k; double v; if (sscanf(argv[++i], "%d=%lf", &k, &v) == 2 && k >= 0 && k < 8) P[k] = v; }
    else { fprintf(stderr, "unknown arg %s\n", argv[i]); return 2; }
  }
  if (argc < 2 || strcmp(argv[1], "play") || !shf) { fprintf(stderr, "usage: bench21 play --engine E --shuffles F ...\n"); return 2; }
  EngineFn fn; if (!strcmp(eng, "random")) fn = eng_random; else if (!strcmp(eng, "greedy")) fn = eng_greedy;
  else if (!strcmp(eng, "expect1")) fn = eng_expect1; else if (!strcmp(eng, "script")) fn = eng_script; else { fprintf(stderr, "unknown engine %s\n", eng); return 2; }
  FILE*f = fopen(shf, "r"); if (!f) { perror("shuffles"); return 2; }
  FILE*tf = tracef ? fopen(tracef, "w") : NULL;
  int deck[52]; void*rc_ptr; long idx = 0; struct timespec t0, t1; double tot = 0;
  while (load_deck(f, deck)) {
    if (idx >= start && (count < 0 || idx < start + count)) {
      RandCtx rc; rc.rng = seed * 0x9E3779B97F4A7C15ULL ^ ((uint64_t)(idx + 1) * 0xD1B54A32D192ED03ULL); sm64(&rc.rng);
      ScriptCtx sc; sc.n = 0; sc.i = 0;
      if (script) { const char*q = script; int a, bb, used; while (sc.n < 64 && sscanf(q, "%d,%d%n", &a, &bb, &used) == 2) { sc.s[sc.n] = a; sc.p[sc.n] = bb; sc.n++; q += used; } }
      if (!strcmp(eng, "script")) { rc_ptr = &sc; } else rc_ptr = &rc;
      GameResult r; Act tr[52]; int sp[52];
      clock_gettime(CLOCK_MONOTONIC, &t0);
      if (play_game(deck, fn, rc_ptr, spc, &r, tr, sp)) return 3;
      clock_gettime(CLOCK_MONOTONIC, &t1);
      tot += (t1.tv_sec - t0.tv_sec) + 1e-9 * (t1.tv_nsec - t0.tv_nsec);
      printf("%ld,%d,%d,%d,%d\n", idx, r.score, r.busts, r.perfect, r.ncards);
      if (tf) { fprintf(tf, "%ld %d %d %d", idx, r.score, r.busts, r.ncards);
        for (int i = 0; i < r.ncards; i++) fprintf(tf, " %d %d %d %d %d", tr[i].nstay, tr[i].nstay ? tr[i].stay[0] : -1, tr[i].nstay > 1 ? tr[i].stay[1] : -1, tr[i].place, sp[i]);
        fprintf(tf, "\n"); }
    }
    idx++; if (count >= 0 && idx >= start + count) break;
  }
  fprintf(stderr, "# elapsed_s=%.6f\n", tot);
  return 0;
}
