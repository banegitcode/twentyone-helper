// node play_log.js <shuffles.txt> <first> <count> <out.jsonl>
// Plays the champion (shipped52, same spec as bench/champion/champion_adapter.js) on bench shuffles and logs every decision
// (observable state + the champion's root action scores).  The deck order is used ONLY to deal cards, never given to the policy.
const L = require('./lib.js'); const fs = require('fs');
const [file, first, count, out] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5]];
const lines = fs.readFileSync(file, 'utf8').split('\n').filter((x) => x.trim()).slice(first, first + count);
const pol = process.env.CONFIG ? L.configPolicy(process.env.CONFIG) : L.championPolicy(); const E = L.E, rules = L.rules; const fd = fs.openSync(out, 'w');
lines.forEach((ln, gi) => {
  const deck = ln.trim().split(/\s+/).map(Number).map(L.codeVal); const st = E.newGame(rules); pol.reset(); let i = 0, step = 0;
  while (!st.over) {
    const v = deck[i++]; const pre = { cols: Array.from(st.cols), deck: Array.from(st.deck), rem: st.rem, busts: st.busts, stays: st.stays, prev: st.prev, score: st.score };
    const m = pol.choose(st, v);
    const sc = (m.scores || []).map((a) => ({ stay: a.stay, col: a.col, value: a.value, deep: a.deep }));
    const ev = E.applyMove(rules, st, v, m);
    fs.writeSync(fd, JSON.stringify({ t: 'dec', g: first + gi, step: step++, v, ...pre, stay: m.stay, col: m.col, exact: !!m.exact, mval: m.value, deepened: m.deepened || 0, scores: sc, pts: ev.pts + (ev.streak || 0), bust: ev.bust, cleared: ev.cleared }) + '\n');
  }
  fs.writeSync(fd, JSON.stringify({ t: 'end', g: first + gi, score: st.score, busts: st.busts, played: st.played, reason: st.reason }) + '\n');
});
fs.closeSync(fd);
