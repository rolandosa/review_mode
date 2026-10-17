#!/usr/bin/env bash
# Builds the client distribution, uploads it, and creates the Page and Tab components.
#   VAULT_HOST=myvault.veevavault.com VAULT_SESSION=<session id> ./deploy.sh
set -euo pipefail
: "${VAULT_HOST:?Set VAULT_HOST}"
: "${VAULT_SESSION:?Set VAULT_SESSION}"
cd "$(dirname "$0")"

npm ci
npm run build

curl -sS --fail-with-body "https://${VAULT_HOST}/api/v26.2/uicode/distributions" \
    -H "Authorization: ${VAULT_SESSION}" \
    -F "file=@distribution.zip"
echo

for component in ../components/Page.review_mode__c.mdl ../components/Tab.review_mode__c.mdl; do
    curl -sS --fail-with-body "https://${VAULT_HOST}/api/mdl/execute" \
        -H "Authorization: ${VAULT_SESSION}" \
        -H "Content-Type: text/plain" \
        --data-binary "@${component}"
    echo
done
