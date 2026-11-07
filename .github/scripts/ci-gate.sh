#!/usr/bin/env bash
# The verdict of ci-ok, the merge gate. Every gated job needs only `changes`, so a job skipped
# because a job it needs failed comes with that failure in NEEDS: a failed or cancelled job fails
# the gate, and a skip passes.
#   NEEDS          toJSON(needs) of the ci-ok job
#   WORKFLOW_FILE  the workflow whose every other job ci-ok has to need
set -euo pipefail

: "${NEEDS:?}" "${WORKFLOW_FILE:?}"

failed=0
error() {
  echo "::error::$1"
  failed=1
}

if [[ "$(jq 'length' <<< "$NEEDS")" -eq 0 ]]; then
  echo "::error::ci-ok needs no job"
  exit 1
fi

# A job left out of needs could fail, or never run, without ci-ok noticing.
while read -r job; do
  if [[ "$job" != ci-ok ]] && ! jq -e --arg job "$job" 'has($job)' <<< "$NEEDS" > /dev/null; then
    error "$job is a job of $WORKFLOW_FILE that ci-ok does not need"
  fi
done < <(awk '/^jobs:/ { in_jobs = 1; next } /^[^ #]/ { in_jobs = 0 } in_jobs && /^  [A-Za-z0-9_-]+:/ { sub(/:.*/, ""); print $1 }' "$WORKFLOW_FILE")

while read -r job result; do
  case "$result" in
    success | skipped) echo "$job: $result" ;;
    *) error "$job: $result" ;;
  esac
done < <(jq -r 'to_entries[] | "\(.key) \(.value.result)"' <<< "$NEEDS")

exit "$failed"
