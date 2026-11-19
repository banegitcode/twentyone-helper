// How often does a 21-completing card meet a 3-card soft column with hard<=7 ("soft low 3-card", e.g. A,A,A / A,A,2 / A,2,3 ...),
// and does the champion-like policy take the completion?  Also frequency of 'sure-800' columns (4 cards, hard<=11).
const fs = require('fs'); const E = require('/workspace/21lab/engine/twentyone-solver/src/engine.js'); const rules = E.DEFAULT_RULES;
let games = 0, events = 0, taken = 0, ev2 = 0, taken2 = 0; const detail = {};
let sure800Moves = 0, moves = 0;
for (const l of fs.readFileSync('/workspace/21lab/experiments/theory_sim/data/all.jsonl', 'utf8').split('\n')) {
  if (l.startsWith('{"t":"end"')) games++;
  if (!l.startsWith('{"t":"mv"')) continue; const m = JSON.parse(l); moves++;
  const cols = m.cols.slice(); if (m.stay >= 0) cols[m.stay] = 0;
  // any column (pre-stay view = actual state shown to the policy)
  for (let j = 0; j < 4; j++) {
    const c = m.cols[j]; if (!c) continue; const hard = c & 31, ace = (c >> 5) & 1, n = (c >> 6) & 7;
    if (n === 3 && ace && hard <= 7 && rules.pts[c * 11 + m.card] === 400) {
      events++; const took = (m.col === j && m.stay !== j); if (took) taken++;
      const k = 'hard' + hard; detail[k] = detail[k] || [0, 0]; detail[k][0]++; if (took) detail[k][1]++;
    }
    if (n === 3 && ace && hard <= 10 && rules.pts[c * 11 + m.card] === 400) { ev2++; if (m.col === j && m.stay !== j) taken2++; }
  }
}
console.log('games', games, 'events/game (3-card soft hard<=7 meets a 21-completing card):', (events / games).toFixed(3), 'taken', (taken / events).toFixed(3), JSON.stringify(detail));
console.log('hard<=10:', (ev2 / games).toFixed(3), 'taken', (taken2 / ev2).toFixed(3));
