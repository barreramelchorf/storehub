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
- `.kiro/specs/loyalty-wallet.md` — spec del módulo de lealtad (Apple/Google Wallet), en staging

**Estado actual:**
- Prod en `v0.36.0`. Rama `main`. Hay una rama en pausa `feature/split-payments`.
- Último feature en prod: apertura/cierre de caja fase 1 (apagado por default via toggle).
- **Lealtad (Apple/Google Wallet) en STAGING, NO en prod**: módulo completo con 2 add-ons
  (`loyalty`, `loyaltyMultiProgram`) activables desde `/platform`. Múltiples programas,
  puntos de bienvenida, QR por programa, recuperación por email, campañas. Apple y Google
  configurados y verificados en staging. Falta cargar secretos en prod para promover.
  Ver `.kiro/HANDOFF.md` sección "Lealtad".

**⚠️ ARCHIVOS LOCALES NO VERSIONADOS (verificar al arrancar en un equipo nuevo):**
Hay archivos que NO están en git (certs Apple, kubeconfig). Están empaquetados cifrados en
`~/storehub-utils.tar.gz.enc` (openssl AES-256-CBC, pbkdf2). Al iniciar sesión, verifica si
existen los archivos descomprimidos:
- `~/.certs/storehub-loyalty/` (certs Apple)
- `~/.kube/config` (kubeconfig del cluster)

Si **ya existen** → todo listo, continúa normal.
Si **NO existen**:
  - Si la variable de entorno `UTILS_PASSWORD` está definida → descomprime tú (el agente):
    ```
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in ~/storehub-utils.tar.gz.enc \
      -pass pass:"$UTILS_PASSWORD" | tar -xzf - -C /tmp/storehub-utils-extract
    mkdir -p ~/.certs/storehub-loyalty ~/.kube
    cp /tmp/storehub-utils-extract/storehub-utils/certs/* ~/.certs/storehub-loyalty/
    cp /tmp/storehub-utils-extract/storehub-utils/kube/config ~/.kube/config && chmod 600 ~/.kube/config
    ```
  - Si `UTILS_PASSWORD` NO está definida → NO lo descomprimas. Pídele al usuario que lo
    haga él (tiene la contraseña) o que exporte `UTILS_PASSWORD` y lo reintentes.
- Además: `pulumi login` (con el PULUMI_ACCESS_TOKEN del usuario) — eso no está en el paquete.

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
