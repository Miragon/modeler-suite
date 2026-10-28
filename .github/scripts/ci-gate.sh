#!/usr/bin/env bash
# The verdict of ci-ok, the one check the ruleset requires. A job skipped because a job it needs
# failed reports "skipped", and a required check counts a skip as passed, so every job has to
# succeed here unless the skip is one CI makes on purpose, and each such skip is checked against
# the reason for it rather than taken on trust.
#   NEEDS          toJSON(needs) of the ci-ok job
#   EVENT_NAME     github.event_name
#   WORKFLOW_FILE  the workflow whose every other job ci-ok has to need
set -euo pipefail

: "${NEEDS:?}" "${EVENT_NAME:?}" "${WORKFLOW_FILE:?}"

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

changes=$(jq -r '.changes.result // "missing"' <<< "$NEEDS")
shared=$(jq -r '.changes.outputs.shared // ""' <<< "$NEEDS")
template=$(jq -r '.changes.outputs.template // ""' <<< "$NEEDS")
modelers=$(jq -r '.changes.outputs.modelers // ""' <<< "$NEEDS")

# Why a job may be skipped on this run; empty when a skip of it is a failure. The path-gated jobs
# may only be skipped on the word of a changes job that succeeded.
skip_reason() {
  case "$1" in
    dependency-review)
      if [[ "$EVENT_NAME" != pull_request ]]; then
        echo "it compares a pull request with its base, which a $EVENT_NAME run has not"
      fi
      ;;
    shared-lint | shared-test | shared-test-browser | shared-e2e)
      if [[ "$changes" == success && "$shared" == false ]]; then
        echo "no path the shared packages depend on changed"
      fi
      ;;
    template)
      if [[ "$changes" == success && "$template" == false ]]; then
        echo "no path the new-modeler template depends on changed"
      fi
      ;;
    modeler-lint | modeler-test | modeler-test-browser | modeler-e2e | modeler-build)
      if [[ "$changes" == success && "$modelers" == "[]" ]]; then
        echo "no path a modeler depends on changed"
      fi
      ;;
  esac
}

while read -r job result; do
  if [[ "$result" == success ]]; then
    echo "$job: success"
    continue
  fi
  reason=""
  if [[ "$result" == skipped ]]; then reason=$(skip_reason "$job"); fi
  if [[ -n "$reason" ]]; then
    echo "$job: skipped by design, $reason"
  else
    error "$job: $result"
  fi
done < <(jq -r 'to_entries[] | "\(.key) \(.value.result)"' <<< "$NEEDS")

exit "$failed"
