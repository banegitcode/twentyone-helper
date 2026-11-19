#!/usr/bin/env node
'use strict';
// E1 (bias-correction kill test) adapter, JSON-lines protocol of bench/README.md. Same as bench/champion/champion_adapter.js, but loads the
// PATCHED copy of the champion sources in ./src (engine/ untouched) and adds a leaf correction to the network value.
//   node adapter.js --config shipped52|ship_nn|nn5 --corr none|phase|b2|phase+b2
//   none      = control: must reproduce the champion exactly (same config, same shuffles -> identical scores)
//   phase     = level correction  387.4 - 7.58 * cardsDealt  (clipped at 0): the measured mean underestimate of ship_nn on set1000 (457 games, 21 Learner,
//               2-parameter weighted line through the 51-bin curve; IN-SAMPLE on set1000 — a fit to 457 games, flagged). Expected: no move changes except via terminal/exact edges.
//   b2        = +c(cardsLeft) on leaves with 2 busts used, c = 21 Theorist's measured over-pricing of the 2nd bust: (6,0) (16,88) (24,176) (28,237) (40,485), flat beyond. Expected ~0 (their flip analysis ~ +0.3/game).
//   phase+b2  = both.
// deepen.budgetMs is forced to 0 (as the bench adapter) so scores do not depend on machine load.
const fs = require('fs'), path = require('path'), readline = require('readline');
const CH = process.env.CHAMPION_DIR || path.join(__dirname, '..', '..', 'engine', 'twentyone-solver');
const E = require(path.join(__dirname, 'src', 'engine.js')); const { createPolicy } = require(path.join(__dirname, 'src', 'x_policies.js'));
const argv = process.argv.slice(2); const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const config = arg('config', 'shipped52'), corr = arg('corr', 'none'); const J = (f) => JSON.parse(fs.readFileSync(path.join(CH, 'results', f), 'utf8'));
let spec; if (config === 'shipped52') spec = J('shipped_policies.json')['52']; else if (config === 'ship_nn') spec = J('ship_nn.json'); else if (config === 'nn5') spec = J('specs_nn5_final.json').find((r) => /Network v3/.test(r.name)).spec; else throw new Error('config?');
spec = JSON.parse(JSON.stringify(spec)); if (spec.deepen) spec.deepen.budgetMs = 0;
const B2 = [[6, 0], [16, 88], [24, 176], [28, 237], [40, 485]];
if (corr === 'phase') spec.corr = { a: 387.4, b: 7.58 }; else if (corr === 'b2') spec.corr = { b2: B2 }; else if (corr === 'phase+b2') spec.corr = { a: 387.4, b: 7.58, b2: B2 }; else if (corr !== 'none') throw new Error('corr?');
const rules = E.DEFAULT_RULES, policy = createPolicy(rules, spec);
function toEngineState(o) { const cols = new Int32Array(4);
  for (let j = 0; j < 4; j++) { const cs = o.columns[j]; if (!cs.length) continue; let hard = 0, ace = 0, not7 = 0; for (const v of cs) { hard += v; if (v === 1) ace = 1; if (v !== 7) not7 = 1; } cols[j] = E.mkCol(hard, ace, cs.length, not7); }
  const deck = new Int32Array(11); for (let v = 1; v <= 10; v++) deck[v] = o.remaining[v - 1]; deck[o.current] += 1;
  return { cols, deck, rem: o.cards_left + 1, played: o.cards_dealt - 1, horizon: Infinity, busts: o.busts, stays: o.stays_left, prev: Math.min(o.streak, rules.sb.length - 1), score: o.score, over: false, reason: '', counts: { s21: 0, s5: 0, s777: 0, s521: 0, busts: o.busts, staysUsed: 2 - o.stays_left } }; }
const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => { if (!line.trim()) return; const msg = JSON.parse(line);
  if (msg.type === 'new_game') { if (policy.reset) policy.reset(); }
  else if (msg.type === 'decide') { const m = policy.choose(toEngineState(msg.state), msg.state.current); process.stdout.write(JSON.stringify({ stay: m.stay >= 0 ? m.stay : null, place: m.col }) + '\n'); }
  else if (msg.type === 'quit') process.exit(0); });
rl.on('close', () => process.exit(0));
