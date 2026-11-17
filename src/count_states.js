'use strict';
// node src/count_states.js [samplesPerLayer=200000]
// Estimates how many positions the full game has (the entries an exact solve from 52 cards would need).
// Position = cards left (count of each value) x the four columns (order ignored, same merging as src/exact.js)
//            x busts so far (0-2) x Stays left (0-2) x streak (0-4).
// For each number of cards left it samples (deck, columns) pairs uniformly and checks that the columns can be built
// from cards that have already been dealt. It does not check that the other dealt cards could have been cleared, and
// it counts every busts/Stays combination (a streak only where a column is empty), so the result is an upper estimate.
const E = require('./engine.js'); const R = E.DEFAULT_RULES;
const N = +process.argv[2] || 200000;
const canon = (c) => { if (c === 0) return 0; const h = c & 31, a = (c >> 5) & 1, n = (c >> 6) & 7, nt = (c >> 9) & 1; return E.mkCol(h, a && h <= 11 ? 1 : 0, n, !nt && n <= 2 ? 0 : 1); };
// column states and the card sets that make each
const idOf = new Map([[0, 0]]), codes = [0], vecs = [new Map([['0,0,0,0,0,0,0,0,0,0', new Int8Array(10)]])];
const queue = [[0, new Int8Array(10)]], seen = new Set(['0|0,0,0,0,0,0,0,0,0,0']);
while (queue.length) {
  const [id, vec] = queue.shift();
  for (let v = 1; v <= 10; v++) {
    if (vec[v - 1] >= R.fullDeck[v]) continue;
    const k = codes[id] * 11 + v; if (R.pts[k] !== 0) continue;
    const c = canon(R.next[k]); let nid = idOf.get(c);
    if (nid === undefined) { nid = codes.length; idOf.set(c, nid); codes.push(c); vecs.push(new Map()); }
    const nv = Int8Array.from(vec); nv[v - 1]++; const key = nid + '|' + nv.join(',');
    if (seen.has(key)) continue; seen.add(key); vecs[nid].set(nv.join(','), nv); queue.push([nid, nv]);
  }
}
const NID = codes.length, opts = vecs.map((m) => [...m.values()]), ncards = opts.map((o) => o[0].reduce((a, b) => a + b, 0));
console.log('column states', NID, '| card sets', seen.size, '| most card sets for one state', Math.max(...opts.map((o) => o.length)));
// number of decks with r cards left, and uniform sampling of one
const full = []; for (let v = 1; v <= 10; v++) full.push(R.fullDeck[v]);
const ways = [new Float64Array(53)]; ways[0][0] = 1;                       // ways[i][t]: values i..9 holding t cards (built backwards)
for (let i = 9; i >= 0; i--) { const w = new Float64Array(53), nx = ways[0]; for (let t = 0; t <= 52; t++) for (let c = 0; c <= full[i] && c <= t; c++) w[t] += nx[t - c]; ways.unshift(w); }
let seed = 12345; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
function sampleDeck(r, out) { let t = r; for (let i = 0; i < 10; i++) { let x = rnd() * ways[i][t], c = 0; for (; c <= full[i] && c <= t; c++) { x -= ways[i + 1][t - c]; if (x < 0) break; } if (c > full[i] || c > t) c = Math.min(full[i], t); out[i] = c; t -= c; } }
const deck = new Int8Array(10), gone = new Int8Array(10), ids = [0, 0, 0, 0];
function fits(k) {                                                          // can columns k..3 be built from the cards in `gone`?
  if (k === 4) return true;
  for (const o of opts[ids[k]]) {
    let ok = true; for (let i = 0; i < 10; i++) if (o[i] > gone[i]) { ok = false; break; }
    if (!ok) continue;
    for (let i = 0; i < 10; i++) gone[i] -= o[i];
    const f = fits(k + 1);
    for (let i = 0; i < 10; i++) gone[i] += o[i];
    if (f) return true;
  }
  return false;
}
const fact = [1, 1, 2, 6, 24]; let total = 0, totalLoose = 0; const rows = [];
for (let r = 52; r >= 1; r--) {
  let sum = 0, sumE = 0;
  for (let s = 0; s < N; s++) {
    sampleDeck(r, deck); for (let i = 0; i < 10; i++) gone[i] = full[i] - deck[i];
    let cards = 0; for (let j = 0; j < 4; j++) { ids[j] = Math.floor(rnd() * NID); cards += ncards[ids[j]]; }
    if (cards > 52 - r) continue;
    ids.sort((a, b) => ncards[b] - ncards[a]);
    if (!fits(0)) continue;
    const cnt = {}; for (const x of ids) cnt[x] = (cnt[x] || 0) + 1; let perm = 24; for (const k in cnt) perm /= fact[cnt[k]];
    sum += 1 / perm; if (cnt[0]) sumE += 1 / perm;
  }
  const boards = NID ** 4 * sum / N, boardsE = NID ** 4 * sumE / N, decks = ways[0][r], pos = decks * 9 * (boards + 4 * boardsE);   // a streak needs a column that was just cleared
  total += pos; rows.push({ r, decks, boards, pos });
  if (r % 4 === 0 || r <= 14) console.log('cards left', String(r).padStart(2), '| decks', decks.toExponential(2), '| column layouts per deck', boards.toExponential(2), '| positions', pos.toExponential(2));
}
console.log('TOTAL positions (upper estimate)', total.toExponential(3));
const big = rows.slice().sort((a, b) => b.pos - a.pos)[0]; console.log('largest layer: cards left', big.r, big.pos.toExponential(2));
require('fs').writeFileSync(__dirname + '/../results/count_states.json', JSON.stringify({ samplesPerLayer: N, columnStates: NID, total, rows }));
