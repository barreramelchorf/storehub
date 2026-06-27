# Tasks — Whitelabel Store Management Platform

Desglose de implementación organizado en fases. Cada tarea es independiente dentro de su fase
y tiene un criterio de "done" verificable.

---

## Fase 0 — Setup del proyecto

### T-001 Inicializar monorepo
- pnpm workspaces + Turborepo
- Estructura de carpetas: `apps/web`, `apps/api`, `packages/types`, `packages/schemas`, `packages/db`
- `.gitignore`, `tsconfig` base compartida, ESLint + Prettier
- **Done:** `pnpm install` desde raíz funciona; `turbo build` corre sin errores

### T-002 Configurar packages compartidos
- `packages/types`: tipos TypeScript base (Tenant, User, Product, etc.)
- `packages/schemas`: schemas Zod compartidos (validación request/response)
- `packages/db`: Drizzle schema + cliente + helper de conexión
- **Done:** los packages se importan correctamente desde `apps/api` y `apps/web`

### T-003 Setup base de datos
- Drizzle schema completo (todas las tablas del modelo de datos)
- Migraciones iniciales con `drizzle-kit generate`
- Script de seed para desarrollo (tenant demo + usuario admin + productos de ejemplo)
- Habilitar RLS en PostgreSQL + policies por tabla
- **Done:** `pnpm db:migrate` aplica schema; `pnpm db:seed` crea datos de prueba

### T-004 Setup infraestructura base (Pulumi)
- Proyecto Pulumi TypeScript en `infra/`
- Stack `dev` apuntando a Minikube
- Namespaces `platform` y `data`
- Helm releases: PostgreSQL, Redis, MinIO
- Secrets de Kubernetes para credenciales
- **Done:** `pulumi up --stack dev` levanta los servicios de datos en Minikube sin errores

### T-005 Docker Compose para desarrollo local
- `docker-compose.yml` con: postgres, redis, minio, api (hot-reload), web (hot-reload)
- Variables de entorno via `.env.example`
- **Done:** `docker-compose up` levanta todo; API responde en `localhost:3001/health`

---

## Fase 1 — API: Core y autenticación

### T-006 Setup Fastify base
- Proyecto Fastify en `apps/api`
- Plugins: `@fastify/cors`, `@fastify/helmet`, `@fastify/multipart`, `@fastify/rate-limit`
- Middleware de resolución de tenant (por `Host` header)
- Middleware de autenticación JWT
- Health endpoint `GET /health`
- Manejo global de errores
- **Done:** `GET /health` retorna `{ status: "ok", db: "connected", redis: "connected" }`

### T-007 Auth endpoints
- `POST /api/auth/login` — valida email/password, emite access + refresh token
- `POST /api/auth/refresh` — renueva access token desde refresh token (httpOnly cookie)
- `POST /api/auth/logout` — invalida refresh token
- Rate limiting en login (5 intentos / 15min por IP)
- **Done:** login retorna tokens; refresh funciona; token inválido retorna 401

### T-008 Middleware de permisos
- Decorator Fastify `requirePermission(permission: string)`
- Extrae `permissions[]` del JWT
- Retorna 403 si el permiso no está en el array
- **Done:** endpoint protegido con `requirePermission("inventory.manage")` rechaza usuario sin ese permiso

---

## Fase 2 — API: Módulos de negocio

### T-009 Categorías CRUD
- `GET|POST /api/admin/categories`
- `GET|PUT|DELETE /api/admin/categories/:id`
- Permisos: view → `inventory.view`, write → `inventory.manage`
- **Done:** CRUD completo funciona; no se pueden acceder datos de otro tenant

### T-010 Productos CRUD
- `GET|POST /api/admin/products`
- `GET|PUT|DELETE /api/admin/products/:id`
- Upload de imágenes a MinIO
- Paginación en listado
- **Done:** CRUD completo con imágenes; listado paginado; imágenes accesibles vía URL

### T-011 Ventas y POS
- `GET|POST /api/admin/sales`
- `GET /api/admin/sales/:id`
- Al crear venta: descuenta stock de cada producto, valida stock disponible
- **Done:** venta registrada correctamente; stock decrementado; venta rechazada si stock insuficiente

### T-012 Analytics endpoints
- `GET /api/admin/analytics?period=day|week|month&from=&to=`
- Retorna: ventas totales, transacciones, top productos, stock bajo mínimo, ventas por día/hora
- Queries optimizadas con índices en `sales.created_at` y `sale_items.product_id`
- **Done:** endpoint retorna datos correctos para cada período; respuesta < 500ms con seed data

### T-013 Documentos PDF
- `GET|POST /api/admin/documents` — listar / subir PDF a MinIO
- `PUT|DELETE /api/admin/documents/:id`
- `GET /:slug.pdf` — endpoint público que sirve el PDF (MinIO presigned URL redirect)
- Validación: solo archivos PDF; slug único por tenant
- **Done:** PDF subido accesible vía `/{slug}.pdf`; slug duplicado retorna error

### T-014 Gestión de usuarios y roles
- CRUD de usuarios del tenant
- CRUD de roles con permisos configurables
- Roles predefinidos creados en seed (admin, manager, cashier)
- **Done:** admin puede crear usuario con rol; usuario hereda permisos del rol

### T-015 Configuración del tenant
- `GET|PUT /api/admin/settings` — branding, contacto, redes, módulos, meta tags
- `PUT /api/admin/settings/domain` — registrar custom domain
- **Done:** cambios en settings se reflejan en la siguiente carga de la tienda pública

### T-016 Endpoints públicos
- `GET /api/public/products?category=&search=&page=` — productos activos con stock
- `GET /api/public/info` — información del negocio
- Sin autenticación; resuelve tenant por host
- **Done:** productos filtrados correctamente; productos inactivos no aparecen

---

## Fase 3 — Frontend: Tienda pública

### T-017 Setup Next.js
- Proyecto Next.js 14 (App Router) en `apps/web`
- Tailwind CSS + shadcn/ui instalado
- Layout con inyección de CSS variables de theming por tenant
- Middleware Next.js para resolución de tenant (setea tenant en headers)
- **Done:** `pnpm dev` levanta; página raíz carga sin errores

### T-018 Tienda pública — catálogo
- Página principal: listado de productos por categoría
- Filtro por categoría, búsqueda por nombre
- Card de producto: imagen, nombre, precio, disponibilidad
- Diseño responsivo mobile-first
- SSR para SEO (meta tags del tenant)
- **Done:** catálogo visible en browser mobile y escritorio; meta tags correctos en `<head>`

### T-019 Tienda pública — información del negocio
- Sección/página con: dirección, horarios, redes sociales, métodos de contacto
- Links a WhatsApp, redes sociales
- **Done:** información del negocio visible y correctamente linkeada

### T-020 Theming por tenant
- Leer config del tenant en Server Component (layout root)
- Inyectar `--color-primary`, `--color-secondary`, logo como CSS variables / datos
- Tailwind configurado para usar esas variables
- **Done:** dos tenants con colores distintos muestran colores diferentes sin reload del server

---

## Fase 4 — Frontend: Panel admin

### T-021 Login y sesión
- Página de login (`/admin/login`)
- Manejo de tokens (access en memoria, refresh en cookie)
- Redirect a `/admin` tras login exitoso
- Protección de rutas admin (middleware)
- **Done:** login funciona; acceso a `/admin` sin sesión redirige a login

### T-022 Layout admin
- Sidebar con navegación por módulos (visible según permisos del usuario)
- Header con nombre del tenant, usuario activo, logout
- Responsivo (sidebar colapsable en móvil)
- **Done:** navegación funciona en mobile y escritorio; módulos ocultos según permisos

### T-023 Admin — Inventario (categorías y productos)
- Listado de categorías con acciones CRUD
- Listado de productos con filtros, paginación, acciones CRUD
- Formulario de producto: campos, upload de imágenes, control de stock
- **Done:** CRUD completo funciona en UI; imágenes se suben y muestran

### T-024 Admin — POS (punto de venta)
- Grid de productos con búsqueda
- Carrito lateral: agregar/quitar productos, ajustar cantidades
- Selección de método de pago, campo de descuento
- Botón "Registrar venta" → llama API → limpia carrito
- Mensaje de error si stock insuficiente
- **Done:** venta registrada desde UI; stock actualizado en inventario

### T-025 Admin — Analytics
- Selector de período (día / semana / mes / rango)
- Tarjetas de resumen: ventas totales, transacciones, ticket promedio
- Gráfico de ventas por día (línea)
- Tabla de productos más vendidos
- Lista de productos con stock bajo mínimo
- **Done:** datos cambian al cambiar período; gráfico renderiza en mobile

### T-026 Admin — Documentos PDF
- Listado de PDFs con slug, estado activo/inactivo
- Upload de nuevo PDF con campo de slug personalizable
- Toggle activo/inactivo, eliminar
- **Done:** PDF subido aparece en listado; accesible vía `/{slug}.pdf` públicamente

### T-027 Admin — Configuración del tenant
- Formulario de branding: nombre, logo, colores (color picker)
- Formulario de información: dirección, horarios, contacto, redes
- Sección de dominio personalizado
- Preview de cambios antes de guardar
- **Done:** cambios guardados se reflejan en tienda pública

### T-028 Admin — Usuarios y roles
- Listado de usuarios con rol asignado
- Crear/editar usuario (solo admin)
- Listado de roles con permisos
- Editor de permisos por rol (checkboxes)
- **Done:** usuario creado puede hacer login con su rol; permisos editados se aplican inmediatamente

---

## Fase 5 — Infraestructura completa

### T-029 Dockerfiles de producción
- `Dockerfile` para `apps/api` (multi-stage, imagen mínima)
- `Dockerfile` para `apps/web` (multi-stage, standalone output)
- **Done:** imágenes construyen correctamente; tamaño < 300MB cada una

### T-030 Manifests Kubernetes en Pulumi
- Deployments para `web` y `api` con health checks (liveness + readiness)
- Services (ClusterIP)
- HorizontalPodAutoscaler básico (min 1, max 3)
- ConfigMaps para configuración no-secreta
- Secrets desde Pulumi config
- **Done:** `pulumi up --stack dev` despliega todos los servicios en Minikube correctamente

### T-031 Ingress y TLS
- ingress-nginx con regla wildcard `*.dominio.com`
- cert-manager con ClusterIssuer Let's Encrypt
- Script / proceso para agregar Ingress de custom domain dinámicamente
- **Done:** tenant accesible por subdominio con HTTPS en staging

### T-032 Jobs de migración en Kubernetes
- Kubernetes Job que corre `drizzle-kit migrate` al desplegar
- InitContainer en el Deployment de API que espera a que la BD esté disponible
- **Done:** despliegue aplica migraciones antes de levantar la API

### T-033 Stack de producción en Pulumi
- Stack `prod` apuntando al cluster real
- Configuración separada de `dev` (recursos, réplicas, storage)
- **Done:** `pulumi up --stack prod` despliega sin errores; app accesible en producción

---

## Fase 6 — Calidad y observabilidad

### T-034 Tests de integración de la API
- Tests para auth, CRUD de productos, registro de venta, analytics
- Verificar aislamiento de tenants (tenant A no puede leer datos de tenant B)
- Framework: Vitest + supertest
- **Done:** `pnpm test` pasa; cobertura de paths críticos de negocio

### T-035 Logs estructurados
- Pino logger en Fastify con nivel configurable vía env
- Logs incluyen: `tenantId`, `userId`, `requestId`, `method`, `path`, `statusCode`, `ms`
- **Done:** logs en formato JSON en stdout; nivel cambiable sin rebuild

### T-036 Documentación de desarrollo
- `README.md` raíz: cómo levantar con Docker Compose y con Minikube
- `infra/README.md`: cómo hacer deploy con Pulumi
- Variables de entorno documentadas en `.env.example`
- **Done:** un desarrollador nuevo puede levantar el proyecto siguiendo el README

---

## Orden sugerido de implementación

```
Fase 0 (T-001 → T-005)  →  Fase 1 (T-006 → T-008)
                                    ↓
                          Fase 2 (T-009 → T-016)
                          Fase 3 (T-017 → T-020)   ← paralelo con Fase 2
                                    ↓
                          Fase 4 (T-021 → T-028)
                                    ↓
                          Fase 5 (T-029 → T-033)
                          Fase 6 (T-034 → T-036)   ← puede ir paralelo
```

Total: 36 tareas across 6 fases.
