#!/usr/bin/env node
'use strict';
// Stay-decision labels for the Learner (21 Streak).  For logged champion decisions with MORE than 16 cards left and a Stay legally available, label the best-Stay
// afterstate against the best no-Stay afterstate (best by the champion's own root value, within WINDOW points) with the STRONGER reference:
//   paired CRN rollouts over random orders of the unseen multiset (never the true order), tail policy = the champion's own search (shipped52 net, depth 1 + deepening,
//   no exact endgame inside the rollout), H plies then the shipped network's value, exact expectimax value once <= KX cards remain.
//   Sequential stopping on the paired SE only (blocks of STEP pairs until SE <= SESTOP or NMAX pairs): NOT on the size of the difference, so the mean is not biased by stopping.
// Source positions: my 150 deeper:16 games on training seeds 3,500,000,001+ (raw/d16_seed3500000001.jsonl).  No full games are played here.
// Output rows (Learner format, like learner-v2a data/*.pos.jsonl):  kind 'D' = the decision, kind 'C' = one labeled afterstate (cols as card-value lists with Ace = 1,
//   deck = counts of values 1..10 still unseen AFTER the placement, left = cards unseen, v = expected points to come from the afterstate EXCLUDING the immediate points dpts).
//   node stay_label.js <worker k> <K> <out.jsonl>   env: H=16 KX=8 N0=16 STEP=16 NMAX=64 SESTOP=30 WINDOW=300 NTARGET=450 DEADLINE_MIN=85
const path = require('path'), fs = require('fs');
const RM = path.join(__dirname, '../regret_map');
const L = require(path.join(RM, 'lib.js'));
const [wk, WK, out] = [+process.argv[2], +process.argv[3], process.argv[4]];
const P = (k, d) => (process.env[k] !== undefined ? +process.env[k] : d);
const H = P('H', 16), KX = P('KX', 8), N0 = P('N0', 16), STEP = P('STEP', 16), NMAX = P('NMAX', 64), SESTOP = P('SESTOP', 30), WINDOW = P('WINDOW', 300), NTARGET = P('NTARGET', 450);
const DEADLINE = (process.env.DEADLINE_EPOCH ? +process.env.DEADLINE_EPOCH : Date.now() + P('DEADLINE_MIN', 85) * 60000);
const E = L.E, rules = L.rules, X = L.exactSolver(21), nnv = L.makeNNValue();
const { createPolicy } = require(path.join(L.ROOT, 'engine/twentyone-solver/src/x_policies.js'));
const spec = L.championSpec(); delete spec.exact; const pol = createPolicy(rules, spec);
const LOG = path.join(__dirname, 'raw/d16_seed3500000001.jsonl'), SEEDBASE = 3500000001;
// ---- pool and stratified sample (deterministic, identical in every worker)
const pool = [];
for (const l of fs.readFileSync(LOG, 'utf8').split('\n')) {
  if (!l) continue; const d = JSON.parse(l); if (d.t !== 'dec' || d.rem < 17 || d.stays < 1 || !d.scores || !d.scores.length) continue;
  const sSt = d.scores.filter((a) => a.stay >= 0), sNo = d.scores.filter((a) => a.stay < 0); if (!sSt.length || !sNo.length) continue;
  const bs = sSt.reduce((a, b) => (b.value > a.value ? b : a)), bn = sNo.reduce((a, b) => (b.value > a.value ? b : a));
  if (Math.abs(bs.value - bn.value) > WINDOW) continue;
  const usedStay = d.stay >= 0, bucket = d.rem <= 24 ? 0 : d.rem <= 32 ? 1 : d.rem <= 40 ? 2 : 3;
  pool.push({ d, bs, bn, usedStay, cell: bucket + ':' + d.stays + ':' + (usedStay ? 1 : 0) });
}
const hash = (g, s) => (Math.imul(g * 1000 + s, 2654435761) >>> 0) / 4294967296;
const cells = {}; for (const p of pool) (cells[p.cell] = cells[p.cell] || []).push(p);
const cellKeys = Object.keys(cells).sort(); const perCell = Math.ceil(NTARGET / cellKeys.length);
let sample = []; for (const k of cellKeys) sample.push(...cells[k].sort((a, b) => hash(a.d.g, a.d.step) - hash(b.d.g, b.d.step)).slice(0, perCell));
sample.sort((a, b) => hash(a.d.g, a.d.step + 77) - hash(b.d.g, b.d.step + 77));   // random order: a time-truncated run is still a stratified-random subset
if (wk === 0 && process.env.PRINT_POOL) console.error('pool', pool.length, 'cells', cellKeys.map((k) => k + '=' + cells[k].length).join(' '), 'sample', sample.length);
// ---- column code -> card value list (Ace = 1) that maps back to the same engine column code
function colList(code) {
  if (!code) return []; const h = code & 31, ace = (code >> 5) & 1, n = (code >> 6) & 7, not7 = (code >> 9) & 1;
  let cards = [], s = h, m = n; if (ace) { cards.push(1); s -= 1; m -= 1; }
  if (m > 0) { const base = new Array(m).fill(2); let extra = s - 2 * m; for (let i = 0; i < m && extra > 0; i++) { const a = Math.min(8, extra); base[i] += a; extra -= a; } cards.push(...base); }
  if (!not7 && !ace) cards = new Array(n).fill(7);
  else if (not7 && !ace && cards.every((c) => c === 7) && cards.length >= 2) { cards[0] -= 1; cards[1] += 1; }
  const hh = cards.reduce((a, b) => a + b, 0), aa = cards.includes(1) ? 1 : 0, nn7 = cards.some((c) => c !== 7) ? 1 : 0;
  if (E.mkCol(hh, aa, cards.length, nn7) !== code) throw new Error('column round trip failed for code ' + code + ' -> ' + cards.join(','));
  return cards;
}
function rollout(st0, v, a, rest, start) {
  const g = E.cloneGame(st0); E.applyMove(rules, g, v, a); pol.reset(); let i = 0;
  const fin = (r) => ({ r, stays: g.stays, rem: g.rem });
  while (!g.over) {
    if (g.rem <= KX) { let t; try { t = X.value(g); } catch (e) { X.clear(); t = X.value(g); } return fin(g.score + t); }
    if (i >= H) return fin(g.score + nnv(g));
    const x = rest[i++]; E.applyMove(rules, g, x, pol.choose(g, x));
  }
  return fin(g.score);
}
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const seOf = (a) => { const n = a.length, m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (n - 1) / n); };
const fd = fs.openSync(out, 'a'); const w = (o) => fs.writeSync(fd, JSON.stringify(o) + '\n');
function afterRow(id, parentId, d, g2, ev, mv, label) {
  const cols = Array.from(g2.cols).map(colList), dk = Array.from(g2.deck).slice(1);
  return { id, kind: 'C', game: SEEDBASE + d.g * 7919, left: g2.rem, cols, col_codes: Array.from(g2.cols), deck: dk, busts: g2.busts, stays: g2.stays, streak: g2.prev, parent: parentId, mv, uses_stay: mv[0] >= 0, dpts: ev.pts + (ev.streak || 0), ok: true, ...label };
}
let done = 0;
sample.forEach((p, idx) => {
  if (idx % WK !== wk || Date.now() > DEADLINE) return;
  const d = p.d, st = L.mkState(d), v = d.v, t0 = process.cpuUsage();
  const mvS = { stay: p.bs.stay, col: p.bs.col }, mvN = { stay: p.bn.stay, col: p.bn.col };
  const rest = []; for (let x = 1; x <= 10; x++) for (let i = 0; i < d.deck[x] - (x === v ? 1 : 0); i++) rest.push(x);
  const rng = E.mulberry32(8800123 + d.g * 131 + d.step * 7); X.clear();
  const RS = [], RN = [], DF = [], lsS = [], lsN = [];
  while (RS.length < NMAX) {
    for (let b = 0; b < (RS.length === 0 ? N0 : STEP); b++) {
      for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = rest[i]; rest[i] = rest[j]; rest[j] = t; }
      const a = rollout(st, v, mvS, rest), c = rollout(st, v, mvN, rest);
      RS.push(a.r); RN.push(c.r); DF.push(a.r - c.r); lsS.push(a.stays); lsN.push(c.stays);
    }
    if (seOf(DF) <= SESTOP) break;
  }
  const u = process.cpuUsage(t0), cpu = (u.user + u.system) / 1000;
  const gS = E.cloneGame(st), evS = E.applyMove(rules, gS, v, mvS), gN = E.cloneGame(st), evN = E.applyMove(rules, gN, v, mvN);
  const dptsS = evS.pts + (evS.streak || 0), dptsN = evN.pts + (evN.streak || 0);
  const pid = (SEEDBASE + d.g * 7919) + ':' + d.step, cidS = pid + ':S', cidN = pid + ':N';
  const nnS = nnv(gS), nnN = nnv(gN), dm = mean(DF), dse = seOf(DF);
  w({ id: pid, kind: 'D', game: SEEDBASE + d.g * 7919, g: d.g, step: d.step, cards_left_incl_current: d.rem, card: v, stays: d.stays, busts: d.busts, streak: d.prev,
    cols_pre: d.cols.map(colList), col_codes_pre: d.cols, deck_pre_incl_current: Array.from(d.deck).slice(1), champion_mv: [d.stay, d.col], champion_used_stay: p.usedStay,
    cand_stay: cidS, cand_nostay: cidN, label_diff_stay_minus_nostay: dm, label_diff_se: dse, n_pairs: DF.length, net_diff_nn_plus_dpts: (dptsS + nnS) - (dptsN + nnN),
    champion_search_diff: p.bs.value - p.bn.value, cpu_ms: Math.round(cpu), H, KX });
  w(afterRow(cidS, pid, d, gS, evS, [mvS.stay, mvS.col], { v: mean(RS) - dptsS, se: seOf(RS), nn: nnS, search_value: p.bs.value, leaf_stays_mean: mean(lsS), n_pairs: DF.length }));
  w(afterRow(cidN, pid, d, gN, evN, [mvN.stay, mvN.col], { v: mean(RN) - dptsN, se: seOf(RN), nn: nnN, search_value: p.bn.value, leaf_stays_mean: mean(lsN), n_pairs: DF.length }));
  done++;
});
fs.closeSync(fd); console.error('worker', wk, 'positions', done);
