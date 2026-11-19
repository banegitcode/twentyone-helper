#!/usr/bin/env node
'use strict';
// life_margin adapter (21 Theorist).  Champion shipped52 (same spec/config handling as bench/champion/champion_adapter.js, deepen.budgetMs forced 0)
// run on a PATCHED COPY of engine/twentyone-solver/src (./src, one-line patch in engine.js nnLeaf): for leaf states with busts>=2 the network
// value is raised by corr(H), H = cards left at the leaf.  Observable state only.  corr is a piecewise-linear function; default table below.
// Why: measured on champion-like positions the network's value of "second bust already happened" is too LOW relative to the value
// actually achieved by the same policy (ideas/life-margin-schedule.md).  Usage:
//   node experiments/life_margin/adapter.js [--config shipped52|nn5] [--scale 1.0] [--pts '[[12,0],[16,88],...]']
// --scale 0 reproduces the champion exactly (use as control: must equal bench champion score game-for-game).
const fs = require('fs'), path = require('path'), readline = require('readline');
const SRC = path.join(__dirname, 'src'); const DIR = process.env.CHAMPION_DIR || path.join(__dirname, '..', '..', 'engine', 'twentyone-solver');
const argv = process.argv.slice(2); const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const J = (f) => JSON.parse(fs.readFileSync(path.join(DIR, 'results', f), 'utf8'));
const scale = +arg('scale', '1');
const PTS = JSON.parse(arg('pts', '[[12,0],[16,88],[24,176],[28,237],[40,485],[52,600]]'));   // (cards left at leaf, points added to V when busts>=2)
globalThis.__LIFE_CORR = (H) => { if (H <= PTS[0][0]) return scale * PTS[0][1]; for (let i = 1; i < PTS.length; i++) if (H <= PTS[i][0]) { const [h0, v0] = PTS[i - 1], [h1, v1] = PTS[i]; return scale * (v0 + (v1 - v0) * (H - h0) / (h1 - h0)); } return scale * PTS[PTS.length - 1][1]; };
const E = require(path.join(SRC, 'engine.js')); const { createPolicy } = require(path.join(SRC, 'x_policies.js'));
const config = arg('config', 'shipped52');
let spec; if (config === 'shipped52') spec = J('shipped_policies.json')['52']; else if (config === 'nn5') spec = J('specs_nn5_final.json').find((r) => /Network v3/.test(r.name)).spec; else throw new Error('config?');
spec = JSON.parse(JSON.stringify(spec)); if (spec.deepen) spec.deepen.budgetMs = 0;
const rules = E.DEFAULT_RULES, policy = createPolicy(rules, spec);
function toEngineState(o) {
  const cols = new Int32Array(4);
  for (let j = 0; j < 4; j++) { const cs = o.columns[j]; if (!cs.length) continue; let hard = 0, ace = 0, not7 = 0; for (const v of cs) { hard += v; if (v === 1) ace = 1; if (v !== 7) not7 = 1; } cols[j] = E.mkCol(hard, ace, cs.length, not7); }
  const deck = new Int32Array(11); for (let v = 1; v <= 10; v++) deck[v] = o.remaining[v - 1]; deck[o.current] += 1;
  return { cols, deck, rem: o.cards_left + 1, played: o.cards_dealt - 1, horizon: Infinity, busts: o.busts, stays: o.stays_left, prev: Math.min(o.streak, rules.sb.length - 1), score: o.score, over: false, reason: '', counts: { s21: 0, s5: 0, s777: 0, s521: 0, busts: o.busts, staysUsed: 2 - o.stays_left } };
}
const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  if (!line.trim()) return; const msg = JSON.parse(line);
  if (msg.type === 'new_game') { if (policy.reset) policy.reset(); }
  else if (msg.type === 'decide') { const m = policy.choose(toEngineState(msg.state), msg.state.current); process.stdout.write(JSON.stringify({ stay: m.stay >= 0 ? m.stay : null, place: m.col }) + '\n'); }
  else if (msg.type === 'quit') process.exit(0);
});
rl.on('close', () => process.exit(0));
