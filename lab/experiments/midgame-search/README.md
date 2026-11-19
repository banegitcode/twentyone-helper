# midgame-search (21 Search)
Deeper, node-budgeted search above 16 cards over a selectable network leaf; exact endgame = deeper:16's (copied unchanged). Design, cost model, pre-registered gain, leaf-selection scheme: `ideas/midgame-search.md`.
```
adapter.js           node adapter.js --config midsearch:<params>[:leaf=<name>][:leaflow=<name>] [--timelog F] [--movelog F]   (bench JSON-lines protocol)
js/msearch.js        the searcher (champion algorithm + extra pass + beam + deterministic NN-evaluation budget)
js/policy.js         config parsing, net loading from nets/, glue to the exact endgame
js/{exact3,hybrid,common}.js   byte copies of the frozen exact-endgame-deeper files (self-contained snapshot for freeze.sh)
nets/ship_nn.json    the champion's network (shipped_policies.json["52"].nn); drop new nets here
tests/equiv.js       msearch(extra off) == champion createSearcher, move + root values;  tests/leaf_format.js;  tests/probe.js (cost / change rate);  tests/timing_table.py
results/             probes, smoke and dev40 runs (plumbing only)
```
Controls: `midsearch:` and `midsearch:champ=1` must equal deeper:16 move for move.
