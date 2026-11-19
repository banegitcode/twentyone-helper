#!/usr/bin/env node
'use strict';
// Bench subprocess adapter = champion (shipped52 config, deepen.budgetMs forced 0, exactly like bench/champion/champion_adapter.js)
// + an OPTIONAL post-hoc re-ranking of the root actions using the policy's own `scores` list.  Observable state only; no deck order.
//   node hooked_adapter.js --config shipped52 --cfg '<json>'   or   --cfgfile path.json
// cfg: { stay: [[remMax, margin], ...], bust: {"0": [[remMax, m], ...], "1": [...], "2": [...]} , maxRemAdj: 52 }
//   For each root action a of the search (not used when the exact endgame answered, m.exact):
//      score(a) = (a.deep ?? a.value)  -  stayMargin(rem)  [if a uses a Stay]  -  bustMargin(busts_before, rem) [if a's placement busts]
//   stay/bust tables are step functions: first row with rem <= remMax applies (rows sorted by remMax ascending); no row -> 0.
//   Positive stay margin = reluctance to use a Stay; positive bust margin = extra aversion to busting (negative = less averse).
const fs = require('fs'), path = require('path'), readline = require('readline');
const DIR = process.env.CHAMPION_DIR || path.join(__dirname, '..', '..', '..', 'engine', 'twentyone-solver'), SRC = path.join(DIR, 'src');
const E = require(path.join(SRC, 'engine.js')); const { createPolicy } = require(path.join(SRC, 'x_policies.js'));
const argv = process.argv.slice(2); const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const J = (f) => JSON.parse(fs.readFileSync(path.join(DIR, 'results', f), 'utf8'));
const config = arg('config', 'shipped52');
let spec; if (config === 'shipped52') spec = J('shipped_policies.json')['52']; else if (config === 'nn5') spec = J('specs_nn5_final.json').find((r) => /Network v3/.test(r.name)).spec; else throw new Error('config?');
spec = JSON.parse(JSON.stringify(spec)); if (spec.deepen) spec.deepen.budgetMs = 0;
const cfg = arg('cfgfile') ? JSON.parse(fs.readFileSync(arg('cfgfile'), 'utf8')) : JSON.parse(arg('cfg', '{}'));
const rules = E.DEFAULT_RULES, policy = createPolicy(rules, spec);
const lookup = (tab, rem) => { if (!tab) return 0; for (const [mx, m] of tab) if (rem <= mx) return m; return 0; };
function toEngineState(o) {
  const cols = new Int32Array(4);
  for (let j = 0; j < 4; j++) { const cs = o.columns[j]; if (!cs.length) continue; let hard = 0, ace = 0, not7 = 0; for (const v of cs) { hard += v; if (v === 1) ace = 1; if (v !== 7) not7 = 1; } cols[j] = E.mkCol(hard, ace, cs.length, not7); }
  const deck = new Int32Array(11); for (let v = 1; v <= 10; v++) deck[v] = o.remaining[v - 1]; deck[o.current] += 1;
  return { cols, deck, rem: o.cards_left + 1, played: o.cards_dealt - 1, horizon: Infinity, busts: o.busts, stays: o.stays_left, prev: Math.min(o.streak, rules.sb.length - 1), score: o.score, over: false, reason: '', counts: { s21: 0, s5: 0, s777: 0, s521: 0, busts: o.busts, staysUsed: 2 - o.stays_left } };
}
function decide(o) {
  const st = toEngineState(o); const m = policy.choose(st, o.current);
  if (m.exact || !m.scores || !(cfg.stay || cfg.bust)) return m;
  const tier = m.scores.some((a) => a.deep !== undefined) ? m.scores.filter((a) => a.deep !== undefined) : m.scores;
  let best = null, bv = -Infinity;
  for (const a of tier) {
    let v = a.deep !== undefined ? a.deep : a.value;
    if (a.stay >= 0 && cfg.stay) v -= lookup(cfg.stay, st.rem);
    if (cfg.bust) {
      const cols = Array.from(st.cols); if (a.stay >= 0) cols[a.stay] = 0;
      if (rules.pts[cols[a.col] * 11 + o.current] < 0) v -= lookup(cfg.bust[String(Math.min(st.busts, 2))], st.rem);
    }
    if (v > bv + 1e-9) { bv = v; best = a; }
  }
  return best || m;
}
const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  if (!line.trim()) return; const msg = JSON.parse(line);
  if (msg.type === 'new_game') { if (policy.reset) policy.reset(); }
  else if (msg.type === 'decide') { const m = decide(msg.state); process.stdout.write(JSON.stringify({ stay: m.stay >= 0 ? m.stay : null, place: m.col }) + '\n'); }
  else if (msg.type === 'quit') process.exit(0);
});
rl.on('close', () => process.exit(0));
