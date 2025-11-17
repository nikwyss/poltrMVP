# Poltr AT Protocol Environment

This project sets up a complete AT Protocol (ATProto) environment for poltr.info, including:

- **PDS (Personal Data Server)**: Hosts user data and identity on the AT Protocol network (uses embedded SQLite)
- **Frontend**: Web application for user interaction
- **Ingress**: NGINX ingress controller with Let's Encrypt TLS certificates

## Prerequisites

- Access to a Kubernetes cluster
- `kubectl` configured to connect to your cluster
- Docker (if building custom frontend images)

## Installation

### 1. Set up Ingress Controller

Install NGINX ingress controller:

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.0/deploy/static/provider/cloud/deploy.yaml
```

### 2. Configure Let's Encrypt

Apply the Let's Encrypt cluster issuer:

```bash
kubectl apply -f letsencrypt-prod.yaml
```

### 3. Configure Secrets

Copy the secrets template and fill in your values:

```bash
cp secrets.sh.dist secrets.sh
# Edit secrets.sh with your actual credentials
nano secrets.sh
```

Generate required secrets:

```bash
# Generate PLC rotation key (must be 64 hex characters / 32 bytes)
openssl rand -hex 32

# Generate JWT secret
openssl rand -hex 32

# Generate admin password
openssl rand -hex 16
```

Create the secrets in Kubernetes:

```bash
bash secrets.sh
```

### 4. Deploy the Application

Deploy all components:

```bash
kubectl apply -f poltr.yaml
```

Check deployment status:

```bash
kubectl get pods -n poltr
```

## Configuration

Key environment variables in the PDS deployment:

- `PDS_HOSTNAME`: Your PDS domain (e.g., `poltr.info`)
- `PDS_SERVICE_HANDLE_DOMAINS`: Allowed handle domains (e.g., `.poltr.info`)
- `PDS_INVITE_REQUIRED`: Set to `"false"` to allow open registration

## Deployment to Remote Kubernetes Cluster

### Deploy Full Stack

```bash
# Apply configuration
kubectl apply -f poltr.yaml

# Verify deployment
kubectl get pods -n poltr
kubectl get ingress -n poltr
```

### Update Frontend Only

```bash
# Restart frontend to pull latest Docker image
kubectl rollout restart deployment/frontend -n poltr

# Monitor rollout status
kubectl rollout status deployment/frontend -n poltr

# Watch pods being recreated
kubectl get pods -n poltr -l app=frontend -w
```

### Update PDS Configuration

```bash
# Edit poltr.yaml with your changes
# Apply the updated configuration
kubectl apply -f poltr.yaml

# Restart PDS deployment
kubectl rollout restart deployment/pds -n poltr
```

### Update Secrets

```bash
# Edit secrets.sh with new values
bash secrets.sh

# Restart affected deployments
kubectl rollout restart deployment/pds -n poltr
kubectl rollout restart deployment/frontend -n poltr
```

## Troubleshooting

View logs for any component:

```bash
# PDS logs
kubectl logs -n poltr deployment/pds --tail=50

# Frontend logs
kubectl logs -n poltr deployment/frontend --tail=50
```

Check pod status:

```bash
kubectl get pods -n poltr
kubectl describe pod -n poltr <pod-name>
```

### Accessing SQLite Database

The PDS uses SQLite for data storage. To access the database:

```bash
# Get the current pod name
kubectl get pods -n poltr -l app=pds

# Copy database file locally
kubectl cp poltr/<pod-name>:/data/account.sqlite ./account.sqlite

# View with DBeaver or sqlite3
sqlite3 account.sqlite
```

## Cluster Management

Kubernetes Dashboard: https://manager.infomaniak.com/v3/hosting/1558567/public-cloud/15667/project/36380/kaas/clusters/2369/dashboard

## Architecture

- **Namespace**: `poltr`
- **Domains**: 
  - `poltr.ch` → Frontend
  - `poltr.info` → PDS (Personal Data Server)
- **Storage**: Persistent volume for PDS data (SQLite databases and blobs)





# IMPORT NEWEST PROPOSALS

- update echtzeitdaten-am-abstimmungstag-zu-eidgenoessischen-abstimmungsvorlagen.json
from https://ckan.opendata.swiss/api/3/action/package_show?id=echtzeitdaten-am-abstimmungstag-zu-eidgenoessischen-abstimmungsvorlagen

-  update .env with actually existing handle

- port forwaring
> kubectl port-forward -n poltr deployment/pds 2583:2583
- import env variables
> source scripts/.env

- end port forwarding
> pkill -f "kubectl port-forward -n poltr deployment/pds"

- run script:
> python3 scripts/import_proposals.py



# UPDATE VENDOR Folder

mkdir -p ./vendor
git clone --depth 1 https://github.com/bluesky-social/atproto.git ./vendor/atproto
