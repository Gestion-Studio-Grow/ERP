# 🔐 Plan — acceso al backoffice real SIN password (sandbox de preventa)

**Tipo:** plan de diseño (Fase 0, no-build) · **Dueño:** Célula del Probador Interactivo (capa Sonnet).
**Coordina con:** la nueva célula **"Sandbox — datos ficticios + persistencia"** (dueña de la capa de
datos mock). **Pasa por:** Gate GSG — este diseño toca autenticación, así que **antes de escribir código
real cruza la Auditoría GSG en Opus** (norma dura de `CLAUDE.md` §"La Auditoría GSG corre SIEMPRE en
Opus"; auth/seguridad es capa de alto juicio, no ejecución Sonnet sin control).

**Precisión del dueño que redefine el alcance:** no es una UI de sandbox aparte — es **el `/admin` real,
con las mismas pantallas** (agenda, caja, facturación, panel del dueño), **sin pedir contraseña**, con
una única frontera pendiente de activar: la **persistencia** (hoy mock, mañana toggle a datos reales).

---

## 1. Cómo funciona HOY el acceso a `/admin` (lo que no hay que romper)

Arquitectura ya auditada en el repo (`src/proxy.ts`, `src/lib/auth.ts`, `src/lib/session.ts`,
`src/lib/authz.ts`, `src/lib/tenant.ts`):

1. **`src/proxy.ts`** (middleware edge, matcher `/admin/:path*`): el **"portón grueso"** — solo valida
   que la cookie `admin_session` tenga una **firma HMAC válida** (`readSessionToken()`, Web Crypto, sin
   Prisma). Sin firma válida → redirect a `/admin/login`. **No decide nada de identidad ni de tenant.**
2. **`src/lib/auth.ts`**: firma/verifica el token (`userId.HMAC(userId)`) con `AUTH_SECRET`. Es la única
   pieza edge-safe.
3. **`src/lib/session.ts` → `getCurrentUser()`**: en runtime Node, toma el `userId` del token y hace
   **un solo lookup a Prisma** (`User` real, scoped por `tenantId` activo). Es el **choke point único**:
   todo lo demás (`requireUser()`, `requireCapability()`, el layout de `/admin`) llama a esta función.
4. **`src/lib/tenant.ts` → `getCurrentTenantId()`**: resuelve el tenant por `FORCE_TENANT_SLUG` (env, ya
   usado para pinnear un deploy entero a un tenant — el mecanismo de "URLs gratis por tenant" de Magra),
   por subdominio, o fail-closed. Usa **`basePrisma`** (cliente crudo), **no** el `prisma` conmutado de
   `db.ts` — dato importante para la sección 4.
5. **Login real** (`src/lib/auth-actions.ts`): valida email+password (scrypt) + rate-limit anti-fuerza
   bruta, y recién ahí llama `createSessionToken(userId)`.

**Conclusión clave:** la cookie firmada **ya es agnóstica de cómo se creó**. El portón (`proxy.ts`) y el
choke point de identidad (`getCurrentUser()`) no cambian — lo único que hay que resolver es **cómo se
mintea el token sin pedir password**, no cómo se salta el portón.

---

## 2. Diseño propuesto — entrada sin password, con frontera dura

### 2.1 Deploy aislado (no una ruta más del sitio de un tenant real)

Reusar el mecanismo de **`FORCE_TENANT_SLUG`** que ya existe (mismo patrón que pinea el deploy de Magra
a su tenant): un **sitio propio** (`probar.<dominio>` o `.vercel.app`/Netlify dedicado), **nunca** el
mismo deploy que sirve un tenant real o la app principal. Env de ese sitio:

- `FORCE_TENANT_SLUG=sandbox` (o `sandbox-<rubro>` si se arma uno por familia) → un tenant **ficticio**,
  namespaced (nunca `carolina`/`magra`/etc.), que **no** necesita existir en la DB de producción (ver 2.3).
- **`DEMO_SANDBOX_MODE=1`** (flag nuevo, exclusivo de este deploy) → activa TODO lo de abajo. Se lee una
  sola vez al boot (invariante dura: si por error quedara seteado en un deploy de tenant real, el arranque
  debe **fallar explícito** — un `throw` en el módulo, no un `if` silencioso en cada request).

### 2.2 Minteo del token sin password

Nueva ruta, ej. `POST /probar/entrar` (server action o route handler), que **solo existe/responde** si
`DEMO_SANDBOX_MODE=1`:

```
if (!process.env.DEMO_SANDBOX_MODE) → 404 (no revela que existe)
cookie = createSessionToken(DEMO_USER_ID)   // MISMA función que usa el login real
set-cookie admin_session = cookie           // MISMA cookie que espera proxy.ts, sin tocarlo
redirect → /admin
```

`DEMO_USER_ID` es una **constante fija y namespaced** (ej. `"demo-owner"`), nunca un id real. **Cero
formulario, cero email, cero password** — el CTA de `/probar` (o `/demo`) es un botón "Entrá al
backoffice real" que pega directo a esta ruta.

**Único código nuevo tocando el choke point de identidad:** en `session.ts → getCurrentUser()`, una rama
al principio — `if (DEMO_SANDBOX_MODE) return DEMO_SESSION_USER` (objetivo fijo, rol `OWNER`, sin
Prisma) — **antes** del lookup real. Todo lo demás (`requireUser`, `requireCapability`, el layout de
`/admin`, cada Server Action) sigue **exactamente igual**, porque todos cuelgan de esta función.

### 2.3 Por qué esto no expone nada real (las garantías, en orden de fuerza)

1. **Físico, no solo lógico:** el deploy sandbox **no tiene `DATABASE_URL` de producción** — ni siquiera
   de lectura. Si el módulo de datos (sección 4) usa DB, es una **base descartable propia**, jamás Neon
   de prod. Aunque alguien lograra forjar una cookie válida contra este deploy, no hay conexión que lo
   lleve a un dato real: la barrera es de red/infraestructura, no de código que pueda tener un bug.
2. **Namespacing:** `DEMO_USER_ID`/`sandbox` no colisionan con ningún id real (se verifica una vez:
   grep de que ningún tenant/usuario de prod usa esos slugs).
3. **El portón existente no se debilita:** `proxy.ts` sigue exigiendo firma HMAC válida igual que hoy;
   no se agrega ningún `if` que "salte" el portón. Se agrega una **fuente adicional de tokens firmados
   legítimos**, gateada por un flag que solo existe en un deploy sin datos reales.
4. **Ruta de minteo oculta y limitada:** `noindex`/`nofollow`, y rate-limit básico (reusar el limiter que
   ya existe para `/admin/login`) para que no sea vector de costo/spam — no protege un secreto (no hay
   password que romper), protege el presupuesto de infra.
5. **`AUTH_SECRET` puede (y conviene) ser propio de ese deploy** — no comparte secreto con los sitios de
   tenants reales, así una cookie minteada ahí ni siquiera *parsea* como válida en otro deploy.

### 2.4 Qué pasa cuando el dueño activa el toggle de datos reales (fuera de este alcance, para contexto)

Cuando el negocio "cierra" y se activa `DEMO_SANDBOX_MODE=0` en un deploy real (o se promueve a un tenant
real, FASE 2 del generador de preset): **desaparece toda esta puerta** — ese deploy nunca tuvo el flag,
usa login real con password desde el día uno. El sandbox y el tenant real **no son el mismo deploy que
cambia de modo**; son deploys distintos (igual que hoy Magra y el sandbox serían sitios Netlify
distintos). Esto es más simple y más seguro que un "toggle en caliente" sobre el mismo deploy.

---

## 3. Lo que esta célula NO resuelve (frontera con "Sandbox — datos ficticios + persistencia")

El acceso (arriba) es independiente de **qué datos ve** el visitante una vez adentro. Esa capa es de la
nueva célula. Le dejo el **contrato de entrada** + un hallazgo que necesita conocer:

- **Contrato de entrada:** cuando `DEMO_SANDBOX_MODE=1`, la identidad (`getCurrentUser()`) y el tenant
  (`getCurrentTenantId()`) ya están resueltos a valores fijos y ficticios (§2.2). La célula de Sandbox
  solo necesita responder: *dado ese usuario/tenant ficticio, ¿de dónde salen los datos que lee/escribe
  cada pantalla, y por qué no persisten?*
- **Dos caminos posibles (trade-off, a decidir por esa célula, no por mí):**
  1. **Base descartable real** (branch de Neon aparte o DB propia, reseed periódico) → **cero cambios**
     en las ~20 Server Actions que hoy llaman `prisma` directo (no hay capa de repository/data-access
     intermedia en el repo — confirmado). "No persiste de verdad" se logra por **reseed/expiración**, no
     por ausencia de base. Costo bajo, honestidad relativa (persiste horas/un día, no para siempre).
  2. **Cliente mock stateless** (sin base) → conmutar en `src/lib/db.ts` (el mismo lugar donde hoy se
     conmuta `prisma` por `RLS_ENFORCEMENT`) a una capa que devuelve datos de ejemplo en lecturas y
     **no-opea** las escrituras (responde éxito, no persiste nada, ni siquiera efímero). Cumple literal
     "sin base real, nada se guarda" pero exige tocar/auditar cada acción para que sepa devolver su
     arquetipo de datos de ejemplo (por rubro, ver `docs/preventa/preset-contract.md` §3.1).
- **Hallazgo importante para esa célula:** `src/lib/tenant.ts` resuelve `FORCE_TENANT_SLUG` con
  **`basePrisma`** (cliente crudo), **no** con el `prisma` conmutado de `db.ts`. Si se elige el camino 2
  (mock sin base), la resolución de tenant **igual** pega a una base real salvo que también se cubra ese
  llamado — el camino 1 (DB descartable real) evita este problema gratis, porque hay una base real (solo
  que descartable) para responder esa consulta.

---

## 4. Checklist del Gate GSG para este diseño (a re-auditar en Opus antes de codear)

- [ ] **Arquitectura/Seguridad:** deploy físicamente aislado de `DATABASE_URL` de prod (no solo un flag
      lógico) — el ítem no-negociable de este plan.
- [ ] **Fail-closed:** `DEMO_SANDBOX_MODE` mal seteado en un deploy real → falla el build/boot, no
      degrada en silencio.
- [ ] **Namespacing verificado:** `DEMO_USER_ID`/slug de tenant sandbox no existen en la DB de prod.
- [ ] **No debilita el portón existente** (`proxy.ts` sin cambios, cookie con la misma firma/mecanismo).
- [ ] **Confiabilidad:** `tsc`+`build`+`test` verdes con el flag en ambos estados (on/off).
- [ ] **Honestidad:** el visitante ve, en algún lugar discreto del backoffice en modo sandbox, que está
      en modo demo (mismo principio que el Gate le exige a los previews — P0-1 de la auditoría del
      2026-07-06).

---

## 5. Próximo paso

1. Esta célula lleva el diseño de §2 al Gate GSG (Opus) antes de tocar `session.ts`/`auth-actions.ts`.
2. La célula de Sandbox decide el camino de §3 (DB descartable vs mock stateless) y lo documenta como
   contrato en `docs/preventa/` para que ambas céclulas codeen contra la misma forma (mismo patrón que
   `preset-contract.md`).
3. Ninguna de las dos cosas se integra a `main` sin pasar el Gate — no se toca `src/lib/session.ts`,
   `src/proxy.ts` ni `src/lib/db.ts` todavía.

## 6. Estado — v1 CONSTRUIDA (2026-07-06), pendiente Gate GSG antes de exponer

Por prioridad explícita del dueño se pasó de diseño a una **primera versión funcional**, en línea con el
plan de arriba y con `docs/demo/plan-sandbox-persistencia.md` (Célula Sandbox) — mismo mecanismo,
implementado con guards por acción en vez de mock genérico de Prisma (ver decisión en §6.2).

### 6.1 Qué existe en código

- **`src/lib/demo-flag.ts`** — `isDemoSandbox()` (lee `DEMO_MODE_ENABLED==="true"`) + `DEMO_TENANT_ID`.
  Cero imports (edge-safe), lo usa también `src/proxy.ts`.
- **`src/lib/demo-sandbox.ts`** — identidad ficticia (`DEMO_SESSION_USER`, rol OWNER), fixtures de
  Agenda&Servicios (agenda del día, caja abierta con ledger, reportes/panel del dueño calculados con el
  motor real `computeDeepKpis` sobre turnos ficticios) y `DEMO_WRITE_BLOCKED` (respuesta honesta para
  escrituras).
- **Guards agregados** (todos: `requireCapability` primero, después el corte — la capacidad se resuelve
  igual porque `getCurrentUser()` ya devuelve la identidad ficticia):
  - `src/lib/session.ts` (`getCurrentUser`) y `src/lib/tenant.ts` (`getCurrentTenantId`): devuelven la
    identidad/tenant fijos sin tocar Prisma/`basePrisma` en absoluto.
  - `src/proxy.ts`: dejar pasar `/admin/:path*` sin cookie cuando la flag está prendida. `/operador` sin
    tocar.
  - `src/lib/actions.ts`: `getAgendaDay`, `getReportData`, `getDeepReportData`, `getOwnerPanelData` (datos
    ficticios) + `confirmPayment`/`cancelAppointment`/`markNoShow`/`completeAppointment`/
    `rescheduleAppointment` (no-op, no persisten).
  - `src/lib/caja-actions.ts`: `getCajaData` (ficticio) + `openCashSession`/`addCashMovement`/
    `closeCashSession` (bloqueadas, `DEMO_WRITE_BLOCKED`).
  - `src/lib/commission-actions.ts`: `getCommissionsOverview` (vacío, estado legítimo) + `settleCommissions`
    (bloqueada).
- **`src/app/demo/DemoTour.tsx`**: un link "Entrá al backoffice real (demo) →" a `/admin/turnos` — sin
  import nuevo, no rompe el aislamiento de `/demo`.

### 6.2 Decisión que se apartó del plan original (documentada, no silenciosa)

El plan de la Célula Sandbox proponía interceptar en `src/lib/db.ts` (mockear TODO el cliente Prisma). Se
optó por **guards en cada acción de lectura/escritura de las 3 pantallas pedidas** (agenda, caja, panel
del dueño) en su lugar: `getReportData`/`getDeepReportData`/`getOwnerPanelData` hacen agregaciones
(`groupBy`-like) que un mock genérico de Prisma tendría que reimplementar fielmente — mockear la
**salida de cada función** es mucho más barato y igual de seguro (cero Prisma tocado en modo demo), a
costa de tener que declarar el guard en cada acción nueva que se sume a estas 3 pantallas (deuda anotada,
no bloqueante). Si más pantallas se suman al sandbox y el costo de guardas dispersas supera al de un
mock centralizado, se reconsidera.

### 6.3 Verificación hecha (sin tocar el árbol/env compartido)

- `tsc --noEmit`: limpio.
- `npm test`: **417/417** (9 nuevas en `src/lib/demo-sandbox.test.ts`, cubren la flag apagada/prendida,
  namespacing de la identidad ficticia, y las 4 formas de datos ficticios).
- Navegador (`/demo`): renderiza con el link nuevo visible; navegación directa a `/admin/turnos` con la
  flag apagada (default de este entorno) **redirige a `/admin/login`** — cero regresión del portón real.
- **No verificado en navegador con la flag prendida**: hacerlo requeriría tocar `.env.local` de un
  worktree compartido con otras sesiones activas (riesgo de disrupción, ver `feedback_working_tree_compartido_commit_race`
  en memoria) — se prefirió cubrir la ruta ON con tests unitarios aislados (§6.3 arriba) en vez de un
  servidor compartido. Queda como pendiente correr esto en un deploy/branch de Neon aislado real.

### 6.4 Qué falta (explícito, no bloqueante para este incremento)

- **Gate GSG en Opus**: este commit toca `session.ts`/`tenant.ts`/`proxy.ts` — corresponde auditoría de
  seguridad antes de exponer esto en un deploy público real (aunque el código es inerte por defecto).
- Optimismo de UI en `caja`/`agenda` (que un clic en "Cobrar"/"Agendar" se **vea** reflejado en pantalla)
  no está — hoy las escrituras devuelven honestamente "no se guarda" en vez de fingir. Es la mejora
  natural del próximo incremento si se pide.
- Deploy real aislado (`FORCE_TENANT_SLUG=demo-agenda` + `DEMO_MODE_ENABLED=true` en un sitio propio) no
  se creó — este incremento es el código; el paso de infraestructura (Netlify/Vercel) queda para cuando
  el dueño lo pida.

## 7. Precisión del dueño (2026-07-06): secuencia CONSULTOR → BACKOFFICE

**Orden correcto, no negociable:** el backoffice de la demo **no se arma antes** de que un **agente
consultor** recomiende, según el rubro/negocio del prospecto, qué necesita para su gestión óptima (qué
módulos, qué configuración, qué reportes). La recomendación del consultor **determina** qué incluye y
cómo queda el backoffice — es entrada, no un adorno posterior. Hoy el v1 (§6) hace lo inverso: el
backoffice está **hardcodeado** a un solo rubro (Agenda&Servicios/estética) sin ningún paso de consulta
previo. Es el próximo trabajo, explícitamente para la sesión Opus (no se implementó acá, solo se deja
estructurado el enganche).

### 7.1 Dónde engancha (sin romper lo que ya funciona)

```
CONSULTOR (nuevo)                          BACKOFFICE (v1, existente)
─────────────────────                      ──────────────────────────
rubro/negocio del prospecto     ──────►     src/lib/demo-sandbox.ts
  │                                           hoy: fixtures fijas de
  ▼                                           UN rubro (PROS/SERVICES/
ConsultorRecommendation                      CLIENTS hardcodeados)
  { rubro, blueprintFamily,       ──────►
    modules[], reports[] }                  mañana: fixtures SE ARMAN
                                             a partir de la Recommendation
```

- **`ConsultorRecommendation`** (contrato mínimo a definir, no implementado): reusa exactamente la tabla
  de familias que ya ratificó la Célula del Probador en `docs/preventa/preset-contract.md` §3
  (Agenda&Servicios / Retail-Mostrador / Gastronomía / Servicios&Oficios / Genérico) — **no inventar una
  segunda taxonomía de rubros**. El consultor v1 puede ser tan simple como: recibir un string de rubro →
  `resolveBlueprint()` (ya existe en `src/blueprints/`) → devolver la familia + su set de módulos de la
  tabla ya escrita. Cero IA todavía; el punto es que el **paso exista y el backoffice dependa de su
  salida**, no que sea sofisticado.
- **Dónde se conecta:** `getDemoAgendaDay`/`DEMO_CAJA_DATA`/`getDemoReportData` (hoy fijas) pasan a
  recibir la `ConsultorRecommendation` (o al menos el rubro/familia) y elegir/parametrizar sus fixtures
  según ella, en vez de los arrays hardcodeados de `demo-sandbox.ts`. La familia Retail/Mostrador, por
  ejemplo, cambiaría `agenda`→`vidriera` (ya previsto en preset-contract.md §3, todavía no construido acá).
- **No se toca** `session.ts`/`tenant.ts`/`proxy.ts` para esto — el enganche del consultor es una capa
  *antes* de `demo-sandbox.ts`, el resto de la cadena de acceso sin password queda igual.

### 7.2 Qué queda pendiente para Opus (en orden)

1. Definir `ConsultorRecommendation` en código (tipo + función mínima rubro→recomendación, reusando
   `resolveBlueprint()` y la tabla de familias de `preset-contract.md`).
2. Generalizar `demo-sandbox.ts`: sacar los fixtures de Agenda&Servicios del hardcode y parametrizarlos
   por la `Recommendation` (empezar sumando **una segunda familia**, p.ej. Retail/Mostrador, para probar
   que el enganche generaliza — no todas las 5 de una vez).
   - **Nota de mocking (para no re-descubrir):** en 2026-07-06 la sesión Sandbox concurrente puede haber
     construido las mismas fixtures/estructura de datos ficticios sobre `src/lib/db.ts` (mock de Prisma)
     en paralelo — **revisar `git log`/el estado de `docs/demo/plan-sandbox-persistencia.md` antes de
     tocar `demo-sandbox.ts`** para no duplicar fixtures ya escritas por esa otra sesión.
3. Solo después, el Gate GSG (Opus) audita el conjunto completo (acceso sin password + consultor +
   backoffice parametrizado) antes de cualquier deploy real.

— Elaborado por **Gestión Studio Grow (GSG)**.
