'use strict';
// node js/paired.js --games 20 --seed0 9100000 --base '{"depth":1,"stayInner":"forced","cache":true,"endgameK":4}' --A '{"exact":{"xK":12,"logCap":24}}' --B '{"exact3":{"xK":12,"logCap":24}}'
// In-process paired comparison of two policy specs (A = champion path, B = this experiment) on identical shuffles
// (engine shuffles, E.shuffledDeck(seed)).  Prints mean diff B-A and its standard error.  NOT the Referee's acceptance harness
// (that uses bench/ shuffle sets and the champion with its network): this checks that the plug-in works and measures time per move.
const C = require('./common.js'); const E = C.E, R = C.R; const P3 = require('./policy_exact3.js');
const args = {}; for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const games = +(args.games || 20), s0 = +(args.seed0 || 9100000), base = JSON.parse(args.base), A = JSON.parse(args.A), B = JSON.parse(args.B);
const mk = (x) => P3.createPolicy(R, Object.assign({}, base, x));
const pa = mk(A), pb = mk(B); const d = [], ta = [], tb = []; let maxA = 0, maxB = 0;
function play(pol, seed, tl) {
  const deck = E.shuffledDeck(seed), st = E.newGame(R); pol.reset(); let i = 0, mx = 0;
  while (!st.over) { const v = deck[i++], t0 = performance.now(); const m = pol.choose(st, v); const dt = performance.now() - t0; if (dt > mx) mx = dt; tl.push(dt); E.applyMove(R, st, v, m); }
  if (st.busts === 0) st.score += R.cfg.perfectBonus; return [st.score, mx];
}
for (let g = 0; g < games; g++) {
  const [a, ma] = play(pa, s0 + g, ta), [b, mb] = play(pb, s0 + g, tb); maxA = Math.max(maxA, ma); maxB = Math.max(maxB, mb); d.push(b - a);
  console.log(s0 + g, 'A', a, 'B', b);
}
const mean = d.reduce((x, y) => x + y, 0) / d.length, sd = Math.sqrt(d.reduce((x, y) => x + (y - mean) ** 2, 0) / Math.max(1, d.length - 1));
console.log(JSON.stringify({ games, meanDiffBminusA: mean, se: sd / Math.sqrt(d.length), identicalGames: d.filter((x) => x === 0).length, maxMoveMsA: maxA, maxMoveMsB: maxB }));
