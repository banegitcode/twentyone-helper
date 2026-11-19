// brute_raw: pre-reveal exact value by brute force over INDIVIDUAL cards, columns given as explicit card-value lists (no reconstruction).
// Reuses the solver in ../exact-endgame-deeper/ref/brute.c (rules written from RULES.md; shares nothing with exact2).
// input line: id busts stays streak n0 v.. n1 v.. n2 v.. n3 v..  cnt1 .. cnt10      (cnt = unseen cards by VALUE, ten-valued merged; Ace = 1)
// output line: V id value visited
#define main brute_main
#include "../exact-endgame-deeper/ref/brute.c"
#undef main
int main(int argc, char**argv){
  (void)argc; (void)argv;
  TM = 1ULL << 24; T = calloc(TM, sizeof(Ent)); USED = malloc(sizeof(uint32_t) << 26);
  char line[4096];
  while (fgets(line, sizeof line, stdin)) {
    long id; int busts, stays, streak, pos = 0, used = 0; G g; memset(&g, 0, sizeof g);
    if (sscanf(line, "%ld %d %d %d%n", &id, &busts, &stays, &streak, &used) < 4) continue; pos += used;
    g.busts = busts; g.stays = stays; g.streak = streak;
    for (int j = 0; j < 4; j++) { int n; sscanf(line + pos, "%d%n", &n, &used); pos += used; g.c[j].n = n;
      for (int i = 0; i < n; i++) { int v; sscanf(line + pos, "%d%n", &v, &used); pos += used; g.c[j].v[i] = v; } }
    NU = 0; for (int v = 1; v <= 10; v++) { int c; sscanf(line + pos, "%d%n", &c, &used); pos += used; for (int i = 0; i < c; i++) UNS[NU++] = v; }
    for (uint64_t u = 0; u < nused; u++) T[USED[u]].k2 = 0; nused = 0; tcount = 0; visited = 0;
    uint64_t mask = NU ? ((1ULL << NU) - 1) : 0;
    double v0 = busts >= 3 ? 0.0 : V(&g, mask);
    printf("V %ld %.6f %llu\n", id, v0, (unsigned long long)visited); fflush(stdout);
  }
  return 0;
}
