#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${DECISION_BRAIN_BASE_URL:-http://127.0.0.1:4177}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ "${DECISION_BRAIN_RESET_BEFORE_DEMO:-0}" == "1" ]]; then
  echo "[0/5] reset state"
  (
    cd "${PROJECT_ROOT}"
    npm run reset:state >/dev/null
  )
  echo "state reset done"
  echo
fi

echo "[1/5] health"
curl -s "${BASE_URL}/api/health"
echo
echo

echo "[2/5] manage position"
curl -s "${BASE_URL}/api/manage-position" \
  -H 'content-type: application/json' \
  -d '{
    "assetQuery": "SOL",
    "units": 100,
    "averageCost": 120,
    "currentPrice": 175,
    "portfolioValue": 50000,
    "naturalLanguagePlan": "2x 回本金，3x 卖 30%，保留历史最高持仓 20% 底仓"
  }'
echo
echo

echo "[3/5] confirm plan"
curl -s "${BASE_URL}/api/confirm-plan" \
  -H 'content-type: application/json' \
  -d '{
    "assetQuery": "SOL"
  }'
echo
echo

echo "[4/5] run daily monitor"
curl -s "${BASE_URL}/api/run-daily-monitor" \
  -H 'content-type: application/json' \
  -d '{}'
echo
echo

echo "[5/5] get asset context"
curl -s "${BASE_URL}/api/asset-context?asset=SOL"
echo
