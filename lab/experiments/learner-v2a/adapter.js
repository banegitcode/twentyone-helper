#!/usr/bin/env node
'use strict';
// v2a submission: deeper:16 (shipped52 network + search, exact solve from 16 cards, budget 3.2M new positions per move, logCap 25) with the leaf network REPLACED by a
// fine-tuned one for leaves with lo..hi cards left (the positions the fallback search evaluates in the 13-16 band).  Copy of experiments/exact-endgame-deeper/adapter.js
// (frozen snapshot untouched) + a patched copy of engine.js in ./src (params.nnAlt).  JSON-lines protocol of bench/README.md; observable state only.
//   node adapter.js --v2a none                    control: must play move-for-move like deeper:16
//   node adapter.js --v2a champ                   plumbing check: alt network = the champion's own weights on lo..hi (must also equal deeper:16)
//   node adapter.js --v2a <name> [--lo 10 --hi 15]   network nets/<name>.json (inside this folder; champion-net layout) used at leaves with lo..hi cards left
const fs = require('fs'), path = require('path'), readline = require('readline');
process.env.TWENTYONE_SRC = path.join(__dirname, 'src');          // all engine/exact modules come from the patched copy next to this file
const DIR = process.env.CHAMPION_DIR || path.join(__dirname, '..', '..', 'engine', 'twentyone-solver');
const C = require('./js/common.js'); const E = C.E;
const { createPolicy } = require('./js/policy_exact3.js');
const argv = process.argv.slice(2); const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const config = 'v2a'; const v2a = arg('v2a', 'none'), LO = +arg('lo', 10), HI = +arg('hi', 15), keepBudget = argv.includes('--keep-budget');
const base = JSON.parse(fs.readFileSync(path.join(DIR, 'results', 'shipped_policies.json'), 'utf8'))['52'];
const spec = JSON.parse(JSON.stringify(base)); delete spec.exact; if (!keepBudget && spec.deepen) spec.deepen.budgetMs = 0;
spec.exact3 = { xK: 16, budget: 3200000, logCap: 25 };
if (v2a === 'champ') spec.nnAlt = { layers: base.nn.layers, scale: base.nn.scale || 1000, lo: LO, hi: HI };
else if (v2a !== 'none') {   // config name = file nets/<name>.json INSIDE this folder (champion-net layout {scale, layers:[{nIn,nOut,W,b}]}, as in ship_nn.json "nn"); no paths outside the folder
  if (!/^[A-Za-z0-9_.-]+$/.test(v2a)) throw new Error('--v2a takes a net NAME (nets/<name>.json), not a path');
  let m = JSON.parse(fs.readFileSync(path.join(__dirname, 'nets', v2a.replace(/\.json$/, '') + '.json'), 'utf8')); if (m.nn) m = m.nn;
  spec.nnAlt = { layers: m.layers, scale: m.scale || 1000, lo: LO, hi: HI };
}
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
const timelog = arg('timelog', null); let gameNo = -1, flushed = -1;
function flushGame() {
  if (!timelog || !policy.game || gameNo < 0 || flushed === gameNo) return; const g = policy.game(); flushed = gameNo;
  fs.appendFileSync(timelog, JSON.stringify(Object.assign({ game: gameNo, config, pid: process.pid, rssMB: Math.round(process.memoryUsage().rss / 1048576) }, g)) + '\n');
}
const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  if (msg.type === 'new_game') { flushGame(); gameNo = msg.game != null ? msg.game : gameNo + 1; if (policy.reset) policy.reset(); }
  else if (msg.type === 'decide') {
    const st = toEngineState(msg.state); const m = policy.choose(st, msg.state.current);
    process.stdout.write(JSON.stringify({ stay: m.stay >= 0 ? m.stay : null, place: m.col }) + '\n');
  } else if (msg.type === 'quit') { flushGame(); process.exit(0); }
});
rl.on('close', () => { flushGame(); process.exit(0); });

