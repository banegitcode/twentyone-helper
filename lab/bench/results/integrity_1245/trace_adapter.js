#!/usr/bin/env node
'use strict';
// Outside wrapper around the FROZEN exact-endgame-deeper policy. Does not edit frozen
// sources. Same JSON-lines protocol as adapter.js, plus a per-decision trace that
// records whether the exact solver answered or gave up (hybrid.stats deltas) and
// how many cards were left (engine rem, including the current card).
const fs = require('fs'), path = require('path'), readline = require('readline');
const FROZEN = process.env.FROZEN_ROOT || path.join(__dirname, '..', '..', 'frozen', 'exact-endgame-deeper');
const ADIR = path.join(FROZEN, 'experiments', 'exact-endgame-deeper');
process.env.CHAMPION_DIR = process.env.CHAMPION_DIR || path.join(FROZEN, 'engine', 'twentyone-solver');
process.env.TWENTYONE_SRC = process.env.TWENTYONE_SRC || path.join(FROZEN, 'engine', 'twentyone-solver', 'src');
const C = require(path.join(ADIR, 'js', 'common.js')); const E = C.E;
const { createPolicy } = require(path.join(ADIR, 'js', 'policy_exact3.js'));
const argv = process.argv.slice(2); const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const config = arg('config', 'deeper:16');
const tracePath = arg('trace', null);
const DIR = process.env.CHAMPION_DIR;
const base = JSON.parse(fs.readFileSync(path.join(DIR, 'results', 'shipped_policies.json'), 'utf8'))['52'];
const spec = JSON.parse(JSON.stringify(base)); delete spec.exact; if (spec.deepen) spec.deepen.budgetMs = 0;
if (config === 'parity13') spec.exact3 = { xK: 13, logCap: 21, budget: 100000 };
else if (config.startsWith('deeper:')) {
  const [, K, B, L, ev] = config.split(':');
  spec.exact3 = { xK: +K, budget: B ? +B : 3200000, logCap: L ? +L : 25 };
  if (ev === 'eval') { spec.exact3.useStandInEvaluator = true; spec.exact3.depth = 1; }
} else throw new Error('trace_adapter: only deeper:/parity13 configs are supported, got ' + config);
const rules = C.R, policy = createPolicy(rules, spec);

function toEngineState(o) {
  const cols = new Int32Array(4);
  for (let j = 0; j < 4; j++) {
    const cs = o.columns[j]; if (!cs.length) continue;
    let hard = 0, ace = 0, not7 = 0;
    for (const v of cs) { hard += v; if (v === 1) ace = 1; if (v !== 7) not7 = 1; }
    cols[j] = E.mkCol(hard, ace, cs.length, not7);
  }
  const deck = new Int32Array(11); for (let v = 1; v <= 10; v++) deck[v] = o.remaining[v - 1]; deck[o.current] += 1;
  return { cols, deck, rem: o.cards_left + 1, played: o.cards_dealt - 1, horizon: Infinity, busts: o.busts, stays: o.stays_left,
    prev: Math.min(o.streak, rules.sb.length - 1), score: o.score, over: false, reason: '',
    counts: { s21: 0, s5: 0, s777: 0, s521: 0, busts: o.busts, staysUsed: 2 - o.stays_left } };
}
function snap() { const s = policy.stats || {}; return { exact: s.exact || 0, fallbackBase: s.fallbackBase || 0, fallbackEval: s.fallbackEval || 0 }; }
function emit(obj) { if (!tracePath) return; fs.appendFileSync(tracePath, JSON.stringify(obj) + '\n'); }

let gameNo = -1, seed = null, moves = [];
const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  if (msg.type === 'new_game') {
    gameNo = msg.game != null ? msg.game : gameNo + 1; seed = msg.seed != null ? msg.seed : null;
    moves = []; if (policy.reset) policy.reset();
  } else if (msg.type === 'decide') {
    const st = toEngineState(msg.state);
    const rem = st.rem, before = snap();
    const m = policy.choose(st, msg.state.current);
    const after = snap();
    const exactHit = after.exact > before.exact;
    const giveup = after.fallbackBase > before.fallbackBase || after.fallbackEval > before.fallbackEval;
    const window = rem <= (spec.exact3 ? spec.exact3.xK : -1);
    const rec = { type: 'decision', game: gameNo, seed, rem, cards_left_excl_current: msg.state.cards_left,
      attempted: window && (exactHit || giveup), exact: exactHit, giveup,
      fallbackBase: after.fallbackBase > before.fallbackBase,
      fallbackEval: after.fallbackEval > before.fallbackEval,
      stay: m.stay >= 0 ? m.stay : null, place: m.col };
    moves.push(rec);
    emit(rec);
    process.stdout.write(JSON.stringify({ stay: rec.stay, place: rec.place }) + '\n');
  } else if (msg.type === 'game_over') {
    emit({ type: 'game', game: gameNo, seed, score: msg.score, n_decisions: moves.length,
      stats: snap(), n_exact: moves.filter((d) => d.exact).length, n_giveup: moves.filter((d) => d.giveup).length });
  } else if (msg.type === 'quit') process.exit(0);
});
rl.on('close', () => process.exit(0));
