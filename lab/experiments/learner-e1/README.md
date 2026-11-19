# learner-e1: bias-correction kill test (packaged for Referee; NOT run by Learner)
adapter.js --config shipped52|ship_nn|nn5 --corr none|phase|b2|phase+b2
- none: control, must equal champion exactly. phase: +max(0,387.4-7.58*cardsDealt) at non-terminal NN leaves (fit in-sample on set1000 bias curve -> overfit risk; use a different set to judge). b2: Theorist's 2nd-bust table. phase+b2: both.
- src/engine.js is the champion engine with a `params.corr` hook (engine/ untouched). deepen.budgetMs forced 0.
- Learner smoke: phase correction shifted root values +224 mean (76..372) and changed 0/240 moves (level bias cancels, as predicted).
- Suggested: python3 compare.py --a "cmd:node champion/champion_adapter.js --config shipped52" --b "cmd:node ../experiments/learner-e1/adapter.js --config shipped52 --corr b2" --set set1000 --workers 4 --cache ; also audit.py --static ../experiments/learner-e1/
