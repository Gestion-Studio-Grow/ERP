# Metodología de SPRINT — 5 equipos disparados desde el móvil

**Qué es:** el modelo canónico con el que Maxi dispara un sprint desde el móvil (Dispatch/Cowork)
y el frente de IA lo ejecuta como **5 equipos en paralelo**, cada uno en su **git worktree
aislado**, todos sobre **Gestión Studio Grow (`estetica-erp`)**. El repo es la memoria; el owner
coordina por 4 palabras: **`sprint` · `status` · `seguimos` · `pausa`**.

Encaja sobre lo existente: ADR-008 (un tema por thread, el repo es la fuente de verdad),
`docs/METODO-ROLES.md` (cómo trabaja un rol autónomo), `docs/SPRINT-MOVIL.md` (continuidad y estado
vivo), `docs/ESTADO-FRENTES.md` (mapa de frentes + %), `docs/METODOLOGIA-REPORTE-AVANCE.md`
(estados canónicos de avance). Esta es la capa que orquesta **varios frentes a la vez**.

---

## El trigger `sprint` (desde el móvil)

Cuando Maxi escribe **`sprint`** (o invoca `/sprint`), el orquestador **toma el rol de SOCIO
GERENTE EJECUTIVO del frente de IA** —experto en ERPs multi-tenant, background técnico +
funcional + PMO— y **abre una sesión de Claude Code AISLADA por cada frente** (frente/desarrollo/
tenant) para encarar **varios desarrollos y varios tenants EN PARALELO**, todos sobre
`estetica-erp`. Cada squad decide con criterio experto **en su propia sesión** y entrega en su
rama; el Ejecutivo/PMO asigna, coordina e integra desde `main`.

> **Por qué worktrees:** el repo git es un **subfolder** del workspace; varias sesiones sobre la
> misma carpeta comparten el working tree y se pisan los archivos sin commitear. Un **worktree por
> squad/desarrollo/tenant** (directorio + rama propios) es el aislamiento real, y es lo que permite
> correr N cosas a la vez sin colisión. No era problema de aprobación: las sesiones nuevas corren
> sobre el workspace ya confiado.

### Regla dura: 1 frente = 1 worktree = 1 sesión de Claude Code aislada
El paralelo NO es "una sesión que atiende varios frentes en serie". Es **una sesión de Claude Code
por frente, con contexto propio y aislado, sobre su propio worktree**. La correspondencia es
estricta: **1 frente = 1 worktree = 1 sesión**.

- **Cómo se "abre una sesión por frente":**
  - **Dentro de una sesión orquestadora** (la del PMO): el Ejecutivo **despacha un subagente por
    frente** (Agent tool / `Task`); **cada subagente ES la sesión aislada** de ese frente —contexto
    propio, corriendo en el worktree del frente, entregando en su rama—. Es la forma nativa de
    "una sesión por frente" dentro de un mismo proceso de Claude Code.
  - **Desde el móvil / Dispatch:** equivale a **abrir N sesiones `claude` separadas**, una apuntada
    a cada worktree. Mismo contrato: contexto por frente, sin compartir sesión.
- **El PMO/Ejecutivo es su propia sesión** (sobre `main`): orquesta, asigna y es el **único** que
  integra. No toma un frente de punta a punta.
- **La coordinación entre sesiones viaja por el REPO, no por el chat.** Cada sesión de frente
  arranca leyendo su bocado del repo (`## Sprint activo`, `ESTADO-FRENTES.md`) y deja su resultado
  en el repo (rama + estado). El repo es la memoria compartida; la sesión, no.
- **Única excepción (fallback):** si el entorno **no puede spawnear sesiones nuevas** (sin laptop /
  sin capacidad de abrir sesiones), se degrada a **una sola sesión reutilizada en serie**, un tema
  por commit (`docs/SPRINT-MOVIL.md`). Es un degradado explícito, no el modo normal.

---

## Creación automática de sesiones + eje de paralelización (CANÓNICO)

Estas seis reglas son la ley del sprint. Rigen sobre todo lo demás de este documento.

1. **`sprint` crea las sesiones solo.** Al invocar `sprint`, el PMO **crea automáticamente** las
   sesiones aisladas (**1 frente = 1 worktree = 1 sesión**). **No se abren a mano** — el trigger las
   despacha.
2. **Se paraleliza POR CORE/DOMINIO, NUNCA por tenant.** Cada frente de desarrollo toma un **dominio
   del Core** —pagos, inventario/POS, caja, fiscal, plataforma— no un cliente. **Razón dura:**
   dominios distintos tocan archivos distintos → **mínimo solape de archivos y mínimos conflictos de
   merge**. Dos frentes sobre distinto dominio no chocan; dos frentes sobre el mismo dominio sí.
3. **El tenant NO es eje de paralelización de código.** El multi-tenant se resuelve **una sola vez**
   en la capa de **plataforma/RLS** (aislamiento por fila: `tenantId` + policies). No se abre una
   sesión de código por cliente: el código es común a todos los tenants.
4. **EXCEPCIÓN — delivery/operación por cliente SÍ.** El trabajo de **entrega/operación** de un
   cliente (onboarding, config, carga de datos, deliverables específicos) **sí puede tener su propia
   sesión por cliente**, porque **no toca el core compartido**. Distinción explícita:
   **core = por dominio; delivery = puede ser por cliente.**
5. **Lo compartido lo SECUENCIA el PMO en serie.** Los archivos transversales
   —`prisma/schema.prisma`, migraciones, auth/tenancy (`tenant.ts` / `rls.ts`)— **no** se reparten a
   dos frentes en paralelo: el PMO los **secuencia en serie** (uno entra, se integra, entra el
   siguiente) para que dos sesiones no peleen el mismo archivo.
6. **Capas fijas de toda corrida.** Todo `sprint` tiene estas capas:
   - **PMO (por encima)** — lidera, asigna cores, **secuencia lo compartido**, integra estrategia/
     roadmap/tablero (absorbe la función ejecutiva) y es **merge-master** a `main` (sobre `main`, sin
     worktree propio).
   - **N frentes de Desarrollo — uno por core.** Cores canónicos hoy: **Pagos · Caja ·
     Inventario/POS · Fiscal · Plataforma** (ver "Mapa de cores" abajo).
   - **Diseño/UX transversal** — capa **cross-cutting on-demand** (tokens, primitivos, branding por
     tenant), **no** un core: se levanta cuando hay trabajo de UI a lo ancho. **Calidad/tests** tampoco
     es core: cada dueño entrega su core en verde (regla "verde antes de commitear").

---

## Mapa de CORES: cada sesión es dueña de un core (eje de paralelización)

El código se reparte por **core de negocio** y **cada sesión es dueña de un core** de punta a punta
(arquitectura + producto + tests de ese core). La especialidad orienta pero no limita; lo que **no**
se hace es partir por tenant: el eje del código es el **core**, nunca el cliente (reglas 2–3). Un
tenant completo de punta a punta solo es unidad de sesión para **delivery/operación** (regla 4).

| Core (sesión dueña) | Alcance | Territorio de archivos (propio) | Worktree · rama |
|---|---|---|---|
| **Pagos** | adapters/gateway de cobros: Mercado Pago, checkout/seña, webhooks de cobro, conciliación | `src/plugins/mercadopago/`, `src/app/api/webhooks/mercadopago/`, `src/lib/mercadopago-*.ts`, preferencia/checkout | `estetica-erp-pagos` · `frente/pagos` |
| **Caja** | caja del POS + UX de operación de caja | `src/app/admin/caja/`, `src/lib/cash-*.ts` (apertura/cierre/arqueo/movimientos) | `estetica-erp-caja` · `frente/caja` |
| **Inventario/POS** | stock, productos, compras/reposición, proveedores | `src/lib/order-actions.ts`, `product-*`, POS/`pedidos`, compras (Supplier/PurchaseOrder) UI | `estetica-erp-inventario` · `frente/inventario` |
| **Fiscal** | ARCA/WSFEv1, facturación, certificados | `src/plugins/arca/`, `src/lib/invoice-core.ts`, `fiscal.ts`, `arca-dispatch.ts` | `estetica-erp-fiscal` · `frente/fiscal` |
| **Plataforma** | RLS/tenancy, performance, auth, observabilidad **+ reporting** | `src/lib/tenant*.ts`, `rls.ts`, `prisma/rls/`, `session.ts`, `capabilities.ts`, `authz.ts`, `getReportData`/`reportes/`, perf/obs | `estetica-erp-plataforma` · `frente/plataforma` |
| **PMO** (por encima) | estrategia, roadmap, tablero, **asigna cores**, **secuencia lo compartido (regla 5)** y **MERGE-MASTER** | — (trabaja sobre **`main`**) | **`main`** (esta sesión) |

> **Cross-cutting (no son cores):** **Calidad/tests** — cada dueño de core entrega con tests en verde
> (regla "verde antes de commitear"). **Diseño/UX transversal** (tokens, primitivos, branding por
> tenant) — se levanta como **sesión cross-cutting puntual** cuando hay UI a lo ancho, **no** es eje
> de paralelización.

El PMO no tiene worktree propio: **trabaja sobre `main`**, orquesta, **asigna cada core activo a una
sesión+worktree**, **secuencia en serie los cimientos compartidos** (schema/migraciones/auth-tenancy,
regla 5) y es el único que integra.

### Worktrees base (un worktree por core)
```
PMO (main)       C:/Users/mlloveras2/Documents/Claude/estetica-erp
Pagos            C:/Users/mlloveras2/Documents/Claude/estetica-erp-pagos         [frente/pagos]
Caja             C:/Users/mlloveras2/Documents/Claude/estetica-erp-caja          [frente/caja]
Inventario/POS   C:/Users/mlloveras2/Documents/Claude/estetica-erp-inventario    [frente/inventario]
Fiscal           C:/Users/mlloveras2/Documents/Claude/estetica-erp-fiscal        [frente/fiscal]
Plataforma       C:/Users/mlloveras2/Documents/Claude/estetica-erp-plataforma    [frente/plataforma]
```

---

## Mapa de secuenciación: cimientos compartidos (SERIE) vs PARALELO

Operacionaliza la regla 5. El paralelismo real depende de que los cores toquen **archivos
disjuntos**; donde comparten un **cimiento**, el PMO lo pasa a **serie**.

### 🔴 Cimientos compartidos → SERIE (un frente por vez, PMO secuencia)

| Cimiento | Archivos | Cores que lo tocan | Cómo se serializa |
|---|---|---|---|
| **Schema + migraciones** | `prisma/schema.prisma`, `prisma/migrations/` | Inventario (Supplier/PurchaseOrder/StockMovement), Fiscal (Invoice/Outbox), Pagos (tabla conciliación), Plataforma (feature_flag) | **un cambio de schema por vez**: el PMO integra uno, el siguiente hace `pull --rebase` antes de tocar el schema. La migración de cada core es una **carpeta nueva aditiva** que queda SIN aplicar (Gate 2). |
| **Auth / tenancy** | `tenant*.ts`, `rls.ts`, `session.ts`, `capabilities.ts`, `authz.ts` | **dueño: Plataforma**; el resto solo **consume** | capabilities/roles nuevos se **piden al dueño Plataforma** (no los agrega otro core). La **activación de RLS** reescribe cómo corre *toda* query → **ventana dedicada**: se integra sola y los demás cores rebasan sobre ella. |
| **God-files co-editados** | `src/lib/actions.ts` (histórico: choque ADR-024) | varios | serializar hunks; objetivo: **extraer lógica a módulos por core** para que deje de ser cimiento. |

### 🟢 Territorios disjuntos → PARALELO (corren a la vez sin pisarse)

| Core | Corre en paralelo porque… | Único contacto con un cimiento |
|---|---|---|
| **Pagos** | vive en `src/plugins/mercadopago/` + rutas de webhook propias | tabla de conciliación → **gate de schema** |
| **Caja** | `/admin/caja` + `cash-*.ts` propios; su schema (`add_cash_register`) **ya está en main** | ninguno pendiente |
| **Inventario/POS** | order/product/stock actions + UI de compras propios | Supplier/PurchaseOrder/StockMovement → **gate de schema** |
| **Fiscal** | `src/plugins/arca/` + invoice-core/fiscal.ts propios | Invoice/Outbox → **gate de schema** (ya escrito, sin aplicar) |
| **Plataforma** | perf/observabilidad/reporting sobre archivos propios | **ES dueño** del cimiento auth/tenancy → su activación RLS es, ella misma, un paso serializado |

### Orden sugerido de integración (PMO)

1. **Plataforma primero (contrato de tenancy):** cablear `rlsPrisma`/`tenantTransaction` como contrato
   que los cores nuevos usan al escribir queries (el cableado **no** cambia prod; la **aplicación** de
   RLS es Gate 2). Así todo core nuevo nace compatible con RLS.
2. **Gate de schema, de a uno:** Fiscal (Invoice/Outbox, ya escrito) → Inventario (Supplier/PO) →
   Pagos (conciliación) → Plataforma (feature_flag). Cada uno rebasa antes de tocar `schema.prisma`.
3. **Lógica de cada core, en paralelo, todo el tiempo:** adapters, UX y endpoints en su territorio
   propio no esperan a nadie; **solo el hunk de schema** de cada uno pasa por la cola serie.
4. **Migraciones a prod y RLS a prod = Gate 2** (acción del owner), al final, en bloque.

---

## Escalado: varios dominios (código) / clientes (delivery) en paralelo

El sprint **escala con la demanda**, no está fijo en 5. Se abren **tantos worktrees/sesiones como
haga falta**, pero el eje es el de la regla 2: **para código, uno por dominio/core** (pagos,
inventario/POS, caja, fiscal, plataforma…); **para delivery, uno por cliente** (regla 4). El PMO le
asigna a cada uno un squad por afinidad de especialidad, pero cualquier squad puede con cualquier
dominio.

- **Un worktree por unidad de trabajo paralela:** un **dominio del Core** (código), o un **cliente**
  (solo delivery/operación), tiene su propio worktree aislado → corren a la vez sin pisarse. Dos
  worktrees de **código nunca** se reparten el mismo dominio (pelearían los mismos archivos).
- **Nombrado:** código por dominio → `estetica-erp-<dominio>` / `frente/<dominio>` (ej.
  `estetica-erp-fiscal`, `estetica-erp-plataforma`). Delivery por cliente → `estetica-erp-<slug>` /
  `tenant/<slug>` (ej. `estetica-erp-magra`), y **solo** para onboarding/config/datos, **no** para
  tocar el Core compartido.
- **Está OK abrir de más.** Si se crean más worktrees/sesiones de los que se terminan usando, no
  pasa nada: los que sobran quedan ociosos (no molestan, se remueven en la consolidación). Preferir
  capacidad de sobra a quedarse corto.
- **Crear un worktree nuevo en caliente:**
  `git worktree add ../estetica-erp-<nombre> -b <frente/x|tenant/slug>` desde `main` (el PMO lo
  hace al asignar). Recordá `npm install` en el worktree nuevo antes de correr tsc/build/test.

> **Regla:** el paralelismo lo habilita el **aislamiento por worktree**, no la cantidad de squads.
> 5 squads son la base de especialidades; la cantidad de *worktrees activos* la fija cuántos
> **dominios (código)** y **clientes (delivery)** estén corriendo en simultáneo (reglas 2 y 4).

---

## Reglas de operación (innegociables)

- **Cada equipo en SU worktree/zona.** Nadie edita fuera de su dominio ni toca `main` salvo el
  Ejecutivo/PMO. El aislamiento por worktree hace el paralelo seguro.
- **Un tema por commit**, atómico, con el *porqué* en el mensaje.
- **Verde antes de commitear:** `tsc --noEmit` + `npm run build` (+ `npm test` si el equipo tocó
  lógica cubierta) en verde **antes** de cada commit.
- **`git pull --rebase` antes de mergear/integrar.** El Ejecutivo/PMO integra cada rama a `main`
  **de a una, en orden**, resolviendo conflictos, re-verificando (tsc+build+test) y pusheando. Los
  equipos **no** mergean a `main` solos.
- **⚠️ `node_modules` no viaja al worktree** (gitignore; `git worktree add` solo saca lo
  versionado). Cada worktree necesita **`npm install`** (corre `prisma generate`) una vez antes de
  poder correr tsc/build/test. No copiar `node_modules` a mano — instalar limpio.
- **Gates intactos:** deploy a prod/Netlify y `prisma migrate deploy` son **acción humana del
  owner**. Cualquier migración se deja como **carpeta nueva SIN aplicar**, marcada "pendiente
  acción humana" (`docs/METODOLOGIA-REPORTE-AVANCE.md`).
- **Estados canónicos de avance** (`docs/METODOLOGIA-REPORTE-AVANCE.md`): 🟢 Avanzable ya · ✅
  Completado — pendiente acción humana · 🔒 Gated. El % mide **lo nuestro**; la ejecución con datos
  reales (ARCA/MP/WhatsApp/RLS) es acción humana, no deuda.

---

## Protocolo móvil (las 4 palabras)

| Palabra | Qué hace |
|---|---|
| **`sprint`** | El PMO toma el rol de socio gerente ejecutivo, **releva qué dominios/cores hay activos** y **crea automáticamente una sesión de Claude Code aislada por cada frente** (1 frente = 1 worktree = 1 sesión; capas fijas PMO/Diseño/Ejecutivo + N frentes de Desarrollo **por dominio**, regla 6), **nunca a mano ni una sola sesión compartida**. El eje es el **dominio, no el tenant** (reglas 2–4); lo compartido lo **secuencia el PMO** (regla 5). Asigna a cada frente su bocado y arranca. Está OK abrir de más. |
| **`status`** | Estado **real del repo** (no de memoria): lee `docs/ESTADO-FRENTES.md` + `## Sprint activo` de `SPRINT-MOVIL.md` + `git log`, y responde en lenguaje de dueño con los estados canónicos. |
| **`seguimos`** | Retoma desde el handoff vivo (`## Sprint activo → Próximo bocado` de cada frente) sin re-preguntar el plan. |
| **`pausa`** | Frena, **consolida** (main limpio y pusheado, ramas integradas o anotadas, handoff al día) y queda a la espera. |

**El repo es la memoria.** Cada equipo deja su estado en el repo (rama + `## Sprint activo` +
`ESTADO-FRENTES.md`), así "status"/"seguimos" reconstruyen todo sin leer el chat. **Sin laptop /
si no se pueden abrir sesiones nuevas:** se degrada a **una sola sesión reutilizada, en serie** (un
tema por commit), que es el fallback documentado en `docs/SPRINT-MOVIL.md`.

---

## Ciclo de un sprint (de principio a fin)

1. **`sprint`** → PMO releva los **dominios/cores** activos y **crea automáticamente** un
   worktree+sesión por cada frente de desarrollo (por dominio, regla 2) + las capas fijas
   (PMO/Diseño/Ejecutivo, regla 6); los clientes en delivery van en su propio worktree (regla 4).
   Asigna cada unidad a un squad y arranca.
2. Cada squad trabaja en su rama, sobre su desarrollo/tenant de punta a punta: un tema por commit,
   verde antes de cada uno, push de su rama.
3. **PMO integra** las ramas a `main` en orden (rebase + verificación + push), mantiene el tablero.
4. **`status`** en cualquier momento → foto real. **`seguimos`** → retoma. **`pausa`** → consolida.
5. Al cerrar: `main` limpio y pusheado, ramas integradas o su estado anotado, worktrees ociosos
   removidos, `ESTADO-FRENTES.md` y `## Sprint activo` al día. Los gates quedan listos para el "sí".

---

## Mantener esto honesto
Documento vivo. Si cambia el modelo de sprint (equipos, worktrees, protocolo), este doc y
`.claude/commands/sprint.md` se actualizan en el mismo commit; si divergen, es un hallazgo para
`/sesion-consolidacion`. La mecánica canónica de sesiones sigue en `docs/TABLERO-SESIONES.md`.
