#!/bin/bash
# Orchestrate the difficulty precompute: split 1..32000 across N parallel worker
# processes, wait for all, then merge into js/difficulty.js.
set -u
cd "$(dirname "$0")/.."          # project root

CAP="${1:-100000}"
WORKERS="${2:-10}"
TOTAL=32000
CHUNK=$(( (TOTAL + WORKERS - 1) / WORKERS ))
LOG=tools/difficulty.log

rm -f tools/diff-part-*.json "$LOG"
echo "start $(date -Is) cap=$CAP workers=$WORKERS chunk=$CHUNK" > "$LOG"

pids=()
for i in $(seq 0 $((WORKERS-1))); do
  START=$(( i*CHUNK + 1 ))
  END=$(( (i+1)*CHUNK ))
  [ "$END" -gt "$TOTAL" ] && END=$TOTAL
  [ "$START" -gt "$TOTAL" ] && break
  node --max-old-space-size=2000 tools/rate-difficulty.js worker "$CAP" "$START" "$END" "$i" &
  pids+=($!)
done

fail=0
for p in "${pids[@]}"; do wait "$p" || fail=1; done
echo "workers finished (fail=$fail) $(date -Is)" >> "$LOG"

node tools/rate-difficulty.js merge "$CAP" && echo "merge ok $(date -Is)" >> "$LOG"
echo "ALL DONE $(date -Is)" >> "$LOG"
