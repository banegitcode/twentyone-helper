#!/usr/bin/env node
'use strict';
// Bias-diagnostic wrapper for the bench subprocess protocol (bench/README.md). Plays EXACTLY like
// bench/champion/champion_adapter.js (same spec loading, same policy, deepen.budgetMs forced to 0) but additionally logs, per decision,
// the network's value of the position AFTER the chosen move, the policy's own search value for that move, and the realized score
// (final score comes from the harness' game_over message, i.e. the bench simulator). It only ever sees the observable state.
//   cmd:node experiments/learner-sim/bias_adapter.js --config ship_nn|nn5|shipped52  (env BIAS_LOG=<prefix>; one file per process)
const fs = require('fs'), path = require('path'), readline = require('readline');
const DIR = process.env.CHAMPION_DIR || path.join(__dirname, '..', '..', 'engine', 'twentyone-solver'), SRC = path.join(DIR, 'src');
const E = require(path.join(SRC, 'engine.js')); const { createPolicy } = require(path.join(SRC, 'x_policies.js'));
const argv = process.argv.slice(2); const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const config = arg('config', 'ship_nn'); const J = (f) => JSON.parse(fs.readFileSync(path.join(DIR, 'results', f), 'utf8'));
let spec;
if (config === 'ship_nn') spec = J('ship_nn.json'); else if (config === 'nn5') spec = J('specs_nn5_final.json').find((r) => /Network v3/.test(r.name)).spec; else if (config === 'shipped52') spec = J('shipped_policies.json')['52']; else throw new Error('config?');
spec = JSON.parse(JSON.stringify(spec)); if (spec.deepen) spec.deepen.budgetMs = 0;
const rules = E.DEFAULT_RULES, policy = createPolicy(rules, spec), nn = spec.nn;
const L = nn.layers.map((l) => ({ nIn: l.nIn, nOut: l.nOut, W: Float64Array.from(l.W), b: Float64Array.from(l.b) })); const A = new Float64Array(256), B = new Float64Array(256), f = new Float64Array(E.NF);
function net(st) { E.featurize(st.cols, st.deck, st.rem, E.cardsLeftToPlay(st), st.busts, st.stays, st.prev, 4, f); let x = A, y = B; for (let i = 0; i < E.NF; i++) x[i] = f[i];
  for (let li = 0; li < L.length; li++) { const l = L[li], last = li === L.length - 1; for (let o = 0, k = 0; o < l.nOut; o++) { let s = l.b[o]; for (let i = 0; i < l.nIn; i++, k++) s += l.W[k] * x[i]; y[o] = last || s > 0 ? s : 0; } const t = x; x = y; y = t; } return x[0] * (nn.scale || 1000); }
function toEngineState(o) { const cols = new Int32Array(4);
  for (let j = 0; j < 4; j++) { const cs = o.columns[j]; if (!cs.length) continue; let hard = 0, ace = 0, not7 = 0; for (const v of cs) { hard += v; if (v === 1) ace = 1; if (v !== 7) not7 = 1; } cols[j] = E.mkCol(hard, ace, cs.length, not7); }
  const deck = new Int32Array(11); for (let v = 1; v <= 10; v++) deck[v] = o.remaining[v - 1]; deck[o.current] += 1;
  return { cols, deck, rem: o.cards_left + 1, played: o.cards_dealt - 1, horizon: Infinity, busts: o.busts, stays: o.stays_left, prev: Math.min(o.streak, rules.sb.length - 1), score: o.score, over: false, reason: '', counts: { s21: 0, s5: 0, s777: 0, s521: 0, busts: o.busts, staysUsed: 2 - o.stays_left } }; }
const logFile = (process.env.BIAS_LOG || '/tmp/bias') + '.' + process.pid + '.jsonl'; let game = -1, rows = [];
const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => { if (!line.trim()) return; const msg = JSON.parse(line);
  if (msg.type === 'new_game') { game = msg.game; rows = []; if (policy.reset) policy.reset(); }
  else if (msg.type === 'decide') { const o = msg.state, st = toEngineState(o); const m = policy.choose(st, o.current);
    const g = E.cloneGame(st); E.applyMove(rules, g, o.current, m);
    rows.push({ step: o.cards_dealt, sb: o.score, sa: g.score, p: g.over ? null : net(g), q: m.value == null ? null : m.value, ex: m.exact ? 1 : 0, b: g.busts, s: g.stays, k: g.prev, nz: g.cols.reduce((a, c) => a + (c ? 1 : 0), 0) });
    process.stdout.write(JSON.stringify({ stay: m.stay >= 0 ? m.stay : null, place: m.col }) + '\n'); }
  else if (msg.type === 'game_over') { const fin = msg.score; const r = rows;
    fs.appendFileSync(logFile, JSON.stringify({ seed: game, final: fin, busts: r.length ? r[r.length - 1].b : 0, n: r.length, p: r.map((x) => x.p), q: r.map((x) => x.q), ex: r.map((x) => x.ex), G: r.map((x) => fin - x.sa), Gb: r.map((x) => fin - x.sb), b: r.map((x) => x.b), s: r.map((x) => x.s), k: r.map((x) => x.k), nz: r.map((x) => x.nz) }) + '\n'); }
  else if (msg.type === 'quit') process.exit(0); });
rl.on('close', () => process.exit(0));
