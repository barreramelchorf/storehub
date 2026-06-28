# Deudas Técnicas — StoreHub

Pendientes a resolver en siguientes iteraciones.

---

## Alta prioridad

### Fix: NEXT_PUBLIC_API_URL placeholder en bundles client-side
- El entrypoint `sed` no está reemplazando correctamente el placeholder en todos los JS bundles
- Las páginas del admin hacen requests a `__NEXT_PUBLIC_API_URL_PLACEHOLDER__/api/...`
- **Solución propuesta**: Eliminar el approach de placeholder y en su lugar usar un endpoint `/config.js` que exponga las env vars al cliente en runtime, o simplemente hardcodear `""` (vacío) en build para producción donde todo va por ruta relativa `/api`

### Panel Super Admin
- Actualmente los tenants se crean vía API con `x-platform-key`
- Crear UI en `/platform` con login separado para:
  - CRUD de tenants
  - Ver métricas globales
  - Gestionar dominios custom

### Migración de datos Xalli → StoreHub
- 3 usuarios, 12 categorías, 94 productos, 119 ventas, 577 sale_items
- 17 imágenes en PVC `/app/uploads/`
- Script de migración que mapee el schema viejo al nuevo
- Copiar imágenes a MinIO

---

## Media prioridad

### Vault (HashiCorp) para secretos
- Instalar Vault en el cluster (stack `support`)
- Vault Injector para inyectar secrets a los pods
- Eliminar secrets de Pulumi config y migrarlos a Vault
- Referencia: ya existe un stack de Vault en el repo de infra viejo

### Optimización del API (spike de CPU al inicio)
- Actualmente usa `tsx` (compila TypeScript on-the-fly al arrancar)
- Spike de ~500m CPU al inicio, luego se estabiliza en ~10m
- **Solución**: Pre-compilar TypeScript a JavaScript en el Dockerfile (eliminar tsx del runtime)
- Reduce tiempo de arranque y consumo de recursos

### CI/CD completo
- GitHub Action de build ya existe
- Falta: action que haga `pulumi up` automático al mergear a main (CD)
- Falta: tests corriendo en CI antes de merge
- Falta: linting en CI

### Wildcard certificate
- Hostinger no tiene webhook para cert-manager DNS-01
- Opciones: migrar DNS a Cloudflare (tiene webhook oficial) o mantener certs individuales por tenant
- Con Cloudflare: wildcard automático, zero config por tenant

---

## Baja prioridad

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

## Notas para retomar

- **Cluster**: k3s en `5.189.172.140` (contexto `default`)
- **Pulumi stacks**: `cert-manager/support`, `storehub/prod`
- **Registry**: `ghcr.io/barreramelchorf/storehub-*`
- **Tenant Xalli**: ya creado en prod (admin@xalli.com / Xalli2024!)
- **Platform API key**: `37959826a1b0bdb404fff0a5d08d270fc5531f7e617479a4`
- **Dominio**: `storehub.barreramelchorf.top`
- **GitHub Actions**: build en push a main o tags `v*`
