This document explains how to set up GitHub Actions-based deployments for `services/appview`.

1) Create the ServiceAccount + RBAC in the cluster

```bash
kubectl apply -f kube/gha-deployer.yaml
```

2) Create a service account token and kubeconfig file for GitHub Actions

If your cluster supports `kubectl create token` (k8s >=1.24):

```bash
kubectl -n poltr create token gha-deployer --duration=8760h -o json > /tmp/gha-deployer-token.json
TOKEN=$(jq -r '.status.token' /tmp/gha-deployer-token.json)
```

Otherwise extract the token from the auto-created secret:

```bash
SECRET_NAME=$(kubectl -n poltr get secret -o name | grep gha-deployer-token)
TOKEN=$(kubectl -n poltr get secret ${SECRET_NAME} -o jsonpath='{.data.token}' | base64 --decode)
```

Build the kubeconfig:

```bash
SERVER=$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}')
CA_DATA=$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.certificate-authority-data}')
cat > /tmp/gha-deployer.kubeconfig <<EOF
apiVersion: v1
kind: Config
clusters:
- name: gha-deployer-cluster
  cluster:
    server: ${SERVER}
    certificate-authority-data: ${CA_DATA}
contexts:
- name: gha-deployer
  context:
    cluster: gha-deployer-cluster
    user: gha-deployer
current-context: gha-deployer
users:
- name: gha-deployer
  user:
    token: ${TOKEN}
EOF

# verify
KUBECONFIG=/tmp/gha-deployer.kubeconfig kubectl get ns

# Add the kubeconfig as a GitHub secret using gh CLI:
gh secret set KUBECONFIG --body-file /tmp/gha-deployer.kubeconfig --repo <OWNER>/<REPO>
```

3) Workflow behavior

- The workflow `.github/workflows/deploy-appview.yml` builds the image `ghcr.io/<owner>/poltr-appview:${{ github.sha }}` and pushes it to GHCR.
- It then uses the `KUBECONFIG` secret to run `kubectl -n poltr set image deployment/appview appview=$IMAGE` and waits for rollout.

4) Secrets

- `GITHUB_TOKEN` is available by default and is used here to authenticate to GHCR. If your org blocks that, create a PAT with `write:packages` and set `REGISTRY_USERNAME` and `REGISTRY_PASSWORD`.

5) Local testing

Build and push locally:

```bash
docker build -t ghcr.io/<OWNER>/poltr-appview:localtest -f ./services/appview/Dockerfile ./services/appview
docker push ghcr.io/<OWNER>/poltr-appview:localtest
kubectl -n poltr set image deployment/appview appview=ghcr.io/<OWNER>/poltr-appview:localtest
kubectl -n poltr rollout status deployment/appview
```


# open a terminal console on the single pod in the "pds"  without specify the exact pod "pds-56cb8595db-b4clg".
```bash
kubectl 


#SQL-LITE: (PDS)
#---------------------

account.sqlite        actors                did_cache.sqlite-wal  sequencer.sqlite-shm
account.sqlite-shm    did_cache.sqlite      lost+found            sequencer.sqlite-wal
account.sqlite-wal    did_cache.sqlite-shm  sequencer.sqlite