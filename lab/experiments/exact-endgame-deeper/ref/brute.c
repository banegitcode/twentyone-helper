// brute: independent reference solver. Written directly from /workspace/21lab/RULES.md; shares NO code or state
// compression with the compressed solvers.  Deck = INDIVIDUAL cards (a subset mask over the unseen cards, each equally
// likely), columns = explicit card lists, rules recomputed from the card list every time.  Memoised on the raw state
// (mask, the four column lists in column order, streak, busts, stays) -- no column-symmetry, no value-count deck.
//   brute POSITIONS [maxN] [stays_per_card=1]  -> for every position with N<=maxN prints
//   P id N V0 BEST  then  A stay place Q  for every legal action (stay=-1 none, else column index to empty first)
// V0 = expected future points before the current card is revealed (current card counted as unseen);
// Q  = points of the action + expected future points after it (current card known).
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
typedef struct { int n; int v[5]; } Col;
typedef struct { Col c[4]; int streak, busts, stays; } G;
static int maxstay = 1, maxstreak_seen = 0;
static int SB(int k){ return k < 2 ? 0 : k == 2 ? 250 : k == 3 ? 500 : k == 4 ? 1000 : 2000; }
// place card x on column j (rules straight from RULES.md). returns points (incl. streak), updates g.
static int place(G*g, int j, int x){
  Col*c = &g->c[j]; c->v[c->n++] = x;
  int hard = 0, ace = 0, all7 = 1;
  for (int i = 0; i < c->n; i++) { hard += c->v[i]; if (c->v[i] == 1) ace = 1; if (c->v[i] != 7) all7 = 0; }
  int total = (ace && hard + 10 <= 21) ? hard + 10 : hard;
  int pts = 0, scored = 0, bust = 0;
  if (total > 21) bust = 1;   // hard>21 <=> over 21 even with all aces as 1; a 5th-card bust is a bust
  else if (total == 21) { pts = (c->n == 5) ? 1000 : (c->n == 3 && all7) ? 600 : 400; scored = 1; }
  else if (c->n == 5) { pts = 800; scored = 1; }
  if (bust) { g->busts++; g->streak = 0; c->n = 0; return 0; }
  if (scored) { g->streak++; if (g->streak > maxstreak_seen) maxstreak_seen = g->streak; pts += SB(g->streak); c->n = 0; return pts; }
  g->streak = 0; return 0;
}
// ---- memo
typedef struct { uint64_t k1, k2; double v; } Ent;
static uint32_t*USED; static uint64_t nused = 0;
static Ent*T; static uint64_t TM, tcount = 0, visited = 0;
static uint64_t colcode(const Col*c){ uint64_t r = c->n; int s[5]; memcpy(s, c->v, sizeof s);
  for (int i = 0; i < c->n; i++) for (int j = i + 1; j < c->n; j++) if (s[j] < s[i]) { int t = s[i]; s[i] = s[j]; s[j] = t; }
  for (int i = 0; i < c->n; i++) { r |= (uint64_t)s[i] << (3 + 4 * i); }
  return r; }   // 3+16 bits
static int NU; static int UNS[40];     // unseen individual cards (values)
static double V(const G*g, uint64_t mask);
static double Gnode(const G*g, uint64_t mask, int x);  // card x known, mask = remaining after it; max over actions
static double actionQ(const G*g, uint64_t mask, int x, int stay, int p){
  G h = *g; if (stay >= 0) { h.c[stay].n = 0; h.stays--; }
  int pts = place(&h, p, x);
  double fut = (h.busts >= 3) ? 0.0 : V(&h, mask);
  return pts + fut;
}
static double Gnode(const G*g, uint64_t mask, int x){
  double best = -1;
  for (int s = -1; s < 4; s++) {
    if (s >= 0 && (g->stays <= 0 || g->c[s].n == 0)) continue;
    if (s >= 0 && maxstay < 1) continue;
    for (int p = 0; p < 4; p++) { double q = actionQ(g, mask, x, s, p); if (q > best) best = q; }
  }
  return best;
}
static double V(const G*g, uint64_t mask){
  if (mask == 0) return g->busts == 0 ? 1000.0 : 0.0;
  uint64_t k1 = colcode(&g->c[0]) | colcode(&g->c[1]) << 19 | colcode(&g->c[2]) << 38 | (uint64_t)g->streak << 57 | (uint64_t)g->busts << 61;
  uint64_t k2 = colcode(&g->c[3]) | mask << 19 | (uint64_t)g->stays << 60 | 1ULL << 63;
  uint64_t h = (k1 * 0x9E3779B97F4A7C15ULL) ^ (k2 * 0xC2B2AE3D27D4EB4FULL); h ^= h >> 29; h = h % TM;
  while (T[h].k2) { if (T[h].k1 == k1 && T[h].k2 == k2) return T[h].v; h = (h + 1) % TM; }
  visited++;
  double sum = 0; int m = 0;
  for (int i = 0; i < NU; i++) if (mask >> i & 1) { sum += Gnode(g, mask & ~(1ULL << i), UNS[i]); m++; }
  double r = sum / m;
  if (tcount * 10 > TM * 8) { fprintf(stderr, "memo full\n"); exit(3); }
  T[h].k1 = k1; T[h].k2 = k2; T[h].v = r; tcount++; if (nused < (1u<<26)) USED[nused++] = (uint32_t)h;
  return r;
}
int main(int argc, char**argv){
  if (argc < 2) return 2;
  int maxN = argc > 2 ? atoi(argv[2]) : 9; if (argc > 3) maxstay = atoi(argv[3]);
  TM = 1ULL << 25; T = calloc(TM, sizeof(Ent)); USED = malloc(sizeof(uint32_t) << 26);
  FILE*f = fopen(argv[1], "r"); char line[1024];
  while (fgets(line, sizeof line, f)) {
    long id; int N, busts, stays, streak, cur, col[16], cnt[11];
    int nt = sscanf(line, "%ld %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d",
      &id, &N, &busts, &stays, &streak, &cur, col, col+1, col+2, col+3, col+4, col+5, col+6, col+7, col+8, col+9, col+10, col+11, col+12, col+13, col+14, col+15,
      cnt+1, cnt+2, cnt+3, cnt+4, cnt+5, cnt+6, cnt+7, cnt+8, cnt+9, cnt+10, &(int){0});
    if (nt < 32 || N > maxN) continue;
    G g; memset(&g, 0, sizeof g); g.busts = busts; g.stays = stays; g.streak = streak;
    for (int j = 0; j < 4; j++) {   // reconstruct a card list consistent with (n, hard, ace, all7)
      int n = col[4*j], hard = col[4*j+1], ace = col[4*j+2], a7 = col[4*j+3]; Col*c = &g.c[j]; c->n = n;
      if (!n) continue;
      if (a7) { for (int i = 0; i < n; i++) c->v[i] = 7; continue; }
      int k = 0, rest = hard; if (ace) { c->v[k++] = 1; rest -= 1; }
      int left = n - k; // distribute 'rest' over 'left' cards each in 2..10 (1 only if forced)
      for (int i = 0; i < left; i++) { int share = rest / (left - i); if (share < 2 && rest >= 2 * (left - i)) share = 2; c->v[k++] = share; rest -= share; }
      int all7 = 1; for (int i = 0; i < n; i++) if (c->v[i] != 7) all7 = 0;
      if (all7 && n >= 2) { c->v[0] -= 3; c->v[1] += 3; }   // not-all-7 flag but even split gave 7s: perturb (keeps hard sum)
      int sum = 0; for (int i = 0; i < n; i++) sum += c->v[i];
      if (sum != hard) { fprintf(stderr, "cannot rebuild column (n=%d hard=%d ace=%d)\n", n, hard, ace); return 4; }
    }
    NU = 0; uint64_t mask = 0; for (int v = 1; v <= 10; v++) for (int i = 0; i < cnt[v]; i++) UNS[NU++] = v;
    if (NU + 1 != N) { fprintf(stderr, "N mismatch\n"); return 5; }
    for (uint64_t u = 0; u < nused; u++) T[USED[u]].k2 = 0; nused = 0; tcount = 0; visited = 0;
    // V0 includes the current card as one more unseen card
    UNS[NU++] = cur; mask = (NU == 64 ? ~0ULL : (1ULL << NU) - 1);
    double v0 = V(&g, mask);
    mask &= ~(1ULL << (NU - 1));
    double best = -1; char buf[4096]; int bl = 0;
    for (int s = -1; s < 4; s++) {
      if (s >= 0 && (g.stays <= 0 || g.c[s].n == 0 || maxstay < 1)) continue;
      for (int p = 0; p < 4; p++) { double q = actionQ(&g, mask, cur, s, p); if (q > best) best = q; bl += snprintf(buf + bl, sizeof buf - bl, "A %d %d %.6f\n", s, p, q); }
    }
    printf("P %ld %d %.6f %.6f %llu\n%s", id, N, v0, best, (unsigned long long)visited, buf); fflush(stdout);
  }
  fprintf(stderr, "max streak seen in any search line: %d\n", maxstreak_seen);
  return 0;
}
