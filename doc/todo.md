# POLTR — Next Steps (todo)

This file lists the next prioritized, actionable tasks to bring the project from MVP to stable deployment.

## Short-term (developer-facing)

1. Commit appview build fix
	- Add missing helpers: `services/appview/src/lib.ts` (done locally). Commit & push.

2. Push branch and open PR
	- Create a feature branch, push the `src/lib.ts` fix and open a PR for review.

3. Add `KUBECONFIG` GitHub secret
	- Create a `gha-deployer` ServiceAccount in the `poltr` namespace and generate a kubeconfig for it.
	- Add kubeconfig to GitHub Actions secrets as `KUBECONFIG`.

4. Trigger workflow and verify CI
	- Push a test change under `services/appview/` to trigger `.github/workflows/deploy-appview.yml`.
	- Inspect Actions logs, confirm image pushed to GHCR and `kubectl set image` succeeded.

5. Address CI/build failures (if any)
	- Fix TypeScript or dependency issues reported by CI. Iterate until the workflow completes successfully.

## Mid-term (local dev & ergonomics)

6. Add `.env.example`
	- Document required environment variables (e.g. `APPVIEW_POSTGRES_URL`) and any default values.

7. Create `docker-compose` dev setup
	- Compose file to bring up Postgres + AppView for local development and testing.

8. Add `kustomization.yaml` for manifests
	- Add a `kustomization.yaml` in `k8s/` to make applying RBAC and overlays easier.

## Repo structure & tooling

9. Scaffold `pnpm` workspace
	- Convert repo to a workspace (root `package.json` with `workspaces`) and add `packages/common` for shared code.

10. Create decision backlog doc
	 - Add `doc/decision-backlog.md` with owners, priorities and deadlines for Auth, Governance, Backfill, Legal.

## Ops & security

11. Add deployment monitoring alerts
	 - Add basic checks and alerting (restart counts, rollout failures) to Ops runbook.

12. Rotate and audit secrets
	 - Ensure any secrets added temporarily are rotated and that secrets are not tracked in git history.

---

If you want, I can: create a feature branch and push the `src/lib.ts` fix (1), create a `docker-compose` (7), and add `.env.example` (6). Tell me which to start with.
