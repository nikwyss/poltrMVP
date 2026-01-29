#!/bin/bash
# Setup Wildcard Certificate for *.poltr.info
#
# Usage: ./setup-wildcard-cert.sh YOUR_INFOMANIAK_API_TOKEN

set -e

TOKEN="$1"

if [ -z "$TOKEN" ]; then
    echo "Usage: $0 YOUR_INFOMANIAK_API_TOKEN"
    echo ""
    echo "Get your token at: https://manager.infomaniak.com/v3/profile/api-tokens"
    echo "Required permission: DNS Zone"
    exit 1
fi

echo "=== Step 1: Install Infomaniak Webhook ==="
helm repo add infomaniak https://infomaniak.github.io/cert-manager-webhook-infomaniak 2>/dev/null || true
helm repo update
helm upgrade --install cert-manager-webhook-infomaniak infomaniak/cert-manager-webhook-infomaniak \
    --namespace cert-manager \
    --wait

echo ""
echo "=== Step 2: Create API Token Secret ==="
kubectl create secret generic infomaniak-api-token \
    --namespace cert-manager \
    --from-literal=api-token="$TOKEN" \
    --dry-run=client -o yaml | kubectl apply -f -

echo ""
echo "=== Step 3: Apply ClusterIssuer ==="
kubectl apply -f cert-manager-wildcard.yaml

echo ""
echo "=== Step 4: Apply Updated Ingress ==="
kubectl apply -f poltr.yaml

echo ""
echo "=== Done! ==="
echo ""
echo "Check certificate status:"
echo "  kubectl get certificates -n poltr"
echo "  kubectl describe certificate poltr-wildcard-cert -n poltr"
echo ""
echo "Check ClusterIssuer status:"
echo "  kubectl get clusterissuer letsencrypt-prod-dns"
