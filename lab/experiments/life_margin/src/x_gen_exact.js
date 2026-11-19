'use strict';
// node src/x_gen_exact.js <M> <seedStart> <games> <out.bin> [rollouts=150] [threads=7] [logCap=24]
// Training rows with EXACT labels for the late game. Each full game is played by a fast network player (half the
// games with one random move) until M cards remain; the rest of the game is solved exactly, then replayed
// `rollouts` times with fresh card orders by the exact player (15% random placements). Every position met is
// written as [features..., exact points still to come / 1000] (same row format as src/gen_data.js).
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs'); const E = require('./engine.js'); const ROW = E.NF + 1;
if (!isMainThread) {
  const { createExact } = require('./exact.js');
  const { nn, seeds, M, rollouts, logCap } = workerData, R = E.DEFAULT_RULES;
  const pol = E.createSearcher(R, { depth: 1, stayInner: 'forced', cache: true, nn }), X = createExact(R, { logCap });
  const f = new Float64Array(E.NF); let out = new Float32Array(seeds.length * rollouts * (M - 1) * ROW), n = 0, skipped = 0;
  const emit = (st, val) => { E.featurize(st.cols, st.deck, st.rem, st.rem, st.busts, st.stays, st.prev, 4, f); for (let x = 0; x < E.NF; x++) out[n * ROW + x] = f[x]; out[n * ROW + E.NF] = val / 1000; n++; };
  for (const seed of seeds) {
    const rng = E.mulberry32(seed ^ 0x3c6ef372), deck = E.shuffledDeck(seed), st = E.newGame(R); pol.reset();
    const dev = rng() < 0.5 ? Math.floor(rng() * (52 - M)) : -1; let i = 0;
    while (!st.over && st.rem > M) {
      const v = deck[i]; let mv;
      if (i === dev) { const acts = []; for (let j = 0; j < 4; j++) acts.push({ stay: -1, col: j }); if (st.stays > 0 && rng() < 0.3) for (let s = 0; s < 4; s++) if (st.cols[s]) acts.push({ stay: s, col: s }); mv = acts[Math.floor(rng() * acts.length)]; }
      else mv = pol.choose(st, v);
      E.applyMove(R, st, v, mv); i++;
    }
    if (st.over) continue;
    X.clear();
    try {
      emit(st, X.value(st));
      const rest = deck.slice(i);
      for (let r = 0; r < rollouts; r++) {
        for (let a = rest.length - 1; a > 0; a--) { const b = Math.floor(rng() * (a + 1)); const t = rest[a]; rest[a] = rest[b]; rest[b] = t; }
        const g = E.cloneGame(st); let k = 0;
        while (!g.over) {
          const v = rest[k++]; let mv = X.choose(g, v);
          if (rng() < 0.15) mv = { stay: -1, col: Math.floor(rng() * 4) };
          E.applyMove(R, g, v, mv);
          if (!g.over) emit(g, X.value(g));
        }
      }
    } catch (e) { skipped++; }
  }
  const res = out.slice(0, n * ROW); parentPort.postMessage({ res, skipped }, [res.buffer]);
} else {
  const [M, s0, games, outFile] = [+process.argv[2], +process.argv[3], +process.argv[4], process.argv[5]];
  const rollouts = +process.argv[6] || 150, T = +process.argv[7] || 7, logCap = +process.argv[8] || 24;
  if (s0 < 1000000 || s0 + games > 1500000) throw new Error('training seeds must stay inside 1,000,000-1,499,999');
  const nn = JSON.parse(fs.readFileSync(__dirname + '/../results/shipped_policies.json'))['52'].nn, t0 = Date.now();
  const chunks = Array.from({ length: T }, () => []); for (let i = 0; i < games; i++) chunks[i % T].push(s0 + i);
  Promise.all(chunks.map((seeds) => new Promise((res, rej) => { const w = new Worker(__filename, { workerData: { nn, seeds, M, rollouts, logCap } }); w.on('message', res); w.on('error', rej); })))
    .then((parts) => {
      const fd = fs.openSync(outFile, 'w'); let rows = 0, sk = 0;
      for (const p of parts) { fs.writeSync(fd, Buffer.from(p.res.buffer, p.res.byteOffset, p.res.byteLength)); rows += p.res.length / ROW; sk += p.skipped; }
      fs.closeSync(fd); console.log(rows, 'rows', 'games skipped (table full)', sk, ((Date.now() - t0) / 1000).toFixed(0) + 's');
    });
}
