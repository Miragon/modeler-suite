#!/usr/bin/env bash
# The path decisions of CI, so a change runs the jobs it can break and no more:
#   ci-paths.sh affected               which modelers, whether the shared packages and whether the
#                                      new-modeler template a change reaches
#   ci-paths.sh vscode-smoke <modeler> whether the change can reach that modeler's packaged extension
#   ci-paths.sh modelers               every modeler (for the weekly smoke)
# Each writes key=value lines to $GITHUB_OUTPUT. The event comes from EVENT_NAME and the base commit
# from PULL_REQUEST_BASE_SHA, PUSH_BEFORE_SHA or MERGE_GROUP_BASE_SHA. Whenever there is nothing to
# compare with, or a path fits no rule, everything runs: a wrong guess may cost minutes, never a
# check that should have failed.
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

# Writes the changed paths, NUL-separated, to the file $1. Fails when there is nothing to compare
# with: a run without a base commit checks everything.
changed_paths() {
  local base
  case "${EVENT_NAME:-}" in
    pull_request) base="${PULL_REQUEST_BASE_SHA:-}" ;;
    push) base="${PUSH_BEFORE_SHA:-}" ;;
    merge_group) base="${MERGE_GROUP_BASE_SHA:-}" ;;
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

# What a changed path reaches: none (documentation only), shared (the shared jobs), all (the
# shared jobs and every modeler) or "modeler <name>".
classify() {
  local path=$1 modeler rest
  case "$path" in
    docs/* | .husky/* | LICENSE)
      echo none
      return
      ;;
    */*) ;;
    *.md)
      echo none
      return
      ;;
  esac
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
    plugins/* | test/* | extensions/* | .claude-plugin/*) echo shared ;;
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

# test:plugin (in shared-test) runs the repository-level checks in test/, which hold these files of
# a modeler against the rest of the suite, as its own jobs never do: its Claude plugin (the
# manifests and skills of the marketplace), the package.json of the modeler and of each workspace
# in it (release config, extension pack, boundaries), its ESLint configs (boundaries; the nearest
# config of a file wins, so at any depth) and its dependency-cruiser config (boundaries), and a
# .miragon folder at any depth (a second brand-lint config). A `*` of a case pattern also matches
# `/`, so regexes keep the same names deeper in a modeler out.
reaches_repository_tests() {
  local plugin='^modelers/[^/]+/plugins/'
  local manifest='^modelers/[^/]+/((packages|apps)/[^/]+/|e2e/)?package\.json$'
  local eslint_config='^modelers/[^/]+/(.+/)?eslint\.config\.[^/]+$'
  local dependency_cruiser_config='^modelers/[^/]+/\.dependency-cruiser\.cjs$'
  local brand_lint_config='^modelers/[^/]+/(.+/)?\.miragon/'
  [[ "$1" =~ $plugin || "$1" =~ $manifest || "$1" =~ $eslint_config ||
    "$1" =~ $dependency_cruiser_config || "$1" =~ $brand_lint_config ]]
}

affected() {
  local changed reach path everything=false shared=false template=false modelers="" all
  all=$(all_modelers)
  changed=$(mktemp)
  if ! changed_paths "$changed"; then
    everything=true
  else
    while IFS= read -r -d '' path; do
      reach=$(classify "$path")
      echo "$path: $reach"
      if reaches_template "$path"; then template=true; fi
      if reaches_repository_tests "$path"; then
        echo "$path: shared (the repository-level tests)"
        shared=true
      fi
      case "$reach" in
        all) everything=true ;;
        shared) shared=true ;;
        "modeler "*) modelers+="${reach#modeler }"$'\n' ;;
      esac
    done < "$changed"
  fi
  if [[ "$everything" == true ]]; then
    shared=true
    template=true
    modelers=$all
  fi
  modelers=$(printf '%s' "$modelers" | sort -u | sed '/^$/d')
  echo "Shared jobs: $shared. Template job: $template. Modelers: $(printf '%s' "${modelers:-none}" | tr '\n' ' ')"
  output shared "$shared"
  output template "$template"
  output modelers "$(lines_to_json "$modelers")"
  output all-modelers "$(lines_to_json "$all")"
}

# The VSIX bundles the extension, its webview and the modeler's packages from source and the shared
# packages from their build (esbuild, with the compiler options of tsconfig.base.json), the
# lockfile's resolved versions are inlined, and the test's setup decides what it runs.
reaches_extension() {
  local path=$1 modeler=$2
  case "$path" in
    package-lock.json | package.json | .npmrc) ;;
    packages/*) ;;
    .github/actions/* | .github/scripts/*) ;;
    .github/workflows/ci.yml | .github/workflows/vscode-smoke.yml | .github/workflows/vscode-smoke-weekly.yml) ;;
    "modelers/$modeler/"*package.json) ;;
    "modelers/$modeler/apps/vscode/"* | "modelers/$modeler/packages/"* | "modelers/$modeler/example/"*) ;;
    "modelers/$modeler/tsconfig"*.json | "modelers/$modeler/vitest.config.ts") ;;
    *) return 1 ;;
  esac
}

vscode_smoke() {
  local modeler=$1 changed path relevant=""
  if [[ ! -f "modelers/$modeler/apps/vscode/package.json" ]]; then
    echo "::error::modelers/$modeler has no VS Code extension"
    return 1
  fi
  changed=$(mktemp)
  if ! changed_paths "$changed"; then
    output run true
    return
  fi
  while IFS= read -r -d '' path; do
    if reaches_extension "$path" "$modeler"; then relevant+=" $path"; fi
  done < "$changed"
  if [[ -n "$relevant" ]]; then
    echo "Paths the $modeler extension depends on changed, the smoke runs:$relevant"
    output run true
  else
    echo "No path the $modeler extension depends on changed: the smoke is skipped."
    output run false
  fi
}

case "${1:-}" in
  affected) affected ;;
  vscode-smoke) vscode_smoke "${2:?usage: ci-paths.sh vscode-smoke <modeler>}" ;;
  modelers) output all-modelers "$(lines_to_json "$(all_modelers)")" ;;
  *)
    echo "usage: ci-paths.sh affected | vscode-smoke <modeler> | modelers" >&2
    exit 2
    ;;
esac
