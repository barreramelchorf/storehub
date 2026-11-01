# HANDOFF — StoreHub (sesión previa)

Fecha de corte: 2026-10-31. Prod en **v0.36.0**. Rama: `main`.
**Última sesión**: módulo de Lealtad (Apple/Google Wallet) implementado y desplegado a
STAGING (no promovido a prod aún). Ver sección "Lealtad" abajo.

Este documento resume TODO lo avanzado, las reglas aprendidas, y el estado del
proyecto, para retomar sin perder contexto. Para el arranque rápido ver
`.kiro/RELAY.md`.

---

## ⚠️ REGLAS DE ORO (respetar siempre)

1. **NUNCA promover a prod sin que el usuario lo indique explícitamente.** Staging
   es automático (push a main). Prod SOLO cuando el usuario diga "promueve a prod"
   → ahí se crea el tag `vX.Y.Z`. Esta regla se rompió una vez y el usuario lo
   remarcó con fuerza.
2. **Consultar diseño de UI antes de implementar** cuando hay tradeoffs (espacio,
   protagonismo), sobre todo en POS móvil. Proponer opciones, no decidir solo.
   Esto también se señaló tras implementar una barra de caja sin consultar.
3. **Investigar antes de afirmar.** No adivinar causas de bugs. Leer logs/código/
   fuente real. El usuario valora el research (ej. se confirmó el bug de Safari
   leyendo el código de busboy, y el modelo de impresión leyendo docs de MP/Square).
4. **Verificar build antes de push**: `npx tsc --noEmit -p apps/api/tsconfig.json`
   y `pnpm --filter @storehub/web build`. Ahora además `pnpm --filter @storehub/api test`
   y `pnpm --filter @storehub/web test`.
5. **Nunca branchear por nombre de stack en infra** (`pulumi.getStack() === "prod"`).
   Usar config values del YAML con default en código. (Documentado en steering.)
6. **Migraciones**: nunca cambios manuales a DB. Tabla nueva = sin backfill salvo
   que se requiera preservar histórico (ej. split payments sí necesita backfill).
   Columnas nuevas en tablas existentes = nullable.
7. **Permisos**: `cajero`/`cajero_almacenista` solo ven/actúan sobre lo suyo;
   `users.manage` (admin/gerente) ve todo. Enforced en backend, no solo UI.
8. **Flujo de git con el git-ops del CI**: el CI commitea `chore(deploy): ... [skip ci]`
   a main tras cada deploy. Por eso, antes de push local: `git stash` (si hay
   artefactos como tsconfig.tsbuildinfo) → `git pull --rebase origin main` →
   `git stash pop` → `git push`.

---

## Arquitectura (resumen, ver .kiro/steering/project-context.md)
- Monorepo pnpm + Turborepo. `apps/web` (Next 14), `apps/api` (Fastify), `packages/db`
  (Drizzle + Postgres), `packages/schemas` (Zod), `packages/types`.
- Infra: Pulumi TS en `infra/applications/storehub/`. k3s en 5.189.172.140.
- CI: `.github/workflows/build.yml`. Push a main → test + build + deploy staging.
  Tag `v*` → test + re-tag images + deploy prod. **El job `test` ahora bloquea
  ambos deploys si falla.**
- Deploy: `kubectl` contexts, namespaces `storehub-prod`/`storehub-staging` (+ `-data-`).

### Credenciales / acceso (de steering)
- Staging admin: `admin` / `password123` (tenant demo-cafe)
- Staging API pod: `kubectl exec -n storehub-staging deploy/api-e3d2e698 -- ...`
  (OJO: el nombre del deploy cambia con cada versión; usar `kubectl get deploy -n ...`)
- Para queries a DB desde un pod:
  `node -e "const p=require('/app/node_modules/.pnpm/postgres@3.4.5/node_modules/postgres');const sql=p(process.env.DATABASE_URL);sql\`...\`.then(r=>{console.log(JSON.stringify(r));process.exit(0)})"`

---

## LO QUE SE COMPLETÓ Y ESTÁ EN PROD (hasta v0.36.0)

- **Analytics ventas por categoría** (revenue por categoría, top/bottom productos,
  inventario por categoría) — en vista por periodo Y anual.
- **Notas en ventas** (POS botón 📝, indicador + filtro en Ventas).
- **Campañas de ofertas** (NxM + % descuento), asignables a productos/categorías,
  por día de semana, prioridad. Sección propia 🎁. Cálculo autoritativo en backend.
- **Fixes varios**: POS carrito compacto en pantallas medianas, modal inventario
  scrolleable + modificadores colapsables, documentos con MD5 cache-busting +
  servidos vía API (no MinIO directo) + borrado de huérfanos en MinIO al eliminar.
- **Imágenes**: servidas vía `/api/public/storage/*` (migración 0014 convirtió URLs
  absolutas a relativas), reemplazo en vez de append, fix rotación iPhone (.rotate),
  fix Safari iCloud 0-byte (arrayBuffer antes de subir), fix Safari multipart
  (FormData filename + isPartAFile en el server).
- **Token móvil**: access token 15m→1h, sameSite lax, refresh en visibilitychange.
- **Semana en analytics**: configurable (lunes default) vía config.weekStart.
- **POS**: confirmaciones al cerrar/vaciar comanda, selector "cajero en turno"
  (admin/gerente, onBehalfOfUserId), imprimir cuenta antes del pago, reimprimir
  ticket de venta pasada, feedback "enviado a la terminal".
- **Simulador MP Point** para staging (`POINT_MOCK=true` solo staging) con controles
  manuales "cliente pagó/canceló".
- **Editar ventas pasadas** (admin/gerente): propina, método de pago, cajero, fecha.
  `PATCH /api/admin/sales/:id`, recalcula total, audit log. (v0.35.0)
- **Apertura/cierre de caja fase 1** (v0.36.0): ver abajo.
- **Seguridad**: cajeros solo ven sus ventas; sección Caja y usuarios restringidas.
- **UX**: todos los `confirm()` nativos → componente `ConfirmDialog` estilizado.
- **Infra**: config-driven flags (pointMock/runSeed/useWildcardTls/logLevel),
  HPA per-servicio (api + web), eliminadas replicas muertas, git-ops de versión en CI,
  health probe del web en `/api/health` (fix deploys lentos).
- **Tests en CI**: job `test` (vitest api + web) que bloquea build/promote-prod.

## Lealtad (Apple/Google Wallet) — FASE 1 (en STAGING oct-2026, NO en prod aún)
- Spec completo: `.kiro/specs/loyalty-wallet.md`. Costo real: ~$99 USD/año (Apple Developer);
  Google gratis. NO confundir con Apple Pay/tokenización (eso es lo caro, no aplica a passes).
- **Add-on COMERCIAL**: se activa desde `/platform` (editar tenant → "Add-on: Lealtad"),
  NO es toggle del tenant. `PUT /api/platform/tenants/:id` con `loyaltyEnabled` → merge en
  `config.modules.loyalty`. El cliente no puede auto-activárselo (solo `x-platform-key`).
- **Módulo independiente del POS**: no depende de `sales`. Un tenant puede tener solo lealtad.
- **DB** (migraciones 0018–0022): `loyalty_programs` (1 por tenant, UNIQUE), `loyalty_cards`,
  `loyalty_transactions`, `apple_pass_registrations`, `loyalty_campaigns`,
  `loyalty_recovery_tokens`. Permisos `loyalty.scan`/`loyalty.manage` (admin/gerente).
- **Código API**: `apps/api/src/lib/loyalty/*` (config, apple-pass passkit-generator 3.7.0,
  google-pass jose, apns http2 nativo, push-dispatcher, pass-builder, scan-logic) +
  `routes/loyalty-public.ts` (enrollment + recuperación + descargas), `loyalty-apple-ws.ts`
  (web service Apple, contrato fijo), `loyalty-admin.ts` (program/cards/scan/redeem/adjust/campaigns).
- **Web**: público `/t/:slug/loyalty` (enrollment) + `/loyalty/recover/:token`; admin
  `/t/:slug/admin/loyalty` (tabs: Escáner html5-qrcode / Tarjetas / Campañas / Programa).
  Nav "Lealtad" 🎟️ gateado por `loyalty.manage` + módulo `loyalty`.
- **Opción A (sin worker)**: push inline en el proceso del API. Escaneo = inmediato;
  campañas = loop con rate limit (`loyaltyPushRateMax/Ms`) + progreso en DB. Diseñado para
  migrar a worker sin reescritura (interfaz `PushDispatcher` + función pura `sendCardUpdate`).
- **Branding Opción C**: hereda del tenant (primary/secondary/logo) con override por programa.
- **Recuperación**: correo obligatorio; re-registro con mismo correo → link de un solo uso
  (30 min) al correo, NO duplica. Captura `birth_date` (opcional, analítica).
- **⚠️ Notificaciones Apple (aprendido a la mala en staging)**: Apple notifica SOLO si cambia
  el VALOR de un campo con `changeMessage`. El `lastUpdated` tag del web service DEBE avanzar
  en cualquier cambio → por eso existe `pass_updated_at` (no usar `last_scan_at`). La oferta
  de campaña se persiste en `current_offer` (si no, el pull del device regenera "unchanged").
  Push solo funciona en APNs PRODUCCIÓN (HTTPS). Notificación llega "quietly".
- **Secrets**: Apple cargados en Pulumi staging (applePassCert/Key/appleWwdrCert PEM +
  applePassTypeId=`pass.top.barreramelchorf.storehub`, appleTeamId=`RAP2536SR4`,
  loyaltyWebServiceUrl). Inyectados vía `kubernetes/index.ts` (secret + configmap).
- **Google PENDIENTE**: certs no generados. Código degrada con gracia (solo botón Apple).
- **Fase 2**: múltiples programas/premios por tenant (quitar UNIQUE), tiers, POS integration,
  segmentación de campañas, expiración de puntos. Ver spec.

## Apertura/Cierre de Caja — FASE 1 (en prod v0.36.0, APAGADO por default)
- Spec completo: `.kiro/specs/cash-sessions.md`.
- Config `modules.cashSessions` (toggle "Apertura y cierre de caja"). Default off.
- Tabla `cash_sessions` (migración 0016) + `cash_session_id` nullable en `sales`.
- Permiso **`cash.view`** (migración 0017) para admin/gerente → gatea la sección Caja.
- Abrir/cerrar = `sales.create` (cajero). Reabrir = `cash.view` (admin/gerente).
- Reglas: 1 sesión abierta a la vez, 1 apertura/día, cierre a ciegas (blind),
  `expectedCash = fondo + ventas efectivo`, flag `lateClose` para cierres de días
  previos. Reapertura para cierres accidentales.
- POS: chip compacto "🧰 Caja" cuando abierta (no roba espacio) / banner ámbar
  cuando cerrada. Modales de apertura (float prellenado del cierre anterior) y
  cierre (blind + reporte). Gate de cobro si módulo activo y sin caja abierta.
- Sección "Caja" (historial con badge de cierre tardío + botón reabrir).

---

## TRABAJO PENDIENTE / EN PAUSA

### feature/split-payments (rama, EN PAUSA, no en prod)
- Pagos divididos (ej. $60 efectivo + $40 tarjeta). Fase 1 = manual.
- **Ya hecho en la rama**: tabla `sale_payments` + migración con backfill (una fila
  por venta existente = método+total, para que el cierre mensual cuadre),
  `saleSchema` acepta `payments[]`, sale creation valida suma==total, todos los
  paths de venta pueblan sale_payments.
- **Pendiente**: analytics `salesByPayment` desde sale_payments, UI de split en POS,
  desglose en detalle de venta, verificar en staging.
- ⚠️ **CONFLICTO DE MIGRACIÓN**: la rama usa `0016_add_sale_payments.sql` pero main
  ya tiene `0016_add_cash_sessions.sql`. Al retomar/mergear: renumerar la de la rama
  a `0018` (0017 ya es cash.view) y resolver el journal manualmente.
- Fase 2 futura: integración con terminal Point.

### Fase 2 Cash Sessions (documentada en spec)
- Movimientos intermedios de efectivo (paid-in/paid-out, retiros a caja fuerte).
- Retiros de gerentes con trazabilidad (alimenta el float sugerido).
- Multiturno (varias sesiones/día).

### Comandas compartidas en Redis (idea, documentada, NO empezada)
- Caso de uso: cajeros toman orden en su cel, pero la "computadora principal" del
  mostrador necesita ver/agregar a las comandas de otros cajeros cuando el cajero
  está ocupado. Hoy el carrito vive en localStorage (por dispositivo).
- Propuesta: comandas en Redis por tenant + rol/permiso nuevo tipo "caja principal"
  (permiso `sales.shared_comandas` o similar) para ver/editar comandas de todos.
  Riesgos: conflictos de edición concurrente, durabilidad de Redis, tiempo real
  (polling vs SSE). Memoria no es problema (volumen bajo). Dividir en fases.

### Otros (TECH_DEBT.md)
- Variantes de producto (distinto a modificadores) — spec en TECH_DEBT.
- Linting en CI (tests ya corren).
- Pre-compilar TS del API con esbuild (bajar CPU).
- Vault para secretos, wildcard cert, APM/Sentry, favicon por tenant, i18n, etc.

---

## NOTAS TÉCNICAS ÚTILES
- El helper `api()` (apps/web/src/lib/api.ts) solo manda `Content-Type: application/json`
  si hay body (fix del bug "Body cannot be empty"). POST sin body está OK.
- Timezone de negocio: `BUSINESS_TIMEZONE` (America/Mexico_City). businessDate =
  `toLocaleDateString('en-CA', { timeZone })`.
- Tests: patrón = funciones puras que replican la lógica (sin DB). `ConfirmDialog`
  y `api()` sí tienen test real. Caja tiene tests de la math de reconciliación.
- Roles en DB (español): administrador, gerente, cajero, almacenista, cajero_almacenista.
