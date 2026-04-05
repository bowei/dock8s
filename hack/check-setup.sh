#!/bin/bash

set -euo pipefail

PASS=0
FAIL=0

check() {
    local name="$1"
    local cmd="$2"
    if eval "$cmd" &>/dev/null; then
        echo "  [ok] $name"
        ((PASS++)) || true
    else
        echo "  [missing] $name"
        ((FAIL++)) || true
    fi
}

echo "Checking Go toolchain..."
check "go" "command -v go"
if command -v go &>/dev/null; then
    echo "       version: $(go version)"
fi

echo "Checking CSS/LESS tools..."
check "lessc" "command -v lessc"

echo "Checking Node/npm..."
check "node" "command -v node"
check "npm" "command -v npm"

echo "Installing npm dependencies..."
if command -v npm &>/dev/null; then
    npm install --prefix "$(dirname "$0")/.." &>/dev/null
    echo "  [ok] npm install done"
else
    echo "  [skip] npm not found"
fi

echo ""
if [[ $FAIL -eq 0 ]]; then
    echo "Setup OK ($PASS checks passed)"
else
    echo "Setup incomplete: $FAIL missing, $PASS ok"
    exit 1
fi
