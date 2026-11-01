# Spec — Tarjetas de Lealtad en Apple Wallet y Google Wallet

## Objetivo
Permitir que un negocio ofrezca una tarjeta de lealtad digital que sus clientes instalan
en **Apple Wallet** y **Google Wallet**. El cliente se auto-registra en una página pública,
instala su pase, y en cada visita el cajero escanea el QR del pase para sumarle puntos.
Los puntos se actualizan **dinámicamente** en el pase ya instalado (sin reinstalar).

Construido con un solo certificado de Apple Developer (de StoreHub) y una sola service
account de Google para todos los negocios — branding por negocio a nivel visual, no a
nivel de emisor.

---

## Principio de diseño clave: módulo INDEPENDIENTE del POS

La lealtad es un módulo **autónomo**. Un tenant puede tener:
- **Solo lealtad** (sin POS/gestión/ventas).
- **Solo POS/gestión** (sin lealtad).
- **Ambos**.

Implicaciones:
- El modelo de datos de lealtad **NO depende** de la tabla `sales`.
- Sumar puntos es una acción propia del módulo: el cajero escanea → endpoint de lealtad
  suma puntos. No pasa por el flujo de ventas.
- Si el tenant TAMBIÉN usa POS, la integración "al cobrar suma puntos" es un **extra
  opcional de fase futura**, nunca la base.
- Se activa con `config.modules.loyalty` (bool, default `false`), igual que `cashSessions`.

---

## Decisiones de negocio (confirmadas con el usuario)
1. **Un solo certificado Apple** (cuenta StoreHub, $99 USD/año total) + una service account
   Google para todos los tenants. Los pases muestran el branding del negocio (logo, colores,
   nombre) pero el emisor técnico es StoreHub.
2. **Actualización dinámica** de puntos en pases instalados (push Apple + REST Google).
3. **Check-in por QR**: el cajero escanea el QR del pase en cada visita → suma puntos.
4. **Independiente del POS** (ver principio de diseño arriba).
5. **Enrollment**: página pública donde el cliente se auto-registra e instala el pase.

---

## Costos reales (verificados oct-2026)
| Concepto | Costo |
|----------|-------|
| Apple Developer Program (obligatorio, 1 cuenta para todo) | **$99 USD/año** |
| Google Wallet API (Issuer account) | **$0** |
| Por pase emitido / por volumen (ambas plataformas) | **$0** |
| **Total** | **~$99 USD/año** |

Lo que se vio antes (~4000 MXN/año) era confusión con **Apple Pay / tokenización de pagos**
(mueve dinero, requiere acuerdos con bancos/redes) — NO aplica a loyalty passes.

---

## Por qué los pases comerciales tardan horas (y cómo lo evitamos)

Flujo de actualización de Apple = **push para notificar + pull para descargar**
(confirmado en doc de Apple):
1. Nuestro servidor manda push vía APNs (payload vacío) al dispositivo.
2. El dispositivo decide cuándo consultar nuestro web service por serials actualizados.
3. El dispositivo descarga el pase nuevo.

Causas reales del retraso de horas (confirmadas en foros de Apple):
- **Batching** de proveedores comerciales (acumulan cambios y mandan push cada X tiempo
  para ahorrar costos). ← la causa más común.
- Web service mal implementado (push mal enviado, o pull falla ~20 veces → pase marcado
  como no-actualizable).
- iOS agrupa/retrasa pulls en bajo consumo (inherente, pero es segundos-minutos, no horas).

**Nuestra estrategia:**
- Push **inmediato** al escanear (en el proceso del API, en background tras responder al
  cajero — ver "Arquitectura de ejecución (Opción A)"). Latencia de segundos, sin batching.
- Web service implementado **exactamente** a la spec de Apple.
- Google: `PATCH` al objeto → Google propaga (normalmente más rápido, sin push manual).
- Resultado esperado: segundos a 1-2 minutos. No garantizable "instantáneo" al 100%
  porque iOS tiene la última palabra, pero se elimina la causa del retraso de horas.

---

## Modelo de datos (Fase 1)

### Tabla `loyalty_programs`
Config del programa por tenant (uno por tenant en v1).
| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | uuid PK | |
| `tenantId` | uuid FK tenants | único por tenant (v1) |
| `name` | text | nombre del programa (ej. "Puntos Xalli") |
| `active` | boolean default true | |
| `pointsPerVisit` | integer default 1 | puntos por escaneo/visita |
| `rewardThreshold` | integer nullable | puntos para recompensa (ej. 10 = café gratis) |
| `rewardDescription` | text nullable | texto de la recompensa |
| `branding` | jsonb | { logoUrl, bgColor, fgColor, labelColor } snapshot/override |
| `createdAt` | timestamp | |

### Tabla `loyalty_cards`
Una tarjeta por cliente inscrito.
| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | uuid PK | también el payload del QR (opaco) |
| `tenantId` | uuid FK tenants | |
| `programId` | uuid FK loyalty_programs | |
| `customerName` | text | capturado en enrollment |
| `customerEmail` | text nullable | |
| `customerPhone` | text nullable | |
| `points` | integer default 0 | saldo actual |
| `totalVisits` | integer default 0 | histórico de escaneos |
| `serialNumber` | text unique | serial del pase (Apple/Google) |
| `authToken` | text | shared secret del web service de Apple (por pase) |
| `platform` | enum `apple`/`google`/`unknown` | detectado al instalar |
| `status` | enum `active`/`blocked` | |
| `lastScanAt` | timestamp nullable | antifraude: cooldown entre escaneos |
| `createdAt` | timestamp | |

Índices: `(tenantId)`, `(serialNumber)`, `(tenantId, customerPhone)`.

### Tabla `loyalty_transactions`
Log de cada movimiento de puntos (auditoría).
| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | uuid PK | |
| `tenantId` | uuid FK tenants | |
| `cardId` | uuid FK loyalty_cards | |
| `type` | enum `earn`/`redeem`/`adjust` | |
| `points` | integer | +/- |
| `balanceAfter` | integer | snapshot del saldo tras el movimiento |
| `performedBy` | uuid FK users nullable | cajero que escaneó (null si auto) |
| `note` | text nullable | |
| `createdAt` | timestamp | |

### Tabla `apple_pass_registrations`
Registro de dispositivos para push (requerido por el web service de Apple).
| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | uuid PK | |
| `cardId` | uuid FK loyalty_cards | |
| `deviceLibraryId` | text | identificador del dispositivo |
| `pushToken` | text | token APNs para notificar |
| `createdAt` | timestamp | |

Índice único: `(cardId, deviceLibraryId)`.
(Google no requiere esta tabla — la propagación la maneja Google vía REST.)

### Tabla `loyalty_campaigns`
Campañas de oferta enviadas a las tarjetas (notificación en el pase). Ver sección
"Notificaciones / campañas de oferta" para el mecanismo y límites.
| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | uuid PK | |
| `tenantId` | uuid FK tenants | |
| `programId` | uuid FK loyalty_programs | |
| `message` | text | texto de la oferta (va al campo "Oferta" del pase) |
| `expiresAt` | timestamp nullable | cuándo limpiar el campo (sin notificar) |
| `status` | enum `pending`/`sending`/`sent`/`failed` | |
| `targetCount` | integer | nº de tarjetas objetivo al disparar |
| `sentCount` | integer default 0 | progreso (para operación masiva) |
| `createdBy` | uuid FK users | |
| `createdAt` | timestamp | |

Índice: `(tenantId, status)`.

### Config del tenant
- `config.modules.loyalty` (bool) — "Programa de lealtad (Wallet)". Default `false`.

---

## Reglas antifraude (puntos por visita)
- **1 punto por visita** (confirmado). `pointsPerVisit` default 1, configurable por programa.
- **Cooldown por tarjeta: 1 escaneo contabilizado por día de negocio** (confirmado). Un
  segundo escaneo el mismo día no suma puntos (responde "ya registrado hoy", no error).
  Se evalúa con `lastScanAt` vs. día de negocio en `BUSINESS_TIMEZONE` (America/Mexico_City),
  igual que el patrón de `businessDate` usado en caja/ventas.
- El cajero debe estar autenticado (`loyalty.scan` permiso nuevo, ver abajo).
- Todo escaneo queda en `loyalty_transactions` con `performedBy`.

---

## Permisos (nuevos)
Siguiendo el patrón de permisos granulares en `roles.permissions`:
| Permiso | Para qué |
|---------|----------|
| `loyalty.scan` | Escanear tarjeta y sumar/canjear puntos (cajeros del programa) |
| `loyalty.manage` | Config del programa, ver tarjetas, ajustes manuales de puntos |

Roles: `administrador` y `gerente` → ambos. Un rol operativo de lealtad podría tener solo
`loyalty.scan`. (Nota: un tenant "solo lealtad" podría no usar los roles del POS — PREGUNTA
ABIERTA sobre cómo se crean usuarios en un tenant sin POS.)

---

## API — Rutas nuevas

### Públicas (sin auth, resuelven tenant por host)
```
GET  /api/public/loyalty/enroll          → datos del programa para la página de registro
POST /api/public/loyalty/enroll          → crea loyalty_card { name, email?, phone? }
                                            responde con links "Add to Apple/Google Wallet"
GET  /api/public/loyalty/card/:id/apple.pkpass   → descarga el .pkpass firmado
GET  /api/public/loyalty/card/:id/google         → redirect/JWT "Save to Google Wallet"
```

### Web service de Apple (spec fija de Apple, sin auth JWT propio — usa authToken del pase)
```
POST   /api/wallet/apple/v1/devices/:deviceLibraryId/registrations/:passTypeId/:serial
DELETE /api/wallet/apple/v1/devices/:deviceLibraryId/registrations/:passTypeId/:serial
GET    /api/wallet/apple/v1/devices/:deviceLibraryId/registrations/:passTypeId
GET    /api/wallet/apple/v1/passes/:passTypeId/:serial
POST   /api/wallet/apple/v1/log
```
(Rutas y contrato DEFINIDOS por Apple — no se pueden cambiar. El `webServiceURL` del pase
apunta a `/api/wallet/apple`.)

### Admin (requieren JWT + permiso)
```
GET|PUT  /api/admin/loyalty/program          loyalty.manage   config del programa
GET      /api/admin/loyalty/cards            loyalty.manage   listado/búsqueda de tarjetas
GET      /api/admin/loyalty/cards/:id        loyalty.manage   detalle + historial
POST     /api/admin/loyalty/scan             loyalty.scan     { cardId } → suma puntos
POST     /api/admin/loyalty/cards/:id/redeem loyalty.scan     canjear recompensa
POST     /api/admin/loyalty/cards/:id/adjust loyalty.manage   ajuste manual + nota
GET|POST /api/admin/loyalty/campaigns        loyalty.manage   listar/crear campaña de oferta
GET      /api/admin/loyalty/campaigns/:id    loyalty.manage   estado/progreso de la campaña
```

---

## Flujo de escaneo (check-in)
1. Cajero abre el escáner en el panel (usa cámara → lee QR → obtiene `cardId`).
2. `POST /api/admin/loyalty/scan { cardId }`.
3. Backend valida: tarjeta activa, módulo activo, cooldown antifraude.
4. Suma `pointsPerVisit`, incrementa `totalVisits`, escribe `loyalty_transactions`.
5. Dispara en background (dentro del API, sin bloquear la respuesta) → push Apple
   (a dispositivos registrados) + PATCH Google. Ver "Arquitectura de ejecución (Opción A)".
6. Responde al cajero con saldo nuevo + si alcanzó recompensa.

---

## Notificaciones / campañas de oferta (v1)

### Realidad técnica (confirmada en docs de Apple/Google) — IMPORTANTE
- **No se pueden mandar notificaciones arbitrarias.** Una notificación SIEMPRE está atada a
  un cambio real en un campo del pase. No es un canal push libre como una app.
- **Apple**: el campo "Oferta" debe tener un `changeMessage` con placeholder `%@`
  (ej. `"Oferta: %@"`). Al cambiar su valor, iOS muestra el mensaje en pantalla de bloqueo
  **de forma discreta** (sin sonido, vibración ni encender pantalla — llega "quietly").
- **Google**: límite duro de **máximo 3 notificaciones con alerta por 24h por objeto**.
  Más allá de eso, el pase se actualiza pero NO notifica. El abuso puede penalizar la cuenta.
- **Conclusión de expectativa** (alineada con el usuario): el pase es un canal
  **complementario** para ofertas discretas y recordar presencia de marca. Para marketing
  agresivo, el canal correcto sigue siendo WhatsApp/email usando los contactos del enrollment.

Esta capacidad se incluye en v1 porque el sistema comercial actual ya la ofrece y no se
quiere perder al migrar.

### Mecanismo de una campaña
1. Admin crea campaña: `message` + `expiresAt` opcional (`POST /api/admin/loyalty/campaigns`).
2. Se crea `loyalty_campaigns` con `targetCount` = nº de tarjetas activas del programa.
3. Para cada tarjeta activa: se actualiza el campo "Oferta" del pase (Apple + Google) y se
   dispara el push/update. **Esto es una operación masiva** → se procesa con rate limiting.
4. Al llegar `expiresAt` (job programado), se limpia el campo "Oferta" (sin notificar).

### Operación masiva + rate limiting
Una **operación masiva** es un disparador único que debe tocar muchas tarjetas a la vez:
- Campaña de oferta a todas las tarjetas.
- Cambio de branding/recompensa del programa (el pase cambió visualmente → re-emitir todas).
- Ajuste global de puntos (ej. "50 puntos de bienvenida a todos").

(NO es operación masiva que muchos clientes escaneen a la vez — esos son N escaneos
individuales independientes, cada uno toca 1 tarjeta y es inmediato.)

Manejo: procesar los N updates con un loop con **rate limiting dentro del API** (p-limit o
delay entre lotes), persistiendo progreso en `loyalty_campaigns` (`sentCount`/`status`).
Protege el cluster y respeta los rate limits de Apple (`TooManyProviderTokenUpdate`) y de
Google (3/24h). Ej. 5000 tarjetas a 10/s ≈ 8 min. Es throttling, NO batch diferido de horas.
Ver "Arquitectura de ejecución (Opción A)" para los detalles y la ruta futura al worker.

- Config (YAML Pulumi, no hardcode): `loyaltyPushRateMax` (default 10), `loyaltyPushRateMs`
  (default 1000). El escaneo individual NO pasa por este límite (es inmediato).

---

## Arquitectura de ejecución (Opción A — sin worker) + ruta futura al worker

### Estado actual confirmado (oct-2026)
NO existe worker ni BullMQ en el proyecto. Deployments en Pulumi: solo `api` y `web`
(+ Job `db-migrate`). `bullmq` no es dependencia. `ioredis` está instalado pero sin uso en
`apps/api/src`. El worker está listado como pendiente en TECH_DEBT.md ("Worker para jobs
async", stack previsto BullMQ + Redis). Decisión: **v1 NO introduce worker** (cluster
pequeño, carga baja, evitar sobre-ingeniería).

### Opción A: ejecución dentro del proceso del API
- **Escaneo individual (inmediato)**: el endpoint `POST /api/admin/loyalty/scan` persiste la
  transacción y responde al cajero de inmediato. El push (Apple APNs + Google PATCH) se
  dispara **en background en el mismo proceso** (tras enviar la respuesta), para no bloquear.
  Volumen trivial (1 tarjeta, 1-2 dispositivos). Latencia de llegada: segundos.
- **Operación masiva (campañas / cambios globales)**: loop con **rate limiting en el API**
  (p-limit o delay entre lotes), con el progreso persistido en `loyalty_campaigns`
  (`status`, `sentCount`, `targetCount`). Reanudable: si el pod reinicia a media campaña,
  al reintentar se reprocesan solo las tarjetas pendientes. Config de rate:
  `loyaltyPushRateMax` (default 10), `loyaltyPushRateMs` (default 1000) — YAML Pulumi.

### ⚠️ Ruta de migración futura al worker (diseñar para esto desde v1)
Para que mover a worker (Opción B: BullMQ + Redis + deployment `worker`) sea un cambio
LOCALIZADO y no una reescritura, v1 DEBE:
1. **Encapsular toda la lógica de push detrás de una interfaz única**, ej.
   `PushDispatcher.enqueue(cardId | campaignId)`. El endpoint de scan y el de campañas SOLO
   llaman a esta interfaz; no conocen el mecanismo de ejecución.
2. La implementación v1 (`InlinePushDispatcher`) ejecuta en background dentro del API.
   La futura (`QueuePushDispatcher`) encolará en BullMQ. **Mismo contrato**, swap por config.
3. **Separar la lógica de "construir y enviar un push de una tarjeta"** en una función pura
   reutilizable (`sendCardUpdate(card)`), independiente de quién la invoca (inline loop hoy,
   job handler mañana). El worker futuro reusa esta función sin cambios.
4. **Persistir estado de progreso en DB** (no en memoria) para campañas → ya reanudable sin
   worker, y trivial de mover a jobs después.
5. Dejar los parámetros de rate como config → el worker reusa los mismos valores en su `limiter`.

Con esto, migrar a worker = implementar `QueuePushDispatcher` + agregar deployment en Pulumi
+ ajustar CI (nueva imagen worker). Cero cambios en la lógica de negocio ni en los endpoints.

---

## Generación de pases
- **Apple** (`.pkpass`): JSON `pass.json` + imágenes (logo, icon) + `manifest.json`
  (SHA1 de cada archivo) + `signature` (PKCS#7 con el Pass Type ID cert) → ZIP.
  Librería candidata: `passkit-generator` (Node, mantenida). Campos: puntos, nombre,
  QR con `cardId`, colores del tenant.
- **Google**: crear `LoyaltyClass` (una por programa/tenant) + `LoyaltyObject` (por tarjeta)
  vía REST API con service account; el "Add to Google Wallet" es un JWT firmado.
  Librería candidata: `google-auth-library` + llamadas REST (o `googleapis`).

---

## Secrets (Kubernetes, vía Pulumi config secreto)
| Secret | Qué es |
|--------|--------|
| `APPLE_PASS_CERT` | Pass Type ID certificate (.p12 o pem) |
| `APPLE_PASS_CERT_PASSWORD` | password del .p12 |
| `APPLE_WWDR_CERT` | Apple WWDR intermediate cert |
| `APPLE_PASS_TYPE_ID` | ej. pass.top.barreramelchorf.storehub |
| `APPLE_TEAM_ID` | Team ID de la cuenta Apple |
| `APPLE_APNS_KEY` | key para mandar push (o se reusa el cert del pase) |
| `GOOGLE_WALLET_SA_JSON` | service account JSON del Issuer de Google |
| `GOOGLE_WALLET_ISSUER_ID` | Issuer ID de la Google Pay & Wallet Console |

Patrón: igual que `JWT_SECRET`/`MINIO_*` — definidos en Pulumi, inyectados como env al API.

---

## Fases de entrega

### Fase 0 — Prerequisitos (fuera de código, el usuario debe hacer)
- [x] Cuenta Apple Developer ($99/año) + Pass Type ID (`pass.top.barreramelchorf.storehub`) +
      certificado. Team ID `RAP2536SR4`. Secrets cargados en Pulumi staging (cert/key/WWDR PEM
      + applePassTypeId/appleTeamId/loyaltyWebServiceUrl).
- [ ] Google Pay & Wallet Console → Issuer + service account. **PENDIENTE** (solo Apple por ahora).
- [x] Secrets Apple en Pulumi staging. Google pendiente.

### Fase 1 — Núcleo (COMPLETADA, en staging oct-2026)
- [x] Migración: tablas loyalty_* (programs/cards/transactions/campaigns + apple_pass_registrations
      + loyalty_recovery_tokens) + permisos `loyalty.scan`/`loyalty.manage` + columnas
      `pass_updated_at`, `current_offer`, `birth_date`. Migraciones 0018–0022.
- [x] Generación de pase Apple (.pkpass, passkit-generator 3.7.0) + Google (JWT con jose).
- [x] Página pública de enrollment + "Add to Wallet" (correo obligatorio + fecha nacimiento).
- [x] Web service de Apple (registrar/desregistrar/serials/pase/log).
- [x] Endpoint de scan + UI de escáner QR en panel (html5-qrcode).
- [x] Push Apple + PATCH Google en background dentro del API (Opción A, sin worker).
- [x] Campañas de oferta con rate limiting + notificaciones (changeMessage + current_offer).
- [x] Sección admin: config del programa (+ colores), tarjetas, campañas, escáner.
- [x] Add-on activable desde el panel de plataforma.
- [x] Branding heredado del tenant con override (Opción C).
- [x] Recuperación de tarjeta por email (link único 30 min).

### Aprendizajes técnicos clave (notificaciones de Apple Wallet)
Apple notifica SOLO cuando cambia el VALOR de un campo (front/back) que tiene `changeMessage`
— no por el push en sí. Dos bugs encontrados y corregidos durante staging:
1. El `lastUpdated` tag del web service usaba `last_scan_at`; campañas/ajustes no lo tocan →
   iOS veía el mismo tag y descartaba la actualización. Fix: columna `pass_updated_at` que
   avanza en CUALQUIER cambio (se bumpea al inicio de `sendCardUpdate`, antes del push).
2. La oferta de campaña solo vivía en memoria durante el run → el pull del dispositivo
   regeneraba el pase sin la oferta ("unchanged"). Fix: persistir en `loyalty_cards.current_offer`.
3. El campo de puntos no tenía `changeMessage` → el escaneo nunca notificaba. Fix: agregado.
El push de actualización de Apple SOLO funciona en APNs **producción** (staging/prod con HTTPS,
no en local). La notificación llega "quietly" (sin sonido/vibración).

### Fase 2 — Futuro (no en este spec)
- Integración opcional POS: al cobrar, sugerir escanear y sumar puntos ligados a la venta.
- **Múltiples programas por tenant** (ej. "café gratis" + "postre gratis" en paralelo).
  Requiere quitar el UNIQUE(tenant_id) de loyalty_programs + UX de selección en enrollment
  + "Programas" (plural) en admin + campañas por programa. Confirmado como caso real deseado.
- Niveles/tiers (una tarjeta con premios por escalón).
- Expiración de puntos.
- Segmentación de campañas (no solo "a todos").
- Google Wallet: certificados aún NO cargados (solo Apple). El código degrada con gracia
  (enrollment muestra solo botón Apple si Google no está configurado).
- Migrar push a worker (BullMQ) si el volumen crece — el código ya está diseñado para el swap
  (ver "Arquitectura de ejecución").

---

## Decisiones resueltas (confirmadas e implementadas)
1. **Cooldown antifraude**: 1 escaneo contabilizado por día de negocio por tarjeta
   (BUSINESS_TIMEZONE). Segundo escaneo el mismo día = no suma (responde "ya registrado hoy").
2. **Modelo de puntos v1**: puntos por visita (`pointsPerVisit`, default 1). Sellos/tiers = fase 2.
3. **Tenant "solo lealtad"**: reusa el mismo sistema de usuarios/roles; solo cambian permisos
   (`loyalty.scan`/`loyalty.manage`). Mismo `/admin/login`, navegación filtrada por permiso.
4. **Dominio del web service**: dominio de plataforma (NO los custom por tenant). Config
   `loyaltyWebServiceUrl` (staging: `https://storehub-staging.barreramelchorf.top`).
5. **QR scanner**: cámara del navegador en el panel (`html5-qrcode`), import dinámico client-side.

## Activación del módulo — ADD-ON COMERCIAL (no auto-servicio del tenant)
La lealtad NO es un toggle en la Configuración del tenant (como `cashSessions`). Es un
**add-on que StoreHub vende/habilita centralmente**. Se activa desde el **panel de plataforma**
(`/platform` → editar tenant → "Add-on: Lealtad (Wallet)") vía `PUT /api/platform/tenants/:id`
con `loyaltyEnabled`, que hace merge en `config.modules.loyalty` (preserva el resto del config).
Como solo se togglea con `x-platform-key`, el cliente no puede auto-activárselo.

## Branding de la tarjeta (Opción C — herencia con override)
Resolución en 3 niveles: **color del programa → branding del tenant (tienda) → defaults
neutros**. Si el programa no define `bgColor`/`labelColor`/`logoUrl`, hereda
`primaryColor`/`secondaryColor`/logo de la tienda. Override opcional por programa (selectores
de color en la pestaña Programa, con "limpiar" para volver a heredar). Aplica al pass
(Apple/Google) y al hero de la página pública de enrollment.

## Recuperación de tarjeta (returning user)
Edge case: usuario borra su tarjeta y se re-registra con el mismo correo. Para no duplicar
ni perder puntos:
- **Correo OBLIGATORIO** en enrollment (canal de recuperación); teléfono opcional.
- **Una tarjeta por correo por tenant** (detección case-insensitive).
- Si el correo ya existe → NO crea duplicado: genera token de **un solo uso, 30 min**
  (`loyalty_recovery_tokens`), envía link al correo registrado (reusa Resend). Solo el dueño
  del correo puede recuperar (no basta conocerlo → seguro contra A pidiendo la tarjeta de B).
- Página pública `/t/:slug/loyalty/recover/:token` valida y reofrece la tarjeta existente con
  sus puntos intactos.
- Se captura **fecha de nacimiento** (opcional, `birth_date`) para análisis.
