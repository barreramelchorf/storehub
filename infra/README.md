# StoreHub Infrastructure

Pulumi TypeScript project that deploys the full StoreHub stack to Kubernetes.

## Architecture

```
infra/
├── package.json               # Single dependency source (no duplication)
├── tsconfig.json
├── Pulumi.yaml                # Project definition
├── Pulumi.cert-manager.yaml   # Stack config: cert-manager
├── Pulumi.dev.yaml            # Stack config: app dev
├── index.ts                   # Dispatcher (routes to correct stack)
├── stacks/
│   ├── cert-manager.ts        # cert-manager + ClusterIssuers
│   └── app.ts                 # StoreHub app (data + platform)
├── helm/index.ts              # PostgreSQL, Redis, MinIO
└── k8s/index.ts               # Deployments, Services, IngressRoute, HPA, RBAC
```

### Deploy order

```bash
cd infra

# 1. Deploy cluster-level infra (once)
pulumi stack select cert-manager
pulumi up

# 2. Deploy app
pulumi stack select dev    # or staging, prod
pulumi up
```

Each stack has its own state in Pulumi Cloud but shares the same codebase and dependencies.

```
Stack: cert-manager
└── cert-manager + ClusterIssuers (letsencrypt-prod, letsencrypt-dns)

Stack: dev / staging / prod
├── Namespace: storehub-data-{stack}
│   ├── PostgreSQL 16
│   ├── Redis 7
│   └── MinIO
└── Namespace: storehub-{stack}
    ├── API Deployment + Service + HPA + ServiceAccount
    ├── Web Deployment + Service
    ├── DB Migration Job
    ├── Traefik IngressRoute
    ├── Wildcard Certificate (prod only)
    └── Secrets & ConfigMap
```

## Prerequisites

- `pulumi` CLI installed
- `kubectl` configured to target your cluster
- Docker images built and pushed to your registry

## Local Development (Minikube)

```bash
# Start minikube with enough resources
minikube start --memory=4096 --cpus=4
minikube addons enable storage-provisioner
minikube addons enable metrics-server

# Install Traefik — already included in k3s, skip if using k3s
# Install cert-manager — managed by Pulumi (helm/index.ts)

# Build images locally (use minikube docker env)
eval $(minikube docker-env)
docker build -f docker/api.Dockerfile --target production -t storehub-api:latest .
docker build -f docker/web.Dockerfile --target production -t storehub-web:latest .
docker build -f docker/migrate.Dockerfile -t storehub-migrate:latest .

# Or push to GitHub Container Registry
docker build -f docker/api.Dockerfile --target production -t ghcr.io/barreramelchorf/storehub-api:latest .
docker build -f docker/web.Dockerfile --target production -t ghcr.io/barreramelchorf/storehub-web:latest .
docker build -f docker/migrate.Dockerfile -t ghcr.io/barreramelchorf/storehub-migrate:latest .
docker push ghcr.io/barreramelchorf/storehub-api:latest
docker push ghcr.io/barreramelchorf/storehub-web:latest
docker push ghcr.io/barreramelchorf/storehub-migrate:latest

# Deploy with Pulumi
cd infra
npm install
pulumi stack select dev
pulumi config set postgresPassword YOUR_PASSWORD --secret
pulumi config set redisPassword YOUR_PASSWORD --secret
pulumi config set jwtSecret YOUR_SECRET --secret
pulumi config set minioRootPassword YOUR_PASSWORD --secret
pulumi up
```

## Production Deployment

```bash
# Create prod stack
pulumi stack init prod

# Configure for production
pulumi config set platformDomain your-domain.com
pulumi config set apiImage your-registry/storehub-api:v1.0.0
pulumi config set webImage your-registry/storehub-web:v1.0.0
pulumi config set migrateImage your-registry/storehub-migrate:v1.0.0
pulumi config set apiReplicas 2
pulumi config set webReplicas 2
pulumi config set postgresPassword PROD_PASSWORD --secret
pulumi config set redisPassword PROD_PASSWORD --secret
pulumi config set jwtSecret PROD_SECRET --secret
pulumi config set minioRootPassword PROD_PASSWORD --secret

# Set kubernetes context to production cluster
pulumi config set kubernetes:context your-prod-context

pulumi up
```

## Custom Domains

Custom domains are handled by creating additional IngressRoute resources.
When a tenant registers a custom domain via the admin panel, the API will create
a new IngressRoute pointing to the web/api services with cert-manager issuing the
TLS certificate automatically.

## Secrets Management

All secrets are managed via Pulumi's encrypted config (`pulumi config set --secret`).
They are stored encrypted in `Pulumi.<stack>.yaml` and decrypted at deploy time
into Kubernetes Secrets.

## Resource Limits

| Service    | Request CPU | Limit CPU | Request Mem | Limit Mem |
|-----------|------------|-----------|-------------|-----------|
| API        | 100m       | 500m      | 128Mi       | 256Mi     |
| Web        | 100m       | 500m      | 128Mi       | 256Mi     |
| PostgreSQL | 100m       | 500m      | 256Mi       | 512Mi     |
| Redis      | 50m        | 200m      | 64Mi        | 128Mi     |
| MinIO      | 50m        | 200m      | 128Mi       | 256Mi     |
