# diag_slow

Diagnostic replay of three deeper:16 shuffles that logged 42–43 s single decisions on the stopped set5000 run. Not a scored test.

```
nice -n 10 python3 replay.py --seeds 1001694,1002103,1001292 --tag isolated
nice -n 10 python3 replay.py --seeds 1001694,1002103,1001292 --prefix --tag prefix
```

See REPORT.md for findings. The policy is the frozen deeper:16 adapter; this directory only adds a wrapper and logs.
