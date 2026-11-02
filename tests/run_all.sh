#!/bin/bash
# Runs every browser test suite sequentially against a local preview server (port 4173).
cd "$(dirname "$0")/.."
for t in hits smoke combat touch; do
  args=""; [ "$t" = hits ] && args="--frames"
  timeout 2700 python3 -u tests/$t.py $args > tests/out/${t}_log.txt 2>&1
  echo "EXIT $?" >> tests/out/${t}_log.txt
  echo "$t: $(grep -c '^PASS' tests/out/${t}_log.txt) passed, $(grep -c '^FAIL' tests/out/${t}_log.txt) failed, $(grep EXIT tests/out/${t}_log.txt)" | tee -a tests/out/run_all.txt
done
