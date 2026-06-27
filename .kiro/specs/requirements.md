# Requirements — Whitelabel Store Management Platform

## Visión general

Plataforma SaaS multi-tenant tipo whitelabel para gestión de establecimientos comerciales
(cafeterías, tiendas de celulares, restaurantes, etc.). Un mismo codebase e infraestructura
sirve a múltiples clientes (tenants), cada uno con su propia configuración, branding y datos
completamente aislados.

---

## 1. Multi-tenancy

### RF-01 Aislamiento por tenant
- Cada tenant tiene sus datos aislados mediante `tenant_id` en todas las tablas de BD.
- Se aplica Row-Level Security (RLS) en PostgreSQL como segunda capa de protección.

### RF-02 Resolución de tenant
- Un tenant puede ser accedido vía subdominio compartido: `{slug}.dominio-plataforma.com`
- Un tenant puede asociar su propio dominio personalizado (custom domain): `misuperapp.com`
- El sistema resuelve el tenant activo a partir del `Host` header de cada request.

### RF-03 Onboarding de tenant
- Registro de nuevo tenant con: nombre del negocio, tipo de giro, slug, email del admin.
- El slug se convierte en el subdominio por defecto.
- El admin puede asociar un dominio personalizado desde el panel de configuración.

### RF-04 Configuración por tenant
- Nombre del negocio, logo, colores primarios/secundarios.
- Tipo de giro (cafetería, tienda de electrónica, panadería, etc.) — afecta terminología UI
  (ej. "menú" vs "catálogo") y módulos disponibles.
- Información del local: dirección, horarios, redes sociales, métodos de contacto.

---

## 2. Tienda pública (frontend público)

### RF-05 Catálogo de productos
- Listado de productos organizados por categorías.
- Por producto: nombre, descripción, precio, imagen, disponibilidad (en stock / agotado).
- Filtro por categoría. Búsqueda por nombre.
- Diseño responsivo (mobile-first).

### RF-06 Información del establecimiento
- Página o sección con: nombre, descripción, dirección, horarios, redes sociales,
  métodos de contacto (teléfono, WhatsApp, email).

### RF-07 Documentos PDF públicos
- El tenant puede subir uno o más PDFs (menú, catálogo, carta de vinos, etc.).
- Cada PDF tiene un slug configurable por el admin: `/{slug}.pdf`
  Ejemplo: `/menu.pdf`, `/catalogo.pdf`, `/carta-vinos.pdf`
- Múltiples PDFs activos simultáneamente.
- El endpoint público sirve el PDF directamente (descarga o visualización en browser).
- El slug debe ser único por tenant.

### RF-08 SEO básico
- Meta tags configurables por tenant (título, descripción, og:image).

---

## 3. Administración (panel privado)

### RF-09 Autenticación
- Login con usuario (email) y contraseña.
- JWT con refresh token.
- Sesión expira en tiempo configurable.
- Diseñado para que en el futuro pueda agregarse OAuth sin cambios estructurales.

### RF-10 Roles y permisos

Roles predefinidos (disponibles por defecto para cualquier tenant):

| Rol | Descripción |
|-----|-------------|
| `admin` | Acceso total al tenant. Puede gestionar usuarios, roles, configuración, inventario, ventas, analytics. |
| `manager` | Todo excepto gestión de usuarios y configuración del tenant. |
| `cashier` | Solo puede registrar ventas (POS). No puede modificar inventario ni ver analytics. |

Los permisos de cada rol predefinido pueden ser ajustados por el `admin` del tenant
(activar/desactivar permisos granulares por rol).

Permisos granulares disponibles:
- `sales.create` — Registrar ventas
- `sales.view` — Ver historial de ventas
- `inventory.view` — Ver inventario
- `inventory.manage` — Crear/editar/eliminar productos y categorías
- `analytics.view` — Ver analytics
- `settings.manage` — Configurar el tenant
- `users.manage` — Gestionar usuarios del tenant
- `documents.manage` — Subir/gestionar PDFs

### RF-11 Gestión de inventario
- CRUD de categorías: nombre, descripción, imagen, orden de aparición.
- CRUD de productos: nombre, descripción, precio, categoría, imágenes, stock, disponibilidad.
- Control de stock: cantidad actual, alerta de stock mínimo configurable por producto.
- Estado de producto: activo / inactivo (no aparece en tienda pública si inactivo).

### RF-12 Punto de venta (POS)
- Interfaz para registrar ventas desde el panel admin (optimizada para uso en pantalla táctil/escritorio).
- Flujo: buscar/seleccionar productos → ajustar cantidades → registrar venta.
- Registro de método de pago: efectivo, tarjeta, transferencia, otro.
- Descuento por venta (porcentaje o monto fijo).
- Al registrar venta, el stock se descuenta automáticamente.
- Impresión / exportación de ticket (opcional, fase 2).

### RF-13 Analytics
- Período seleccionable: día, semana, mes, rango personalizado.
- Métricas disponibles:
  - Ventas totales (monto) por período.
  - Número de transacciones por período.
  - Días/horas con mayor volumen de ventas (heatmap).
  - Productos más vendidos (por cantidad y por monto).
  - Stock actual por producto.
  - Productos por debajo del stock mínimo (alerta de resurtido).
  - Ticket promedio.
  - Ingresos por método de pago.

### RF-14 Gestión de documentos PDF
- Subida de archivos PDF.
- Definición de slug personalizado por archivo.
- Activar / desactivar un PDF sin eliminarlo.
- Eliminar PDF.

### RF-15 Configuración del tenant
- Editar información del negocio (nombre, logo, colores, redes, contacto).
- Gestión de dominio personalizado (agregar/verificar dominio).
- Configuración de tipo de giro.

---

## 4. Requisitos no funcionales

### RNF-01 Responsividad
- Tienda pública y panel admin deben ser completamente funcionales en móvil y escritorio.

### RNF-02 Seguridad
- HTTPS obligatorio en todos los endpoints.
- Autenticación requerida en todos los endpoints `/admin/*`.
- RLS en PostgreSQL para evitar data leaks entre tenants.
- Rate limiting en endpoints de autenticación.
- Sanitización de inputs. Prevención de SQL injection vía ORM.
- Los PDFs subidos no son ejecutables; solo se sirven como `application/pdf`.

### RNF-03 Performance
- Tiempo de carga de tienda pública < 2s en conexión móvil promedio.
- Imágenes optimizadas y servidas desde CDN o storage con cache headers.
- Paginación en listados (productos, ventas, etc.).

### RNF-04 Disponibilidad
- El sistema debe tolerar reinicios de pods sin pérdida de datos.
- Health checks configurados para liveness y readiness en Kubernetes.

### RNF-05 Observabilidad
- Logs estructurados (JSON) con nivel configurable.
- Health endpoint (`/health`) que reporte estado de BD y dependencias.

### RNF-06 Extensibilidad
- El sistema de tipos de giro debe permitir agregar nuevos tipos sin modificar el core.
- Los módulos (POS, inventario, analytics) deben poder habilitarse/deshabilitarse por tenant.

---

## 5. Fuera de alcance (v1)

- Pasarela de pagos integrada (solo registro de venta, no cobro online).
- App móvil nativa.
- Notificaciones push.
- OAuth / SSO.
- Módulo de facturación fiscal.
- Múltiples idiomas (i18n).
- Marketplace o tienda con carrito de compras online.
