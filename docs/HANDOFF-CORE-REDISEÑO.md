# 🤝 HANDOFF — para la sesión que rediseña el CORE (motor + función de módulos)

> **Para quién:** la sesión (en paralelo) que está **rediseñando el core del back con función de módulos**.
> Esa sesión **no sabe** qué hay en vuelo en las otras ramas. Este documento es el mapa: qué está abierto,
> qué toca cada rama, dónde va a haber conflicto, qué invariantes **no podés romper**, y en qué orden conviene
> mergear cuando el core aterrice.
>
> **Fecha:** 2026-07-12 · **Autor:** GSG (sesión de consolidación) · **Base:** `origin/main` = `aacd640`.
> **Regla:** si algo acá choca con el repo, gana el repo. Verificá los HEAD con `git log`/`git branch -r`
> antes de operar — las ramas se mueven.

---

## 0. TL;DR (leé esto aunque no leas nada más)

0. **🏛️ Ante incongruencia entre el modelo viejo y el rediseño del core, GANA SIEMPRE el core / el modelo
   nuevo** (decisión del dueño, 2026-07-12). Vos tenés vía libre para cambiar estructura. **Única excepción a
   confirmar con el dueño:** no *eliminar* las **garantías** de integridad de plata/stock (I1–I7) ni el
   **aislamiento entre clientes** (RLS) — podés cambiar **cómo** se implementan, no **que** protejan. Detalle
   en §0.bis.
1. **`main` auto-deploya a producción** (4 apps en vivo, **clientes reales adentro**). Cada merge a `main` es
   un deploy real. **Migración SIEMPRE antes del merge; nada entra sin Gate verde.** Ver [ADR-091](adr/ADR-091-main-auto-deploya-a-produccion.md).
2. **El core NO puede romper los invariantes I1–I7** ([ADR-064](adr/ADR-064-nucleo-transaccional-ledger-invariantes.md)).
   **I2** (comprobante↔venta 1:1) e **I7** (venta+caja atómica) **ya se cerraron con una migración aplicada
   en prod** — el índice único existe (`20260710120000_invoice_origin_idempotency_unique`). Si tocás
   `invoice-core`/`order-core`, **preservalos** o los reintroducís rotos.
3. **RLS está enforced de verdad en prod**: 43/43 tablas con policy, flag on, rol `app_rls` `NOBYPASSRLS`.
   **Toda tabla nueva con `tenantId` necesita su policy en el mismo release** o el chequeo de cobertura falla.
   Ver [ADR-092](adr/ADR-092-rls-enforced-en-prod.md).
4. **La rama de mayor riesgo para vos es `fix/sprint-entregable`** — toca `invoice-core`, `order-core`, caja
   y `schema.prisma` con fixes de concurrencia. **Coordiná primero con ella** (§2, §4).
5. **Orden de merge propuesto en §4.** Resumen: los fixes de core (`fix/sprint-entregable`) **antes** que el
   rediseño (o el rediseño los absorbe); los fronts entran cuando quieran (no tocan core); el backoffice de
   carnicería entra **después** del core, rebasado.

---

## 0.bis 🏛️ Regla de gobernanza — quién gana ante incongruencia (decisión del dueño, 2026-07-12)

**Regla:** cuando el **modelo viejo** (lo que hay hoy en `main` y en estas ramas) **choca** con el **rediseño
del core / el modelo nuevo**, **GANA SIEMPRE el core.** No tenés que pedir permiso para cambiar tablas,
nombres, estructura o flujos: la dirección de producto es tuya. El resto de este handoff es **contexto para
que no rompas lo que no querés romper**, no una atadura a la implementación vieja.

**Única excepción — hay que CONFIRMARLA con el dueño, no asumirla:** el core puede cambiar **cómo** se
implementan, pero **no debería *eliminar*** estas dos **protecciones** (distinto de su implementación):

1. **Integridad de plata y stock** — que una venta no deje la caja/el stock/el comprobante en estado
   inconsistente (el *espíritu* de los invariantes I1–I7, ADR-064). Cambiá libremente las tablas y el
   mecanismo; **conservá la garantía**.
2. **Aislamiento entre clientes** — que un tenant **nunca** vea datos de otro (RLS, ADR-062/092). Cambiá el
   esquema; **conservá el aislamiento**.

**Cómo tratar el borde:**
- Si tu rediseño cambia la **implementación** de una garantía (otras tablas, otro nombre, otra estructura) →
  **adelante, gana el core**, sin discusión.
- Si tu rediseño **obsoleta la protección misma** (p. ej. "ya no hace falta RLS porque…", "la atomicidad
  venta+caja ya no aplica porque…") → **eso NO se asume: se eleva al dueño y se discute.** Ante la duda de si
  estás tocando *implementación* o *protección*, tratalo como protección y preguntá.

**Regla práctica no negociable mientras la excepción no se confirme:** **toda tabla nueva con `tenantId`
necesita su policy de RLS en el mismo release**, o el chequeo de cobertura (`prisma/rls/check-coverage.mjs`)
falla **y se abre una fuga entre clientes reales**. Es barato y es la red de seguridad — no lo dejes para "después".

---

## 1. Inventario de ramas abiertas (verificado 2026-07-12)

> HEAD `git rev-parse --short`; ahead/behind vs `origin/main` (`aacd640`). Las ramas locales (sin `origin/`)
> viven en worktrees del dueño y **no están pusheadas** — pedí el push antes de depender de ellas.

| Rama | HEAD | ahead/behind | Qué toca | Riesgo de conflicto con el core |
|---|---|---|---|---|
| **`fix/sprint-entregable`** ⚠️ (local) | `32e191b` | 19 / 1 | **Fixes de concurrencia:** `invoice-core.ts`, `order-actions.ts`, `order-core-guards`, `caja-actions.ts`, `caja/cash-sale.ts`, `invoice-from-mp.ts` + **`schema.prisma`** + tests de carrera (doble-submit, colisión de code, unicidad de venta-caja) | **🔴 ALTO** — es exactamente el código del núcleo transaccional que el rediseño reescribe. **Coordinar sí o sí.** |
| **`producto/magra-backoffice`** | `700d421` | 6 / 2 | Catálogo rubro-aware carnicería: **nuevo módulo `src/lib/carniceria/`** (cortes, despiece, lotes) + `product-extras.ts` (**toca el modelo de producto**) + pantallas `/admin/{catalogo,despiece,lotes,inventario}` + `AdminShell`/`layout` + **`prisma/pending-gate2/CarniceriaRubro.sql`** (migración NO aplicada) | **🟡 MEDIO** — mayormente aditivo (módulo nuevo), pero `product-extras` y el layout tocan superficie compartida. Rebasar **después** del core. |
| **`diseno/magra-front`** | `47666cc` | 6 / 1 | Front público de MAGRA + **fix del acceso admin en la vidriera genérica** (el link a `/admin` faltaba en el layout `(site)` — afecta a los 3 tenants retail: Magra/Shine/ADM) | **🟢 BAJO** — front + layout de vidriera, no toca el motor. |
| **`diseno/velas-fable`** | `43c2f32` | 6 / 1 | Front de **Shine Velas** (`storefront.ts` + `tenant-layout.ts`, detrás de `TENANT_FIDELITY_ENABLED`) | **🟢 BAJO** — presentación por tenant; cero motor. |
| **`diseno/ch-premium-v4`** | `60204bd` | 6 / 1 | Diseño premium de **CH Estética** (vidriera) | **🟢 BAJO** — front. |
| **`fiscal/consola-cuit`** | `b2883fb` | 1 / 0 | Campo de **CUIT en la consola de operador** (cierra el gap del runbook ARCA §3.b: hoy `/operador/tenants/[id]` avisa que falta `arcaCuit` pero no lo setea) | **🟢 BAJO** — consola de operador (plano de plataforma), no el core del tenant. |
| **`seguridad/gate-rls-cumplido`** (local) | `949d330` | 35 / 1 | **Evidencia** del gate RLS del 2º tenant (docs de seguridad) | **🟢 NULO** — doc/evidencia. |
| **`qa/*`** (`qa/magra-e2e`, `qa/superficies-cliente`, `qa/ch-estetica-e2e`) | varios | — | **Reportes de QA** end-to-end (bugs de escritura, aislamiento, superficies) | **🟢 NULO** — doc/reportes. |
| `feat/imagen-ia` | (origin) | — | Capacidad compartida de **generación de imágenes por IA** multi-proveedor (`src/lib/imagen/`) — ver [ADR-094](adr/ADR-094-generacion-de-imagenes-por-ia.md) | **🟢 BAJO** — módulo aislado nuevo, sin tocar el motor. |

**Otras ramas vivas (no en la lista del dueño, contexto):** `fase2/consola-operador` (rama de esta sesión de
origen), `fase2/aceitar-alta`, `fase2/fabrica-tenants` (fábrica de altas — [ADR-095](adr/ADR-095-fabrica-de-altas-estado-honesto.md)),
`frente/facturacion-arca`, `core/pagos`. La mayoría ya reflejadas en `main`.

---

## 2. Invariantes que el CORE NO puede romper (lo crítico)

### 2.1 Núcleo transaccional I1–I7 (ADR-064)
El rediseño **hereda** estos gates. Estado **real hoy** (varios cerrados desde el snapshot 07-10 que decía I2/I7 rojos):

| Inv. | Qué garantiza | Estado real 2026-07-12 | Cómo lo rompés (evitar) |
|---|---|---|---|
| I1 | Σ movimientos = saldo (reconstruible desde el ledger) | 🟡 parcial | mutando `Product.stock` fuera de `recordMovement` (`src/lib/stock/ledger.ts`) |
| **I2** | **Comprobante ⇔ venta (1:1)** | **🟢 CERRADO** — índice único **aplicado en prod** (`20260710120000_invoice_origin_idempotency_unique`) | quitando el índice único o insertando factura sin la clave de origen (`invoice-from-mp.ts`/`invoice-core.ts`) |
| I3 | Stock nunca negativo sin autorización | 🟢 verde | quitando la guarda atómica `stock: { gte: -delta }` |
| I4 | Toda la plata pasa por la calculadora central | 🟡 parcial | agregando cálculos de dinero fuera de `round.ts`/calculadoras |
| I5 | Cobro parcial nunca sobre-cobra | 🟢 verde | — |
| I6 | Redondeo único EPSILON-safe (`round2`) | 🟢 verde | reintroduciendo un 2º redondeo |
| **I7** | **Venta al contado atómica (orden+stock+cobro+caja)** | **🟢 CERRADO** — venta+caja en una transacción | separando la caja a una tx aparte (era la causa raíz del rojo) |

> **Regla dura:** si el rediseño toca `invoice-core`/`order-core`/`caja`, **corré los tests de invariante
> ANTES de mergear** (`order-core-guards.test.ts`, `invoice-core.test.ts`, `cash-sale-unique.test.ts`,
> `caja-open-concurrency.test.ts`). El fix que los cerró vive en **`fix/sprint-entregable`** (§4): si el core
> parte de `main` sin absorberlo, verificá que no reintroducís las carreras que esa rama arregló.

### 2.2 RLS (ADR-062 / ADR-092) — línea base NO negociable
- **43/43 tablas con `tenantId` protegidas** por la policy `tenant_isolation` (`prisma/rls/0001_enable_rls.sql`).
  El chequeo de cobertura (`prisma/rls/check-coverage.mjs`) **falla** si aparece una tabla de-tenant sin policy.
- **Toda tabla nueva con `tenantId` necesita su policy en el MISMO release.** Si el rediseño agrega entidades
  (módulos, asignaciones), agregá su policy en `0001_enable_rls.sql` y re-corré el check → o el gate te frena.
- El rol `app_rls` es `NOBYPASSRLS`. El rol legacy **`app_user` (BYPASSRLS) NUNCA debe usarse como
  `DATABASE_URL`** — es un footgun conocido (§5, deuda).

### 2.3 Deploy / release
- **`main` auto-deploya a producción** (ADR-091). 4 apps en vivo: `magra-erp`, `chestetica-erp`,
  `shinevelas-erp`, `adosmanos-erp`. → **migración aplicada ANTES del merge**, nunca `main` schema-ahead de la
  DB (fue la causa del incidente CH del 07-09).
- **Gate visual + contraste AA son BLOQUEANTES** (ADR-090): si una página se ve rota o ilegible, el gate
  falla aunque `tsc`/tests/build estén verdes. *"Lo que es cosmético para el cliente es crítico."*
- Nada entra a `main` sin el **Gate de Excelencia** (ADR-040), auditado en Opus.

---

## 3. Nota de arquitectura para el rediseño con "función de módulos"

El dueño ya fijó dirección de producto en [**ADR-089**](adr/ADR-089-nucleo-mas-modulos-instalables-por-producto.md)
(núcleo mínimo + módulos instalables, App Store por tenant) sobre la fundación de **ADR-054** (repositorio de
plugins / catálogo de módulos) y **ADR-055** (principio de VARIANTE: el objeto se crea una vez y se **asigna**
con su propio ABM). Si tu rediseño formaliza la "función de módulos", **construí sobre esos ADR**, no en paralelo:

- El motor **no** debe tener `if producto` (ADR-061): si aparece, falta un eje de configuración
  (módulo/flag/perfil/blueprint).
- Módulo↔tenant es una **asignación con ABM** (ADR-055), no "todos con todo". La fundación está en `src/modules/`
  detrás de `MODULE_REGISTRY_ENABLED` (default OFF).
- Cualquier tabla nueva del registro de módulos que lleve `tenantId` → **policy RLS en el mismo release** (§2.2).
- La nav/Inicio se **componen de lo instalado** (`Tenant.modules`), nunca hardcodeado (ADR-089 §2).

---

## 4. Orden de merge propuesto (para cuando el core aterrice)

Objetivo: **minimizar conflicto** y que el core parta de una base con los invariantes ya cerrados.

**Fase A — antes de/junto con el core (resolver el conflicto duro primero):**
1. **`fix/sprint-entregable`** → la decisión es del dueño y de la sesión del core: **(a)** mergear a `main`
   PRIMERO (es un bugfix chico que cierra carreras reales y preserva I2/I7) para que el rediseño rebase sobre
   una base correcta; **o (b)** que la sesión del core **absorba** esos fixes en el rediseño. Lo que **no**
   hay que hacer es mergear el core y después el fix por encima — reintroduciría las carreras en medio del
   refactor. ⚠️ Toca `schema.prisma` → coordinar la migración.

**Fase B — independientes del core (no tocan el motor, entran cuando quieran, en cualquier orden):**
2. `diseno/ch-premium-v4`, `diseno/velas-fable`, `diseno/magra-front` (con el **fix de acceso admin** en la
   vidriera genérica — beneficia a los 3 retail). Fronts/layout de vidriera, cero motor.
3. `fiscal/consola-cuit` — campo de CUIT en la consola (plano de operador). Chico, cierra un gap del runbook ARCA.

**Fase C — después del core (rebasar sobre el core ya mergeado):**
4. **`producto/magra-backoffice`** — nuevo módulo `src/lib/carniceria/` + `product-extras.ts` (toca el modelo
   de producto) + `prisma/pending-gate2/CarniceriaRubro.sql` (**Gate 2**, migración sin aplicar). Rebasar
   **después** del core porque comparte superficie de producto/layout; su migración se aplica en su propio
   release (nunca `main` schema-ahead). Ver la brecha vs Bistrosoft en [ADR-096](adr/ADR-096-rubro-carniceria-magra-vs-bistrosoft.md).

**Fase D — evidencia/QA (doc, sin conflicto, se pliega al final o a esta consolidación):**
5. `seguridad/gate-rls-cumplido`, `qa/*` — reportes y evidencia. Sin riesgo.

> **Regla transversal para cada merge:** migración aplicada antes → Gate de Excelencia en Opus (incl. gate
> visual + AA + cobertura RLS) → merge → verificar que las 4 apps siguen 200. Nada de esto lo corre esta
> sesión: el merge es decisión del dueño.

---

## 5. Deuda conocida que el core hereda (no la reintroduzcas, y si podés, cerrala)

- **Colisión de timestamp de migración:** `20260711140000_add_cartera_cliente` **y**
  `20260711140000_add_tenant_fiscal_credential` comparten timestamp. Prisma las ordena por nombre de carpeta
  (determinista), pero es exactamente el patrón que CLAUDE.md marca como riesgo. **No agregues una tercera con
  ese timestamp.**
- **Loaders `/admin` sin filtro `tenantId` explícito** (A-3 latente): RLS los cubre como red de seguridad,
  pero son latentes, no fuga viva. Si el rediseño reescribe loaders, **agregá el predicado `tenantId`**.
- **`.env` local apunta al owner de PROD** (footgun): el `DATABASE_URL` de desarrollo del dueño usa el rol
  owner contra la base productiva. Cuidado con correr scripts que escriban.
- **`app_user` legacy con BYPASSRLS** sigue existiendo; revocarlo es pendiente pre-cobros (§2.2).
- **🔴 Bugs de concurrencia en flujos de escritura (severidad ALTA — hay CLIENTES REALES adentro, no es
  hipotético):** pedido duplicado por doble-click, doble asiento de caja, sobre-devolución. Los cerró
  `fix/sprint-entregable` (doble-submit, colisión de `code`, idempotencia caja/MP, sobre-devolución) pero esa
  rama **no está en `main`**. MAGRA/Shine/A Dos Manos **ya están cargando datos** (son clientes, no trials — ver
  ESTADO §3): un doble-click hoy puede duplicar una venta real. Si el core reescribe estos flujos, **portá las
  guardas sí o sí**; si no reescribe, hay que mergear `fix/sprint-entregable` igual.
- **Lint rojo heredado** en `main` (deuda pre-existente, no bloquea el build de Turbopack).

---

## 6. Punteros

- Estado real de hoy: [`docs/ESTADO-ACTUAL.md`](ESTADO-ACTUAL.md) + [`docs/ESTADO-Y-ROADMAP.md`](ESTADO-Y-ROADMAP.md).
- ADRs de esta consolidación: **090–096** (índice en [`docs/adr/INDEX.md`](adr/INDEX.md)).
- Invariantes: [ADR-064](adr/ADR-064-nucleo-transaccional-ledger-invariantes.md) · RLS: [ADR-062](adr/ADR-062-rls-pool-shared-schema-linea-base.md)/[ADR-092](adr/ADR-092-rls-enforced-en-prod.md).
- Módulos: [ADR-054](adr/ADR-054-repositorio-de-plugins-catalogo-de-modulos.md)/[ADR-055](adr/ADR-055-principio-de-variante-objeto-maestro-asignacion.md)/[ADR-089](adr/ADR-089-nucleo-mas-modulos-instalables-por-producto.md).
- Fiscal por tenant: [ADR-066](adr/ADR-066-credenciales-fiscales-por-tenant.md)/[ADR-093](adr/ADR-093-credenciales-fiscales-por-tenant-implementacion.md) + runbook [`docs/runbooks/arca-homologacion.md`](runbooks/arca-homologacion.md).

— Elaborado por GSG
