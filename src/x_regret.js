'use strict';
// node src/x_regret.js <N> <seedStart> <games> <out.json> [logCap=26] [spec.json] [threads=14]
// Full 52-card games played by a policy (default: shipped). From the moment N cards remain, every move is scored
// against the EXACT optimum for the rest of the game (src/x_exact.js). Regret of a move = exact value of the best
// action - exact value of the action played. The sum of regrets over the last N cards is an unbiased, low-noise
// estimate of (optimal play of the last N cards) - (the policy's play of the last N cards), per game.
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs'); const E = require('./engine.js');
if (!isMainThread) {
  const { createExact } = require('./exact.js'); const { createPolicy } = require('./x_policies.js');
  const { spec, seeds, N, logCap } = workerData, R = E.DEFAULT_RULES;
  const pol = createPolicy(R, spec), X = createExact(R, { logCap });
  for (const seed of seeds) {
    const deck = E.shuffledDeck(seed), st = E.newGame(R); if (pol.reset) pol.reset(); X.clear();
    const reg = new Array(N + 1).fill(0), mis = new Array(N + 1).fill(0), cat = { missedStay: 0, wrongStay: 0, other: 0, deepened: 0, notDeepened: 0 }; let i = 0, vstar = null, scoreAtN = 0, fail = null, t0 = Date.now(), remStart = 0;
    while (!st.over) {
      const v = deck[i++], m = pol.choose(st, v);
      if (st.rem <= N && !fail) {
        try {
          if (vstar === null) { vstar = X.value(st); scoreAtN = st.score; remStart = st.rem; }
          const q = X.q(st, v); let best = -Infinity, mine = null, bestA = null;
          for (const a of q) { if (a.value > best) { best = a.value; bestA = a; } if (a.stay === m.stay && a.col === m.col) mine = a.value; }
          reg[st.rem] = best - mine; if (best - mine > 0.01) { mis[st.rem] = 1; const d = best - mine; if (m.stay >= 0 && bestA.stay < 0) cat.wrongStay += d; else if (m.stay < 0 && bestA.stay >= 0) cat.missedStay += d; else cat.other += d; if (m.deepened) cat.deepened += d; else cat.notDeepened += d; }
        } catch (e) { fail = e.message; }
      }
      E.applyMove(R, st, v, m);
    }
    parentPort.postMessage({ seed, score: st.score, reached: vstar !== null, remStart, vstar, toGo: st.score - scoreAtN, reg, mis, cat, fail, states: X.states(), sec: (Date.now() - t0) / 1000 });
  }
  parentPort.postMessage({ done: true });
} else {
  const [N, s0, games, out] = [+process.argv[2], +process.argv[3], +process.argv[4], process.argv[5]];
  const logCap = +process.argv[6] || 26, T = +process.argv[8] || 14;
  const spec = process.argv[7] && process.argv[7] !== '-' ? JSON.parse(fs.readFileSync(process.argv[7])) : JSON.parse(fs.readFileSync(__dirname + '/../results/shipped_policies.json'))['52'];
  const chunks = Array.from({ length: T }, () => []); for (let i = 0; i < games; i++) chunks[i % T].push(s0 + i);
  const rows = []; let live = T; const t0 = Date.now();
  const report = () => {
    const ok = rows.filter((r) => r.reached && !r.fail && r.remStart === N), n = ok.length; if (!n) return;
    const tot = ok.map((r) => r.reg.reduce((a, b) => a + b, 0)), mean = tot.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(tot.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, n - 1));
    const per = []; for (let r = N; r >= 1; r--) per.push(r + ':' + (ok.reduce((a, g) => a + g.reg[r], 0) / n).toFixed(1));
    const mis = []; for (let r = N; r >= 1; r--) mis.push(r + ':' + (100 * ok.reduce((a, g) => a + g.mis[r], 0) / n).toFixed(0) + '%');
    const cats = {}; for (const k of Object.keys(ok[0].cat)) cats[k] = +(ok.reduce((a, g) => a + g.cat[k], 0) / n).toFixed(1);
    const vs = ok.reduce((a, g) => a + g.vstar, 0) / n, tg = ok.reduce((a, g) => a + g.toGo, 0) / n;
    const summary = { N, games: rows.length, usable: n, failed: rows.filter((r) => r.fail).length, endedEarly: rows.filter((r) => !r.reached).length, meanScoreAll: rows.reduce((a, g) => a + g.score, 0) / rows.length,
      regretLastN: mean, ci: 1.96 * sd / Math.sqrt(n), optimalToGo: vs, policyToGoRealised: tg, perCardLeft: per.join(' '), wrongMoveRate: mis.join(' '), regretByKind: cats, maxStates: Math.max(...rows.map((r) => r.states)), secPerGame: rows.reduce((a, g) => a + g.sec, 0) / rows.length };
    fs.writeFileSync(out, JSON.stringify({ summary, rows }));
    return summary;
  };
  chunks.forEach((seeds) => {
    const w = new Worker(__filename, { workerData: { spec, seeds, N, logCap }, resourceLimits: { maxOldGenerationSizeMb: 4096 } });
    w.on('message', (m) => { if (m.done) { if (--live === 0) { console.log(JSON.stringify(report(), null, 1), ((Date.now() - t0) / 1000).toFixed(0) + 's'); } return; } rows.push(m); if (rows.length % 20 === 0) { const s = report(); if (s) console.log(rows.length, 'regret', s.regretLastN.toFixed(1), '±', s.ci.toFixed(1), 'maxStates', s.maxStates, 'sec/game', s.secPerGame.toFixed(1)); } });
    w.on('error', (e) => { console.error('worker error', e); if (--live === 0) console.log(JSON.stringify(report(), null, 1)); });
  });
}
