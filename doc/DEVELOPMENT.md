# POLTR Development Setup

## Quick Start

This is a monorepo containing three custom services and orchestrated third-party images.

### Prerequisites
- Node.js 20+ (for frontend and indexer)
- Python 3.11+ (for appview)
- Docker Desktop
- kubectl (optional, for cluster access)
- Git

## Repository Structure

```
poltr/
├── services/
│   ├── front/      # React frontend (TypeScript + Vite)
│   ├── appview/    # API service (Python + FastAPI)
│   └── indexer/    # Firehose listener (Node.js)
├── k8s/            # Kubernetes manifests
├── doc/            # Project documentation
└── .github/        # CI/CD workflows
```

## Local Development

### 1. Frontend Development

```bash
cd services/front
npm install
npm start
```

Access at: `http://127.0.0.1:5173`

**Important:** Use `127.0.0.1` (not `localhost`) for OAuth compatibility.

See `services/front/README.md` for details.

### 2. AppView Development

```bash
cd services/appview

# Port-forward to PostgreSQL
kubectl port-forward -n poltr deployment/allforone-postgres 5432:5432

# Run locally
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 3000
```

See `services/appview/README.md` for details.

### 3. Indexer Development

```bash
cd services/indexer

# Port-forward to PDS and PostgreSQL
kubectl port-forward -n poltr deployment/pds 2583:2583
kubectl port-forward -n poltr deployment/allforone-postgres 5432:5432

# Run locally
npm install
npm run dev
```

See `services/indexer/README.md` for details.

## Working with Kubernetes

### Access Production Services

```bash
# View all pods
kubectl get pods -n poltr

# View logs
kubectl logs -n poltr deployment/appview --tail=50
kubectl logs -n poltr deployment/indexer --tail=50
kubectl logs -n poltr deployment/pds --tail=50

# Port forward services
kubectl port-forward -n poltr deployment/pds 2583:2583
kubectl port-forward -n poltr deployment/allforone-postgres 5432:5432
```

### Deploy Changes

```bash
# Apply Kubernetes manifests
kubectl apply -f k8s/poltr.yaml

# Restart a deployment
kubectl rollout restart deployment/appview -n poltr
kubectl rollout status deployment/appview -n poltr
```

## Database Access

### PostgreSQL (AppView + Indexer data)

```bash
# Port forward
kubectl port-forward -n poltr deployment/allforone-postgres 5432:5432

# Connect with psql
psql -h localhost -p 5432 -U poltr -d poltr
```

### SQLite (PDS data)

```bash
# Copy database locally
kubectl get pods -n poltr -l app=pds
kubectl cp poltr/<pod-name>:/data/account.sqlite ./account.sqlite

# View with sqlite3
sqlite3 account.sqlite
```

## Building Docker Images

### Build All Services

```bash
# Frontend
docker build -t poltr-front ./services/front

# AppView
docker build -t poltr-appview ./services/appview

# Indexer
docker build -t poltr-indexer ./services/indexer
```

### Push to Registry

```bash
# Tag for GitHub Container Registry
docker tag poltr-front ghcr.io/<owner>/poltr-front:latest

# Push
docker push ghcr.io/<owner>/poltr-front:latest
```

## Common Tasks

### Import Proposals

```bash
# Update dataset
curl -o echtzeitdaten.json https://ckan.opendata.swiss/api/3/action/package_show?id=echtzeitdaten-am-abstimmungstag-zu-eidgenoessischen-abstimmungsvorlagen

# Port forward PDS
kubectl port-forward -n poltr deployment/pds 2583:2583

# Import
source scripts/.env
python3 scripts/import_proposals.py
```

### Update Vendor Dependencies

```bash
mkdir -p ./vendor
git clone --depth 1 https://github.com/bluesky-social/atproto.git ./vendor/atproto
```

## CI/CD

### GitHub Actions

The workflow `.github/workflows/build-and-push-services.yml` automatically:
1. Builds Docker images on push to `main`
2. Pushes to GitHub Container Registry
3. Updates Kubernetes deployments

### Manual Deployment

See `doc/DEPLOY.md` for detailed deployment procedures.

## Troubleshooting

### Frontend won't connect to PDS
- Ensure you're using `127.0.0.1` not `localhost`
- Check OAuth client configuration
- Verify PDS is accessible

### AppView/Indexer can't reach database
- Verify port-forward is active
- Check database credentials
- Ensure PostgreSQL pod is running

### Firehose not receiving events
- Check PDS is running
- Verify indexer subscription URL
- Review indexer logs for errors

## Development Workflow

1. **Create feature branch:** `git checkout -b feature/my-feature`
2. **Make changes** in relevant service directory
3. **Test locally** with port-forwarding
4. **Commit and push:** `git push origin feature/my-feature`
5. **Create pull request** on GitHub
6. **Merge** after review and CI passes

## Resources

- AT Protocol Docs: https://atproto.com
- Bluesky PDS: https://github.com/bluesky-social/pds
- Project Architecture: `doc/ARCHITECTURE.md`
- Contributing Guide: `doc/CONTRIBUTING.md`
- Roadmap: `doc/ROADMAP.md`
