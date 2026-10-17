# RELAY — arranque para la nueva sesión de StoreHub

> Pega esto como primer mensaje en la nueva sesión. Es el contexto mínimo para
> continuar sin perder las reglas. El detalle completo está en `.kiro/HANDOFF.md`.

Retomo StoreHub. Estás parado en `/Users/fernando/Code/storehub` (ese es el
directorio de trabajo, ahí viven el monorepo, `.kiro/`, infra, etc.).

**Antes de hacer nada, lee estos archivos para recuperar contexto:**
- `.kiro/HANDOFF.md` — resumen completo de lo avanzado, reglas y pendientes
- `.kiro/steering/project-context.md` — arquitectura, deploy, credenciales
- `.kiro/steering/permissions.md` — roles y permisos
- `TECH_DEBT.md` — deuda técnica y features documentadas
- `.kiro/specs/cash-sessions.md` — spec del feature de caja (fase 1 en prod)

**Estado actual:**
- Prod en `v0.36.0`. Rama `main` limpia. Hay una rama en pausa `feature/split-payments`.
- Último feature en prod: apertura/cierre de caja fase 1 (apagado por default via toggle).

**REGLAS CRÍTICAS (no romper):**
1. NUNCA promover a prod sin que yo lo indique explícitamente. Staging es automático
   (push a main); prod solo cuando yo diga "promueve a prod" (ahí se taguea vX.Y.Z).
2. Consúltame el diseño de UI antes de implementar cuando haya tradeoffs de espacio/
   protagonismo (sobre todo POS móvil). Propón opciones primero.
3. Investiga antes de afirmar (lee logs/código/docs reales, no adivines).
4. Verifica builds Y tests antes de push. El CI corre tests y bloquea el deploy si fallan.
5. Para push local: git pull --rebase antes de push (el CI commitea version bumps a main).
6. No branchear por nombre de stack en infra; usar config del YAML.

**¿En qué quieres que trabajemos?** (opciones pendientes: retomar split-payments con
el fix de migración 0016→0018, comandas compartidas en Redis, variantes de producto,
fase 2 de caja, o algo nuevo.)
