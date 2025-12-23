# POLTR Documentation Index

Welcome to the POLTR project documentation. This index helps you navigate all project management and technical documents.

## Overview

POLTR is an ATProto-based civic-tech platform for Swiss referenda, built as a monorepo with three custom services (frontend, appview, indexer) and orchestrated third-party images (Bluesky PDS, PostgreSQL).

## Essential Documents

### 📋 Project Management

- **[ROADMAP.md](./ROADMAP.md)** - Strategic long-term planning: vision, phases (quarters/years), milestones, open questions
- **[todo.md](./todo.md)** - Tactical short-term tasks: current sprint work items (days/weeks), updated weekly

### 🏗️ Technical Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture, components, data flow, and infrastructure
- **[DEVELOPMENT.md](./DEVELOPMENT.md)** - Local development setup, common tasks, and troubleshooting
- **[DEPLOY.md](./DEPLOY.md)** - Deployment procedures, CI/CD setup, and GitHub Actions configuration

### 🤝 Collaboration

- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Development workflow, branching strategy, code standards, and testing

## Quick Navigation

### For New Contributors
1. Start with [ROADMAP.md](./ROADMAP.md) to understand the vision and current state
2. Review [ARCHITECTURE.md](./ARCHITECTURE.md) to understand the system
3. Follow [DEVELOPMENT.md](./DEVELOPMENT.md) to set up your environment
4. Read [CONTRIBUTING.md](./CONTRIBUTING.md) for workflow guidelines

### For Project Management
1. **Daily/Weekly:** Check [todo.md](./todo.md) for current sprint tasks and immediate priorities
2. **Monthly/Quarterly:** Review [ROADMAP.md](./ROADMAP.md) for strategic planning, phases, and open questions
3. Update todo.md weekly; update ROADMAP.md when phases/strategy change

### For Deployment
1. Follow [DEPLOY.md](./DEPLOY.md) for deployment procedures
2. Check [ARCHITECTURE.md](./ARCHITECTURE.md) for infrastructure details
3. Review CI/CD workflows in `.github/workflows/`

### For Development
1. See [DEVELOPMENT.md](./DEVELOPMENT.md) for setup instructions
2. Check service-specific READMEs in `services/*/README.md`
3. Review [CONTRIBUTING.md](./CONTRIBUTING.md) for standards

## Service-Specific Documentation

Each service has its own technical README with setup and deployment instructions:

- **Frontend:** `services/front/README.md` - React + TypeScript + OAuth
- **AppView:** `services/appview/README.md` - API service + PostgreSQL
- **Indexer:** `services/indexer/README.md` - Firehose listener + PostgreSQL

## External Resources

- **AT Protocol:** https://atproto.com
- **Bluesky PDS:** https://github.com/bluesky-social/pds
- **Kubernetes Dashboard:** https://manager.infomaniak.com/v3/hosting/1558567/public-cloud/15667/project/36380/kaas/clusters/2369/dashboard
- **GitHub Repository:** (Add your repo URL here)

## Document Status

| Document | Last Updated | Status |
|----------|--------------|--------|
| ROADMAP.md | 2024-12-23 | ✅ Current |
| todo.md | 2024-12-23 | ✅ Current |
| ARCHITECTURE.md | 2024-12-23 | ✅ Current |
| DEVELOPMENT.md | 2024-12-23 | ✅ Current |
| CONTRIBUTING.md | 2024-12-23 | ✅ Current |
| DEPLOY.md | 2024-11-21 | ⚠️ Needs Review |

## Contributing to Documentation

When making significant changes to the project:

1. Update relevant documentation files
2. Update this index if adding new documents
3. Update the "Document Status" table above
4. Ensure cross-references are accurate

### Documentation Guidelines

- Keep documents focused and single-purpose
- Use clear headings and structure
- Include code examples where helpful
- Link between related documents
- Update regularly as project evolves

## Getting Help

If you can't find what you're looking for:

1. Check the service-specific READMEs
2. Search existing GitHub issues
3. Review the architecture document
4. Ask in pull request comments
5. Create a new issue with the `documentation` label

---

**Last Updated:** 2024-12-23
