# Gate RLS — Ensayo (offline) + Plan de cutover a prod — 2026-07-11

> **Rama:** `seguridad/levantar-rls` (worktree aislado). **Sin merge, sin deploy, sin tocar la DB de prod.**
> Complementa el runbook `docs/runbooks/levantar-gate-rls-2do-tenant.md` (rama `fase2/aceitar-alta`) con la
> **evidencia real de esta sesión** y el **plan de cutover ejecutable** para cuando el dueño dé el OK.
>
> **PARADA DURA:** este documento llega **hasta el borde del cutover**. El paso de tocar prod (aplicar SQL,
> rotar `DATABASE_URL`) lo confirma y ejecuta el dueño (Gate 1 + Gate 2). — Elaborado por GSG (Seguridad)

---

## 0. TL;DR honesto

- **El cableado de RLS ya está hecho y es correcto.** No hubo que "encender" nada desde cero: la app ya usa
  `rlsPrisma` conmutado por flag, `tenantTransaction`, `runInTenantContext` en los bordes sin-host, y los
  crons ya aíslan por tenant explícito. Esta sesión lo **verificó exhaustivamente** y **cerró un hueco**.
- **El ensayo "en vivo" contra un branch de Neon NO se pudo correr en esta sesión** por falta de acceso:
  **no hay `psql`, no hay `neonctl`, no hay `NEON_API_KEY`** en el entorno. Crear un branch de Neon y
  conectarse por psql **requiere una acción del dueño** (ver §6). No se tocó prod.
- **En su lugar se corrió un ensayo OFFLINE equivalente contra Postgres real (PGlite)** — que soporta RLS,
  roles y `set_config` de verdad — cubriendo **todas** las aserciones de aislamiento del ensayo canónico
  **más** los ángulos que pediste (por-ID, por include/relación, y el no-filtrado entre requests que comparten
  conexión por el pooler). **Todo verde.** Es evidencia dura del **mecanismo** y del **código**; lo único que
  el offline no reproduce es el pooler real de Neon (pgbouncer) — eso queda para el ensayo en branch (§6).
- **Vallas:** `tsc` limpio · **929/929 tests** verdes · cobertura estática RLS **41/41**. (`next build` y
  gate visual: ver §4 — no aportan a este cambio y/o requieren DB viva.)

---

## 1. Estado del cableado (Fase B) — lo que ya estaba y es correcto

Verificado leyendo el código en `seguridad/levantar-rls` (== HEAD de trabajo):

| Pieza | Archivo | Estado |
|---|---|---|
| Conmutador por flag | `src/lib/db.ts` | `RLS_ENFORCEMENT=on` → `rlsPrisma`; off → `basePrisma` (idéntico a hoy). ✓ |
| Extensión RLS | `src/lib/rls.ts` | Envuelve cada op en una tx que setea `app.current_tenant_id` con `set_config(...,true)` (transaction-scoped → pooling-safe). `tenantTransaction`/`bookingTransaction` para tx interactivas. ✓ |
| Contexto por request | `src/lib/tenant-context.ts` | `AsyncLocalStorage`; `runInTenantContext`. ✓ |
| Conexión del owner | `src/lib/operator-db.ts` | `operatorPrisma` usa `OPERATOR_DATABASE_URL ?? DATABASE_URL` — separación física del acceso cross-tenant. ✓ |
| Resolución de tenant | `src/lib/tenant.ts` | Por subdominio / `TENANT_HOST_MAP`, **fail-closed** (ADR-015): con >1 tenant y sin host → THROW. ✓ |
| Crons aislados | `src/lib/cron/reminder-sweep.ts`, `src/lib/arca-dispatch.ts` | Barrido cross-tenant vía `operatorPrisma` (owner, bypass por diseño), escritura por fila vía `tenantTransaction(fn, { tenantId })`. ✓ |
| Bordes sin-host | `src/app/api/webhooks/mercadopago/route.ts`, `src/app/api/public/v1/orders/route.ts`, `src/lib/public-api-auth.ts` | Usan `runInTenantContext` con tenant explícito. ✓ |

**Migración de `$transaction`:** `tenantTransaction`/`bookingTransaction` en **23 archivos**; **no queda ningún
`prisma.$transaction` crudo** sobre el cliente conmutado (los 3 matches son código generado / tipos / comentarios).

## 2. Auditoría de fugas — resultado: LIMPIA (con 1 hueco cerrado)

- **`operatorPrisma` (rol owner, evade RLS):** se usa **solo** en el control-plane (consola `/operador/*`,
  tras su propia auth), en los **crons**, y en el **provisioning** — **nunca en un handler de request de cara
  al tenant** (vidriera, `/admin`, reserva). Sin fugas por ahí.
- **`basePrisma` (sin GUC):** fuera del framework, se usa solo para leer la tabla **`Tenant`** (excluida de RLS
  a propósito) en `brand-sheet.ts` / `public-api-auth.ts`, y para `SELECT 1` en `/api/ready`. Post-go-live
  (como `app_rls` sin GUC) esos accesos **funcionan** (Tenant no tiene policy) y **no filtran** nada. Sin riesgo.
- **🔧 HUECO CERRADO (este PR):** el **CLI** `scripts/provision-tenant.ts` (`main()`) conectaba con
  `process.env.DATABASE_URL`. Post-go-live, `DATABASE_URL` = `app_rls` (sin BYPASSRLS) → la **fábrica de
  tenants por CLI** no podría crear las filas del tenant nuevo (el `WITH CHECK` exige el GUC del tenant nuevo,
  que el provisioning no setea). **Fix:** conectar con `OPERATOR_DATABASE_URL ?? DATABASE_URL` (owner-first,
  con fallback = comportamiento actual pre-RLS), igual patrón que `operator-db.ts`. El alta **por consola** ya
  usaba `operatorPrisma` (owner) — no estaba afectada. Reversible; con `OPERATOR_DATABASE_URL` sin setear no
  cambia nada respecto de hoy.

## 3. Evidencia del ensayo OFFLINE (Postgres real vía PGlite — sin tocar Neon)

Corridos con el cliente Prisma real + las policies de producción (`0001_enable_rls.sql`, data-driven) + rol
`app_rls` (`SET LOCAL ROLE`, simula la app conectada sin bypass):

**`node prisma/rls/check-coverage.mjs`** → **41/41** modelos de-tenant son protegibles (tienen `tenantId`).
Excluidas a propósito: `Tenant` (raíz) y `_ProfessionalServices` (M2M sin `tenantId`, protegida
transitivamente). *(El doc traía 38; el schema creció a 41 y el chequeo data-driven las cubrió solo.)*

**`tsx prisma/rls/verify-wiring.mts`** → **5/5**:
- aislamiento (cliente real + policies + `app_rls`): ctx=A ve SOLO a A
- `runInTenantContext` alimenta la extensión real sin `getCurrentTenantId`
- self-resolución con 1 tenant (el caso del go-live)
- `tenantTransaction` setea `app.current_tenant_id` como primer statement (self-resuelto y explícito)

**`tsx prisma/rls/verify-async-tenant-isolation.mts`** → **7/7** (crons):
- `processArcaOutbox` drena los 2 tenants y autoriza CADA factura en SU tenant, sin arrojar
- mecanismo de `runReminderSweep`: barrido cross-tenant + marcado por fila en su tenant
- **regresión confirmada:** el patrón viejo (ambiental) SIGUE arrojando con >1 tenant → el bug era real y el
  fix no "funciona porque hay un solo tenant"

**`tsx prisma/rls/verify-rls-offline-pglite.mts`** (NUEVO en este PR) → **8/8** — cubre los ángulos que pediste:
- **A** lectura aislada · **B** **no se pesca por ID** (SELECT del Client de B con ctx=A → 0 filas) ·
  **C** **include/JOIN**: cruzar relaciones con ctx=A solo trae lo de A ·
  **D** **WITH CHECK**: INSERT con `tenantId` ajeno → RECHAZADO ·
  **E** **UPDATE cross-tenant** → BLOQUEADO ·
  **F** **fail-closed**: sin GUC, 0 filas ·
  **G** **no-filtrado por conexión reutilizada** (el riesgo clásico Neon+pooler): tras una tx con ctx=A en una
  conexión, la **siguiente tx en la MISMA conexión física, sin re-setear el GUC, ve 0 filas** → prueba que
  `set_config(...,true)` es transaction-scoped y **no se filtra entre requests** que comparten conexión por el
  pooler en modo transacción.

> **Qué NO cubre el offline:** el pooler real de Neon (pgbouncer en modo transacción) y el rol `app_rls`
> autenticando por password sobre el proxy de Neon. El diseño es correcto (transaction-scoped), y G lo prueba a
> nivel de conexión reutilizada; pero la confirmación final sobre el pooler real es parte del **ensayo en branch
> de Neon** (§6), que necesita tu acción.

## 4. Vallas de confiabilidad

- **`tsc --noEmit`** → limpio (exit 0). Valida TODO el proyecto TS, incluido el fix del CLI y la app Next.
- **Suite** (`node --import tsx --test "src/**/*.test.ts"`) → **929 pass / 0 fail**.
- **`next build`** → **N/A local, sin impacto en este cambio.** El único cambio de código está en el `main()`
  del CLI `provision-tenant.ts`, **fuera del grafo de build de Next** (la función exportada `provisionTenant`
  que la app importa no cambió). El código de la app Next es byte-idéntico a la base (`b5fc38d`) que **ya
  buildea y deploya en prod**. El build local en el worktree quedó bloqueado solo por una limitación de
  Turbopack con el `node_modules` enlazado (junction), no por el código. `tsc` verde cubre el typecheck completo.
- **Gate visual** → **no aplica en esta sesión / difiere al ensayo en branch.** Requiere dev server contra una
  DB viva; no hay branch de Neon y **no se toca prod**. Además, con `RLS_ENFORCEMENT=off` la salida visual es
  **byte-idéntica** a hoy (el candado solo cambia comportamiento con el flag `on` + rol `app_rls`).

---

## 5. Plan de CUTOVER a producción — paso por paso, con rollback por paso

> **NADA de esto se corre en esta sesión.** Es el guion para cuando el dueño dé el OK (Gate 1 deploy + Gate 2 DB).
> Orden pensado para que en TODO momento el sistema quede consistente y con salida de escape.

**Precondición:** el ensayo en branch de Neon (§6) en verde (`verify-rls` 4/4 + `check-rls-live` sin drift).

| # | Paso | Comando / acción | Rollback |
|---|---|---|---|
| **C0** | **Foto previa de prod** (read-only) | `RLS_AUDIT_DATABASE_URL="<PROD>" node prisma/rls/check-rls-live.mjs` → guardar el "antes" | — (solo lectura) |
| **C1** | **Backstop de DB en prod**: habilitar RLS + policy en las 41 tablas | aplicar `prisma/rls/0001_enable_rls.sql` sobre prod (data-driven, idempotente) | `prisma/rls/0001_rollback.sql` (quita policies + RLS). **Aplicar 0001 NO cambia el comportamiento** mientras la app siga como owner → paso seguro y reversible. |
| **C2** | **Crear rol `app_rls`** (login, NOBYPASSRLS, solo DML) | aplicar `prisma/rls/0002_app_role.sql` sobre prod — **crea el rol SIN password** | `DROP ROLE app_rls;` (nadie conecta con él aún) |
| **C3** | **Password de `app_rls`** — **la pone el DUEÑO**, fuera del repo | Neon console → Roles → Reset password, o `ALTER ROLE app_rls PASSWORD '<secret>'` | resetear/rotar la password |
| **C4** | **Setear `OPERATOR_DATABASE_URL`** = string del **owner** (`neondb_owner`) en Vercel | Vercel → Env (Production) | quitar la var (cae a `DATABASE_URL`) |
| **C5** | **Rotar `DATABASE_URL`** = string de **`app_rls`** + **`RLS_ENFORCEMENT=on`** en Vercel, y **redeploy** | Vercel → Env + deploy | **volver `DATABASE_URL` al owner** y `RLS_ENFORCEMENT=off` + redeploy → enforcement apagado al instante (el código con flag off = idéntico a hoy) |
| **C6** | **Verificar en vivo, en prod, con el 1er tenant todavía solo** | `RLS_AUDIT_DATABASE_URL="<PROD>" node prisma/rls/check-rls-live.mjs` → **41/41 + `app_rls` sin BYPASSRLS**; probar que las 4 apps sirven (vidriera, reserva, `/admin`, cron) | si algo falla → C5 rollback |
| **C7** | **(opcional) Hardening FORCE RLS** | `prisma/rls/0003_force_rls_optional.sql` — solo tras validar que seed/provisioning setean el GUC o usan owner | `0001_rollback.sql` incluye `NO FORCE` |
| **C8** | **Recién ahora: alta del 2º tenant** | consola `/operador/alta` (usa `operatorPrisma`=owner) o CLI `npm run provision` **con `OPERATOR_DATABASE_URL` seteada** (fix de este PR) | el alta es idempotente/transaccional; si algo falla, aborta sin dejar fila a medias |

**Regla de oro del rollback:** el interruptor maestro es `RLS_ENFORCEMENT` + a qué rol apunta `DATABASE_URL`.
Volver `DATABASE_URL` al owner y el flag a `off` **desactiva RLS en un redeploy**, sin migración inversa. Las
policies (`0001`) pueden quedar aplicadas sin efecto sobre el owner; si se quiere limpiar, `0001_rollback.sql`.

---

## 6. Qué necesito de vos (dueño) para completar el ensayo EN VIVO

El ensayo offline (§3) prueba el mecanismo y el código. Para cerrar la Fase A/C **contra Postgres real de
Neon con su pooler**, necesito **una** de estas dos, **sin exponer prod**:

1. **(preferido) Un branch de Neon desechable** (copia de prod) y su connection string como
   `RLS_VERIFY_DATABASE_URL` / `RLS_AUDIT_DATABASE_URL`. Con eso corro:
   ```
   # aplicar los SQL sobre el BRANCH (no prod) — vía un runner node con `pg`, ya que no hay psql:
   node <runner> prisma/rls/0001_enable_rls.sql   # sobre el branch
   node <runner> prisma/rls/0002_app_role.sql
   RLS_VERIFY_DATABASE_URL="<BRANCH>" node prisma/rls/verify-rls.mjs      # espera 4/4
   RLS_AUDIT_DATABASE_URL="<BRANCH>"  node prisma/rls/check-rls-live.mjs  # espera sin drift
   ```
   *(No hay `psql` ni `neonctl` en el entorno; aplico los `.sql` con un pequeño runner de `pg`, que sí está.)*
2. **O bien un `NEON_API_KEY`** (temporal, revocable) para que yo **cree el branch** por la API de Neon y corra
   lo de arriba. Lo usaría solo para crear/borrar el branch de ensayo, nunca contra prod.

> Cualquiera de las dos es **sobre un branch**, nunca sobre prod. Si preferís correrlo vos, los comandos de
> arriba son exactamente los del runbook `levantar-gate-rls-2do-tenant.md`.

**Para el cutover (§5), además, SOLO vos:** password de `app_rls` (C3), setear `OPERATOR_DATABASE_URL` (C4) y
rotar `DATABASE_URL` (C5) en Vercel, y dar el OK de deploy (Gate 1) + de tocar la DB de prod (Gate 2). Los
secretos los pegás vos; el agente nunca los toca (SEC-1 / ADR-041).

---

## 7. Riesgos residuales — honestos

1. **Pooler real de Neon no ensayado en vivo (esta sesión).** El offline (G) prueba el no-filtrado por conexión
   reutilizada a nivel de `pg`, y el diseño (`set_config(...,true)` transaction-scoped) es el correcto para el
   pooler en modo transacción. **Falta** confirmarlo contra el pgbouncer real de Neon → **ensayo en branch (§6)
   antes del cutover.** Riesgo: bajo (diseño correcto), pero **no cero hasta el ensayo en vivo**.
2. **`app_user` legacy con BYPASSRLS (inarreglable por `neondb_owner`).** Es inofensivo **mientras nadie conecte
   con él**. Mitigación dura: **nunca** rotar `DATABASE_URL` a `app_user`; `check-rls-live.mjs` **bloquea** si el
   rol de la app evade RLS. Pendiente del dueño: idealmente sacarlo de circulación (revocar login) — requiere
   confirmación de que ningún sistema lo use.
3. **Performance con RLS on.** Sin `runInTenantContext` en el borde HTTP del app normal, cada operación abre su
   propia tx + `set_config` (la extensión resuelve el tenant por subdominio, cacheado por request). Es
   **correcto** pero más pesado que envolver el request entero. No es bloqueante; optimizable después (envolver
   el request en `runInTenantContext` una vez). El `connection_limit` bajo (5) sobre el pooler ya está puesto.
4. **`next build`/gate visual no ejecutados localmente** (§4). Cubierto por `tsc` + suite verdes + que la app
   Next es idéntica a la base que ya deploya; el cambio de código es CLI-only. Correr el build+visual completos
   como parte del deploy de Vercel (que ya lo hace) o del ensayo en branch.
5. **Secretos / PITR** (fuera de este frente, pero pre-cobros): rotar `NEON_API_KEY` y password de `app_rls`,
   habilitar PITR (ESTADO §C·I4). No bloquea el gate RLS, sí conviene antes de datos reales.

---

## 8. Checklist "listo para el 2º tenant" — estado tras esta sesión

- [x] `check-coverage` estático (41/41).
- [x] Ensayo del **mecanismo** en verde (offline, Postgres real vía PGlite): aislamiento, por-ID, include,
      WITH CHECK, UPDATE cross-tenant, fail-closed, no-filtrado por conexión reutilizada.
- [x] App cableada a `app_rls` + `runInTenantContext`/`tenantTransaction` + **crons con contexto de tenant**.
- [x] Fábrica de tenants por CLI corregida a owner-first (`OPERATOR_DATABASE_URL`).
- [x] `tsc` + **929 tests** verdes.
- [ ] **Ensayo en branch de Neon** (`verify-rls` 4/4 + `check-rls-live` sin drift) — **necesita tu acción (§6).**
- [ ] Prod: `0001` + `0002` aplicados; password de `app_rls` puesta por el dueño; `DATABASE_URL` rotada;
      `OPERATOR_DATABASE_URL` seteada — **cutover (§5), OK del dueño.**
- [ ] `check-rls-live` en prod: 41/41 + `app_rls` sin BYPASSRLS.
- [ ] `app_user` legacy confirmado **sin uso**.

— Elaborado por GSG (Seguridad)
