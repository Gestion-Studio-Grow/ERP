# 🧭 GSG — ESTADO Y ROADMAP (documento de entrada)

> **Este es EL documento para retomar.** Foto actual + roadmap Fase 1–5 + semáforos + decisiones que esperan tu
> firma. Si abrís una sesión nueva, empezá **acá**. Para el detalle: `docs/ESTADO-ACTUAL.md` (foto operativa),
> `docs/estrategia/fundacional-DEFINITIVO-v2.md` (síntesis fundacional), `docs/estrategia/fundacional-index.md`
> (las 12+2 ADRs), `docs/PRACTICA-DE-GUARDADO.md` (que no se pierda nada).
>
> **Fecha:** 2026-07-12 · **Autor:** GSG (consolidación) · **Regla:** si algo choca con el repo, gana el repo.

> **🔁 RECONCILIACIÓN 2026-07-12 (consolidación 0712).** Foto corregida al repo/prod real. Cambios grandes desde 07-10:
> - **`main` real = `aacd640`** (era `93eae5f`) — landearon: invariantes **I2/I7 cerrados** con índice único aplicado, **suite de facturación** (ADR-075–080), **producto por módulos** (ADR-089), **cert fiscal por tenant** aplicado.
> - **RLS ENFORCED en prod = CONFIRMADO** (ya no "A CONFIRMAR"): flag on + **43/43 policies** + `app_rls` NOBYPASSRLS ([ADR-092](adr/ADR-092-rls-enforced-en-prod.md)). **Gate del 2º tenant CUMPLIDO → alta de clientes DESBLOQUEADA.**
> - **`main` AUTO-DEPLOYA a producción** ([ADR-091](adr/ADR-091-main-auto-deploya-a-produccion.md)) — corrige la creencia anterior; cada push a `main` publica a 4 apps. Migración SIEMPRE antes del merge.
> - **Credenciales fiscales por tenant** implementadas y **migración aplicada a prod** ([ADR-093](adr/ADR-093-credenciales-fiscales-por-tenant-implementacion.md)); ARCA en homologación fail-safe (runbook `arca-homologacion.md`).
> - **Gate de render visual + AA** ahora bloqueante ([ADR-090](adr/ADR-090-gate-de-render-visual-y-calidad-de-superficie.md)).
> - **🏛️ Gobernanza (dueño 2026-07-12):** ante incongruencia modelo viejo ↔ **rediseño del core**, **gana el core**; única excepción a confirmar: no eliminar las garantías de integridad (I1–I7) ni el aislamiento (RLS).
> - **👥 MAGRA/Shine/A Dos Manos son CLIENTES reales (no trials)** — ya cargan datos; el `TRIAL` de la base es técnico. Bugs de concurrencia = severidad ALTA.
> - **🖥️ Consola de operador = app propia `gsg-erp`** (`gsg-erp.vercel.app/operador/login`).
> - **🤝 Para la sesión que rediseña el core:** leer **[`docs/HANDOFF-CORE-REDISEÑO.md`](HANDOFF-CORE-REDISEÑO.md)** (inventario de ramas + invariantes + orden de merge + regla de gobernanza).

---

## 1. Foto actual (una pantalla)

- **Repo:** `https://github.com/Gestion-Studio-Grow/ERP.git` (origin). **`main` real = `aacd640`.**
- **Fundación consolidada** en la rama **`fundacion/consolidacion-diseno`** (sacada de `rf6x0m`, **en origin**),
  pendiente de **merge a `main` (Gate del dueño)**. Contiene ADR-060..073, síntesis DEFINITIVO v2, comercial/Mariano,
  diseño (ADR-072/073 + mockups MAGRA), y la ingesta del bundle de recuperación.
- **Prod:** CH Estética vivo en Vercel. **Incidente 2026-07-09 (resuelto):** CH cayó por `main` *schema-ahead* de
  su DB; mitigado con 2 hotfixes defensivos (`ad3202c`, `93eae5f`). **Causa raíz abierta:** aplicar migraciones §C
  (Gate 2) **antes** de cualquier deploy de `main` a CH.
- **Tenants:** 4 provisionados en Neon (CH, Magra, Shine, A Dos Manos), aislamiento verificado; solo CH deployado.
- **Producto:** dos líneas (**Comercio Micro** / **PyME-Empresa**) sobre motor compartido; motor del Micro **ya anda**
  (POS, caja, catálogo, facturación sandbox). Madurez del sistema ~**65%** (refactor, no reconstruir — ADR-063).

## 2. Semáforos

### 2.1 Núcleo transaccional — invariantes I1–I7 (ADR-064)
| | Invariante | Estado |
|---|---|---|
| I1 | Σ movimientos = saldo (reconstruible desde el ledger) | 🟡 parcial (falta test de reconciliación) |
| I2 | Comprobante ⇔ venta (1:1) | 🟢 **CERRADO** — índice único **aplicado en prod** (`20260710120000_invoice_origin_idempotency_unique`) |
| I3 | Stock nunca negativo sin autorización | 🟢 verde |
| I4 | Toda la plata pasa por la calculadora central | 🟡 parcial (calc repartidas) |
| I5 | Cobro parcial nunca sobre-cobra | 🟢 verde |
| I6 | Redondeo único EPSILON-safe | 🟢 verde |
| I7 | Venta al contado atómica (orden+stock+cobro+caja) | 🟢 **CERRADO** — venta+caja en una transacción |

**Resumen:** I3/I5/I6 🟢 · **I2/I7 🟢 (cerrados, migración aplicada, ADR-064)** · I1/I4 🟡. Falta solo cerrar I1/I4 (reconciliación + unificar calculadoras). ⚠️ Los fixes de concurrencia adicionales viven en `fix/sprint-entregable` (ver HANDOFF §2).

### 2.2 Seguridad
| Ítem | Estado |
|---|---|
| RLS pool shared-schema (línea base, ADR-062) | 🟢 **43/43 policies** (subió de 38 al sumar fiscal+cartera) |
| RLS **enforced en vivo** en prod | 🟢 **CONFIRMADO 2026-07-12** — flag on + 43/43 + `app_rls` NOBYPASSRLS ([ADR-092](adr/ADR-092-rls-enforced-en-prod.md)); **gate 2º tenant CUMPLIDO → alta desbloqueada** |
| Loaders `/admin` sin filtro `tenantId` explícito (A-3) | 🟡 **latente, no fuga** (RLS los cubre); agregar predicado al reescribir |
| Aislamiento de tenant en crons async | 🟢 `reminders`+`arca-outbox` cerrados (`1036b2c`); webhook MP con TODO |
| Rol legacy `app_user` con `BYPASSRLS` | 🔴 revocar (pre-cobros); **jamás** como `DATABASE_URL` |
| `.env` local apunta al owner de PROD | 🔴 footgun (cuidado con scripts de escritura) |
| Rotación de secretos + **PITR** (ADR-067) | 🔴 pendiente (pre-cobros) |
| Credenciales fiscales por tenant (ADR-066) | 🟢 **implementado + migración aplicada** ([ADR-093](adr/ADR-093-credenciales-fiscales-por-tenant-implementacion.md)); cifrado en sobre + guard fail-closed |

### 2.3 Diseño (ADR-072 / ADR-073)
| Ítem | Estado |
|---|---|
| Norte Apple×SAP + backoffice "Fable" congelado + ⌘K | 🟢 decidido (ADR-072) |
| Personalización = config, nunca fork + Creative Grow | 🟢 decidido (ADR-073) |
| Challenge "todo se ve igual" + 3 direcciones + paleta MAGRA | 🟢 documentado (fuentes + mockups) |
| Assets HTML aprobados (Fable claro/oscuro, Editorial, Nítido) | 🔴 faltan (rutas destino en `docs/estrategia/diseno/README.md`) |
| Motor de theming rico (tokens extendidos + slots + CSS-dato) | 🟡 [SUPUESTO] no verificado en código |

## 3. Roadmap Fase 1 → 5

- **Fase 1 — Endurecer la base (CASI CERRADA):** ✅ **I2/I7 cerrados** (migración aplicada), ✅ **RLS enforced verificado en vivo** (43/43). **Falta:** cerrar **I1/I4** (reconciliación + unificar calculadoras) + revocar `app_user` legacy + portar los fixes de `fix/sprint-entregable`. **Salida:** núcleo transaccional firmable por el consultor.
- **Fase 2 — Primer cliente en vivo:** salir con **Comercio Micro** (`docs/estrategia/resumen-ejecutivo-primer-cliente.md`,
  7 pasos); fábrica de tenants operable (dry-run + saga, ADR-065).
- **Fase 3 — Micro vendible + preset IA self-serve:** el alta se auto-sirve (ADR-058 P5 / ADR-034).
- **Fase 4 — Separación de bases + producto Empresa:** construir la separación de ADR-060 (Gate), DR/cumplimiento (ADR-067).
- **Fase 5 — Escala:** catálogo de módulos por rubro (ADR-054/055), analytics cross-tenant (ADR-027), canal de contadores.

## 4. ⛳ Decisiones que esperan tu firma

| # | Decisión | Tipo |
|---|---|---|
| 1 | **🤝 Coordinar el merge del REDISEÑO DEL CORE** con las ramas en vuelo — ver `docs/HANDOFF-CORE-REDISEÑO.md` (orden de merge §4) | Gate |
| 2 | **ARCA homologación:** setear `ARCA_MODO=homologacion` en Vercel (4 apps) + CUIT por tenant + **cargar el cert de prueba** por consola — runbook `arca-homologacion.md` | Dueño |
| 3 | **Candado 2 (facturación):** de homologación → real requiere cert productivo por tenant + `ARCA_MODO=real` | Gate 4 |
| 4 | Revocar `app_user` BYPASSRLS + rotar secretos + PITR (pre-cobros) | Seguridad |
| 5 | **Proteger `main` en GitHub** (branch protection) + **mirror/backup** | GitHub |
| 6 | **Cutover a producción por tenant** (salida a vivo UAT→prod): accesos reales + reset de datos de UAT + ARCA real + `TRIAL`→`ACTIVE`. Checklist: `docs/runbooks/CUTOVER-POR-TENANT.md` | Proceso |
| 7 | Aportar los 4 HTML de diseño que faltan (Fable claro/oscuro, Editorial, Nítido) | Material |
| 8 | Confirmar rol/pricing de Mariano y validar números comerciales | Comercial |

> **Candado 1 (alta de clientes) = ABIERTO** desde 2026-07-12 (gate 2º tenant cumplido, ADR-092). **Candado 2
> (facturación real) = abierto a medias:** homologación lista (cert por tenant implementado, ADR-093); falta que
> el dueño cargue cert + setee `ARCA_MODO`, y luego el salto a real.

> **Ningún irreversible se corre solo.** Este documento + los runbooks son el guion; los Gates los abrís vos.

— Elaborado por GSG (PMO)
