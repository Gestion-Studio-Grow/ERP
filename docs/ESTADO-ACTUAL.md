# ESTADO ACTUAL — la foto completa (para retomar sin perderse)

**Qué es:** la foto viva del sistema para arrancar cualquier sesión/sprint sin re-descubrir el
contexto. La **produce/actualiza el PMO en la FASE 0 (Exploración)** y se **re-taggea en la FASE
FINAL (Backup)** (ver `docs/METODOLOGIA-SPRINT.md`). **Si abrís una sesión nueva y pegás tu prompt,
este documento es la fuente de verdad para continuar exactamente desde acá.** Si algo no coincide con
el repo/prod, gana el repo y este doc se corrige en el acto.

- **Actualizado:** 2026-07-08 (FASE 0 reconciliación de drift, PMO) · **Autor:** PMO (sesión autónoma)
- **Método:** barrido del repo (`git log`, `git worktree list`, `prisma/migrations/`, `.claude/`,
  `docs/`) + reconciliación del drift acumulado. **NO se consultó Neon prod** (política: diagnóstico,
  no tocar prod/DB) → el estado de migraciones *aplicadas* se deriva de docs y se marca "a confirmar".
- **Reconciliación de esta pasada (2026-07-08):** el doc traía drift interno — el HANDOFF ya marcaba F1
  mergeado (`debb3c5`) pero el §1 y §8 seguían en el snapshot viejo. **`main` real = `6c88719`** (F1
  vidrieras + GSG Lab + ritual `/status` + roster materializado en `.claude/agents/`). Se reconcilió:
  **(1)** §1 `main HEAD` `29e9dcb` → **`6c88719`**; **(2)** §8 `.claude/agents/` "NO existe" → **18 agentes
  materializados**; **(3)** §7-bis F1 marcado **MERGEADO**. *(Este clon remoto trae solo `main` + la rama de
  sesión; las ramas/tags WIP de §7 viven en el entorno local del dueño, no en el remoto.)*
- **Reconciliación previa (2026-07-07):** el doc venía del snapshot `273a267` → `main` `29e9dcb`
  (~28 commits). Se reconcilió: HANDOFF viejo de Magra → **Plan de Ventana**; **Netlify → Vercel** (§2);
  RLS → **VIVO y enforced**. Detalle de qué landeó desde el snapshot en §1.

---

## 🚦 HANDOFF — próximo paso real (2026-07-07)

> **🧭 PUNTO DE PARTIDA — Rediseño del producto GROW-AR (2026-07-08, aprobado por el dueño).** Rama
> `claude/sprint-startup-generic-rf6x0m`, verde. Se rediseñó el producto y arrancó la ejecución:
> - **Filosofía GROW-AR (ADR-058):** un Core, **dos motores** (`lite` micro/comerciante ↔ `enterprise`
>   pyme), invariante **`enterprise ⊇ lite`** ("crecé sin migrar", upgrade aditivo). Baja al criterio rector
>   en `FUNDAMENTOS §10`.
> - **Personalización ASIMÉTRICA (ADR-058 P5, decisión del dueño):** micro → **preset-IA** (máxima
>   personalización, vende el self-serve); pyme → **estandarizar para dar carácter** (menos personalización
>   → baja mano de obra + anti-rechazo enterprise + identidad de marca).
> - **Reingeniería de interfaz (ADR-059):** aceptada **con los 3 fixes bloqueantes del Challenger** (ADR-045).
>   Perfil = dimensión ortogonal; IA de 5 grupos criollos; un design system **dos densidades**; tier en canal
>   **neutro** (el acento es del tenant); naming **"Comercio"/"Empresa"** (`lite`/`enterprise` nunca al cliente).
> - **Equipo agrandado:** 7 charters nuevos en `.claude/agents/` (Data/DBA · Release Manager · FinOps ·
>   Pricing · Soporte/CS · SRE · PO Catálogo/Plugins). Roster al día.
> - **▶️ EJECUCIÓN — PR-1/M1 LANDED (reversible, flag OFF):** motor de perfiles `src/modules/perfil.ts`
>   (`perfilGateAllows` + `visibleNavItems`) + `src/lib/profile-gating.ts` (`getActiveProfile` en memoria) +
>   flag `PROFILES_ENABLED` + **property-test del invariante de NAV** (`perfil.test.ts`). Vallas verdes
>   (**tsc + 577 tests**, +5). Cero DB, cero cambio de UI.
> - **▶️ EJECUCIÓN — PR-2/M2 LANDED en la rama del sprint (reversible, flag maestro OFF) + GATE (Opus, S5) PASA CON OBSERVACIONES (2026-07-08):** pool de 5 sesiones —
>   **S1** mapa de cobertura validado + corregido por revisión adversarial S5 (2F3/fiado → módulo de catálogo **default OFF** gateado por rubro, build diferido ADR-030; BMC-lite con dependencia anotada §C·I6; BFA CUT) ·
>   **S2** tokens `--density`/`--space-*` (aditivos, `--density:1` = cero cambio visual; pisos duros 44px + AA) + primitivos `PageHeader`/`SectionGroup`/`ProfileBadge` (**tier en canal neutro**, nunca acento) + `profile-labels` (**"Comercio"/"Empresa"**, nunca lite/enterprise al cliente) ·
>   **S3** flags `NAV_GROUPING_ENABLED` (maestro) + `UPGRADE_TEASER_ENABLED` (**ambos default OFF**) + `candado.ts` (3 estados, colapsa a legado con teaser OFF) + runbook de rollback ·
>   **S4** `nav-groups.ts` (5 grupos + asignación ítem→grupo de los 17 + backlog KEEP) ·
>   **S5 (integración)** cableó el skeleton de nav en `AdminShell.tsx`/`layout.tsx` **detrás del flag maestro OFF** (con flag OFF → nav plana legada idéntica). **Vallas verdes: tsc + 596 tests + naming/tier/§C verificados.** Cero DB, cero cambio de UI con flags OFF.
> - **Naming de los 5 grupos (OBSERVACIÓN del Gate, a confirmar por el dueño):** S4 usó etiquetas **neutro-profesionales** ("Operación · Clientes · Inventario y compras · Finanzas · Configuración") en vez de los **criollos de ADR-059 D3** ("Día a día · Plata y papeles · …"), citando un override del dueño **no verificable en el repo**. Es label-only detrás del flag OFF (reversible). **Elevado al dueño** para confirmar naming o revertir a criollo.
> - **§C pendientes del rediseño (ELEVADOS, no ejecutados):** columna `Tenant.profile` + su migración (Gate 2) · entidades nuevas
>   (`cuentas-a-cobrar`, `inventario`, multi-sucursal) = ADR aparte · la **valla de DATO** ("subir sin perder
>   un dato") se construye con la persistencia (M4). Docs: `docs/estrategia/roadmap-dos-modelos.md` (hitos M0–M5).
> - **✅ §C·I6 RESUELTO — era un pendiente FANTASMA, no un fix por traer (2026-07-08, nueva ola, S2):** el fix
>   de doble-descuento/oversell de `calidad` (`3cca30f`/`85c38f3`) ya estaba **cherry-pickeado en esta misma
>   rama desde el 2026-07-05** (`a290cb8`/`82b1a00`), **antes** de que arrancara este sprint de rediseño — el
>   §C·I6 que este doc venía anotando como "pendiente de merge desde worktree `calidad`" estaba
>   **desactualizado** respecto al repo real. Verificado por: (a) ancestry (`git merge-base --is-ancestor`),
>   (b) diff línea a línea de `external-orders.ts`/`order-core.ts` contra `calidad` (sin diferencias de fondo),
>   (c) auditoría del refactor de ledger F1b (`2ac11fa`, posterior) — **no reintrodujo** el bug: `recordMovement`
>   (`src/lib/stock/ledger.ts`) es ahora **el ÚNICO mutador de `Product.stock`** en todo el repo (venta/compra/
>   consumo/ajuste), con la misma guarda atómica anti-oversell (`stock: { gte: -delta }`). Cobertura de test
>   igual o mayor a la de `calidad` (17 tests en `order-core.test.ts` + `ledger.test.ts` nuevos de F1b/F2).
>   **Criterio de "M2 terminado" para stock-lite: DESTRABADO.** Nada que traer — nada que decidir (tabla `C`
>   I6 actualizada abajo). tsc limpio + **596 tests** verdes.
> - **Cobertura scope items SAP:** `docs/estrategia/mapa-cobertura-scope-items.md` — **VALIDADO** (desafío del Analista + revisión adversarial S5, `docs/estrategia/desafio-cobertura-2026-07-08.md`) — curado a AR (micro ~6 ·
>   pyme ~15 · ~70% corporativo). **Decisión del dueño:** los descartados **NO se tiran → RESERVA** (§6):
>   guardados como definición (no construidos), se despiertan por necesidad de cliente (reusable→producto /
>   exclusivo→proyecto aparte, `FUNDAMENTOS §2`).
> - **⏸️ MERGE A MAIN = decisión del dueño** con la lista de §C resuelta (ver retro `docs/retro/retro-sprint-grow-ar-pr2-2026-07-08.md`). La rama queda verde y pusheada; nada se mergeó a `main`. **Próximo paso recomendado tras el OK del dueño:** PR-3/M2 (set `lite` por rubro + `KpiTile`/`EmptyState`) y `DataTable` como hito propio (ADR-059 D6, fix #5).

> **🆕 Sprint 2026-07-08 (Balde B en Opus) — WIP en rama `claude/sprint-startup-generic-rf6x0m`, verde, Gate-pendiente para merge a `main`.** Foco del dueño: **ARCA · Facturador · Módulos del backoffice**. Entregado:
> - **Módulos del backoffice (ADR-054/055):** vidriera **`/admin/modulos`** (el OWNER prende/apaga las apps, variante + dependencias, cap `modules:manage`) **+ gating de navegación** (`src/modules/gating.ts` + `src/lib/module-gating.ts`): con `MODULE_REGISTRY_ENABLED` on, apagar un módulo lo saca del menú; default off = nav legada intacta (reversible). Primer consumidor del backoffice para la fundación de módulos. Vallas verdes (tsc + **572 tests** + build + gate:rls 33/33 + lint).
> - **ARCA — decisión de dinero (ADR-057):** cierra Float vs `Decimal(14,2)` (§5) + R4. `number` con redondeo único ahora (reversible); `Decimal(14,2)` al borde del repo de `Invoice` al encender ARCA real (**§C·I2/Gate 2**). Desbloquea la integración.
> - **Metodología:** pool fijo de **5 sesiones reutilizables** (reuse-first; overflow espera slot) — `CLAUDE.md → CONCURRENCIA`.
> - **ARCA — reversible cerrado (ADR-057 follow-through):** **redondeo único** EPSILON-safe unificado POS+fiscal (R4 cerrado; `round2` en `src/lib/round.ts`, suma de IVA redondeada en `invoice-core`) + **worker del outbox** (`/api/cron/arca-outbox`, fail-closed con `CRON_SECRET`, dormido hasta deploy+ARCA real). Vallas verdes (tsc + 568 tests + build + lint).
> - **ARCA — migración Decimal preparada (R1, ADR-057):** `Invoice.{neto,iva,total}` → `Decimal(14,2)` en schema + **migración `20260708120000_invoice_money_decimal` SIN aplicar** (Gate 2); conversión `Decimal→number` en el único borde de lectura (`facturacion-actions`). Blast radius verificado = 1 edge. `main` queda schema-ahead-of-DB (mismo estado que las otras 9 pendientes → **aplicar migraciones antes de deployar**).
> - **§C empaquetado:** runbook **`docs/runbooks/encender-arca-real.md`** — pasos ordenados (migrar → deployar → cert homologación → real), rollback y regla de secretos. Todo listo para el "1 clic" del dueño.
> - **Catálogo de módulos (R4):** +descriptor **Reseñas**; el nav de Reseñas ahora es toggleable y gateable.
> - **Facturador — verificado (no rehecho):** la pantalla `/admin/facturacion` ya mostraba estado por factura (pendiente/autorizada+CAE/rechazada+motivo) desde `prisma.invoice` real (lección MP-13).
> - **Diferido con criterio (R2):** enforcement a nivel URL del gating de módulos → **no se hizo** por riesgo de **loop de redirects** (p. ej. PROFESSIONAL con `agenda` apagada) y por ser hardening de un feature **no-security** (el rol ya es la barrera, ADR-017). El nav-gating ya entrega la UX; el URL-block necesita un diseño loop-safe (follow-up).
> - **Pendiente del dueño (§C):** cert + homologación ARCA (I3) · `migrate deploy` de las fiscales + Decimal (I2/Gate 2), **en ese orden** (ver runbook). Con eso, el worker emite solo.

**📐 Método canónico vigente (fuente de verdad del flujo de trabajo):** toda sesión/frente sigue **AL PIE** el
**flujo RACI** de **`docs/adr/ADR-049-split-de-roles-raci.md`**, renderizado en **`docs/organizacion/estructura-gsg.mermaid`**
(que además es el **organigrama de células**, gemelo textual de `docs/organizacion/roster-completo-gsg.md`).
Flujo: Necesidad → **PMO propone** → ¿Fundamento? (Advisory tesis → Challenger antítesis → síntesis, ADR-045) →
**Dueño aprueba** → ¿Reversible? (no → Arquitecto **eleva** → OK dueño; sí → Arquitecto/célula **ejecuta**,
pool/factory ADR-053) → **Calibra (ADR-052)** → **Gate de Excelencia en Opus (ADR-040)** → ¿pasa? → **Merge** →
Dispatch **releva status** → **Retro (ADR-047)** → mejora continua.

**Marco de ventana vigente:** **Plan de Ventana hasta 2026-07-08 20:00** (`docs/estrategia/plan-ventana-2026-07-08.md`),
criterio del dueño **80% AFINAR / 20% otros**, **Sonnet por defecto** (Opus solo Gate/juicio crítico),
**concurrencia ≤ 4 en olas**, **P1 = demos/venta primero**. Baldes fijados: 🟢 **A** = pulir a vendible HOY
en Sonnet · 🔴 **B** = NO tocar, reingeniería MAÑANA en Opus (cockpit operador, módulos ARCA/MP reales,
repo de plugins ADR-054/055 bajo principio de VARIANTE).

**Prod intacto y estable:** CH Estética vivo en **Vercel**, **RLS enforced** (`app_rls`), 4 tenants
provisionados en Neon con aislamiento verificado. Nada rojo bloqueante en `main`.

**▶️ OLA 1 DEL HANDOFF CERRADA (2026-07-07).** **F1 mergeado a `main`** tras rebase + Gate (Opus) pasado.
**`main` ahora en `debb3c5`** (era `fa94440`). F3 sigue en punto seguro, sin mergear (espera su Gate). Detalle
por frente abajo; irreversibles elevados en §C.

- **F1 · `frente/diseno-vidrieras`** — ✅ **MERGEADO a `main`** (`debb3c5`, FF sobre `fa94440`). Vidriera pádel + copy honesto ADM + saneo DX-5 Shine. Vallas verdes (tsc/build/**559 tests**), Gate pasado.
- **F3 · `frente/demo-vendible`** — HEAD **`1334212`** · tag `snapshot/2026-07-07-f3-wip`. Verde (tsc/build/**560 tests**). **Puede rebasar sobre `main`-con-F1 (`debb3c5`).**

**➡️ PRÓXIMO PASO EXACTO (Ola 2):**
1. ✅ **F1 hecho** — rebasado sobre `origin/main`, Gate (Opus) pasado, mergeado a `main` (`debb3c5`, push OK).
2. **Ola 2 · F3:** rebasar `frente/demo-vendible` sobre `main` ya con F1 (`debb3c5`) → QA + Gate en Opus → merge.
3. **Necesita del dueño (no bloquea el Gate, sí el "estado final vendible"):**
   - **§C·I7 (NUEVO):** material real de **Shine y A Dos Manos** (bio/catálogo/precios/testimonios o acceso IG)
     — el copy DX-5 exacto quedó **provisional** porque las fuentes IG están login-walled. Sin esto, la vidriera
     queda con copy provisional marcado, no "forma final".
   - **§C·I1** deploy de los sitios · **§C·I2** datos reales de Magra · resto de §C.

> **Nota de norma (registrada en lecciones MP-9):** F3 corrió en **Opus** siendo **reversible** (correspondía
> **Sonnet**). Al reabrir, **fijar modelo explícito** por frente (reversible → Sonnet); el Gate va siempre en Opus.

---

## 1. Git / código

| Ítem | Valor |
|---|---|
| **main HEAD (origin)** | **`5ab3aa7`** — `merge: Fase C/C.5 de ADR-060 — entidades fundacionales + Libros (Gate S5/Opus PASA)`. Sobre Ola 1 (`a6e9969`): **Supplier (D1)** · **Collection/settlement (D9)** · **Invoice→origen (D10)** (3 migraciones **aditivas, escritas NO aplicadas**, con rollback.sql) · pantalla **`/admin/libros`** (Libro IVA estructurado, naming honesto) · helpers DataTable · `setTenantProfile`. **Todo detrás de flags DEFAULT OFF / loaders gateados por perfil enterprise (OFF en prod).** `gate:rls` 35/35. §C sin ejecutar: **nada aplicado a Neon** (las 3 nuevas + la cola con el Decimal **frenadas**, decisión A/B del dueño), sin deploy. |
| **Plataforma de prod** | **Vercel** (`vercel.json` activo; ver §2). Netlify = **legacy** (Opción A, superada). |
| **Auto-publish** | **APAGADO / gated** — push a `main` **no** publica. Deploy = acción del dueño (**Gate 1**). |
| **Snapshot tags** | `snapshot/2026-07-07-cierre` (cierre de sprint) · WIP de frentes sin mergear: `snapshot/2026-07-07-f1-wip` (`09f668a`), `snapshot/2026-07-07-f3-wip` (`1334212`) · previos: `snapshot/2026-07-07-f4b`, `snapshot/2026-07-07-f4`, `snapshot/2026-07-05-eod` |
| **Ramas WIP abiertas (NO en main)** | `frente/diseno-vidrieras` (`09f668a`, F1) · `frente/demo-vendible` (`1334212`, F3) — **verdes, pusheadas, esperan Gate+merge** |

**Qué landeó desde el snapshot `273a267` → `29e9dcb` (resumen):**
- **Cockpit Operador (T4, `29e9dcb`)** — rediseño de la consola de operador como cockpit interactivo
  read-only (control-plane, no datos de negocio). **Funcional; OP-2/OP-3 cerrados.** *(Balde B: no pulir,
  reingeniería mañana en Opus.)*
- **Banco de pruebas ARCA/MP (`db13aa4`, `5d5d8f5`)** — módulos ARCA y Mercado Pago **reales sobre la
  fundación, en sandbox por defecto** (sin credenciales productivas). *(Balde B.)*
- **Fundación repo de módulos (`0843c9f`, ADR-054/055)** + **catálogo bajo variante (`ce00385`)** —
  principio de VARIANTE (objeto maestro + ABM de asignación). *(Balde B: sólo documentado/fundación.)*
- **Fixes Magra vidriera (`f1ee590`, `32924c4`, `1fe395f`)** — M-1 footer on-brand, copy real relevado.
- **Gobernanza (ADR-045…055)** — Advisory+Challenger, de-sesgo por sector, retro, Arquitecto de Solución,
  roster completo GSG, calibración universal, pool de agentes, principio de variante + **Plan de Ventana**.

**Cores con trabajo en `main` (ERP):** Pagos, Caja, Inventario/POS (ledger `StockMovement`), Fiscal
(ARCA sandbox), Plataforma (RLS enforced + cockpit operador), Diseño. **Agencia Digital:** consultores +
go-to-market + WhatsApp por capas.

---

## 2. Prod: qué está vivo

- **App deployada en Vercel + Neon (Postgres).** Evidencia: `vercel.json` activo (build `prisma generate
  && next build` + cron diario), QA 2026-07-07 verificó `chestetica-erp.vercel.app` y `magra-erp.vercel.app`
  sirviendo, playbook `docs/metodologia/demo-publica-costo-cero.md` y runbook `docs/runbooks/deploy-vercel.md`
  son Vercel. *(No se consultó el panel de prod esta sesión — política de no tocar prod; reconciliación por
  evidencia de repo + QA.)*
- **Netlify = legacy:** el `netlify.toml` de raíz y las menciones en docs viejos corresponden a la **Opción
  A** (un sitio por tenant con `FORCE_TENANT_SLUG`), **superada** por la **Opción B de Vercel** (un solo
  proyecto, subdominios por tenant vía `APP_BASE_DOMAIN` + `Tenant.subdomain`). Deuda doc: purgar menciones
  Netlify residuales.
- **Auto-publish gated:** publicar en prod requiere OK explícito del dueño (*"deployá"*). El push a `main`
  no gasta créditos ni publica.
- **Vertical maduro en prod:** núcleo de servicios/estética (agenda, clientes, catálogo, cobro manual,
  comisiones, reseñas, recordatorios, RBAC, auditoría) — tenant CH operando.

---

## 3. Tenants

| Tenant | Slug | Subdomain | Blueprint | Estado |
|---|---|---|---|---|
| **CH Estética** (Carolina Haponiuk) | `beauty-spa` | `chestetica` | `servicios` | ✅ **VIVO en prod** (Vercel) — `app_rls` + RLS enforced. Vidriera real sirviendo (QA 07-07). |
| **Magra** (carnicería boutique) | `magra` | `magra` | `carniceria` | ✅ **Alta HECHA en Neon** (`cmr8nncxj0000aoh7cqpn7yyg`), aislamiento verificado. **Falta deploy del sitio** (I1) + **datos reales** (M-2/M-3, Gate 2). Email OWNER provisional. |
| **Shine Velas** | `shinevelas` | `shinevelas` | `velas` (retail) | ✅ **Alta HECHA en Neon** (`cmr9b3b5a0000m8h7913rkvf3`), aislamiento verificado. Falta deploy + alinear vidriera a lo real (F1). Email OWNER provisional. |
| **A Dos Manos** (pádel) | `adosmanos` | `adosmanos` | `padel` (retail) | ✅ **Alta + conversión HECHA en Neon** (`cmr9b3kij0000fkh73ax0d85h`, 20 productos), aislamiento verificado. Falta deploy + alinear vidriera (F1). Email OWNER provisional. |

**4 tenants provisionados** con aislamiento (policy + RLS) verificado. **Solo CH tiene sitio deployado**;
Magra/Shine/ADM esperan deploy (Gate 1). Migración `control_plane_tenant` (columna `subdomain`) aplicada.

**Gate de negocio de Magra (decisión de dueño, no técnica):** cobro MP online, fotos, precios reales.

---

## 4. Gates pendientes (acción del dueño) — ver §C para el "1 clic de OK"

| # | Gate | Estado |
|---|---|---|
| 1 | **RLS a prod** | ✅ **HECHO** — RLS **vivo y enforced** (`app_rls` NOBYPASSRLS, `RLS_ENFORCEMENT=on`, 33/33 sin drift). Ya no es pendiente. |
| 2 | **Alta de los tenants** | ✅ **HECHO** — los 4 tenants provisionados con aislamiento verificado. |
| 3 | **Deploy de sitios** (Magra/Shine/ADM) | 🔑 **Gate 1** — CH ya live; los otros 3 esperan deploy en Vercel. → §C·I1 |
| 4 | **Migraciones inventario/fiscal + datos reales Magra** | 🔒 **Gate 2** — 9 migraciones sin aplicar (§5) + Branding/catálogo real de Magra (M-2/M-3). → §C·I2 |
| 5 | **ARCA — cert + homologación** | 🔑 **Gate 4** — adapter SOAP escrito + sandbox listo; falta cert emisor + homologación + flag `ARCA_INVOICING_ENABLED`. → §C·I3 |
| 6 | **Seguridad pre-cobros** | 🔴 rotar `NEON_API_KEY` + password `app_rls` + habilitar **PITR**. → §C·I4 |

---

## 5. Migraciones: aplicadas vs SIN aplicar

> ⚠️ **No verificado contra Neon esta sesión.** "Aplicada" = evidencia en docs. "SIN aplicar" = Gate 2.

**✅ Aplicadas a Neon (hasta `add_waitlist`):** `init` → … → `20260704140000_add_waitlist`.

**🔒 SIN aplicar — Gate 2 (código en repo, DB no migrada):**
- `20260704160000_add_invoice_outbox` — Invoice/Outbox del Plugin ARCA.
- `20260704180000_add_pos_orders` — POS/órdenes. **⚠️ a confirmar** (POS venta opera; puede estar aplicada).
- `20260705120000_control_plane_tenant` — plano de control / super-admin. *(la columna `subdomain` figura aplicada; confirmar el resto.)*
- `20260705124318_add_cash_register` — caja del POS.
- `20260705130000_add_product_track_stock` — `trackStock`.
- `20260705140000_add_stock_purchases` — compras/reposición.
- `20260705150000_add_stock_ledger` — ledger `StockMovement`.
- `20260705150001_add_tenant_fiscal_config` — config fiscal por tenant.
- `20260705150002_fiscal_invoice_align` — Invoice alineado al spec (`ivaDesglose` Json, `authorizedAt`, unique).

**✅ Sin colisiones de timestamp** (verificado 2026-07-07: los 27 dirs son únicos; la doble `150000` se
resolvió a `150000/150001/150002`). **RLS** vive **fuera** de `prisma/migrations/` a propósito (`prisma/rls/`)
→ ningún `migrate deploy` lo aplica solo.

**⚠️ DECISIÓN PENDIENTE (PMO/ADR) — dinero `Float` vs `Decimal`:** el spec fiscal pide `Decimal(14,2)`;
hoy son `Float` (coherente con el contrato `number` del plugin ARCA). Solo impacta con ARCA en real (hoy
sandbox). No se toca unilateralmente — requiere decisión de arquitectura antes de integrar.

---

## 6. Bugs / deuda conocida

- **QA end-to-end 2026-07-07 (`docs/calidad/reporte-qa-productos-2026-07-07.md`):**
  - **A-1** (CH: equipo con servicios idénticos) → ✅ **RESUELTO** (fix de dato en prod con OK, patrón DX-7).
  - **M-1** (Magra: footer genérico) → ✅ **RESUELTO** (código, reversible).
  - **m-1** (Shine: góndola vacía anunciada) → ✅ **RESUELTO** (código, se ata al stock real).
  - **M-2 / M-3** (Magra: Branding placeholder + catálogo genérico en Neon) → 🔒 **es DATO, no código** →
    **elevar al dueño (Gate 2)**. Dirección/IG (`@magra.carniceria` vs real `@tiendamagra`)/horario/catálogo.
- **🔎 Fix de bug SIN mergear en worktree `calidad`:** `fix(pos): eliminar doble descuento de stock
  (oversell)` (`3cca30f`) + tests — **no está en `main`** (4 commits ahead). **Decisión pendiente:**
  recuperar (cherry-pick a un frente) vs descartar. Además `src/lib/tenant.ts` con cambios sin commitear +
  `tenant.test.ts` nuevo en ese worktree. Ver §7. **No se tocó.**
- **Cobertura QA parcial (07-07):** mobile quedó parcial (el resize se resetea al navegar) + no se
  completaron los 5 pasos de reserva CH ni el checkout real → **pasada mobile/flujos dedicada = F2**.
- Deuda técnica priorizada: `docs/ROADMAP.md` y `docs/PROXIMOS-PASOS.md`.

---

## 7. Worktrees y sesiones — inventario (2026-07-07)

**10 worktrees registrados** (todos **detrás de `main`**; solo `calidad` tiene cambios sin commitear).
**No hay worktrees fantasma** (`git worktree prune` limpio). **NO se limpió/rebaseó nada** — inventario y
recomendación; la limpieza es acción del dueño (§C·I5, `rm -rf` vedado por config).

| Worktree | Rama | HEAD | vs `main` (behind/ahead) | Sucio | Nota |
|---|---|---|---|---|---|
| `-calidad` | `frente/calidad` | `754471c` | 187 / **4** | **2** | ⚠️ **oversell fix + tests sin mergear** + `tenant.ts` sin commitear. Revisar antes de descartar. |
| `-deploy` | `deploy/land-f1b` | `f0a13f0` | 157 / 0 | 0 | puntero del deploy viejo. Stale, seguro. |
| `-diseno` | `frente/diseno` | `4c648c2` | 119 / 0 | 0 | en origin. Stale. **No reusar para F1** (abrir worktree fresco). |
| `-fiscal` | `core/pagos` | `520d95b` | 168 / 0 | 0 | ⚠️ nombre de dir ≠ rama; en origin. Stale. |
| `-growthfunnel` | `frente/growth-funnel` | `4f57af0` | 82 / 1 | 0 | en origin. 1 commit propio. Stale. |
| `-importaciones` | `frente/importaciones` | `fdbbbf8` | 61 / 3 | 0 | en origin (impo, trigger propio). Stale. |
| `-plataforma` | `frente/plataforma` | `47924db` | 136 / 0 | 0 | **local-only** pero su HEAD es **ancestro de main** (contenido, seguro). |
| `-producto` | `frente/producto-rubros` | `f1ee590` | 13 / 0 | 0 | el más cercano a main (M-1/m-1 ya mergeados). Stale. |
| `-reliability` | `frente/reliability` | `cf79296` | 43 / 0 | 0 | en origin. Stale. |
| `-whatsapp-cta` | `frente/whatsapp-cta` | `3dd0956` | 52 / 0 | 0 | en origin. Stale. |

**8 carpetas huérfanas** (hermanas de `estetica-erp`, **NO son worktrees ni repos** — copias/artefactos en
disco, probablemente materializaciones de sprints viejos): `-adosmanos`, `-cajaint`, `-fix002`,
`-magradocs`, `-op23`, `-pagos-fase3`, `-rls`, `-waitlist` (esta con `node_modules`). Ocupan disco; **no
tienen git** → limpiarlas es higiene (§C·I5).

**Sesiones vivas:** no es detectable por git si hay procesos `claude` corriendo. Git-wise, **solo `calidad`
tiene trabajo sin commitear** (posible sesión que quedó abierta ahí). El resto está limpio.

**Recomendación (no ejecutada):** para F1/F3 **abrir worktrees frescos rebasados sobre `main 29e9dcb`**
(`frente/diseno-vidrieras`, `frente/demo-vendible`), **no reusar** los stale. Antes de tocar `calidad`,
**decidir el destino del oversell fix**. Limpieza de stale/huérfanos → §C·I5.

---

## 7-bis. Cierre de sprint — estado de F1 (MERGEADO) y F3 (WIP en el entorno local del dueño)

**Ola 1 cerrada:** F1 **mergeado a `main`** (su copy pádel/ADM + saneo Shine viven en `main` `6c88719`).
F3 sigue como WIP: **no está en el remoto** (solo `main` + rama de sesión) — vive en el worktree local del
dueño. Orden de Gate/merge al reabrir F3: rebasa sobre `main` con F1 → Gate Opus → merge.

### F1 · `frente/diseno-vidrieras` — ✅ **MERGEADO a `main`** (contenido en `6c88719`) · verde (tsc/build/559)
- **✅ COMPLETO:** secciones de pádel **brand-neutral**; **calibración ADR-052** hecha; **copy de A Dos Manos**
  + **saneo de Shine** (se quitaron **reviews/testimonios fabricados**, que violaban DX-5).
- **🟡 A MEDIO / bloqueado (dato, no código):** el **copy DX-5 exacto de Shine y ADM es provisional** — las
  fuentes reales (Instagram) están **login-walled**, no se pudo relevar la copia exacta. Marcado provisional en
  `src/tenants/storefront.ts`: objetos `adosmanos` (~L210) y `shinevelas` reviews (~L196).
- **⤴️ Elevó §C·I7:** falta que el **dueño aporte material real** (bio/catálogo/precios/testimonios) o **acceso
  IG** para cerrar el copy a "forma final". (Relacionado con el gate ADR-042 de autorización de marca.)

### F3 · `frente/demo-vendible` — HEAD `1334212` · tag `snapshot/2026-07-07-f3-wip` · verde (tsc/build/560)
- **✅ COMPLETO:** **J-1/J-3** — backoffice-demo **sin password** y **sin callejones sin salida**
  (dashboard/clientes/navegación **acotada a fixtures**).
- **🟡 Follow-ups reversibles (no bloqueantes):** cablear fixtures de los **módulos restantes** (allowlist
  `WIRED_DEMO_MODULE_HREF`); **branding de demo por rubro**.
- **⤴️ Elevó:** **persistencia/credenciales de demo** (acción del dueño, FASE 2) + **Gate + merge** (PMO).
- **⚠️ Nota de norma:** F3 corrió en **Opus** siendo **reversible** (correspondía **Sonnet**) → registrado en
  lecciones **MP-9**. Al reabrir, fijar modelo explícito.

## 8. Estructura de agentes — realidad vs doc (para no asumir)

**La estructura de agentes ya está MATERIALIZADA como archivos + METODOLOGÍA + COMANDOS + GOBERNANZA:**
- **`.claude/agents/` EXISTE — 18 subagentes definidos** (materializados en `8e0aca5`/`b5c3536`): `pmo`,
  `arquitecto-solucion`, `advisory`, `challenger`, `seguridad`, `auditoria-gsg-gate`, `qa`, `sello-marca-gsg`,
  `raci-matriz`, `constructor`, `diseno-marca`, `cobro-fiscal`, `growth`, `operaciones`, `plataforma-deploy`,
  `preset-ia`, `backoffice-producto`, `backoffice-ingenieria`. Se instancian **solo con tarea** (definir ≠
  instanciar, ADR-053). *(El doc previo decía "NO existe / 0 subagentes" — quedó superado por el roster ya materializado.)*
- **`.claude/commands/` (16):** comandos slash que una sesión adopta (sprint, economia, boost, impo, remoto, status, lab,
  manual, rol, rol-fullstack, sesion-*). Son prompts, no agentes con toolset propio.
- **`docs/organizacion/roster-completo-gsg.md` (~30 roles):** gobernanza documental. "✅" = *rol ya operado
  por una sesión*. **18 de esos roles YA tienen archivo `.claude/agents/`** (los del núcleo de gobierno + las
  células de ejecución más usadas); el resto (Agencia Grow, pricing, etc.) sigue documentado sin archivo hasta
  que haya tarea.
- **Mecanismo real de "1 frente = 1 sesión"** (`sprint.md`): el dueño abre N ventanas `claude` y pega el
  comando/charter, **o** el PMO despacha los subagentes del roster (Agent tool `subagent_type`) con su charter
  ya materializado. El "auto-abren las células" sigue siendo disparo manual/ad-hoc, pero ahora **apoyado en
  definiciones reales** en `.claude/agents/`. **Funciona.**

---

## 9. Frentes listos para abrir (Plan de Ventana — Balde A)

Re-mapeados al rol y flujo SGS (RACI ADR-049). **Ola de ejecución** tras el OK del dueño.

| Frente | Rol formal | Worktree | Modelo | Paso 0 / verificación previa |
|---|---|---|---|---|
| **F1 · Alinear vidrieras Shine + ADM a lo real** | **Diseño** (core) + **Adaptador/Delivery**; coord. **Arquitecto de Solución** (reversible) | `frente/diseno-vidrieras` (fresco) | Sonnet (Gate en Opus) | **Calibración ADR-052** + ⚠️ **verificar autorización de marca (ADR-042) de Shine y ADM registrada** antes de tocar identidad |
| **F3 · Demo consultor→backoffice vendible** | **Consultores/Agencia Digital** + **Producto por rubro** | `frente/demo-vendible` (fresco) | Sonnet (Gate en Opus) | **Calibración ADR-052** + **por playbook** `demo-publica-costo-cero.md` (no improvisar deploy/ruteo) |
| **F2 · QA mobile + flujos completos** | **QA / Probador** | núcleo (read-only, sin worktree) | Sonnet | transversal; verifica lo de F1 y cierra cobertura mobile/reserva/checkout |
| **F4 · Coherencia doc + retro** | **PMO (autor)** + rol Docs/Índice vivo (lo absorbe el PMO) | núcleo (esta sesión) | Opus | FASE 0 / cierre — **este documento** + §C + retro ADR-047 |

**Regla dura por frente:** sigue **al pie el flujo RACI** (ADR-049 / `estructura-gsg.mermaid`) · modelo
etiquetado explícito · **Paso 0 de calibración (ADR-052)** · entrega verde (`tsc`+`build`+`test`) · **Gate de
Excelencia auditado en Opus** antes de que el PMO mergee · retro ADR-047 al cierre. Irreversibles **se
elevan** (§C), no se corren.

**➡️ Prompts de arranque "listo para pegar" de F1 y F3** (con el flujo RACI completo + el Plan de Ventana
**embebidos**, para trabajar en norma sin depender del chat): **`docs/estrategia/prompts-arranque-F1-F3.md`**.

---

## C · 🔒 IRREVERSIBLES pendientes de OK del dueño ("1 clic de OK")

**Ninguno se ejecuta en la ventana.** Quedan **listos** para tu aprobación; decís cuál y se corre.

| # | Acción irreversible | Gate | Qué desbloquea |
|---|---|---|---|
| **I1** | **Deploy de sitios** Magra + Shine + ADM en Vercel (`<slug>-erp.vercel.app` o subdominios) | **Gate 1** (deploy = *"deployá"*) | los 3 tenants live (CH ya lo está) |
| **I2** | **Aplicar migraciones** de Inventario/Fiscal (9, §5) + cargar **datos reales de Magra** (Branding M-2 + catálogo M-3) en Neon | **Gate 2** (`migrate deploy` / edición de datos, OK Neon) | inventario avanzado + facturación + vidriera fiel de Magra |
| **I3** | **ARCA — certificado del emisor + homologación** + flag `ARCA_INVOICING_ENABLED` | **Gate 4** (acción dueño) | facturación electrónica real (hoy sandbox) |
| **I4** | **Rotar secretos + PITR** (`NEON_API_KEY` + password `app_rls` + habilitar PITR) | acción dueño (seguridad) | 2 rojos pre-cobros cerrados |
| **I5** | **Limpieza de disco** — 10 worktrees stale + 8 carpetas huérfanas (`rm -rf` vedado por config) | acción dueño / método permitido | higiene del entorno (§7) |
| **I6** | ~~Destino del oversell fix de `calidad`~~ → ✅ **CERRADO, VERIFICADO (2026-07-08):** ya estaba cherry-pickeado en la rama desde el 2026-07-05 (`a290cb8`/`82b1a00`) y sobrevivió intacto el refactor de ledger F1b (único mutador de `Product.stock`, misma guarda anti-oversell). No había nada que recuperar ni decidir — el ítem era un remanente desactualizado del doc. | — (cerrado, sin acción) | stock-lite destrabado para "M2 terminado" |
| **I7** | **Material real de Shine y A Dos Manos** (bio/about, catálogo+precios reales, testimonios reales de IG/WhatsApp) o **acceso IG** — hoy el copy DX-5 quedó **provisional** (fuentes IG login-walled; sin web/TiendaNube pública) | acción dueño (aportar material) | cierra el copy DX-5 exacto de Shine/ADM (hoy provisional) + repone reseñas reales; con la autorización I8 ya otorgada, esto es lo único que falta para "forma final" |
| **I8** | ~~Autorización de marca (ADR-042) de Shine/ADM~~ → ✅ **OTORGADA por el dueño 2026-07-07**. **Gap que detectó F1:** el copy de Shine ya está en `main` **landeado antes** de la verificación y con reviews aparentemente inventadas → regularizar con material real (I7). | acción dueño (autorización) — **hecha** | desbloqueó el A2; el DX-5 fiel queda ahora atado solo a I7 (material real). Ver `docs/estrategia/F1-vidrieras-calibracion-y-gate-adr042.md` |

> Los secretos los **pega SIEMPRE el dueño** (FASE 2, ADR-041); las migraciones quedan como **carpeta sin
> aplicar**; nada de §C se corre solo.

> **Nota de reconciliación Shine/ADM (doc-only, 2026-07-07):** `PLAN-RECONVERSION-CLIENTES.md` (07-06) decía
> que Shine y A Dos Manos **no** eran tenants reales en Neon (gated). Quedó **superado**: sus **altas están
> hechas** (§3, tenantIds `cmr9b3b5a…` / `cmr9b3kij…`, aislamiento verificado) y F1 trabajó sobre sus
> vidrieras vivas. **Verdad única vigente: los 4 tenants existen en Neon.** Lo pendiente de Shine/ADM no es el
> alta sino **datos reales (I7)** y **deploy del sitio (I1)**. `PLAN-RECONVERSION` se corrige en el mismo acto.

---

## Para retomar — próximos pasos claros

1. **Leé esta foto** (sobre todo el HANDOFF + §7-bis) + `docs/ESTADO-FRENTES.md` (tablero de Sprint activo).
   **Ola 1 cerrada:** F1 ya está en `main`. F3 sigue WIP (en el worktree local del dueño, no en el remoto).
2. **Retomá por F3:** cuando reaparezca la rama de F3, rebasala sobre `main` (`6c88719`) → QA + **Gate en Opus**
   → merge. Fijar **modelo explícito** por frente (reversible → Sonnet, ver MP-9).
3. **Del dueño:** **§C·I7** (material real Shine/ADM) para cerrar el copy DX-5 a forma final; y el resto de §C (deploys, datos Magra).
4. **Balde B (Opus):** cockpit operador → reingeniería, módulos ARCA/MP reales, repo de plugins (ADR-054/055, VARIANTE).
5. **Estado:** nada rojo en `main` (`6c88719`, sin cambios de código esta sesión — solo reconciliación doc); prod estable en Vercel.

> **Gates = acción del dueño.** Nada de deploy/alta/migraciones/secretos se corre solo. Este doc + los
> runbooks (`docs/runbooks/`) son el guion para ejecutarlos cuando el dueño dé el OK.

— Elaborado por GSG (PMO)
