#!/usr/bin/env node
'use strict';
// 21 Lab submission #2 (deterministic pooled exact endgame): champion network + search with the exact endgame of js/pooledp.js.  (adapter.js is untouched.)  JSON-lines protocol of bench/README.md, modeled on
// bench/champion/champion_adapter.js.  Only the observable state arrives; the deck order never reaches this process.
//
//   node adapter2.js --config pooledp:K[:logCap[:maxPositions[:tailTotal[:tailMove[:wallGuardSec]]]]]      (empty field = default)
//        DETERMINISTIC pooled-clock exact endgame (js/pooledp.js): every limit is a count of NEW table positions per game, so decisions are identical on any machine.
//        defaults: logCap 26 (806 MB table), maxPositions 45,000,000 (main solve), tailTotal 28,000,000 + tailMove 14,000,000 (only with <= 14 cards left) (retries after a give-up), floor: last 12 cards always get 2M.
//        wallGuardSec: OPTIONAL live-play guard (machine-dependent!) -- leave it out on the bench.
//   node adapter2.js --config deeperlog:K[:budget[:logCap]] --movelog FILE
//        plays EXACTLY like adapter.js --config deeper:K[:budget[:logCap]] (same js/hybrid.js, same exact3 table, same defaults: budget 3,200,000 new positions per move, logCap 25)
//        and appends one JSON line per game to FILE: {game, config, moves:[{rem, exact: true|false|null, newPos, tableAfter, ms}], ...} with rem = cards left incl. the current card,
//        exact = true (exact solve finished), false (gave up -> champion search), null (rem > K: not attempted); newPos = new table positions of that move's solve.
//   node adapter2.js --config shipped52    the champion unchanged (exact last 13, 100k budget): control / sanity check
//   --timelog FILE  append one JSON line per finished game (think time cpu/wall, max move, exact/give-up counts, positions) -- pooled configs only
//   --keep-budget  keep deepen.budgetMs (wall clock) of the champion search; default forces it to 0 like the Referee's adapter.
// The budget is a count of positions, not seconds, so results do not depend on how loaded the machine is.
const fs = require('fs'), path = require('path'), readline = require('readline');
const DIR = process.env.CHAMPION_DIR || path.join(__dirname, '..', '..', 'engine', 'twentyone-solver');
const C = require('./js/common.js'); const E = C.E;
const { createPolicy: createPolicyP } = require('./js/policy_p.js');
const H = require('./js/hybrid.js'), E3 = require('./js/exact3.js');
const champion = require(path.join(C.ENGINE_SRC, 'x_policies.js'));
const argv = process.argv.slice(2); const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const config = arg('config', 'pooledp:16'), keepBudget = argv.includes('--keep-budget');
const base = JSON.parse(fs.readFileSync(path.join(DIR, 'results', 'shipped_policies.json'), 'utf8'))['52'];
const spec = JSON.parse(JSON.stringify(base)); delete spec.exact; if (!keepBudget && spec.deepen) spec.deepen.budgetMs = 0;
if (config === 'shipped52') { spec.exact = base.exact; }
else if (config.startsWith('deeperlog:')) {
  const [, K, B, L] = config.split(':'); spec.exact3 = { xK: +K, budget: B ? +B : 3200000, logCap: L ? +L : 25 };
} else if (config.startsWith('pooledp:')) {
  const f = config.split(':'), n = (i) => (f[i] ? +f[i] : undefined);
  spec.pooledp = { xK: +f[1], logCap: n(2), maxPositions: n(3), tailTotal: n(4), tailMove: n(5), wallGuardSec: n(6) };
  for (const k of Object.keys(spec.pooledp)) if (spec.pooledp[k] === undefined) delete spec.pooledp[k];
} else throw new Error('unknown --config ' + config);
const rules = C.R;
const movelog = arg('movelog', null); let curMoves = [], pend = null;
function createPolicy(rules, sp) {
  if (!sp.exact3) return createPolicyP(rules, sp);
  // same construction as js/policy_exact3.js, but with a logging wrapper around the exact table (the wrapper only observes)
  const b = Object.assign({}, sp); delete b.exact3; const o = Object.assign({}, sp.exact3);
  const X = E3.createExact(rules, { logCap: o.logCap || 22, restrict: o.restrict, wasm: o.wasm });
  const W = Object.create(X); W.choose = (st, v, maxNew) => {
    const c0 = X.states(), t0 = process.cpuUsage(); const m = X.choose(st, v, maxNew), c1 = X.states(), t = process.cpuUsage(t0);
    pend = { exact: !!m, newPos: c1 >= c0 ? c1 - c0 : c1, tableAfter: c1, ms: +((t.user + t.system) / 1000).toFixed(1) }; return m;
  };
  const inner = H.withExactEndFallback(rules, champion.createPolicy(rules, b), o, W);
  return { choose(st, v) { pend = null; const m = inner.choose(st, v); curMoves.push(Object.assign({ rem: st.rem, exact: null }, pend || {})); return m; }, reset() { if (inner.reset) inner.reset(); },
    game: () => ({ moves: curMoves.length, exactMoves: curMoves.filter((x) => x.exact === true).length, giveUps: curMoves.filter((x) => x.exact === false).length }) };
}
const policy = createPolicy(rules, spec);

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
function flushMoves() { if (!movelog || !curMoves.length) return; fs.appendFileSync(movelog, JSON.stringify({ game: gameNo, config, pid: process.pid, moves: curMoves }) + '\n'); curMoves = []; }
function flushGame() {
  const g0 = policy.game ? policy.game() : null; flushMoves();
  if (!timelog || !g0 || gameNo < 0 || flushed === gameNo) return; const g = g0; flushed = gameNo;
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
