// gen_positions: play games with the Referee's baseline engine (bench/native/engines.h) on a shuffle file and dump the
// position (before placing the card) whenever the number of cards still to be placed (INCLUDING the current card)
// equals one of the requested N.  One line per position:
//   id N busts stays streak cur  [n hard ace all7]x4  cnt[1..10]   (cnt = unseen cards EXCLUDING the current card)
// usage: gen_positions SHUFFLES ENGINE(expect1|greedy) START COUNT N1,N2,...  > positions.txt
#include "../../../bench/native/sim.h"
#include "../../../bench/native/engines.h"
int main(int argc, char**argv){
  if (argc < 6) { fprintf(stderr, "usage\n"); return 2; }
  FILE*f = fopen(argv[1], "r"); if (!f) { perror("shuffles"); return 2; }
  EngineFn fn = !strcmp(argv[2], "greedy") ? eng_greedy : eng_expect1;
  long start = atol(argv[3]), count = atol(argv[4]); int want[64], nw = 0;
  for (char*t = strtok(argv[5], ","); t; t = strtok(NULL, ",")) want[nw++] = atoi(t);
  int deck[52]; long idx = 0;
  while (1) {
    int ok = 1; for (int i = 0; i < 52; i++) if (fscanf(f, "%d", &deck[i]) != 1) { ok = 0; break; }
    if (!ok) break;
    if (idx >= start && idx < start + count) {
      St s; st_init(&s);
      for (int i = 0; i < 52; i++) {
        int r = card_value(deck[i]);
        s.cur = r; s.cnt[r]--; s.left = 51 - i; s.dealt = i + 1;
        int N = 52 - i;
        for (int w = 0; w < nw; w++) if (want[w] == N) {
          printf("%ld %d %d %d %d %d", idx, N, s.busts, s.stays, s.streak, r);
          for (int j = 0; j < 4; j++) printf(" %d %d %d %d", s.c[j].n, s.c[j].hard, s.c[j].ace, s.c[j].n ? s.c[j].all7 : 0);
          for (int v = 1; v <= 10; v++) printf(" %d", s.cnt[v]);
          printf("\n");
        }
        St obs = s; Act a; memset(&a, 0, sizeof a); a.place = -1; fn(&obs, &a, NULL);
        for (int k = 0; k < a.nstay; k++) st_stay(&s, a.stay[k]);
        int b; st_place(&s, a.place, r, &b);
        if (s.dead) break;
      }
    }
    idx++; if (idx >= start + count) break;
  }
  return 0;
}
