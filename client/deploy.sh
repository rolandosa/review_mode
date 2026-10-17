#!/usr/bin/env bash
# Deploys Review Mode to a Vault: client distribution, then the time log object, Page and Tab (MDL).
#
#   VAULT_HOST=myvault.veevavault.com VAULT_SESSION=<session id> ./deploy.sh
#
# VAULT_SESSION may be omitted when a proxy already authenticates requests to VAULT_HOST.
set -euo pipefail

: "${VAULT_HOST:?Set VAULT_HOST, e.g. myvault.veevavault.com}"
API="https://${VAULT_HOST}/api"
VERSION="${VAULT_API_VERSION:-v26.2}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUTH=(-H "X-VaultAPI-ClientID: review-mode-deploy")
[[ -n "${VAULT_SESSION:-}" ]] && AUTH+=(-H "Authorization: ${VAULT_SESSION}")

check() {
  if ! grep -q '"responseStatus" *: *"SUCCESS"' <<<"$1"; then
    echo "FAILED: $1" >&2
    exit 1
  fi
}

echo "▶ Building client code"
(cd "$ROOT/client" && npm ci --silent && npm run -s build)

# The Page component references the distribution, so upload the code first.
echo "▶ Uploading client distribution review_mode__c"
out=$(curl -sS "${AUTH[@]}" -F "file=@${ROOT}/client/distribution.zip" "${API}/${VERSION}/uicode/distributions")
check "$out"

echo "▶ Running MDL (object, page, tab)"
for f in "$ROOT"/components/Object.review_time_log__c.mdl "$ROOT"/components/Page.review_mode__c.mdl "$ROOT"/components/Tab.review_mode__c.mdl; do
  out=$(curl -sS "${AUTH[@]}" -H "Content-Type: text/plain" --data-binary "@$f" "${API}/mdl/execute")
  check "$out"
  echo "   ✓ $(basename "$f" .mdl)"
done

echo "✅ Done. Open https://${VAULT_HOST}/ui/#custom/page/review-mode"
echo "   Users other than Vault Owners need View on the Review Mode page and tab, and Create/Edit on Review Time Log, via a permission set."
