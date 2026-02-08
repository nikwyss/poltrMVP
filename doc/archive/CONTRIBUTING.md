# Contributing to POLTR

## Development Workflow

### Branching Strategy
- `main` - Production branch
- `feature/*` - Feature development branches
- `fix/*` - Bug fix branches

### Pull Request Process
1. Create a feature branch from `main`
2. Make your changes
3. Submit a pull request
4. Wait for review and CI checks
5. Merge after approval

## Project Structure

```
poltr/
├── .github/workflows/       # CI/CD pipelines
├── doc/                     # Project documentation
├── infra/                   # Infrastructure
│   ├── kube/              # Kubernetes manifests
│   ├── cert/              # Certificate management
│   ├── deployer/          # GHA deployer RBAC
│   └── scripts/           # One-off setup scripts
├── services/               # Application services
│   ├── front/             # React frontend
│   ├── appview/           # API service
│   └── indexer/           # Firehose indexer
```

## Local Development

### Prerequisites
- Node.js 20+
- Docker
- kubectl (for K8s interaction)
- Access to cluster (optional)

### Service-Specific Setup

Each service has its own development instructions:
- Frontend: `services/front/README.md`
- AppView: `services/appview/README.md`
- Indexer: `services/indexer/README.md`

### Working with Kubernetes

#### Port Forwarding
```bash
# Access PDS locally
kubectl port-forward -n poltr deployment/pds 2583:2583

# Access PostgreSQL locally
kubectl port-forward -n poltr deployment/allforone-postgres 5432:5432
```

#### View Logs
```bash
# Check specific service logs
kubectl logs -n poltr deployment/pds --tail=50
kubectl logs -n poltr deployment/appview --tail=50
kubectl logs -n poltr deployment/indexer --tail=50
```

## Code Standards

### TypeScript/JavaScript
- Use TypeScript for type safety
- Follow ESLint configuration
- Run `npm run lint` before committing

### Docker
- Keep images minimal (production dependencies only)
- Use multi-stage builds where appropriate
- Include health checks

### Kubernetes
- All manifests in `infra/kube/` directory
- Use namespaces (`poltr`)
- Document resource requirements

## Testing

### Frontend
```bash
cd services/front
npm test
```

### AppView/Indexer
```bash
cd services/appview  # or services/indexer
npm test
```

## Deployment

### Automatic Deployment
- Push to `main` triggers GitHub Actions
- CI builds and pushes Docker images
- CD updates Kubernetes deployments

### Manual Deployment
```bash
# Build and push service
docker build -t ghcr.io/<owner>/poltr-<service>:<tag> ./services/<service>
docker push ghcr.io/<owner>/poltr-<service>:<tag>

# Update deployment
kubectl -n poltr set image deployment/<service> <service>=ghcr.io/<owner>/poltr-<service>:<tag>
kubectl -n poltr rollout status deployment/<service>
```

## Documentation

### When to Update Docs
- New features require documentation
- Architecture changes need updates to `doc/ARCHITECTURE.md`
- API changes need updates to service READMEs

### Documentation Files
- `doc/ARCHITECTURE.md` - System architecture
- `doc/project_summary.md` - Project overview
- `doc/todo.md` - Task tracking
- `doc/DEPLOY.md` - Deployment procedures
- `README.md` - Getting started guide

## Communication

### Issue Tracking
- Use GitHub Issues for bugs and features
- Label appropriately (bug, enhancement, documentation)
- Link PRs to issues

### Commit Messages
- Use clear, descriptive messages
- Reference issue numbers when applicable
- Format: `type: description` (e.g., `fix: oauth callback redirect`)

## Getting Help

- Check service-specific READMEs
- Review architecture documentation
- Check existing issues/PRs
- Ask in pull request comments
