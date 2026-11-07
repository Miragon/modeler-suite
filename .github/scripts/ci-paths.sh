#!/usr/bin/env bash
# The path decisions of CI, so a change runs the jobs it can break and no more:
#   ci-paths.sh affected   which modelers a change reaches (and which of them have an Orca plugin),
#                          and whether it reaches the shared packages and the new-modeler template
#   ci-paths.sh modelers   every modeler and every modeler with an Orca plugin (the weekly smokes)
# Each writes key=value lines to $GITHUB_OUTPUT. The event comes from EVENT_NAME and the base commit
# from PULL_REQUEST_BASE_SHA or PUSH_BEFORE_SHA. Whenever there is nothing to compare with, or a
# path fits no rule, everything runs: a wrong guess may cost minutes, never a check that should
# have failed. The repository-level tests (shared-test) run on every change, so a path that only
# they read needs no rule here.
set -euo pipefail

output() {
  echo "$1=$2" >> "${GITHUB_OUTPUT:-/dev/stdout}"
}

lines_to_json() {
  printf '%s' "$1" | jq -cRs 'split("\n") | map(select(length > 0))'
}

all_modelers() {
  local manifest
  for manifest in modelers/*/package.json; do
    [[ -f "$manifest" ]] || continue
    manifest=${manifest#modelers/}
    echo "${manifest%%/*}"
  done
}

with_orca_plugin() {
  local modeler
  while IFS= read -r modeler; do
    if [[ -f "modelers/$modeler/apps/orca/orca-plugin.json" ]]; then echo "$modeler"; fi
  done <<< "$1"
}

# Writes the changed paths, NUL-separated, to the file $1. Fails when there is nothing to compare
# with: a run without a base commit checks everything.
changed_paths() {
  local base
  case "${EVENT_NAME:-}" in
    pull_request) base="${PULL_REQUEST_BASE_SHA:-}" ;;
    push) base="${PUSH_BEFORE_SHA:-}" ;;
    *)
      echo "A ${EVENT_NAME:-local} run checks everything."
      return 1
      ;;
  esac
  if [[ -z "$base" || "$base" =~ ^0+$ ]]; then
    echo "No base commit to compare with: everything runs."
    return 1
  fi
  # Comparing two trees needs the base commit only, not the history in between. --no-renames lists
  # a moved file under its old path too, and -z prints every path as it is, never quoted (a
  # non-ASCII name, a quote), so both still match a pattern below.
  if ! git cat-file -e "$base^{commit}" 2> /dev/null && ! git fetch --no-tags --depth=1 origin "$base"; then
    echo "Cannot fetch the base $base: everything runs."
    return 1
  fi
  if ! git diff --no-renames --name-only -z "$base" HEAD > "$1"; then
    echo "Cannot compare with the base $base: everything runs."
    return 1
  fi
  echo "Compared with $base."
}

# What a changed path reaches: none (only the always-on jobs read it), all (the shared jobs and
# every modeler) or "modeler <name>".
classify() {
  local path=$1 modeler rest
  case "$path" in
    modelers/*/*)
      rest=${path#modelers/}
      modeler=${rest%%/*}
      rest=${rest#*/}
      if [[ ! -f "modelers/$modeler/package.json" ]]; then
        echo all
        return
      fi
      # Only a modeler's own prose is documentation: Markdown under plugins/ feeds the skill drift
      # tests, and a package or the extension ships its README.
      case "$rest" in
        docs/* | LICENSE) echo none ;;
        */*) echo "modeler $modeler" ;;
        *.md) echo none ;;
        *) echo "modeler $modeler" ;;
      esac
      ;;
    .github/workflows/ci.yml | .github/workflows/vscode-smoke.yml | .github/workflows/orca-smoke.yml) echo all ;;
    .github/actions/* | .github/scripts/*) echo all ;;
    .github/* | docs/* | plugins/* | test/* | extensions/* | .claude-plugin/* | .husky/*) echo none ;;
    LICENSE) echo none ;;
    */*) echo all ;;
    *.md) echo none ;;
    *) echo all ;;
  esac
}

# The template job creates a modeler from plugins/modeler-kit on the packed shared packages and
# borrows a renderer's design-system files (.github/scripts/template-instance.mjs). The paths of the
# `all` class (packages/, the root, .github/) reach it through `everything` in affected.
reaches_template() {
  case "$1" in
    plugins/modeler-kit/*) ;;
    modelers/event-storming/packages/renderer/src/theme/*) ;;
    *) return 1 ;;
  esac
}

affected() {
  local changed reach path all
  local everything=false template=false modelers=""
  all=$(all_modelers)
  changed=$(mktemp)
  if ! changed_paths "$changed"; then
    everything=true
  else
    while IFS= read -r -d '' path; do
      reach=$(classify "$path")
      echo "$path: $reach"
      if reaches_template "$path"; then template=true; fi
      case "$reach" in
        all) everything=true ;;
        "modeler "*) modelers+="${reach#modeler }"$'\n' ;;
      esac
    done < "$changed"
  fi
  if [[ "$everything" == true ]]; then
    template=true
    modelers=$all
  fi
  modelers=$(printf '%s' "$modelers" | sort -u | sed '/^$/d')
  echo "Shared jobs: $everything. Template job: $template. Modelers: $(printf '%s' "${modelers:-none}" | tr '\n' ' ')"
  output shared "$everything"
  output template "$template"
  output modelers "$(lines_to_json "$modelers")"
  output orca-modelers "$(lines_to_json "$(with_orca_plugin "$modelers")")"
}

case "${1:-}" in
  affected) affected ;;
  modelers)
    output all-modelers "$(lines_to_json "$(all_modelers)")"
    output orca-modelers "$(lines_to_json "$(with_orca_plugin "$(all_modelers)")")"
    ;;
  *)
    echo "usage: ci-paths.sh affected | modelers" >&2
    exit 2
    ;;
esac
