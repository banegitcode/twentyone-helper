# Open-source tools for training a stronger "21" solitaire engine and running it in a phone browser

Verification date for everything below: 2026-11-17. Documentation was read only; no code was downloaded or run. Where a page did not show a version or commit date, that is stated. Items in "Inferences" are my reasoning, not sourced facts.

## 1. Training frameworks for custom single-player stochastic games (OpenSpiel, LightZero, muzero-general, alpha-zero-general, Pgx/mctx, PufferLib, EnvPool); Apple Silicon and cloud GPU cost

### Takeaway
Only two surveyed stacks have explicit, first-class chance-node planning: LightZero (Stochastic MuZero, tested on 2048, PyTorch, runs on macOS) and mctx (`stochastic_muzero_policy`, JAX). OpenSpiel's AlphaZero, alpha-zero-general and muzero-general are documented as two-player / deterministic and are poor fits; every option requires re-implementing the JavaScript simulator in Python, C/C++ or JAX. A rented RTX 4090 costs roughly $0.15-0.75/hour, so GPU cost is small compared with the porting effort.

### Cited Findings

**LightZero (opendilab)**
- Licence Apache-2.0; 1.7k stars; README header reads "Updated on 2026.03.11 LightZero-v0.2.0"; 300 commits — [LightZero README](https://github.com/opendilab/LightZero). A search snippet of the same README showed "Updated on 2025.06.03 LightZero-v0.2.0", so the version number has not changed between those dates — [search snippet of github.com/opendilab/lightzero](https://github.com/opendilab/lightzero).
- Algorithms in the support table: AlphaZero, MuZero, Sampled MuZero, Stochastic MuZero, EfficientZero, Gumbel MuZero, ReZero, UniZero (plus Sampled EfficientZero / Sampled UniZero columns). A tick means finished and tested, a lock means work in progress — [LightZero README](https://github.com/opendilab/LightZero).
- Stochastic MuZero is ticked for 2048, CartPole, Pendulum, LunarLander and Atari; it is locked (unfinished) for board games, MuJoCo, BipedalWalker and DM Control — [LightZero README](https://github.com/opendilab/LightZero).
- Python + PyTorch; MCTS exists twice, in Python (`ptree`) and C++ (`ctree`). "LightZero currently supports compilation only on Linux and macOS platforms"; Windows unsupported. Install is clone + `pip3 install -e .` — [LightZero README](https://github.com/opendilab/LightZero).
- The stock Stochastic MuZero 2048 config uses `num_of_possible_chance_tile = 2`, `chance_space_size = 16 * 2` (32), `use_ture_chance_label_in_chance_encoder = True`, 100 simulations, batch 512, 8 collector envs, 3 evaluator envs, `max_env_step = 1e9`, `td_steps = 10`, discount 0.999 — [stochastic_muzero_2048_config.py](https://github.com/opendilab/LightZero/blob/main/zoo/game_2048/config/stochastic_muzero_2048_config.py).
- Custom env: subclass DI-engine `BaseEnv`, register with `@ENV_REGISTRY.register('<name>')`, return observation dicts with keys `observation`, `action_mask`, `to_play` (`-1` for single-player), implement `legal_actions`, return `BaseEnvTimestep(obs_dict, rew, done, info)`, and point `env.type` / `env.import_names` in the config at it. The custom-env tutorial says nothing about how a stochastic env reports its chance outcome — [LightZero customize_envs tutorial](https://opendilab.github.io/LightZero/tutorials/envs/customize_envs.html).
- In the LightZero paper's Stochastic MuZero description, decision nodes select with pUCT and chance nodes sample outcomes from the chance distribution; the policy's default chance space size is 2 — [LightZero paper, arXiv 2310.08348](https://arxiv.org/pdf/2310.08348); [lzero.policy.stochastic_muzero source](https://opendilab.github.io/LightZero/_modules/lzero/policy/stochastic_muzero.html).

**mctx and Pgx (JAX)**
- mctx: Apache-2.0, 2.7k stars, 63 commits. README names `muzero_policy`, `gumbel_muzero_policy` and a generic `search`; it recommends Gumbel MuZero because it guarantees policy improvement when action values are correctly evaluated — [mctx README](https://github.com/google-deepmind/mctx).
- `mctx/__init__.py` reports `__version__ = "0.0.71"` and exports `stochastic_muzero_policy` together with `ChanceRecurrentFnOutput` and `DecisionRecurrentFnOutput` — [mctx __init__.py](https://github.com/google-deepmind/mctx/blob/main/mctx/__init__.py).
- Pgx: Apache-2.0, 661 stars, 969 commits; 20 games including 2048, backgammon and the MinAtar suite; API v2 (v2.0.0, 2023-11-08) changed `step` to `step(state, action, key=None)`, with the key needed only for stochastic envs; `init`/`step` are JIT-able and meant to be wrapped in `jax.vmap`; an AlphaZero example lives in `examples/alphazero`. The README gives no throughput numbers and does not mention Apple Silicon — [Pgx README](https://github.com/sotetsuk/pgx).
- A 2022 paper reports Stochastic MuZero reaching about 510,000 average on 2048, and that a Gumbel + Stochastic MuZero combination learned well with only 2 simulations — [On Reinforcement Learning for the Game of 2048, arXiv 2212.11087](https://arxiv.org/pdf/2212.11087).

**OpenSpiel (DeepMind)**
- Apache-2.0, 5.6k stars; supports single- and multi-agent, perfect- and imperfect-information games; core API and games are C++ exposed to Python; install guides for Linux, macOS and Windows — [OpenSpiel README](https://github.com/google-deepmind/open_spiel).
- The core API exposes chance nodes: a state can be tested for being a chance node and returns a list of (action, probability) outcomes — [OpenSpiel API reference](https://openspiel.readthedocs.io/en/latest/api_reference.html).
- AlphaZero doc: two implementations (Python/TF1, called "an old implementation", CPU-only, no batched inference; and C++ LibTorch with threads, batching and GPU). The model "can play any 2-player game"; the code is "a re-implementation for illustrative purposes". Chance nodes and single-player games are not addressed — [OpenSpiel alpha_zero.md](https://github.com/google-deepmind/open_spiel/blob/master/docs/alpha_zero.md).
- Algorithm list marks MCTS, Minimax/Alpha-Beta, Value Iteration, Policy Iteration, Q-learning, DQN and both AlphaZero versions as thoroughly tested, PPO as lightly tested; a `open_spiel.python.scale` module offers "AlphaZero-style search with mctx" and PPO for JAX games. Expectiminimax and MuZero are not listed — [OpenSpiel algorithms.md](https://github.com/google-deepmind/open_spiel/blob/master/docs/algorithms.md).
- Adding a game: C++ — copy `tic_tac_toe.{h,cc}` and its test, add Bazel/CMake entries, implement `spiel.h` methods, add a playthrough. Python — copy `python/games/tic_tac_toe.py` and its test, import in `python/games/__init__.py`, register in `pyspiel_test.py`. The C++ `example` binary cannot run Python games. Backgammon and Pig are the cited templates for chance events — [OpenSpiel developer_guide.md](https://github.com/google-deepmind/open_spiel/blob/master/docs/developer_guide.md).

**muzero-general (werner-duvaud)**
- MIT, 2.9k stars, 135 commits; PyTorch + Ray; targets Python 3.12+; supports single-player and two-player discrete-action games; includes a simplified "Twenty-One" card game. Add a game by copying `games/cartpole.py` and implementing `reset`, `step`, `legal_actions`, `render`. Its OpenSpiel adapter states "Chance-based games such as backgammon and simultaneous-action games are unsupported" — [muzero-general README](https://github.com/werner-duvaud/muzero-general).

**alpha-zero-general (suragnair)**
- MIT, 4.5k stars, 221 commits; described as for "any two-player turn-based adversarial game"; new games subclass `Game.py` and `NeuralNet.py`; PyTorch and Keras examples — [alpha-zero-general README](https://github.com/suragnair/alpha-zero-general).

**PufferLib**
- MIT, 6.6k stars, default branch `5.0`, 4,297 commits; "a fast and sane reinforcement learning library that can train tiny, super-human models in seconds" — [PufferLib README](https://github.com/PufferAI/PufferLib).
- PufferLib 3.0 blog claims training at up to 4M steps/second on one RTX 5090, and 2-4M steps/second for a ~150k-parameter MLP-LSTM on arcade games — [PufferLib blog](https://puffer.ai/blog.html).
- A docs mirror describes a custom Ocean env as three parts: Python wrapper, C binding, C simulation code. This is a third-party mirror, not confirmed as the official docs — [Mintlify mirror: creating environments](https://www.mintlify.com/PufferAI/PufferLib/ocean/creating-environments).

**EnvPool**
- PyPI listing states Linux, macOS and Windows wheels for Python 3.11-3.14; custom C++ envs are added through `envpool/core/env.h` with CartPole as the worked example; release wheels are built on `macos-14` — [EnvPool on PyPI](https://pypi.org/project/envpool); [EnvPool new-env docs](https://envpool.readthedocs.io/en/stable/content/new_env.html); [EnvPool build docs](https://envpool.readthedocs.io/en/latest/pages/build.html).

**Apple Silicon**
- The only current signal found on jax-metal is an unanswered Apple developer-forum thread titled "Is Jax for Apple Silicon is still supported" — [Apple Developer Forums thread 815139](https://developer.apple.com/forums/thread/815139).
- Blog-level comparisons say PyTorch MPS keeps existing PyTorch code working while MLX is faster for LLM inference; none covered RL workloads and their figures are unverified — [jisaku.com MLX vs PyTorch](https://jisaku.com/posts/mlx-vs-pytorch-apple-silicon).

**Cloud GPU prices (late 2026, ballpark; several sources are vendor blogs)**
- RTX 4090: Vast.ai marketplace from $0.14/h (September 2026), CloudRift $0.39/h, RunPod Secure Cloud $0.74/h — [vast.ai pricing guide](https://vast.ai/blog/how-much-does-it-cost-to-rent-a-gpu-in-the-cloud); [CloudRift pricing](https://cloudrift.ai/pricing); [RunPod pricing](https://www.runpod.io/gpu-cloud/pricing).
- A100 80GB: $1.39/h (PCIe) on RunPod; hyperscalers $3.67-5.03/h — [RunPod pricing](https://www.runpod.io/gpu-cloud/pricing); [Hostinger comparison](https://www.hostinger.com/au/tutorials/?p=150400).
- H100: November 2026 on-demand median $3.92/GPU-hour vs $1.94 for A100 — [AIMultiple GPU index](https://aimultiple.com/gpu-index). RunPod's own page lists H100 80GB "from $1.99/hr", which conflicts with a comparison quoting RunPod at $3.99 — [RunPod pricing](https://www.runpod.io/gpu-cloud/pricing); [Spheron comparison](https://spheron.network/blog/gpu-cloud-pricing-comparison-2026/).

### Inferences
- For a 56-input MLP value net the bottleneck is simulation and search, not network training. A 15-core Mac CPU is likely adequate for PyTorch-CPU training of nets this size; a GPU helps mainly if the environment itself is vectorised on the GPU (Pgx/JAX style) or the net grows a lot.
- At $0.15-0.75/h, a 24-hour 4090 run costs roughly $4-18. Budget is not the constraint; the port of the simulator out of JavaScript is.
- LightZero is the lowest-effort route to a tested Stochastic MuZero: Python env, macOS supported, 2048 as a template. Risk: the stock config's `max_env_step = 1e9` and 100 simulations per move suggest heavy compute, and the "true chance label" flag implies the env must expose the chance outcome, which the tutorial does not document.
- mctx is a search library only: it would need a JAX re-write of the game (as a Pgx-style env) plus a training loop. Highest ceiling for throughput, highest porting cost, and jax-metal's status means GPU work would realistically run on a rented NVIDIA card, with CPU JAX locally.
- OpenSpiel is most useful here as an exact-solver/benchmark harness (value iteration, MCTS with explicit chance outcomes) rather than as the trainer, since its AlphaZero is documented only for two-player games.
- PufferLib/EnvPool (model-free PPO at millions of steps/second) require a C or C++ port of the game. A C port would double as the basis for a WASM search core (question 4), which is a notable synergy.
- Keeping the existing Node.js trainer and adding ideas (TD/TC afterstate learning, n-tuple tables, expectimax-in-the-loop targets) may beat any framework migration, because the simulator stays in one language.

### Gaps
- Whether OpenSpiel's MCTS and its `python.scale` mctx-based AlphaZero correctly handle chance nodes in a single-player game: not stated on the pages read.
- How LightZero's Stochastic MuZero env must report the realised chance outcome: not in the tutorial; would need a read of `zoo/game_2048/envs`.
- Last-commit dates for mctx, Pgx, muzero-general, alpha-zero-general, OpenSpiel and PufferLib were not visible in the fetched pages, so "actively maintained" is unverified for each. Latest OpenSpiel release number unverified (a LinkedIn snippet mentions "OpenSpiel 2.0" with AlphaZero ported to JAX; not confirmed against the repo).
- Gymnasium, CleanRL and Stable-Baselines3 were not individually checked in this pass.
- No verified benchmark of PyTorch-MPS, MLX or jax-metal on RL workloads was found. Official PufferLib Mac support was not confirmed.
- Wall-clock training time for any of these on a game of this size is unknown.

## 2. Open-source strong 2048 engines with n-tuple networks (moporgic/TDL2048, aszczepanski/2048, nneonneo/2048-ai)

### Takeaway
TDL2048+ (MIT, C++14) is the fastest and best-documented n-tuple/TD framework, at millions of moves per second per thread, but its speed comes from 2048-specific bitboard and BMI2/AVX2 tricks. The transferable part is the method (afterstate TD/TC learning, optimistic initialisation, multistage weights, lookup-table features summed per evaluation), not the code.

### Cited Findings
- TDL2048+: MIT (copyright 2021 Hung Guei), C++14, 1,748 commits. Files: `2048.cpp` (main), `board.h` (bitboard), `makefile`, `moporgic/` helpers, `utilities/` scripts. Needs GCC 5+ and GNU Make — [TDL2048 README](https://github.com/moporgic/TDL2048).
- Speed for the 4x6-tuple network (April 2021): Ryzen 9 5950X 5.75M moves/s single-thread training, 6.55M testing, 64.7M / 102.5M multi-thread; Core i7-7700K about 3.0M / 3.35M single-thread; Raspberry Pi 2B 54k / 62k — [TDL2048 README](https://github.com/moporgic/TDL2048).
- Methods: TD(0), TD(lambda), n-step TD, temporal coherence (TC), optimistic initialisation (e.g. `4x6patt=320000/norm`), multistage TD, carousel shaping, restart; expectimax with ply depth, transposition table and tile-downgrading at test time — [TDL2048 README](https://github.com/moporgic/TDL2048).
- Results with OTD+TC training and tile-downgrading expectimax: 1-ply 412,785 average (30.16% reach 32768, 1M games); 3-ply 563,316 (57.90%); 6-ply 625,377 (72.00%, 100 games) — [TDL2048 README](https://github.com/moporgic/TDL2048).
- Recommends BMI2 + AVX2 CPUs; fallback paths exist and both can be disabled in the makefile; a Raspberry Pi 2B (ARM) appears in the tested table. Apple Silicon is not mentioned — [TDL2048 README](https://github.com/moporgic/TDL2048).
- Pretrained 4x6 to 8x6 networks are published on Hugging Face — [moporgic/TDL2048 on Hugging Face](https://huggingface.co/moporgic/TDL2048/blob/main/README.md).
- Optimistic TD paper: optimistic initialisation to encourage exploration, combined with TC fine-tuning (OTD+TC) — [Optimistic Temporal Difference Learning for 2048, arXiv 2111.11090](https://arxiv.org/pdf/2111.11090).
- aszczepanski/2048: C++11, CMake, Boost; expectimax with an n-tuple network evaluation learned by a TD variant; described as the best controller as of March 2017. 1-ply: about 324,710 average at about 258,371 moves/s; 1000 ms/move: about 609,104 average, 32768 in 69% of games. No licence is shown on the page — [aszczepanski/2048 README](https://github.com/aszczepanski/2048).
- The method behind it (delayed TC learning, multi-stage weight promotion, redundant encoding) — [Jaskowski, arXiv 1604.05085](https://www.arxiv.org/pdf/1604.05085v2).
- nneonneo/2048-ai: MIT, 1.2k stars, C++ core (`2048.cpp`, `2048.h`) plus Python browser controllers; expectimax over a "highly-efficient bitboard representation" with hand heuristics; README claims "upwards of 10 million moves per second on recent hardware" — [nneonneo/2048-ai README](https://github.com/nneonneo/2048-ai).

### Inferences
- An n-tuple network is a sum of table lookups indexed by small groups of discrete features. For "21" the analogue would be tables indexed by tuples such as (column total, soft/hard flag, cards-in-column) per column, pairs of columns, and bucketed remaining-deck counts. That is a short loop over a `Float32Array`, with no matrix multiply, and likely faster than the current 56-128-48 MLP.
- TDL2048's source is tied to a 64-bit 4x4 board, so adapting the code means rewriting the board, the index extraction and the move generator, which is most of the program. Re-implementing TD(0)/TC afterstate learning in the existing Node.js trainer is probably less work than forking it.
- Afterstate learning maps directly onto the game: evaluate the position after placing a card and before the next card is drawn, which is exactly where expectimax needs its leaf values.
- Optimistic initialisation and TC (per-weight adaptive learning rates) are independent of 2048 and can be applied to any lookup-table evaluator.
- No licence on aszczepanski/2048 means it should be read for ideas, not copied.

### Gaps
- Whether TDL2048 builds and performs well on Apple Silicon (no BMI2/AVX2) is not documented.
- Binary layout of `.w` weight files is not described in the README.
- Last commit dates were not visible for any of the three repositories.
- No published use of n-tuple networks on a card-placement solitaire was found.

## 3. Running larger networks in a phone browser, offline, in one HTML file

### Takeaway
WASM with SIMD is universally available on current phones, and ONNX Runtime Web can load its `.wasm` from an in-memory buffer, so single-file embedding is technically possible; WebGPU now ships on iOS 26 and Android Chrome 121+, while WebNN remains a desktop-only Chrome origin trial. For an MLP this small, a hand-written forward pass (JS typed arrays or a tiny custom WASM module) is the proportionate choice, and a general runtime mainly adds megabytes.

### Cited Findings
- WebAssembly SIMD: Safari and iOS Safari 16.4+, Chrome 91+, Firefox 89+, Samsung Internet 16.0+, current Chrome for Android; 96.78% global support — [caniuse wasm-simd](https://caniuse.com/wasm-simd).
- WebAssembly threads and atomics: Chrome 74+, Firefox 79+, Safari 14.1+, iOS Safari 14.5+, current Chrome for Android; 97.18% global support — [caniuse wasm-threads](https://caniuse.com/wasm-threads).
- ONNX Runtime Web multi-threading turns on only "when the browser supports WebAssembly multi-threading and `crossOriginIsolated` mode is enabled"; default thread count is min(half of `hardwareConcurrency`, 4); `proxy` runs inference in a Web Worker but cannot be combined with the WebGPU provider — [ORT Web env flags](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html).
- `env.wasm.wasmBinary` accepts an `ArrayBufferLike | Uint8Array` containing the WebAssembly binary, and when set `wasmPaths` is ignored; `simd` accepts `true | "fixed" | "relaxed" | false` — [ORT JS API: WebAssemblyFlags](https://onnxruntime.ai/docs/api/js/interfaces/Env.WebAssemblyFlags.html).
- onnxruntime-web 1.31.1 README compatibility table: `wasm` supported on every listed browser including Safari iOS and Chrome Android; `webgpu` supported on Chrome/Edge for Windows, Android (Chromium 121+) and macOS, and marked unsupported for Safari macOS/iOS and Chrome on iOS; `webgl` everywhere but in maintenance mode; `webnn` only on Chrome/Edge Windows behind a flag — [onnxruntime-web 1.31.1 README](https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/README.md).
- WebKit: WebGPU is "now shipping in Safari 26.0 for macOS, iOS, iPadOS, and visionOS" (post dated 2025-09-15); the same release evaluates WebAssembly first in a new in-place interpreter, giving faster start-up and lower memory for large modules — [WebKit Features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/). This conflicts with the ORT README table above, which still lists Safari WebGPU as unsupported.
- WebNN: Chrome origin trial re-enabled in M-147, running M-147 to M-149 after delays for release-blocking issues, and "remains disabled on Android" — [blink-dev Intent to Experiment: WebNN](https://groups.google.com/a/chromium.org/g/blink-dev/c/5CWKSChYo98). No Safari WebNN status was found.
- iOS memory: a WebKit bug is titled "Only ~300 MB of RAM is reliably available to WebAssembly pages" (iOS 17) — [WebKit bug 269777](https://bugs.webkit.org/show_bug.cgi?id=269777). On iOS 16.4 a shared `WebAssembly.Memory` with a 2 GB maximum failed with out-of-memory while non-shared worked — [WebKit bug 255103](https://bugs.webkit.org/show_bug.cgi?id=255103). Emscripten users report lowering the maximum memory setting as the iOS workaround — [emscripten issue 19374](https://github.com/emscripten-core/emscripten/issues/19374).

### Inferences
- The current net is roughly 56x128 + 128x48 + 48 weights, about 13-14k parameters. Even a 10x larger MLP is a few hundred kilobytes as float32 and about a quarter of that as int8, so iOS memory limits are irrelevant for the weights; they matter only for large transposition tables (keep total WASM/typed-array memory well under about 300 MB, and declare a small maximum).
- Embedding weights as base64 costs about 33% size overhead over raw binary and is much more compact than JSON number arrays; decode once into a `Float32Array` or `Int8Array`. The same applies to embedding a `.wasm` module and instantiating it from bytes, and to a Web Worker created from a Blob URL of inline source, which keeps the page a single file.
- For per-call latency on tiny inputs, a general runtime adds tensor allocation and JS-to-WASM call overhead on every evaluation; expectimax makes thousands of leaf evaluations per move, so a specialised batched forward pass will beat ONNX Runtime Web or TensorFlow.js here. WebGPU is not worthwhile for nets of this size because per-dispatch overhead dominates.
- Because the ORT README and WebKit disagree about Safari WebGPU, any use of the WebGPU provider on iPhone needs a real-device test.
- Cross-origin isolation, and therefore WASM threads, is not available to a page opened from `file://` or served without the headers, so the offline single-file design should assume single-threaded WASM plus ordinary Web Workers with message passing.

### Gaps
- TensorFlow.js current status, bundle size and WASM backend were not checked in this pass.
- No sourced figure was found for inferences per second of small MLPs in JS vs WASM vs WASM-SIMD on phones; this needs a local benchmark.
- int8 quantisation accuracy impact for a value net of this kind, and ONNX Runtime Web's quantised-operator speed in WASM, were not verified.
- Size of the ONNX Runtime Web `.wasm` binaries in 1.31.x was not stated in the pages read; whether the inlined bundle works from `file://` on iOS Safari is untested.
- Whether Blob-URL Web Workers and `WebAssembly.instantiate` from bytes work when the page is opened from the iOS Files app (not a web origin) was not verified.
- AssemblyScript and Rust/Emscripten toolchain status were not checked.
- No official Apple figure for maximum `ArrayBuffer` or WASM memory on iOS; the ~300 MB number comes from a bug report.

## 4. Speeding up the search itself: WASM port, bit-packing, SharedArrayBuffer / COOP-COEP on GitHub Pages

### Takeaway
GitHub Pages still cannot set COOP/COEP headers, so SharedArrayBuffer and WASM threads there depend on a fragile service-worker shim; plan for message-passing Web Workers instead. Published WASM-vs-JS speedups are inconsistent blog numbers (roughly 2-5x claimed for regular typed-array loops), so the gain for this expectimax must be measured, not assumed.

### Cited Findings
- GitHub Pages: the only staff reply (2023-07-10) says custom headers are a scenario GitHub "would support" with "No ETA at the moment"; users were still requesting it on 2026-03-26, 2026-08-15 and 2026-10-25 — [GitHub community discussion 13309](https://github.com/orgs/community/discussions/13309).
- Workarounds reported there: service-worker shims (`coi-serviceworker` / `enable-threads.js`), with reports of reload loops in Chrome (2024-07-11) and failure with coi-serviceworker v0.1.7 in Firefox (2025-08-26); `COEP: credentialless`; or moving to hosts that allow headers (Netlify `_headers`, S3 + CloudFront) — [GitHub community discussion 13309](https://github.com/orgs/community/discussions/13309).
- The service-worker approach reloads the page on first visit and works only over HTTPS or localhost — [godot-coi-serviceworker README](https://github.com/nisovin/godot-coi-serviceworker); [dev.to: Enabling COOP/COEP without touching the server](https://dev.to/stefnotch/enabling-coop-coep-without-touching-the-server-2d3n).
- WASM vs JS: one overview claims 2-5x for regular loops over large typed arrays, without methodology — [iloveblogs WASM vs JS](https://www.iloveblogs.blog/post/web-assembly-javascript-performance-2026). A Rust/WASM benchmark notes copying data across the JS-WASM boundary can become significant and cautions that its own results are small-scale — [dev.to Rust + WebAssembly performance](https://dev.to/bence_rcz_fe471c168707c1/rust-webassembly-performance-javascript-vs-wasm-bindgen-vs-raw-wasm-with-simd-4pco). An older Samsung Internet test found JS faster on small arrays and WASM faster on large ones — [Performance Testing Web Assembly vs JavaScript](https://medium.com/samsung-internet-dev/performance-testing-web-assembly-vs-javascript-e07506fd5875).
- Reference points for compact-state search: nneonneo's bitboard expectimax claims over 10M moves/s native — [nneonneo/2048-ai README](https://github.com/nneonneo/2048-ai); TDL2048 offers a power-of-two transposition table and depth limits keyed to board emptiness — [TDL2048 README](https://github.com/moporgic/TDL2048).

### Inferences
- Already-optimised JS that uses typed arrays, avoids allocation and stays monomorphic is often within about 1.5-2x of WASM; the larger wins usually come from algorithmic changes: packing the state into one or two 32-bit integers, a typed-array transposition table keyed on that packed state, merging chance outcomes by card rank instead of by card, move ordering, and probability-threshold pruning of unlikely chance branches.
- If a WASM port is done, the whole search including leaf evaluation should live inside WASM so the boundary is crossed once per move, not once per node.
- Root-level parallelism (one Worker per candidate move, plain `postMessage`) needs no SharedArrayBuffer and works on GitHub Pages and from a local file, at the cost of no shared transposition table.
- A service worker cannot register from `file://`, so the COOP/COEP shim does not help the offline single-file use case at all.
- A C implementation of the game written for PufferLib/EnvPool training could be compiled with Emscripten to give the browser search core, sharing one rules implementation between training and play.

### Gaps
- No rigorous, current WASM-vs-JS benchmark for tree search with small integer state was found; expected speedup for this solver is unknown until measured.
- Current state of `COEP: credentialless` in Safari and Firefox was not verified (the thread's information dates from 2023).
- The current `coi-serviceworker` README and version were not read directly.
- Number of performance cores usefully available to Workers on current phones was not researched.

## 5. Gradient-boosted trees or lookup-table evaluators as MLP alternatives; export to JS

### Takeaway
m2cgen converts LightGBM/XGBoost models into dependency-free JavaScript, so tree ensembles are deployable in a single file, but n-tuple lookup tables are the better-proven fast evaluator for expectimax in stochastic puzzle games.

### Cited Findings
- m2cgen is a Python library that transpiles trained models (including tree, random forest, XGBoost and LightGBM, for classification and regression) into native code in several languages including JavaScript, via `export_to_javascript(model)` — [m2cgen repository](https://github.com/BayesWitnesses/m2cgen); [m2cgen on PyPI](https://pypi.org/project/m2cgen/0.6.0).
- `lgbm-to-code` is a separate package that converts LightGBM models to Python, C++ or JavaScript — [lgbm-to-code on PyPI](https://pypi.org/project/lgbm-to-code/0.2).
- `mljs/xgboost` is an Emscripten port that runs XGBoost itself in JavaScript rather than exporting code — [mljs/xgboost](https://github.com/mljs/xgboost).
- N-tuple evaluators reach about 3.4M-6.6M evaluated moves/s per thread natively on desktop CPUs and state-of-the-art 2048 strength — [TDL2048 README](https://github.com/moporgic/TDL2048).

### Inferences
- Generated tree code is one nested if/else per tree; a few hundred trees of depth 6 is a few thousand branch evaluations per call and tens to hundreds of kilobytes of source, likely slower per evaluation than a small MLP or a handful of table lookups, and it cannot be trained online by TD without periodic full refits.
- Trees suit supervised distillation: label positions with deep expectimax or rollouts, fit LightGBM, and use it either as the leaf evaluator or as a feature-importance probe to decide which feature tuples deserve lookup tables.
- A hybrid, lookup tables for the dominant per-column features plus a small MLP residual, is a low-risk way to gain accuracy without increasing per-leaf cost much.
- m2cgen's verified latest PyPI version in the results was 0.6.0; outputs should be checked numerically against the Python model before shipping, since a search summary mentioned an open issue about wrong scores for XGBoost with `tree_method="hist"` (issue not read directly).

### Gaps
- Treelite (and its JS/WASM story) returned no results and was not verified.
- m2cgen's maintenance status and latest release date were not confirmed.
- No head-to-head benchmark of GBDT vs MLP vs n-tuple evaluation speed in JavaScript was found.

## 6. Open-source solvers/bots for blackjack-solitaire games ("21 Blitz", "Simply 21", "Catch 21", "Blackjack Solitaire")

### Takeaway
Two web searches found no open-source solver or bot for this family of games; the nearest hits are ordinary dealer-blackjack solvers and RL toys, plus a simplified "Twenty-One" environment bundled with muzero-general.

### Cited Findings
- Searches for the game names with "solver", "bot", "expectimax" and "reinforcement learning" returned only app-store listings and standard blackjack projects, for example an exact house-rules solver — [juliendubost/black-jack-resolver](https://awesome.ecosyste.ms/projects/github.com%2Fjuliendubost%2Fblack-jack-resolver) — and tabular/deep RL blackjack demos — [lxmymjr/Blackjack](https://github.com/lxmymjr/Blackjack); [AntoniovanDijck/BlackJackRL](https://github.com/AntoniovanDijck/BlackJackRL).
- RLCard is a general card-game RL toolkit with multiple environments, not a solitaire solver — [rlcard fork](https://github.com/kaiks/rlcard).
- muzero-general ships a game described as "Twenty-One ... a simplified card game" — [muzero-general README](https://github.com/werner-duvaud/muzero-general).
- 21 Blitz is a commercial blackjack-solitaire hybrid played for score against another player — [21 Blitz on the App Store](https://apps.apple.com/us/app/-/id1330011201).

### Inferences
- The existing solver appears to have no public open-source competitor, so progress has to come from general methods (2048-style TD/n-tuple learning, Stochastic MuZero) rather than from borrowing a domain-specific engine.
- Dealer-blackjack solvers address a different decision problem (hit/stand against a dealer) and offer little beyond card-probability bookkeeping.

### Gaps
- GitHub's own code search was not used (web search only), so small unstarred repositories may exist. "Simply 21" returned nothing at all.
- No academic paper analysing optimal play of a multi-column 21 solitaire was found in these searches.
