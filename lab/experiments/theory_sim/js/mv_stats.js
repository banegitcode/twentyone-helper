// Derive clear types from logged moves (data/all.jsonl) using Landon's rule tables, and score by bust count.
const fs = require('fs'); const E = require('/workspace/21lab/engine/twentyone-solver/src/engine.js');
const rules = E.DEFAULT_RULES; const typ = { 400: 'n21', 600: 'n777', 800: 'n5', 1000: 'n521' };
const cnt = { n21: 0, n777: 0, n5: 0, n521: 0, bust: 0 }; let games = 0; const byb = {}; const clearsByRemBucket = {};
const ends = {};
const lines = fs.readFileSync('/workspace/21lab/experiments/theory_sim/data/all.jsonl', 'utf8').split('\n');
const bk = (rem) => rem > 41 ? '52-42' : rem > 31 ? '41-32' : rem > 21 ? '31-22' : rem > 11 ? '21-12' : '11-1';
const scoreIn = {}; let streakish = 0;
for (const l of lines) {
  if (l.startsWith('{"t":"mv"')) {
    const m = JSON.parse(l); const cols = m.cols.slice(); if (m.stay >= 0) cols[m.stay] = 0;
    const p = rules.pts[cols[m.col] * 11 + m.card];
    if (p > 0) { cnt[typ[p]]++; const b = bk(m.rem); clearsByRemBucket[b] = (clearsByRemBucket[b] || 0) + 1; }
    else if (p < 0) cnt.bust++;
  } else if (l.startsWith('{"t":"end"')) { const e = JSON.parse(l); games++; (byb[e.busts] = byb[e.busts] || []).push(e.score); }
}
console.log('games', games, 'per game:', Object.fromEntries(Object.entries(cnt).map(([k, v]) => [k, +(v / games).toFixed(3)])));
console.log('clears/game by cards-left bucket', Object.fromEntries(Object.entries(clearsByRemBucket).map(([k, v]) => [k, +(v / games).toFixed(2)])));
for (const b of Object.keys(byb)) { const a = byb[b]; const m = a.reduce((x, y) => x + y, 0) / a.length; const sd = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); console.log('final busts', b, 'n', a.length, 'mean score', m.toFixed(0), '±', (sd / Math.sqrt(a.length)).toFixed(0)); }
