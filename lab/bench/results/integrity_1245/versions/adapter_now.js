#!/usr/bin/env node
'use strict';
// 21 Lab submission: champion (shipped52 network + search, exact last 4) with its exact endgame swapped for / extended by
// experiments/exact-endgame-deeper (js/exact3.js + js/hybrid.js).  JSON-lines protocol of bench/README.md, modeled on
// bench/champion/champion_adapter.js.  Only the observable state arrives; the deck order never reaches this process.
//
//   node adapter.js --config parity13                     exact3 with exactly the shipped52 settings (xK 13, 100k positions/move, logCap 21):
//                                                         must play game-for-game like shipped52 (sanity check of the plug-in)
//   node adapter.js --config deeper:K[:budget[:logCap]]   exact3 endgame from K cards, `budget` NEW table positions per move
//                                                         (default 3,200,000 = about 2.0 s of CPU for one move at ~1.6M positions/s measured on the
//                                                         loaded box), logCap default 25.  If a move's solve does not finish, that move uses the
//                                                         champion's own search (the solved positions are kept for the next move), exactly like shipped52.
//   node adapter.js --config deeper:K:budget:logCap:eval  same, but a move whose solve does not finish uses the depth-1 frontier-evaluator fallback
//                                                         with the STAND-IN heuristic (timing/plumbing only; NOT recommended for scoring)
//   node adapter.js --config pooled:K[:logCap[:clockSec[:cpu|wall[:reserveSec]]]]
//                                                         POOLED-CLOCK mode (3-minute clock is pooled over the game): one big exact solve at the first move with
//                                                         <= K cards left (later moves are table lookups), in slices of 1M positions, with the time-safety rule of js/pooled.js
//                                                         (give up for this move if the solve would eat the clock needed for the rest of the game, or if the table passes
//                                                         70% of its capacity).  Defaults: logCap 26 (806 MB table, ~50M positions), clockSec 180, clock cpu, reserveSec 20.
//   --timelog FILE  append one JSON line per finished game (think time cpu/wall, max move, exact/give-up counts, positions) -- pooled configs only
//   --keep-budget  keep deepen.budgetMs (wall clock) of the champion search; default forces it to 0 like the Referee's adapter.
// The budget is a count of positions, not seconds, so results do not depend on how loaded the machine is.
const fs = require('fs'), path = require('path'), readline = require('readline');
const DIR = process.env.CHAMPION_DIR || path.join(__dirname, '..', '..', 'engine', 'twentyone-solver');
const C = require('./js/common.js'); const E = C.E;
const { createPolicy } = require('./js/policy_exact3.js');
const argv = process.argv.slice(2); const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const config = arg('config', 'deeper:16'), keepBudget = argv.includes('--keep-budget');
const base = JSON.parse(fs.readFileSync(path.join(DIR, 'results', 'shipped_policies.json'), 'utf8'))['52'];
const spec = JSON.parse(JSON.stringify(base)); delete spec.exact; if (!keepBudget && spec.deepen) spec.deepen.budgetMs = 0;
if (config === 'parity13') spec.exact3 = { xK: 13, logCap: 21, budget: 100000 };
else if (config.startsWith('deeper:')) {
  const [, K, B, L, ev] = config.split(':');
  spec.exact3 = { xK: +K, budget: B ? +B : 3200000, logCap: L ? +L : 25 }; if (ev === 'eval') { spec.exact3.useStandInEvaluator = true; spec.exact3.depth = 1; }
} else if (config.startsWith('pooled:')) {
  const [, K, L, CS, CK, RS] = config.split(':');
  spec.pooled = { xK: +K, logCap: L ? +L : 26, clockSec: CS ? +CS : 180, clock: CK || 'cpu', reserveSec: RS ? +RS : 20 };
} else throw new Error('unknown --config ' + config);
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
