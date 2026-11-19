#!/usr/bin/env node
'use strict';
// Champion adapter: runs Landon's shipped JS/WASM policy (engine/twentyone-solver/src) behind the 21 Lab
// JSON-lines protocol. It receives ONLY the observable state (see bench/README.md) and rebuilds the engine's
// own search state from it. The deck order never reaches this process. engine/ is read-only: nothing is written there.
//
//   node champion_adapter.js --config nn5|shipped52|computer|exact12|exact13|exact14|exact15 [--keep-budget]
//   env CHAMPION_DIR overrides the engine directory.
//
// Configs (all with deepen.budgetMs forced to 0 unless --keep-budget, so results do not depend on wall-clock speed):
//   nn5       results/specs_nn5_final.json  "Network v3"   NN + 1/2-ply expectimax, selective 2-deeper, exact last 4 (endgameK 4)
//   shipped52 results/shipped_policies.json["52"]          same + exact2 endgame from 13 cards, 100k-position budget/move, logCap 21
//   computer  shipped52 with the web page's computer override {xK:14, logCap:25, budget:400000} (web/template.html BIG)
//   exactNN   results/x_specs_early.json  "Complete solve from NN cards" (exact2, logCap 26, unlimited budget)
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const DIR = process.env.CHAMPION_DIR || path.join(__dirname, '..', '..', 'engine', 'twentyone-solver');
const SRC = path.join(DIR, 'src');
const E = require(path.join(SRC, 'engine.js'));
const { createPolicy } = require(path.join(SRC, 'x_policies.js'));

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const config = arg('config', 'nn5');
const keepBudget = argv.includes('--keep-budget');
const J = (f) => JSON.parse(fs.readFileSync(path.join(DIR, 'results', f), 'utf8'));

function loadSpec(name) {
  let spec;
  if (name === 'nn5') spec = J('specs_nn5_final.json').find((r) => /Network v3/.test(r.name)).spec;
  else if (name === 'shipped52') spec = J('shipped_policies.json')['52'];
  else if (name === 'computer') { spec = J('shipped_policies.json')['52']; spec.exact = Object.assign({}, spec.exact, { xK: 14, logCap: 25, budget: 400000 }); }
  else if (/^exact\d+$/.test(name)) { const k = +name.slice(5); spec = J('x_specs_early.json').find((r) => r.spec.exact2 && r.spec.exact2.xK === k).spec; }
  else if (name.startsWith('file:')) spec = JSON.parse(fs.readFileSync(name.slice(5), 'utf8'));
  else throw new Error('unknown --config ' + name);
  spec = JSON.parse(JSON.stringify(spec));
  if (!keepBudget && spec.deepen) spec.deepen.budgetMs = 0;
  return spec;
}

const rules = E.DEFAULT_RULES;
const spec = loadSpec(config);
const policy = createPolicy(rules, spec);

// Rebuild the engine's search state from the observation. Engine convention: st.deck/st.rem INCLUDE the current card
// (applyMove removes it), st.prev = streak counter capped at the bonus table length.
function toEngineState(o) {
  const cols = new Int32Array(4);
  for (let j = 0; j < 4; j++) {
    const cs = o.columns[j];
    if (!cs.length) continue;
    let hard = 0, ace = 0, not7 = 0;
    for (const v of cs) { hard += v; if (v === 1) ace = 1; if (v !== 7) not7 = 1; }
    cols[j] = E.mkCol(hard, ace, cs.length, not7);
  }
  const deck = new Int32Array(11);
  for (let v = 1; v <= 10; v++) deck[v] = o.remaining[v - 1];
  deck[o.current] += 1;
  return {
    cols, deck, rem: o.cards_left + 1, played: o.cards_dealt - 1, horizon: Infinity, busts: o.busts, stays: o.stays_left,
    prev: Math.min(o.streak, rules.sb.length - 1), score: o.score, over: false, reason: '',
    counts: { s21: 0, s5: 0, s777: 0, s521: 0, busts: o.busts, staysUsed: 2 - o.stays_left },
  };
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  if (msg.type === 'new_game') { if (policy.reset) policy.reset(); }
  else if (msg.type === 'decide') {
    const st = toEngineState(msg.state);
    const m = policy.choose(st, msg.state.current);
    process.stdout.write(JSON.stringify({ stay: m.stay >= 0 ? m.stay : null, place: m.col }) + '\n');
  } else if (msg.type === 'quit') process.exit(0);
});
rl.on('close', () => process.exit(0));
