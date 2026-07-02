# StoreHub — Project Context

## What is this project?
SaaS whitelabel multi-tenant platform for store management (POS, inventory, analytics, public storefront). Live in production.

## Architecture
- **Monorepo**: pnpm workspaces + Turborepo
- **Frontend**: Next.js 14 (App Router) in `apps/web/`
- **Backend**: Fastify API in `apps/api/`
- **Database**: Drizzle ORM + PostgreSQL (with RLS) in `packages/db/`
- **Shared**: `packages/types/`, `packages/schemas/` (Zod)
- **Infrastructure**: Pulumi TypeScript in `infra/applications/storehub/`
- **Dockerfiles**: `docker/` (api, web, migrate)
- **CI**: GitHub Actions builds linux/amd64 images on push to main or tags `v*`

## Environments
| Env | URL | Namespaces | Notes |
|-----|-----|-----------|-------|
| **Prod** | `storehub.barreramelchorf.top` + `xalli.top` | `storehub-prod`, `storehub-data-prod` | Live traffic |
| **Staging** | `storehub-staging.barreramelchorf.top` | `storehub-staging`, `storehub-data-staging` | For testing |

- Cluster: k3s on `5.189.172.140`, kubectl context `default`
- Registry: `ghcr.io/barreramelchorf/storehub-*`
- Pulumi stacks: `cert-manager/support`, `storehub/prod`, `storehub/staging`

## Deployment Flow
1. Make changes → commit → push to main (triggers GitHub Action build with tag `latest`)
2. To deploy: create git tag `vX.Y.Z` → Action builds with that tag
3. Update Pulumi YAML: `pulumi config set version vX.Y.Z`
4. `pulumi up` deploys to the selected stack
5. **Always test in staging first**, then promote to prod

## Multi-Tenancy
- Tenants resolved by: subdomain, custom domain (DB lookup), `x-tenant-slug` header, or `DEFAULT_TENANT_SLUG` env
- Custom domains: configured in Pulumi YAML `customDomains` array → creates Ingress + cert-manager TLS
- Next.js middleware rewrites custom domain paths (`/admin/*` → `/t/:slug/admin/*` internally)
- JWT contains `tenantId` — all admin operations scoped to tenant from token

## Key Credentials
- **Prod admin (Xalli)**: username `admin` / `Xalli2024!` at `xalli.top/admin/login`
- **Staging admin**: username `admin` / `password123` at `storehub-staging.barreramelchorf.top/t/demo-cafe/admin/login`
- **Prod platform key**: `37959826a1b0bdb404fff0a5d08d270fc5531f7e617479a4`
- **Staging platform key**: `0015b865c1f407686f34f72485e8952cb59631541f1e0e78`

## Deployment Process

### Deploy to Staging
```bash
cd /Users/fernando/Code/storehub

# 1. Commit and push changes
git add . && git commit -m "feat: description" && git push origin main

# 2. Create version tag (triggers GitHub Action to build images)
git tag vX.Y.Z && git push origin vX.Y.Z

# 3. Wait ~4 minutes for GitHub Action to build (check: gh run list --limit 1)

# 4. Deploy to staging
cd infra/applications/storehub
pulumi stack select staging
pulumi config set version vX.Y.Z
pulumi config set migrationsVersion vX.Y.Z
pulumi up --yes --skip-preview
```

### Promote to Prod (after staging verification)
```bash
cd infra/applications/storehub
pulumi stack select prod
pulumi config set version vX.Y.Z
pulumi config set migrationsVersion vX.Y.Z
pulumi up --yes --skip-preview
```

### Verify deployment
```bash
kubectl get pods -n storehub-staging  # or storehub-prod
kubectl logs -n storehub-staging -l app=storehub-api --tail=5
```

### If migration job gets stuck
```bash
kubectl delete jobs --all -n storehub-staging
pulumi up --yes --skip-preview
```

### If pulumi gets stuck with "Another update in progress"
```bash
pulumi cancel && pulumi up --yes --skip-preview
```

## Development Rules
- **Never make manual DB changes** — all schema changes must be in Drizzle migrations
- **Verify code compiles** before pushing (`npx tsc --noEmit`)
- **Test against staging**, not prod
- **All changes must eventually reach prod** — nothing hardcoded per environment
- **Resources/config are in Pulumi YAML** — not in TypeScript code
- **Seed must be idempotent** — safe to run multiple times
- Dockerfiles use `node:20-alpine`, tsx for runtime (API), standalone for web
- `imagePullPolicy: Always` on all deployments

## Pending Work (see TECH_DEBT.md for full list)
- Rol "Almacenista" (inventory.restock permission — only add stock, audited)
- `CREATE EXTENSION unaccent` must be in migrations (currently only in prod manually)
- Pre-compile TypeScript API (esbuild bundle to eliminate CPU spike)
- GitHub Actions CD: auto `pulumi up` on tag push
- Vault for secrets management
