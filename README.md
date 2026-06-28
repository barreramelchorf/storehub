# StoreHub

Plataforma SaaS whitelabel para gestión de tiendas — punto de venta, inventario, analytics y tienda pública personalizable por tenant.

## Quick Start (desarrollo local)

```bash
# Clonar y preparar
git clone git@github.com:barreramelchorf/storehub.git
cd storehub
cp .env.example .env
pnpm install

# Levantar servicios (PostgreSQL, Redis, MinIO)
docker-compose up postgres redis minio -d

# Correr migraciones y seed
pnpm db:migrate
pnpm db:seed

# Iniciar en desarrollo
pnpm dev
```

La app queda disponible en:
- **Web (tienda pública)**: http://localhost:3000
- **API**: http://localhost:3001
- **Admin**: http://localhost:3000/admin/login

Credenciales del seed: `admin@demo-cafe.com` / `password123`

## Estructura del proyecto

```
storehub/
├── apps/
│   ├── api/              # Fastify REST API
│   └── web/              # Next.js (tienda pública + admin panel)
├── packages/
│   ├── types/            # Tipos TypeScript compartidos
│   ├── schemas/          # Validaciones Zod compartidas
│   └── db/               # Drizzle ORM schema + migraciones
├── infra/                # Pulumi IaC (ver infra/README.md)
│   ├── applications/storehub/
│   └── infrastructure/cert-manager/
├── docker/               # Dockerfiles (api, web, migrate)
└── docker-compose.yml    # Dev local
```

## Scripts principales

| Comando | Descripción |
|---------|-------------|
| `pnpm dev` | Inicia API + Web en modo desarrollo |
| `pnpm build` | Build de producción |
| `pnpm test` | Corre tests de todos los packages |
| `pnpm db:migrate` | Aplica migraciones de BD |
| `pnpm db:seed` | Seed de datos de desarrollo |

## Stack

- **Frontend**: Next.js 14, Tailwind CSS, TanStack Query, Zustand
- **Backend**: Fastify, Drizzle ORM, JWT (jose), BullMQ
- **Base de datos**: PostgreSQL 16 (con RLS), Redis 7, MinIO
- **Infraestructura**: Kubernetes (k3s), Traefik, Pulumi TypeScript, Docker
- **CI/CD**: GitHub Actions (próxima iteración)

## Arquitectura

Multi-tenant SaaS — un solo deployment sirve a múltiples tiendas:
- Tenant resolution por `Host` header (subdominio o custom domain)
- Row-Level Security en PostgreSQL para aislamiento de datos
- Theming por tenant via CSS variables
- Custom domains con cert-manager (HTTP-01 automático)

## Documentación

- [Spec de requisitos](.kiro/specs/requirements.md)
- [Arquitectura técnica](.kiro/specs/architecture.md)
- [Tareas de implementación](.kiro/specs/tasks.md)
- [Infraestructura](infra/README.md)
