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

### Carrito + Ordenar por WhatsApp (tienda pública) ✅
- **Implementado en v0.13.3–v0.13.6**

### Multicomanda en POS (múltiples cuentas simultáneas)
- Feature específico para restaurantes — debe ser configurable (on/off) desde Configuración → Módulos
- **Concepto**: el cajero puede tener múltiples cuentas/comandas abiertas a la vez (ej: Mesa 1, Mesa 2, Barra)
- **Nombres**: default auto-generado ("Comanda 1", "Comanda 2"), editable si el cajero tiene tiempo
- **UI**: tabs arriba del panel de carrito para switchear entre comandas
  - `[+ Nueva] [Comanda 1 ●] [Mesa 2 ●] [Barra ●]`
  - El contenido del carrito cambia según la tab activa
  - Cada tab tiene su propio carrito independiente
- **Mobile-first**: tabs deben funcionar bien en celular (scroll horizontal, compactos)
- **Persistencia**: todas las comandas abiertas se guardan en localStorage
- **Cobrar**: cierra solo la comanda activa, las demás permanecen
- **Sin límite** de comandas simultáneas
- Complejidad: media-alta (UI de tabs, multi-state management, localStorage multi-cart)

### Pagos divididos / split payments (fase 1: manual) — PARCIALMENTE IMPLEMENTADO, EN PAUSA
- **Caso de uso**: una cuenta se paga con varios métodos (ej: $60 efectivo + $40 tarjeta).
- **Ya hecho en código (commits locales, NO desplegado, NO probado)**:
  - Schema: tabla `sale_payments` (id, saleId FK, method enum, amount) + relación `sales.payments`
  - Migración `0016_add_sale_payments.sql`: crea la tabla + **backfill idempotente** (una fila por venta existente con su método+total, garantiza `SUM(payments)=sales.total` para que el histórico y el cierre mensual cuadren exacto)
  - ⚠️ **CONFLICTO DE MIGRACIÓN AL MERGEAR**: main ya usó `0016` para cash sessions. Al retomar/mergear `feature/split-payments`, renumerar su migración a `0017_add_sale_payments.sql` y ajustar el `_journal.json` (idx 17). Resolver el conflicto del journal manualmente.
  - `saleSchema`: `paymentMethod` ahora opcional + `payments[]` opcional, con refine (requiere uno u otro)
  - Sale creation (`sales.ts`): valida `sum(payments)==total` (2 decimales), setea `sales.paymentMethod` efectivo (único o dominante), inserta filas en `sale_payments`
  - Todos los paths de venta pueblan `sale_payments`: POS manual, terminal (`point.ts` → card), checkout online (`webhooks.ts` → card)
- **Pendiente (tareas 3-6)**:
  - Analytics `salesByPayment`: cambiar para agregar desde `sale_payments` (montos reales por método) en vez del enum único de `sales`. **Crítico**: validar que el histórico da los mismos números tras el backfill (cierre mensual + transferencias deben cuadrar).
  - POS: UI de pago dividido (elegir métodos + montos, validar suma == total)
  - Mostrar desglose del split en el detalle de venta (sales page + dashboard)
  - Verificar builds + correctitud del backfill en staging, luego push
- **Fase 2 (futura)**: integrar el split con el cobro por terminal Point (parte por terminal + parte manual). Hoy el split es solo manual (no dispara terminal).
- **Riesgo clave**: el cambio de analytics no debe perder ni alterar datos históricos — el backfill está diseñado para eso, pero hay que verificarlo contra números reales antes de desplegar a prod.

### Variantes de producto (distinto a modificadores)
- **Problema**: Hoy las variantes se meten como modificadores, pero no lo son. Un modificador es un extra aditivo (leche +$5). Una variante es el **mismo producto en formas mutuamente excluyentes** (Tarta de fresa / mora / piña), cada una con su propio precio y stock. Al meterlas como modificadores, en analytics la info se mezcla (todo cuenta como "Tarta").
- **Diseño propuesto**:
  - Nueva tabla `product_variants`: `id`, `productId` (FK), `name`, `price` (override o delta), `stock`, `sku` (opcional), `active`, `sortOrder`
  - El producto padre puede marcarse como "tiene variantes" → al agregarlo en POS se **obliga a elegir una variante** (selección única, no múltiple como modificadores)
  - `sale_items` debe referenciar la variante específica (`variantId` nullable)
  - Stock se descuenta a nivel variante, no producto
  - **Analytics**: agrupar por variante para que cada una tenga sus propias métricas (top/bottom, ingresos). El producto padre puede mostrar el agregado.
  - Tienda pública: mostrar selector de variante (dropdown o botones)
- **Diferencia clave con modificadores**:
  - Modificador = opcional, aditivo, múltiple (checkboxes)
  - Variante = obligatorio, excluyente, único (radio/selección)
- **Migración**: nueva tabla + `variantId` nullable en `sale_items` + flag `hasVariants` en products (o inferido de si existen variantes)
- **Complejidad**: alta — toca schema, POS, tienda pública, analytics, y descuento de stock
- **Consideración**: un producto podría tener AMBOS (variante + modificadores). Ej: "Tarta de fresa" (variante) + "extra crema" (modificador). El diseño debe soportar la combinación.

### Pre-compilar TypeScript del API (esbuild)
- Actualmente usa `tsx` (compila on-the-fly al arrancar)
- Spike de ~300-500m CPU al inicio, luego se estabiliza
- Se intentó con esbuild pero falló por imports de workspace packages
- **Solución**: resolver los paths de packages en el bundle, o usar tsc + node directo
- Objetivo: bajar CPU limit a 100-200m

### CI/CD completo con Pulumi ✅
- **Implementado**: push main → build SHA tag → auto deploy staging; tag v* → re-tag → auto deploy prod
- ~~**Falta**: tests corriendo en CI antes de merge~~ ✅ Job `test` corre API + Web (vitest) y bloquea build/promote-prod si falla
- **Falta**: linting en CI

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

### Crear usuario 'tienda_online' al provisionar nuevos tenants
- La migración 0012 cubre los tenants existentes
- Falta agregar la creación en `apps/api/src/routes/platform.ts` al POST de nuevo tenant
- Sin esto, un tenant nuevo no podrá recibir pagos online hasta que se corra otra migración
- Cambio pequeño: un INSERT más en el endpoint de crear tenant

### Integración Mercado Pago Point (cobro presencial desde POS)
- Conectar el POS del admin con la terminal física Point de MP
- Al darle "Cobrar" con tarjeta, enviar la orden directo al Point vía API
- El Point muestra el monto, cliente pasa tarjeta, pago procesado automáticamente
- Elimina errores manuales (no hay que teclear monto en el Point)
- Feature configurable on/off desde Configuración → Módulos
- Requisitos: cuenta MP vinculada al Point, hardware Point (~$600-900 MXN)
- API: POST /point/integration-api/devices/{device_id}/payment-intents
- Flujo: POS cobra → API crea payment intent → Point recibe → cliente paga → webhook confirma
- Investigar: vinculación de dispositivo, notificaciones de pago, manejo de errores/timeout

### Confirmación de impresión vía webhook (Point)
- Hoy la impresión de tickets/cuenta es request/response: confirmamos que MP **aceptó/encoló** la acción (201 + actionId) y mostramos "✓ Enviado a la terminal". No confirmamos que el papel salió físicamente.
- Modelo real de MP (y Square): la acción de impresión tiene estados (`created` → `printed`/`error`) que se confirman vía **webhook** o consultando `GET /terminals/v1/actions/:id`.
- **Mejora futura**: suscribirse a los webhooks de acciones de terminal de MP para mostrar "✓ Impreso" definitivo o "⚠ Falló la impresión" (ej: sin papel), en vez de solo "enviado".
- El simulador de staging replica el modelo actual (devuelve el actionId, no hace seguimiento del estado final).
- Prioridad: baja — el cajero tiene el papel físico como confirmación inmediata.

### APM / Monitoreo de errores
- Actualmente no hay monitoreo de errores ni métricas de rendimiento
- Opciones gratuitas: Sentry (free tier 5K eventos/mes), Grafana Cloud (free tier), Uptime Kuma (self-hosted)
- Lo mínimo: captura de errores en API y frontend, alertas, trazabilidad
- Ideal: Sentry en frontend (Next.js SDK) + Sentry en API (Fastify plugin) + Uptime Kuma para health checks
- Bonus: dashboards de latencia, error rate, uptime

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

## 📌 BACKLOG PRIORITARIO (pedido 2026-11-14, antes del motor de campañas programadas)

### B1 — Reactivar usuarios desactivados  ✅ HECHO (staging, 2026-11-14)
- Decisión: solo el administrador (`users.manage`) desactiva y reactiva; el gerente no.
- Implementado: `POST /api/admin/users/:id/reactivate` + botón "Reactivar" (reemplaza el
  "Inactivo" deshabilitado) con ConfirmDialog. Desactivar y reactivar quedan en el audit log
  (`user_deactivated` / `user_reactivated`).
- Protección: un usuario no puede desactivar su propia cuenta (409). Como quien llama debe
  ser un admin activo, esto basta para que el tenant siempre conserve al menos un admin
  activo; un admin sí puede desactivar a OTRO admin. Caso límite no cubierto: dos admins
  desactivándose mutuamente al mismo tiempo (carrera), improbable.
- Contexto original:
- Verificado en DB (2026-11-14): hoy SOLO el rol `administrador` tiene `users.manage` en
  todos los tenants (demo-cafe en staging; xalli y chickenstore en prod). Por lo tanto solo
  el administrador puede desactivar usuarios. El gerente no ve ni la página Usuarios.
- ⚠️ `DELETE /api/admin/users/:id` no tiene guardas: un admin puede desactivarse a sí mismo
  o desactivar al último admin del tenant y dejarlo sin acceso. Agregar la protección junto
  con la reactivación.
- Hoy desactivar = `DELETE /api/admin/users/:id` (active=false) y no hay forma de revertirlo;
  la UI muestra el botón "Inactivo" deshabilitado (`admin/users/page.tsx`).
- Falta: endpoint de reactivación (o aceptar `active` en el PUT) + botón "Reactivar" con
  ConfirmDialog + audit log.
- ⚠️ DECISIÓN PENDIENTE de permisos: se pidió que lo hagan admin y gerente, pero hoy
  `users.manage` solo lo tiene `administrador` (el gerente NO gestiona usuarios, ver
  `.kiro/steering/permissions.md`). Opciones: (a) permiso nuevo `users.reactivate` para
  admin+gerente (no abre el resto de la gestión de usuarios), (b) dar `users.manage` al
  gerente (cambia el modelo de roles). Recomendado: (a).

### B2 — Previsualizador de la tarjeta de lealtad  ✅ HECHO (staging, 2026-11-14)
- Implementado en `admin/loyalty/PassPreview.tsx`, usado en el form de programa (crear y
  editar): vista Apple/Google, herencia de colores programa → tenant → defaults, y puntos de
  muestra = puntos de bienvenida. Es una vista aproximada, no el .pkpass real.
- Hallazgo: en Google solo se aplica el color de fondo de la clase (el código no envía color
  de texto ni de etiquetas); texto y etiquetas solo aplican a Apple. La UI lo indica.
- Pendiente menor: no hay campo de logo por programa en el form (el preview usa el logo de
  la tienda).
- Texto original del pedido:
- Los selectores de color (fondo/texto/etiquetas) no muestran cómo queda el pase.
- Falta: preview en vivo en el form de programa, tanto al crear como al editar. Debe
  reflejar la herencia de branding (programa → tenant → defaults), nombre del negocio,
  logo, puntos, recompensa. Idealmente una vista tipo Apple Wallet y otra tipo Google.
- Es un render aproximado en HTML/CSS (no el .pkpass real). Aclarar en la UI que es
  referencial.

### B3 — Segundo camino para acumular puntos: búsqueda por teléfono  ✅ HECHO (staging, 2026-11-14)
- Decisiones del usuario: teléfono OBLIGATORIO en el registro, solo México (10 dígitos),
  coincidencia por número completo normalizado, validado en el formulario.
- Implementado: `normalizeMxPhone` (packages/schemas; acepta +52/52/521, espacios, guiones),
  teléfono obligatorio en `loyaltyEnrollSchema` (se guarda normalizado), endpoint
  `GET /api/admin/loyalty/cards/by-phone` (`loyalty.scan`, solo tarjetas activas, devuelve
  nombre/puntos/programa), campo `via: 'qr'|'phone'` en el scan (la transacción queda con
  nota "Visita por teléfono"), y búsqueda en la pestaña Escáner con lista si hay varias.
- La búsqueda compara los últimos 10 dígitos del teléfono guardado, así que números viejos
  con formato libre ("55 4578 3005") también coinciden sin migración.
- ⚠️ Tarjetas existentes sin teléfono (era opcional) no se pueden encontrar por este camino.
- Teléfono duplicado (resuelto 2026-11-14): el registro detecta un celular ya existente en el
  mismo programa y, igual que con el correo, NO crea tarjeta nueva: manda el enlace de
  recuperación al correo con el que se registró la tarjeta existente (el mensaje al cliente no
  revela ese correo). Si la tarjeta vieja no tiene correo, responde 409 y pide ayuda al
  negocio. Las tarjetas anuladas NO cuentan como duplicado.
- Migración 0027 normaliza los teléfonos existentes a 10 dígitos (idempotente; no toca los
  que no se pueden normalizar). Antes de promover a prod, en prod hay 1 tarjeta (xalli) con
  solo 9 dígitos: la migración la deja intacta y no será encontrable por teléfono hasta
  corregirla a mano.
- ⚠️ Política de tarjetas anuladas: hoy una tarjeta anulada NO bloquea el re-registro (el
  mensaje al cajero dice "pide que se registre de nuevo"), así que un cliente anulado por mal
  uso puede registrarse otra vez con los mismos datos. Si se quiere un veto real, hay que
  usar el estado `blocked` (existe en el enum, sin UI) y que cuente como duplicado.
- Pendiente (abuso): un tercero que conozca el correo o celular de alguien puede provocar
  envíos repetidos del correo de recuperación; solo existe el límite global de 100 req/min.
- Texto original del pedido:
- Caso: el cliente olvidó su teléfono/tarjeta. El cajero captura el número celular y el
  sistema devuelve la tarjeta para sumar la visita.
- Requiere: endpoint de búsqueda por teléfono (tenant-scoped, `loyalty.scan`) + UI en la
  pestaña Escáner (campo "o buscar por teléfono"), reutilizando la misma lógica de scan
  (cooldown `maxScansPerDay`, transacción `earn`, push).
- Edge cases a decidir: (1) teléfono es opcional en el enrollment → clientes sin teléfono no
  son encontrables (¿volverlo obligatorio?); (2) normalizar formato (espacios/guiones/+52);
  (3) varios resultados (mismo teléfono en distintos programas) → mostrar lista para elegir;
  (4) coincidencia parcial (últimos 4 dígitos) vs exacta; (5) seguridad/antifraude: el
  teléfono no es secreto, así que registrar en la transacción que fue manual
  (`note: 'Visita por teléfono'`) para auditar abuso.

### B4 — Webcam de escritorio no lee el QR (investigar, lote independiente)
- Síntoma: una webcam comprada no logra leer el QR en el escáner del panel.
- Hipótesis a descartar (no confirmadas): (a) el escáner pide `facingMode: environment`,
  pensado para celulares; (b) región de escaneo fija de 240px y 10 fps; (c) webcams de foco
  fijo que no enfocan a corta distancia; (d) el QR del pase en la pantalla del teléfono es
  pequeño o con brillo/reflejo; (e) resolución solicitada baja.
- Opciones a evaluar: selector de cámara (`Html5Qrcode.getCameras()`), pedir mayor
  resolución, quitar/ajustar `qrbox`, usar la API nativa `BarcodeDetector` donde exista,
  y siempre dejar el fallback manual (B3) y/o lector USB de códigos (actúa como teclado).
- Pedir al usuario: modelo de webcam, navegador y si lee un QR impreso en papel.

### B5 — Logo de tienda / favicon / logo por programa (diseño a futuro)
- Hoy no existe carga de logo: `ImageUpload` es solo de productos y `config.branding.logoUrl`
  no tiene pantalla. Por eso los pases salen solo con el nombre del negocio como texto
  (Apple usa un ícono transparente de 1x1; Google, `default-logo.png`).
- Cadena de resolución acordada: logo del programa → logo de la tienda → solo texto con el
  nombre del negocio. El backend (`pass-builder.ts`) y el preview ya la implementan; falta
  la carga de imágenes (tienda y programa) y el favicon, junto con el tema pendiente de
  logo/favicon de la tienda.
- Cuidado al diseñarlo: Apple y Google piden formatos distintos (Apple: logo horizontal
  chico más ícono cuadrado obligatorio; Google: logo cuadrado que se recorta en círculo).
  Conviene validar o generar variantes al subir (el API ya usa `sharp`).

### B6 — Recuperación de tarjeta: incidente 2026-11-14 y endurecimiento (por decidir)
- Incidente: el usuario abrió el enlace de recuperación y vio "Application error: a client-side
  exception". El token quedó consumido (el API sí respondió). Reproducido con Chrome headless
  (UA iPhone) sobre el despliegue actual: la página se dibuja bien. El intento coincidió con el
  reemplazo de pods web/api de staging (pods viejos detenidos 05:37:04 y 05:37:18 UTC; intento
  05:37:15 UTC), por lo que la causa más probable es un desfase de versión durante el deploy
  (el navegador pide archivos de un build que acaba de desaparecer). No confirmado.
- Debilidad real: el enlace se consume con un GET. Si algo falla después de la respuesta
  (render, red, cierre de pestaña) o un escáner de correo lo abre antes, el cliente ve "ya fue
  usado" y debe empezar de nuevo. Práctica estándar (Stytch, Supabase, better-auth): el enlace
  solo muestra una página de confirmación y el token se gasta con un POST al presionar un botón.
- Abuso del correo de recuperación (OWASP Forgot Password): limitar por cuenta, no crear más de
  un token activo por ventana, y respuestas genéricas para no enumerar cuentas.
- Opciones a implementar: (a) consumir el token con POST tras un botón "Recuperar mi tarjeta";
  (b) cooldown: si ya hay un token vigente enviado hace < ~5 min, no generar/enviar otro;
  (c) límite por tarjeta (ej. 3 correos/hora) y por IP en el endpoint de registro;
  (d) `error.tsx` en las rutas de lealtad para mostrar un mensaje amable con "Reintentar" en
  lugar de la pantalla genérica de Next.
- Tarjetas anuladas y veto: plataformas de lealtad (Incentivio, LoyaltyPlant) usan un estado
  "bloqueado" que conserva el historial, restringe el canje y marca las cuentas recreadas
  ("linked"), en vez de borrar. Propuesta: separar "Anular" (pase inválido, puede volver a
  registrarse) de "Bloquear cliente" (usa el estado `blocked` existente, cuenta como duplicado
  por correo/celular y rechaza el re-registro con un mensaje neutro), y no repetir los puntos de
  bienvenida si ya existió una tarjeta anulada con el mismo correo/celular en el programa.

### Lealtad — dominio dedicado para el web service de passes
- Hoy `loyaltyWebServiceUrl` = `https://storehub.barreramelchorf.top` (prod) y
  `https://storehub-staging.barreramelchorf.top` (staging). Es el host de plataforma.
- Pendiente: comprar un dominio propio (ej. `storehub.top`) y migrar a él para verse más
  profesional (es whitelabel; el host del web service es transparente al tenant).
- **Impacto de la migración** (parametrizado para ser poco intrusivo):
  - Cambiar un solo valor: `pulumi config set loyaltyWebServiceUrl https://<nuevo-dominio>`
    en cada stack + redeploy. Todo el código lo lee de ahí (`getWebServiceBaseUrl()`).
  - ⚠️ OJO con passes YA emitidos: el `webServiceURL` (Apple) y las URLs de imagen (Google)
    quedan embebidos en el pase AL MOMENTO de emitirlo. Los passes viejos seguirán apuntando
    al dominio anterior hasta que se regeneren (un escaneo/campaña los regenera). Por eso el
    dominio viejo debe seguir respondiendo un tiempo tras la migración (mantener el Ingress).
  - El QR de enrollment usa `window.location.origin` (cliente) → migra solo, sin cambio.

### Lealtad — Issuer/cert separados para staging
- Hoy staging y prod comparten el MISMO Pass Type ID de Apple y el MISMO Issuer de Google
  (los "de storehub", que son de producción). Pragmático pero mezcla passes de prueba con
  reales bajo el mismo emisor.
- Pendiente: crear un Pass Type ID de Apple (`pass.top.barreramelchorf.storehub-staging` o
  similar) y un Issuer de Google separados para staging, y cargar esos secretos solo en el
  stack staging. Prod se queda con los actuales ("storehub"). No rompe nada hoy porque
  classId/serialNumber son únicos por tenant/tarjeta.

### Date picker en campo de fecha de nacimiento (enrollment de lealtad)
- El campo `birth_date` en la página pública de registro usa `<input type="date">` nativo.
  Da buena experiencia en móvil (selector nativo del teléfono con rueda de año), pero
  no es visualmente consistente con el `DatePicker` del admin (react-day-picker).
- Opciones evaluadas:
  - A) Extender `DatePicker.tsx` con `captionLayout="dropdown"` de react-day-picker (prop
    opcional `yearNavigation` para no romper el POS). Mejor consistencia visual.
  - B) Tres selects nativos (día/mes/año). Mejor UX para fechas de nacimiento.
  - C) Mantener `<input type="date">` (buena UX móvil, simple). **Estado actual.**
- Decisión pendiente. Si la captura es mayormente en móvil, C puede quedarse. Si se
  captura en desktop con frecuencia (cajero), A o B valen la pena.

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
