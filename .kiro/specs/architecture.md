# Architecture — Whitelabel Store Management Platform

## 1. Visión general

Sistema multi-tenant tipo whitelabel desplegado en Kubernetes. Un solo conjunto de servicios
atiende a múltiples tenants, aislados por `tenant_id` en base de datos con Row-Level Security.

```
                        Internet
                           │
                    ┌──────▼───────┐
                    │  Ingress     │  (wildcard *.dominio.com + custom domains)
                    │  + cert-mgr  │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐ ┌────▼────┐ ┌────▼────┐
        │  Frontend │ │   API   │ │  Worker │
        │  (Next.js)│ │(Node.js)│ │ (queue) │
        └───────────┘ └────┬────┘ └────┬────┘
                           │           │
              ┌────────────┼───────────┤
              │            │           │
        ┌─────▼──┐   ┌─────▼──┐  ┌────▼───┐
        │Postgres│   │ Redis  │  │ MinIO  │
        └────────┘   └────────┘  └────────┘
```

---

## 2. Stack tecnológico

### Frontend
| Decisión | Tecnología | Justificación |
|----------|-----------|---------------|
| Framework | **Next.js 14 (App Router)** | SSR para tienda pública (SEO), RSC para admin, un solo repo |
| Lenguaje | TypeScript | Tipado end-to-end con la API |
| Estilos | Tailwind CSS | Utility-first, fácil theming por tenant (CSS variables) |
| Componentes UI | shadcn/ui | Componentes accesibles, sin lock-in, copiables al repo |
| Estado global | Zustand | Ligero, suficiente para el POS y sesión |
| Data fetching | TanStack Query | Cache, invalidación y estados de carga |
| Formularios | React Hook Form + Zod | Validación client/server compartida |
| Charts | Recharts | Liviano, suficiente para analytics |

### Backend (API)
| Decisión | Tecnología | Justificación |
|----------|-----------|---------------|
| Runtime | **Node.js 20** | Ecosistema, facilidad de contratación |
| Framework | **Fastify** | Más rápido que Express, schema-first, plugins |
| Lenguaje | TypeScript | Compartir tipos con frontend (monorepo) |
| ORM | **Drizzle ORM** | Type-safe, cercano a SQL, soporte RLS, migraciones simples |
| Validación | Zod | Schemas compartidos con frontend |
| Auth | JWT (jose) + bcrypt | Sin dependencias externas, extensible a OAuth |
| File upload | Multipart via Fastify | PDFs e imágenes |
| Queue | BullMQ (Redis) | Jobs async: procesamiento de imágenes, emails future notifications |

### Base de datos
| Decisión | Tecnología | Justificación |
|----------|-----------|---------------|
| BD principal | **PostgreSQL 16** | RLS nativo, JSONB para configs flexibles, maduro |
| Cache / sesiones | **Redis 7** | Sesiones, rate limiting, BullMQ |
| Object storage | **MinIO** | S3-compatible, self-hosted en el cluster |

### Infraestructura
| Decisión | Tecnología | Justificación |
|----------|-----------|---------------|
| Contenedores | Docker | Build reproducible |
| Orquestación | Kubernetes (cluster propio) | Ya disponible |
| IaC | **Pulumi TypeScript** | Definido como requisito |
| Ingress | **Traefik v3** | Wildcard TLS + custom domains dinámicos sin reinicio (ingress-nginx retirado marzo 2026) |
| TLS | cert-manager + Let's Encrypt | Certificados automáticos |
| BD en cluster | Helm chart (Bitnami PostgreSQL) via Pulumi | |
| Redis en cluster | Helm chart (Bitnami Redis) via Pulumi | |
| Storage en cluster | Helm chart (MinIO) via Pulumi | |
| Desarrollo local | Minikube | Simular el cluster completo localmente |
| Dev alternativo | Docker Compose | Opción más simple para desarrollo rápido |

### Monorepo
```
/
├── apps/
│   ├── web/          # Next.js (frontend + tienda pública)
│   └── api/          # Fastify (REST API)
├── packages/
│   ├── types/        # Tipos TypeScript compartidos
│   ├── schemas/      # Schemas Zod compartidos
│   └── db/           # Drizzle schema + migraciones
├── infra/            # Pulumi TypeScript (IaC)
│   ├── k8s/          # Componentes Kubernetes
│   └── helm/         # Helm releases (postgres, redis, minio)
├── docker/           # Dockerfiles por servicio
├── k8s/              # Manifests locales (minikube)
└── docker-compose.yml
```

Gestor de monorepo: **pnpm workspaces** + **Turborepo** (build cache).

---

## 3. Multi-tenancy

### Resolución de tenant
Cada request HTTP llega con un `Host` header. El API middleware resuelve el tenant así:

1. Busca en la tabla `tenants` un registro donde `custom_domain = Host` (custom domains).
2. Si no, extrae el subdominio y busca `slug = subdominio`.
3. Si no se encuentra → 404.
4. El tenant resuelto se inyecta en el contexto de Fastify (`request.tenant`).

### Aislamiento de datos
- Todas las tablas de datos de negocio tienen columna `tenant_id UUID NOT NULL`.
- Se activa RLS en PostgreSQL: cada policy filtra por `current_setting('app.tenant_id')`.
- El API setea el parámetro de sesión antes de cada query: `SET app.tenant_id = '{id}'`.
- Drizzle ORM nunca emite queries sin el contexto de tenant activo.

### Custom domains
Flujo de dos pasos — la parte de infraestructura se automatiza, el DNS es responsabilidad del cliente:

1. Admin registra `misupertienda.com` en el panel → se guarda en `tenants.custom_domain`.
2. El sistema crea automáticamente un `IngressRoute` de Traefik + cert-manager emite el certificado TLS via HTTP-01 challenge.
3. El sistema muestra al admin: *"Apunta un registro A de `misupertienda.com` a `IP_DEL_CLUSTER`"*.
4. Una vez que el DNS propaga y el certificado está listo, el dominio se activa automáticamente.

El cliente debe realizar el paso de DNS manualmente — ningún sistema puede hacerlo por él.

---

## 4. Modelo de datos (tablas principales)

```sql
-- Core multi-tenant
tenants (id, slug, custom_domain, name, giro, config JSONB, created_at)
users   (id, tenant_id, email, password_hash, role_id, active, created_at)
roles   (id, tenant_id, name, permissions JSONB, is_default BOOLEAN)

-- Catálogo
categories (id, tenant_id, name, description, image_url, sort_order, active)
products   (id, tenant_id, category_id, name, description, price, images JSONB,
            stock, min_stock, active, visible, created_at)
--          active: existe en el sistema / visible: aparece en tienda pública

-- Ventas
sales      (id, tenant_id, user_id, total, discount, tip, payment_method, notes,
            status, -- approved | pending_approval | rejected
            sale_date, -- fecha real de la venta (puede ser pasada)
            created_at)
sale_items (id, sale_id, product_id, quantity,
            unit_price,         -- precio cobrado
            original_price,     -- precio base del producto al momento de la venta
            override_reason,    -- NULL si no hubo override
            subtotal)

-- Aprobación de ventas backdated
sale_approvals (id, sale_id, reviewed_by, status, note, created_at)

-- Documentos PDF
documents  (id, tenant_id, name, slug, file_path, active, created_at)

-- Auditoría
audit_log  (id, tenant_id, user_id, event_type, entity_type, entity_id,
            payload JSONB, -- { before: {...}, after: {...} }
            created_at)

-- Configuración del tenant (almacenada en tenants.config JSONB)
-- {
--   "branding": { "logo_url", "primary_color", "secondary_color" },
--   "contact": { "address", "phone", "whatsapp", "email", "hours" },
--   "social": { "instagram", "facebook", "tiktok", "website" },
--   "modules": { "pos": true, "inventory": true, "analytics": true },
--   "meta": { "title", "description", "og_image" }
-- }
```

---

## 5. API — Estructura de rutas

```
# Públicas (sin auth, resuelven tenant por host)
GET  /                          → tienda pública (Next.js SSR)
GET  /api/public/products       → listado de productos
GET  /api/public/info           → información del negocio
GET  /:slug.pdf                 → servir PDF

# Admin (requieren JWT)
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout

GET|POST        /api/admin/products
GET|PUT|DELETE  /api/admin/products/:id
GET|POST        /api/admin/categories
GET|PUT|DELETE  /api/admin/categories/:id

GET|POST        /api/admin/sales
GET             /api/admin/sales/:id

GET             /api/admin/analytics

GET|POST        /api/admin/documents
PUT|DELETE      /api/admin/documents/:id

GET|PUT         /api/admin/settings
GET|POST        /api/admin/users
PUT|DELETE      /api/admin/users/:id
GET|POST        /api/admin/roles
PUT|DELETE      /api/admin/roles/:id

# Plataforma (super-admin, gestión de tenants)
POST /api/platform/tenants
GET  /api/platform/tenants
```

---

## 6. Infraestructura Kubernetes (via Pulumi TypeScript)

### Namespaces
- `platform` — servicios de la plataforma (api, web, worker)
- `data` — PostgreSQL, Redis, MinIO

### Recursos por servicio
```
web  (Next.js):  Deployment + Service + HPA
api  (Fastify):  Deployment + Service + HPA
worker (BullMQ): Deployment
```

### Helm releases (gestionados desde Pulumi)
```typescript
// infra/helm/index.ts
new k8s.helm.v3.Release("postgresql", {
  chart: "postgresql",
  version: "15.x",
  repositoryOpts: { repo: "https://charts.bitnami.com/bitnami" },
  namespace: "data",
  values: { /* ... */ }
});

new k8s.helm.v3.Release("redis", { /* Bitnami Redis */ });
new k8s.helm.v3.Release("minio", { /* Bitnami MinIO */ });
```

### Ingress (Traefik v3)
```yaml
# Wildcard para subdominios — definido en Pulumi
IngressRoute: host(`*.dominio-plataforma.com`)

# Custom domains — creados dinámicamente por la API al registrar un dominio
IngressRoute: host(`misupertienda.com`)
```
Traefik recarga la configuración sin reinicio al detectar nuevos IngressRoutes.

### Secrets
- Secrets de Kubernetes para: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `MINIO_*`.
- En Pulumi: definidos como `pulumi.Config` con valores secretos encriptados.

### Desarrollo local (Minikube)
```bash
minikube start --memory=4096 --cpus=4
# Habilitar addons
minikube addons enable ingress
minikube addons enable storage-provisioner

# Desplegar con Pulumi apuntando al contexto de minikube
pulumi up --stack dev
```

Alternativa Docker Compose para desarrollo sin Minikube:
```bash
docker-compose up  # levanta api, web, postgres, redis, minio
```

---

## 7. Autenticación y autorización

### Flujo JWT
1. `POST /api/auth/login` → valida credenciales → emite `access_token` (15min) + `refresh_token` (7d).
2. `access_token` en header `Authorization: Bearer ...`
3. `refresh_token` en cookie `httpOnly`.
4. El middleware de Fastify verifica el JWT, extrae `{ userId, tenantId, permissions[] }`.

### Permisos granulares
- Los permisos se almacenan en `roles.permissions` como array JSONB: `["sales.create", "inventory.view"]`.
- El middleware verifica que el usuario tiene el permiso requerido para cada endpoint.
- Los roles predefinidos (admin, manager, cashier) tienen permisos por defecto pero son editables.

---

## 8. Theming por tenant

El branding (colores, logo) se aplica vía CSS variables en Next.js:
- El layout root lee la configuración del tenant (SSR) e inyecta variables CSS.
- `--color-primary`, `--color-secondary`, `--tenant-logo` disponibles globalmente.
- Tailwind se configura para usar esas variables como colores base.
- El admin puede previsualizar cambios antes de guardar.

---

## 10. Patrón de operaciones asíncronas (Worker)

Las operaciones que toman tiempo (resize de imágenes, procesamiento de PDFs) no bloquean al usuario:

1. El cliente sube el archivo → la API guarda el archivo raw en MinIO y encola el job → responde inmediatamente con `{ status: "processing", id: "..." }`.
2. El Worker procesa el job (resize, optimización, etc.) y actualiza el estado en BD a `ready`.
3. El frontend hace polling ligero (`GET /api/admin/products/:id`) o espera un refresco manual para ver el resultado final.

No se implementan WebSockets en v1 — el polling es suficiente para la frecuencia de estas operaciones. (a resolver en implementación)

| Decisión | Opciones | Recomendación |
|----------|----------|---------------|
| Image resizing | Sharp en API vs Worker async | Worker para no bloquear API |
| PDF serving | Fastify static vs MinIO presigned URL | MinIO presigned (no expone paths internos) |
| Migraciones en CI | drizzle-kit push vs generate+migrate | generate+migrate para producción |
| Rate limiting | Redis-based en Fastify | @fastify/rate-limit con Redis store |
