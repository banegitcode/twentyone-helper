'use strict';
// Evaluator-v2 data generation with the CHAMPION policy (engine/twentyone-solver, read-only use).
//   node gen_v2.js <policy ship|ship_noexact> <seedStart> <games> <out.f32> [workers=4]  [--shuf bench/shuffles/<file>.txt] [--carousel q]
//   --carousel q : bust-state carousel (ideas/bust-state-carousel.md). With probability q per game: play k ~ U{0..28} cards with the champion policy, then FORCE busts:=1 or 2
//                  (50/50; a legal value-function input, the game continues normally: 3rd bust ends it, no Perfect Bonus) and keep only the positions from that move on (dev column = 2).
//                  Targets stay true return-to-go of the champion continuation (no future-order info).
// One row per position (after each placement), raw state + labels, Float32 x ROW:
//   [c0 c1 c2 c3 | d1..d10 (cards left incl. NOTHING of the future order) | busts stays prev rem | G qn rn exn p | game step dev]
//   G   = realized points scored after this position (MC return-to-go incl. Perfect Bonus)
//   qn  = the policy's search value for ITS NEXT move on the card that was actually dealt (TD(0) label; EXACT if exn=1,
//         i.e. next move was made by the exact endgame solver);  rn = points scored by that next move (0 if game ended)
//   p   = shipped network's value of this position (for lambda-return bootstraps / bias checks)
//   dev = 1 if a random exploration move was injected earlier in this game (only positions from the injected move on are kept)
// A position's lambda-return is built offline from (rn, qn, G): see train_targets.py.   Deck order never leaves the generator
// except through the single dealt card, exactly like the real game.  Training seeds only (default range 1,300,000+).
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path'), fs = require('fs');
const SRC = path.join(__dirname, '../../engine/twentyone-solver/src/');
const ROW = 4 + 10 + 4 + 5 + 3;
if (!isMainThread) {
  const E = require(SRC + 'engine.js'); const { createPolicy } = require(SRC + 'x_policies.js'); const R = E.DEFAULT_RULES;
  const { spec, seeds, decks, carousel } = workerData, nn = spec.nn;
  const L = nn.layers.map((l) => ({ nIn: l.nIn, nOut: l.nOut, W: Float64Array.from(l.W), b: Float64Array.from(l.b) }));
  const A = new Float64Array(256), B = new Float64Array(256), f = new Float64Array(E.NF);
  const net = (st) => { E.featurize(st.cols, st.deck, st.rem, st.rem, st.busts, st.stays, st.prev, 4, f); let x = A, y = B; for (let i = 0; i < E.NF; i++) x[i] = f[i];
    for (let li = 0; li < L.length; li++) { const l = L[li], last = li === L.length - 1; for (let o = 0, k = 0; o < l.nOut; o++) { let s = l.b[o]; for (let i = 0; i < l.nIn; i++, k++) s += l.W[k] * x[i]; y[o] = last || s > 0 ? s : 0; } const t = x; x = y; y = t; } return x[0] * 1000; };
  const pol = createPolicy(R, spec); let batch = [], ng = 0;
  for (let gi = 0; gi < seeds.length; gi++) {
    const seed = seeds[gi], rng = E.mulberry32(seed ^ 0x7a3c91d5), deck = decks ? decks[gi] : E.shuffledDeck(seed, R), st = E.newGame(R); if (pol.reset) pol.reset();
    let dev = rng() < 0.5 ? Math.floor(rng() * 50) : -1; let i = 0; const rows = []; let kind = dev >= 0 ? 1 : 0, carBusts = 0;
    if (carousel > 0) { const r1 = rng(), r2 = rng(), r3 = rng(); if (r1 < carousel) { dev = Math.floor(r2 * 29); carBusts = r3 < 0.5 ? 1 : 2; kind = 2; } }
    while (!st.over) {
      const v = deck[i]; let mv, isDev = false;
      if (kind === 2 && i === dev) { st.busts = carBusts; mv = pol.choose(st, v); }
      else if (i === dev) { isDev = true; const acts = []; for (let j = 0; j < 4; j++) acts.push({ stay: -1, col: j });
        if (st.stays > 0 && rng() < 0.3) for (let s = 0; s < 4; s++) if (st.cols[s]) for (let j = 0; j < 4; j++) acts.push({ stay: s, col: j });
        mv = acts[Math.floor(rng() * acts.length)]; mv.value = null; mv.exact = false; }
      else mv = pol.choose(st, v);
      const prevScore = st.score; E.applyMove(R, st, v, mv); i++;
      // fill previous row's next-move fields
      if (rows.length && rows[rows.length - 1].open) { const pr = rows[rows.length - 1]; pr.qn = mv.value == null ? NaN : mv.value; pr.rn = st.score - prevScore; pr.exn = mv.exact ? 1 : 0; pr.open = false; }
      if (!st.over && i > dev) { const r = { cols: Array.from(st.cols), deck: Array.from(st.deck).slice(1), busts: st.busts, stays: st.stays, prev: st.prev, rem: st.rem, scoreAfter: st.score, p: net(st), step: i, qn: NaN, rn: 0, exn: 0, open: true }; rows.push(r); }
    }
    for (const r of rows) {
      const o = new Float32Array(ROW); let k = 0;
      for (let q = 0; q < 4; q++) o[k++] = r.cols[q]; for (let v = 0; v < 10; v++) o[k++] = r.deck[v];
      o[k++] = r.busts; o[k++] = r.stays; o[k++] = r.prev; o[k++] = r.rem; o[k++] = st.score - r.scoreAfter; o[k++] = r.qn; o[k++] = r.rn; o[k++] = r.exn; o[k++] = r.p;
      o[k++] = seed; o[k++] = r.step; o[k++] = kind; batch.push(o);
    }
    ng++; if (ng % 20 === 0 || gi === seeds.length - 1) { const out = new Float32Array(batch.length * ROW); batch.forEach((o, j) => out.set(o, j * ROW)); parentPort.postMessage({ out, ng: ng }, [out.buffer]); batch = []; ng = 0; }
  }
  parentPort.postMessage({ done: true });
} else {
  const args = process.argv.slice(2).filter((a, i, arr) => a !== '--shuf' && arr[i - 1] !== '--shuf' && a !== '--carousel' && arr[i - 1] !== '--carousel');
  const carousel = process.argv.includes('--carousel') ? +process.argv[process.argv.indexOf('--carousel') + 1] : 0;
  const [which, s0, count, out, W] = [args[0], +args[1], +args[2], args[3], +args[4] || 4];
  const shufFile = process.argv.includes('--shuf') ? process.argv[process.argv.indexOf('--shuf') + 1] : null;
  const shipped = JSON.parse(fs.readFileSync(path.join(SRC, '../results/shipped_policies.json')))['52']; const spec = JSON.parse(JSON.stringify(shipped));
  if (spec.deepen) spec.deepen.budgetMs = 0; if (which === 'ship_noexact') delete spec.exact; else if (which !== 'ship') throw new Error('policy?');
  if (!shufFile && (s0 < 1000000 || s0 + count > 1500000)) throw new Error('training seeds must stay inside 1,000,000-1,499,999 (champion convention)');
  let decks = null; if (shufFile) decks = fs.readFileSync(shufFile, 'utf8').trim().split('\n').slice(s0, s0 + count).map((l) => l.trim().split(/\s+/).map((c) => Math.min((+c % 13) + 1, 10)));
  const chunks = Array.from({ length: W }, () => ({ seeds: [], decks: decks ? [] : null }));
  for (let i = 0; i < count; i++) { const c = chunks[i % W]; c.seeds.push(s0 + i); if (decks) c.decks.push(decks[i]); }
  const fd = fs.openSync(out, 'w'); let rows = 0, games = 0, finished = 0; const t0 = Date.now();
  for (const c of chunks) { const w = new Worker(__filename, { workerData: { spec, seeds: c.seeds, decks: c.decks, carousel } });
    w.on('message', (m) => { if (m.done) { if (++finished === W) { fs.closeSync(fd); console.log('done', games, 'games', rows, 'rows', ((Date.now() - t0) / 1000).toFixed(0) + 's'); } return; }
      fs.writeSync(fd, Buffer.from(m.out.buffer, m.out.byteOffset, m.out.byteLength)); rows += m.out.length / ROW; games += m.ng; if (games % 100 < 20) console.log(games, 'games', rows, 'rows', ((Date.now() - t0) / 1000).toFixed(0) + 's'); });
    w.on('error', (e) => { console.error(e); process.exit(1); }); }
}
