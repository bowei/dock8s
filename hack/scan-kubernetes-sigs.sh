#!/bin/bash
#
# scan-kubernetes-sigs.sh
#
# Scans github.com/kubernetes-sigs for repos that define Kubernetes API types
# (CRDs), then writes proposed metadata.yaml files to:
#   ./tmprepos/github.com/kubernetes-sigs/<repo>/metadata.yaml
#
# A repo is considered to have a Kubernetes API if its Go source (outside vendor/)
# contains kubebuilder or code-generator markers:
#   +kubebuilder:object:root=true
#   +k8s:deepcopy-gen:interfaces=k8s.io/apimachinery/pkg/runtime.Object
#
# The proposed metadata.yaml lists the default branch and the inferred apiDirs.
# Review the output in tmprepos/ and copy entries to cmd/docsite/repos/ as needed.
#
# Requirements: gh (GitHub CLI, authenticated), git, jq
# Usage: [PARALLEL=N] bash hack/scan-kubernetes-sigs.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

EXISTING_DIR="${REPO_ROOT}/cmd/docsite/repos/github.com/kubernetes-sigs"
OUT_DIR="${REPO_ROOT}/tmprepos/github.com/kubernetes-sigs"
CLONE_BASE="$(mktemp -d)"
MAX_PARALLEL="${PARALLEL:-8}"

cleanup() { rm -rf "${CLONE_BASE}"; }
trap cleanup EXIT

# find_api_dirs: reads Go file paths (one per line) from stdin; outputs
# deduplicated apiDir candidates based on top-level directory patterns.
#
# Many repos (e.g. cluster-api) have API markers in test fixtures, internal
# packages, and controller code as well as the real public API directory.
# We filter out paths that are clearly non-API before inferring the dir:
#   - paths starting with a known non-API component (test/, internal/, etc.)
#   - paths containing /test/ or /testdata/ anywhere
#   - Go test files (*_test.go)
find_api_dirs() {
  grep -v -E \
    '^(test|testdata|internal|util|cmd|controllers|bootstrap|hack|docs|config|scripts|e2e|vendor)/' |
  grep -v -E '/(test|testdata|e2e)/' |
  grep -v '_test\.go$' |
  awk -F/ '
    {
      root = $1
      # For files at repo root (NF==1), $1 is the filename itself; skip.
      if (NF == 1) next
      # pkg/apis is a common pattern; peek one level deeper.
      if (root == "pkg" && NF > 2 && $2 == "apis") root = $1 "/" $2
      print root
    }
  ' | sort -u
}

check_repo() {
  local repo="$1"
  local branch="$2"
  local clone_dir="${CLONE_BASE}/${repo}"

  if [[ -d "${EXISTING_DIR}/${repo}" ]]; then
    printf '[exists ] %s\n' "${repo}"
    return
  fi

  if ! timeout 120 git clone \
      --depth 1 --quiet --branch "${branch}" \
      "https://github.com/kubernetes-sigs/${repo}" "${clone_dir}" 2>/dev/null; then
    printf '[clone! ] %s\n' "${repo}"
    return
  fi

  # Search for Kubernetes API type markers; exclude vendor/.
  local api_files
  api_files=$(git -C "${clone_dir}" grep -rl \
    -e '+kubebuilder:object:root=true' \
    -e '+k8s:deepcopy-gen:interfaces=k8s.io/apimachinery/pkg/runtime.Object' \
    -- '*.go' 2>/dev/null | grep -v '^vendor/' || true)

  if [[ -z "${api_files}" ]]; then
    printf '[no-api ] %s\n' "${repo}"
    rm -rf "${clone_dir}"
    return
  fi

  # Infer apiDirs from the paths of files containing markers.
  local api_dirs
  api_dirs=$(printf '%s\n' "${api_files}" | find_api_dirs)

  if [[ -z "${api_dirs}" ]]; then
    printf '[no-dirs] %s (markers found but could not determine dirs: %s)\n' \
      "${repo}" "$(printf '%s\n' "${api_files}" | head -3 | paste -sd' ')"
    rm -rf "${clone_dir}"
    return
  fi

  # Verify each inferred dir actually exists in the clone.
  local verified=()
  while IFS= read -r dir; do
    if [[ -d "${clone_dir}/${dir}" ]]; then
      verified+=("${dir}")
    fi
  done <<< "${api_dirs}"

  if [[ ${#verified[@]} -eq 0 ]]; then
    printf '[no-dirs] %s (inferred dirs not found on disk)\n' "${repo}"
    rm -rf "${clone_dir}"
    return
  fi

  printf '[found  ] %s @ %s  dirs: %s\n' \
    "${repo}" "${branch}" "$(printf '%s ' "${verified[@]}")"

  mkdir -p "${OUT_DIR}/${repo}"
  {
    echo "refs:"
    echo "- ${branch}"
    echo "apiDirs:"
    for dir in "${verified[@]}"; do
      echo "- ${dir}"
    done
  } > "${OUT_DIR}/${repo}/metadata.yaml"

  rm -rf "${clone_dir}"
}

# -- Main --

echo "==> Fetching kubernetes-sigs repo list from GitHub..."
repo_info=$(gh api 'orgs/kubernetes-sigs/repos?per_page=100&type=public' \
  --paginate \
  --jq '.[] | select(.archived == false) | "\(.name)\t\(.default_branch)"')

mkdir -p "${OUT_DIR}" "${CLONE_BASE}"

total=$(printf '%s\n' "${repo_info}" | wc -l | tr -d ' ')
printf '==> Scanning %s public non-archived repos (parallelism=%s)\n\n' \
  "${total}" "${MAX_PARALLEL}"

# Process repos with bounded parallelism (slide a window of MAX_PARALLEL jobs).
declare -a pids=()
while IFS=$'\t' read -r name branch; do
  check_repo "${name}" "${branch}" &
  pids+=($!)

  if (( ${#pids[@]} >= MAX_PARALLEL )); then
    wait "${pids[0]}" 2>/dev/null || true
    pids=("${pids[@]:1}")
  fi
done <<< "${repo_info}"

for pid in "${pids[@]}"; do
  wait "${pid}" 2>/dev/null || true
done

echo ""
echo "==> Scan complete!"
found=$(find "${OUT_DIR}" -name 'metadata.yaml' 2>/dev/null | wc -l | tr -d ' ')
printf '    %s repos with Kubernetes APIs written to tmprepos/\n' "${found}"

if [[ "${found}" -gt 0 ]]; then
  echo ""
  echo "    To add a repo, copy its tmprepos/ entry to cmd/docsite/repos/:"
  echo "    cp -r tmprepos/github.com/kubernetes-sigs/<repo> cmd/docsite/repos/github.com/kubernetes-sigs/"
  echo ""
  echo "    Proposed repos:"
  find "${OUT_DIR}" -name 'metadata.yaml' | sort | while IFS= read -r f; do
    dir="${f%/metadata.yaml}"
    repo="${dir##*/}"
    refs=$(grep -A5 '^refs:' "${f}" | grep '^-' | tr -d '- ' | paste -sd',' )
    dirs=$(grep -A5 '^apiDirs:' "${f}" | grep '^-' | tr -d '- ' | paste -sd',' )
    printf '    %-40s  refs=%-10s  dirs=%s\n' "${repo}" "${refs}" "${dirs}"
  done
fi
