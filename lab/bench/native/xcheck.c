// Cross-check: replay identical shuffles + identical action sequences (bench21 --trace output) through
// the lab lead's simulator core /workspace/21sol/game.h (read-only include; not modified) and compare
// per-step points, busts and final score with bench21's own rules core.
//   xcheck <shuffles.txt> <trace.txt>
#include "game.h"
static int val(int code){ int r = code % 13 + 1; return r > 10 ? 10 : r; }
int main(int argc, char**argv){
  if (argc < 3) { fprintf(stderr, "usage: xcheck shuffles trace\n"); return 2; }
  game_init();
  FILE*sf = fopen(argv[1], "r"), *tf = fopen(argv[2], "r"); if (!sf || !tf) { perror("open"); return 2; }
  int deck[10000][52]; int nd = 0;
  while (nd < 10000) { int ok = 1; for (int i = 0; i < 52; i++) if (fscanf(sf, "%d", &deck[nd][i]) != 1) { ok = 0; break; } if (!ok) break; nd++; }
  long games = 0, bad = 0, steps = 0, bonus_streak = 0, n21 = 0, n777 = 0, n5 = 0, n521 = 0, nbust = 0;
  long idx; int fscore, fbusts, ncards;
  while (fscanf(tf, "%ld %d %d %d", &idx, &fscore, &fbusts, &ncards) == 4) {
    State s; state_init(&s); int dealt = 0, mismatch = 0;
    for (int i = 0; i < ncards; i++) {
      int nst, s0, s1, pl, pts; if (fscanf(tf, "%d %d %d %d %d", &nst, &s0, &s1, &pl, &pts) != 5) return 3;
      int st[2] = { s0, s1 };
      for (int k = 0; k < nst; k++) { s.col[st[k]] = 0; s.stays--; }
      int r = val(deck[idx][i]);
      int id = s.col[pl]; int t = CT[id][r];
      if (t == -1) { if (CSCORE[id][r]) { int c = CP[id][r]; if (c == 400) n21++; else if (c == 600) n777++; else if (c == 800) n5++; else if (c == 1000) n521++; } }
      if (t == -2) nbust++;
      int before_streak = s.streak;
      int got = place(&s, pl, r); steps++; dealt++;
      if (t == -1 && before_streak >= 1) bonus_streak++;
      if (got != pts) { mismatch = 1; if (bad < 10) printf("MISMATCH game %ld step %d: bench21=%d 21sol=%d\n", idx, i, pts, got); }
      if (s.dead) break;
    }
    int final = s.score + ((s.busts == 0 && dealt == 52) ? 1000 : 0);
    if (final != fscore || s.busts != fbusts) { mismatch = 1; if (bad < 10) printf("MISMATCH game %ld final: bench21=%d/%d 21sol=%d/%d\n", idx, fscore, fbusts, final, s.busts); }
    bad += mismatch; games++;
  }
  printf("xcheck: %ld games, %ld steps replayed, %ld disagreeing games | coverage: 21=%ld three7s=%ld 5card=%ld 5card21=%ld busts=%ld streak-bonus-scores=%ld\n",
         games, steps, bad, n21, n777, n5, n521, nbust, bonus_streak);
  return bad != 0;
}
