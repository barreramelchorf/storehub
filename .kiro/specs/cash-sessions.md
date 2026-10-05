# Spec — Apertura y Cierre de Caja (Cash Sessions)

## Objetivo
Permitir que un local lleve el control del efectivo físico: con cuánto se abrió la caja,
cuánto entró por ventas en efectivo durante el día, y cuánto debería haber al cierre, de
modo que el conteo físico cuadre contra lo que el sistema espera. Alinea el dinero real
con el registrado y detecta faltantes/sobrantes.

Basado en el modelo estándar de la industria (Square, Final POS): sesión de caja con
float inicial, reconciliación al cierre, y conteo a ciegas (blind count).

---

## Decisiones de negocio (confirmadas)
1. **Permiso**: cualquiera con `sales.create` puede abrir y cerrar la caja (cajeros,
   gerentes, admins). No se crea permiso nuevo.
2. **Blind count**: al cerrar, el usuario cuenta el efectivo físico SIN ver el esperado;
   el sistema revela la diferencia (over/under) después de registrar el conteo.
3. **Movimientos intermedios** (paid-in/paid-out, retiros a caja fuerte) → **Fase 2**.
4. **Float de apertura**: híbrido — el sistema sugiere el `closingCount` del cierre
   anterior, pero es **editable** (ej. un gerente retiró efectivo y dejó otra cantidad).
   El registro de retiros de efectivo por gerentes/admins → **Fase 2**.
5. **Una sola apertura al día** (no multiturno por ahora).

---

## Reglas de concurrencia (crítico, multi-usuario)
- Solo puede existir **UNA sesión abierta a la vez** por tenant. Validación en backend:
  intentar abrir con una ya abierta → error 409.
- La apertura la hace **un** usuario; cualquier cajero puede vender durante esa sesión.
- El cierre lo hace un usuario (no necesariamente el que abrió).
- "Una sola apertura al día": no se puede abrir una segunda sesión el mismo día de negocio
  (zona horaria del negocio) una vez cerrada la del día. (Confirmar si se permite reabrir
  en caso de cierre accidental — ver Preguntas abiertas.)

---

## Modelo de datos (Fase 1)

### Tabla `cash_sessions`
| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | uuid PK | |
| `tenantId` | uuid FK tenants | |
| `status` | enum `open`/`closed` | |
| `openedBy` | uuid FK users | quién abrió |
| `openedAt` | timestamp | |
| `openingFloat` | numeric(10,2) | fondo inicial declarado |
| `closedBy` | uuid FK users (nullable) | quién cerró |
| `closedAt` | timestamp (nullable) | |
| `closingCount` | numeric(10,2) (nullable) | efectivo físico contado (blind) |
| `expectedCash` | numeric(10,2) (nullable) | calculado al cierre |
| `difference` | numeric(10,2) (nullable) | closingCount − expectedCash (over/under) |
| `cashSales` | numeric(10,2) (nullable) | snapshot al cierre (informativo) |
| `cardSales` | numeric(10,2) (nullable) | snapshot (informativo) |
| `transferSales` | numeric(10,2) (nullable) | snapshot (informativo) |
| `otherSales` | numeric(10,2) (nullable) | snapshot (informativo) |
| `businessDate` | date | día de negocio (tz) para el constraint "1 por día" |
| `lateClose` | boolean default false | true si se cerró después de su día de negocio |

Índices: `(tenantId, status)`, `(tenantId, businessDate)`.

### Tabla `sales` (modificación)
- Agregar `cashSessionId` uuid nullable FK → `cash_sessions.id`. Las ventas nuevas (con
  módulo activo) lo setean a la sesión abierta. Históricas = NULL. Sin backfill.

### Config del tenant
- `config.modules.cashSessions` (bool) — "Pedir apertura y cierre de caja diario".
  Toggle en Configuración → Módulos. Default: `false` (no rompe tenants actuales).

---

## Cálculo del esperado (al cierre)
```
expectedCash = openingFloat
             + (ventas aprobadas en EFECTIVO de la sesión)
             - (devoluciones/cancelaciones en efectivo de la sesión)
difference   = closingCount - expectedCash   // + sobrante, - faltante
```
- Solo cuenta **efectivo**. Tarjeta/transferencia se muestran como informativos pero no
  entran en el esperado (no están físicamente en la caja).
- "Ventas de la sesión" = ventas aprobadas con `saleDate`/`createdAt` dentro de la ventana
  de la sesión (desde `openedAt` hasta el cierre). **Decisión a confirmar**: ¿atar las
  ventas a la sesión por `cashSessionId` (robusto) o por rango de tiempo (simple)? Ver
  Preguntas abiertas.

---

## Endpoints (Fase 1)
- `GET /api/admin/cash-session/current` — sesión abierta actual (o null). Público para
  usuarios con `sales.create`. El POS lo usa para el gate.
- `POST /api/admin/cash-session/open` — body `{ openingFloat }`. Valida que no haya otra
  abierta (409) y que no se haya abierto ya ese día. `sales.create`.
- `POST /api/admin/cash-session/close` — body `{ closingCount }`. Calcula expected +
  difference, snapshot de ventas por método, marca `closed`. Devuelve el reporte (incluida
  la diferencia — aquí se revela, blind). `sales.create`.
- `GET /api/admin/cash-session/:id` — reporte de una sesión (para historial). 
- (Opcional) `GET /api/admin/cash-sessions` — listado/historial.

---

## Gate de ventas (Fase 1)
- Si `config.modules.cashSessions === true` y NO hay sesión abierta → el POS **bloquea el
  cobro** (botones Cobrar/Terminal deshabilitados) y muestra un aviso "Abre la caja para
  comenzar a vender" con un botón para abrir.
- El backend también valida en `POST /api/admin/sales`: si el módulo está activo y no hay
  sesión abierta → rechaza (defensa real, no solo UI).
- Si el módulo está desactivado, todo funciona como hoy (sin gate).

---

## UI (Fase 1)
- **Apertura**: modal al entrar al POS (o botón) — campo `openingFloat` prellenado con el
  cierre anterior (editable). Confirmar → sesión abierta.
- **Cierre**: botón "Cerrar caja" en el POS. Modal con conteo a ciegas: el usuario ingresa
  `closingCount` SIN ver el esperado. Al confirmar, se muestra el reporte: float, ventas
  por método, esperado, contado, y diferencia (sobrante/faltante resaltado).
- **Reporte/historial**: ver sesiones pasadas (quién abrió/cerró, montos, diferencia).
  Posiblemente en Analytics o una sección nueva "Caja".

---

## Fase 2 (futura, documentada aquí para no perder contexto)
- **Movimientos intermedios de efectivo**: paid-in (entra efectivo que no es venta),
  paid-out (sale efectivo: pago a proveedor, etc.), drops a caja fuerte. Tabla
  `cash_movements` (sessionId, type, amount, reason, userId, createdAt). Entran al cálculo
  del esperado.
- **Retiros de efectivo por gerentes/admins con trazabilidad**: caso de uso — el gerente
  saca dinero para no tener tanto en caja. Es un `paid-out` con razón, auditado. Esto
  también alimenta el float sugerido del día siguiente.
- **Multiturno**: varias sesiones por día.
- **Caja principal / comandas compartidas** (feature separada, ver TECH_DEBT): si se
  implementa, revisar interacción con las sesiones de caja.

---

## Preguntas abiertas (RESUELTAS)

1. **Atar ventas a la sesión** → RESUELTO: agregar `cashSessionId` nullable a `sales`.
   - Ventas nuevas (con módulo activo) llevan el id de la sesión abierta.
   - Ventas históricas quedan en `NULL` = "anteriores al sistema de cajas". **Sin backfill**
     (no se inventan sesiones retroactivas). Cero impacto en analytics/reportes existentes
     (siguen usando `saleDate`/`paymentMethod`).

2. **Reapertura por cierre accidental** → RESUELTO:
   - Abrir y cerrar caja normal = cualquiera con `sales.create` (cajeros, gerentes, admins).
   - **Reabrir una sesión cerrada por accidente = solo admin/gerente (`users.manage`)** —
     acción de supervisión/corrección. Endpoint `POST /api/admin/cash-session/:id/reopen`.

3. **Cierre olvidado (sesión abierta de un día anterior)** → RESUELTO:
   - Al intentar ABRIR, si hay una sesión abierta de un día de negocio anterior, el sistema
     exige **cerrar esa sesión pendiente primero** (no bloquea indefinidamente).
   - El cierre tardío se hace **directo** (conteo a ciegas normal), SIN flujo de aprobación
     bloqueante (evitaría el inicio del nuevo día). Se marca con bandera `lateClose: true`
     + audit log (día que correspondía vs cuándo se cerró).
   - En el historial de cajas, los cierres tardíos aparecen **destacados** (badge) para
     monitoreo. El admin/gerente investiga patrones; no autoriza previamente.

4. **Ventas con terminal/online (tarjeta)** → RESUELTO: NO afectan el efectivo esperado.
   El gate NUNCA bloquea cobros con terminal/online (no tocan la caja física). Aparecen
   solo como informativos en el snapshot del reporte.

---

## Alcance Fase 1 (implementación)
1. Schema `cash_sessions` + enum + migración (sin backfill: tabla nueva, vacía)
2. Config `modules.cashSessions` + toggle en Configuración
3. Backend: endpoints open/close/current + validaciones de concurrencia + gate en creación
   de venta + snapshot de ventas por método al cierre
4. (Decisión Q1) `cashSessionId` en `sales` si se opta por atar por sesión
5. POS: gate + modal de apertura + modal de cierre (blind) + reporte post-cierre
6. Historial de sesiones (lectura)
7. Verificar builds, probar en staging
