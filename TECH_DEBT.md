# Deudas Técnicas — StoreHub

Pendientes a resolver en siguientes iteraciones.

---

## Alta prioridad

### ~~Rol "Almacenista" + endpoint de restock~~ ✅
- Nuevo permiso: `inventory.restock` — solo puede sumar stock, no restar ni editar precios
- Rol "Almacenista" (solo restock) y "Cajero+Almacenista" (restock + ventas)
- Endpoint `POST /api/admin/inventory/restock` que solo suma stock, con auditoría
- Toda suma queda en audit_log automáticamente
- Reducciones de stock solo vía ventas o admin/manager con razón obligatoria
- **Implementado en v0.12.0–v0.12.1** (migraciones 0003, 0004)

### ~~CREATE EXTENSION unaccent en migraciones~~ ✅
- Migración 0002: `CREATE EXTENSION IF NOT EXISTS unaccent`
- Idempotente — seguro para prod donde ya existe manualmente
- **Implementado en v0.12.0**

---

## Alta prioridad

### Configuración de colores/branding no aplica cambios ✅
- ~~En Configuración se pueden elegir colores primario y secundario~~
- ~~Al cambiar los colores, no se refleja en el sitio (ni admin ni tienda pública)~~
- **Implementado en v0.13.1–v0.13.2**: CSS variables inyectadas desde tenant config, título dinámico

---

## Media prioridad

### Carrito + Ordenar por WhatsApp (tienda pública)
- La tienda pública actualmente solo muestra productos y precios
- **Fase 1**: Agregar carrito de compras en la tienda pública
  - El cliente puede agregar productos, ver resumen, ajustar cantidades
  - Botón "Ordenar" abre WhatsApp con mensaje pre-armado: lista de productos, cantidades, total
  - El número de WhatsApp sale de la configuración del tenant (`config.contact.whatsapp`)
  - El cobro se hace manualmente después del mensaje (flujo in-person)
- **Fase 2 (futuro, no urgente)**: Pasarela de pagos (Stripe, Mercado Pago, PayPal)
  - Pago online directo desde la tienda
  - No prioritario — el negocio es presencial, la tienda pública es más catálogo/precios

### Pre-compilar TypeScript del API (esbuild)
- Actualmente usa `tsx` (compila on-the-fly al arrancar)
- Spike de ~300-500m CPU al inicio, luego se estabiliza
- Se intentó con esbuild pero falló por imports de workspace packages
- **Solución**: resolver los paths de packages en el bundle, o usar tsc + node directo
- Objetivo: bajar CPU limit a 100-200m

### CI/CD completo con Pulumi
- GitHub Action de build ya existe (push a main → `latest`, tag → versión)
- **Falta**: action que haga `pulumi up` automático al push de tag (CD)
- **Falta**: tests corriendo en CI antes de merge
- **Falta**: linting en CI
- Esto automatiza el deploy sin intervención manual

### Vault (HashiCorp) para secretos
- Instalar Vault en el cluster (stack `support`)
- Vault Injector para inyectar secrets a los pods
- Eliminar secrets de Pulumi config y migrarlos a Vault
- Referencia: ya existe un stack de Vault en el repo de infra viejo

### Wildcard certificate
- Hostinger no tiene webhook para cert-manager DNS-01
- Opciones: migrar DNS a Cloudflare (tiene webhook oficial) o mantener certs individuales por tenant
- Con Cloudflare: wildcard automático, zero config por tenant
- Actualmente cada custom domain necesita entrada en Pulumi YAML + DNS manual

---

## Baja prioridad

### Favicon configurable por tenant
- Actualmente usa el favicon default de Next.js
- Permitir subir una imagen desde Configuración que se use como favicon
- UI: interfaz de recorte cuadrado (crop) para que el usuario seleccione el área
- Backend: procesar/redimensionar a 32x32 y 180x180 (apple-touch-icon)
- Servir dinámicamente según el tenant (por hostname o slug)
- Complejidad media: requiere crop UI (librería tipo react-cropper), procesamiento de imagen (sharp), y servir el favicon dinámicamente

### Toppings / Modificadores de productos (v2)
- Productos que se pueden agregar como complemento a otros
- En la tienda pública: opción de seleccionar toppings al ver un producto
- En el POS: agregar toppings al registrar venta

### Impresión de tickets
- Generar PDF/HTML de ticket al registrar venta
- Integración con impresoras térmicas (ESC/POS)

### i18n (múltiples idiomas)
- La UI actual está en español
- Agregar soporte para inglés como mínimo

### Worker para jobs async
- Definido en el spec original pero no implementado
- Para: resize de imágenes batch, emails, notificaciones futuras
- Stack: BullMQ + Redis (Redis ya existe)

---

## Completados ✅

- ~~Rol "Almacenista" + endpoint de restock~~ — v0.12.0–v0.12.1: permiso `inventory.restock`, roles almacenista/cajero_almacenista, endpoint con audit log
- ~~CREATE EXTENSION unaccent en migraciones~~ — v0.12.0: migración idempotente `IF NOT EXISTS`
- ~~Configuración de colores/branding no aplica~~ — v0.13.1–v0.13.2: CSS variables desde tenant config, título dinámico, sin flash
- ~~Dashboard "Ventas del mes" mostraba 30 días atrás~~ — v0.12.2: corregido a 1ro del mes actual
- ~~NEXT_PUBLIC_API_URL placeholder~~ — Resuelto: entrypoint sed + runtime injection funciona
- ~~Panel Super Admin~~ — Existe en `/platform` con CRUD de tenants y custom domains
- ~~Migración Xalli~~ — 94 productos, 119 ventas, 577 items, 3 usuarios, 17 imágenes migrados
- ~~Custom domain routing~~ — Middleware Next.js reescribe /admin/* en dominios propios
- ~~Token refresh automático~~ — Interceptor 401 + refresh proactivo implementado
- ~~Tenant-scoped tokens~~ — localStorage por tenant, sin data leaks
- ~~Configurable resources/HPA~~ — Controlados desde Pulumi YAML por stack

---

## Notas para retomar

- **Cluster**: k3s en `5.189.172.140` (contexto `default`)
- **Pulumi stacks**: `cert-manager/support`, `storehub/prod`, `storehub/staging`
- **Registry**: `ghcr.io/barreramelchorf/storehub-*`
- **Prod**: `xalli.top` + `storehub.barreramelchorf.top` (v0.11.3)
- **Staging**: `storehub-staging.barreramelchorf.top` (v0.12.3)
- **Prod admin (Xalli)**: username `admin` / `Xalli2024!`
- **Staging admin**: username `admin` / `password123` (tenant demo-cafe)
- **Prod platform key**: `37959826a1b0bdb404fff0a5d08d270fc5531f7e617479a4`
- **Staging platform key**: `0015b865c1f407686f34f72485e8952cb59631541f1e0e78`
- **GitHub Actions**: build en push a main o tags `v*`
- **Dominio Xalli**: `xalli.top` → `5.189.172.140`
