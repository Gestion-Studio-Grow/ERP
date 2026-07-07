# ESTADO ACTUAL — la foto completa (para retomar sin perderse)

**Qué es:** la foto viva del sistema para arrancar cualquier sesión/sprint sin re-descubrir el
contexto. La **produce/actualiza el PMO en la FASE 0 (Exploración)** y se **re-taggea en la FASE
FINAL (Backup)** (ver `docs/METODOLOGIA-SPRINT.md`). **Si abrís una sesión nueva y pegás tu prompt,
este documento es la fuente de verdad para continuar exactamente desde acá.** Si algo no coincide con
el repo/prod, gana el repo y este doc se corrige en el acto.

- **Actualizado:** 2026-07-07 (FASE 0 + F4 doc-only, PMO) · **Autor:** PMO (sesión autónoma)
- **Método:** barrido del repo (`git log`, `git worktree list`, `prisma/migrations/`, `.claude/`,
  `docs/`) + reconciliación del drift acumulado. **NO se consultó Neon prod** (política: diagnóstico,
  no tocar prod/DB) → el estado de migraciones *aplicadas* se deriva de docs y se marca "a confirmar".
- **Reconciliación de esta pasada (2026-07-07):** el doc venía del snapshot `273a267`; **`main` ya está
  en `29e9dcb`** (~28 commits después). Se reconcilió: **(1)** el HANDOFF viejo del go-live de Magra →
  **Plan de Ventana vigente**; **(2)** **plataforma de deploy: Netlify → Vercel** (evidencia dura, ver §2);
  **(3)** RLS pasó de "casi completo" a **VIVO y enforced**. Detalle de qué landeó desde el snapshot en §1.

---

## 🚦 HANDOFF — próximo paso real (2026-07-07)

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

**⏸️ SPRINT PAUSADO (cierre 2026-07-07, el dueño reabre después).** Los dos frentes **pararon en punto
seguro**: árbol limpio, vallas verdes, pusheados, **SIN merge a `main`** (esperan Gate). **`main` sigue en
`29e9dcb`** — no cambió (lo de esta sesión es doc-only del PMO). Detalle por frente en §7-bis; irreversibles
elevados en §C.

- **F1 · `frente/diseno-vidrieras`** — HEAD **`09f668a`** · tag `snapshot/2026-07-07-f1-wip`. Verde (tsc/build/**559 tests**).
- **F3 · `frente/demo-vendible`** — HEAD **`1334212`** · tag `snapshot/2026-07-07-f3-wip`. Verde (tsc/build/**560 tests**).

**➡️ PRÓXIMO PASO EXACTO AL REABRIR (en este orden):**
1. **Gate + merge de F1 primero** (orden F1 → F3): el PMO corre QA transversal + **Gate de Excelencia en Opus**
   sobre `frente/diseno-vidrieras` (`09f668a`) → si pasa, mergea a `main`. **F1/F3 NO están mergeados.**
2. **Luego F3:** rebasar `frente/demo-vendible` sobre `main` ya con F1 → QA + Gate en Opus → merge.
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
| **main HEAD (origin)** | **`29e9dcb`** — `feat(cockpit): rediseño consola operador — cockpit interactivo read-only (T4, W1–W6)` |
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

## 7-bis. Cierre de sprint — estado de F1 y F3 (WIP sin mergear, esperan Gate)

Ambos frentes pararon en **punto seguro** (árbol limpio, verde, pusheado, **sin merge a `main`**). Orden de
Gate/merge al reabrir: **F1 → F3**.

### F1 · `frente/diseno-vidrieras` — HEAD `09f668a` · tag `snapshot/2026-07-07-f1-wip` · verde (tsc/build/559)
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

**La estructura de agentes existe como METODOLOGÍA + COMANDOS + GOBERNANZA, no como flota instanciada:**
- **`.claude/agents/` NO existe** (0 subagentes activos). **`.claude/agents-en-pausa/`** tiene 2 archivos
  **stale** (`fullstack-arquitecto`, `revisor-verificador`, apuntan al método viejo `METODO-ROLES.md`).
- **`.claude/commands/` (14):** comandos slash que una sesión adopta (sprint, economia, boost, impo, remoto,
  manual, rol, rol-fullstack, sesion-*). Son prompts, no agentes con toolset propio.
- **`docs/organizacion/roster-completo-gsg.md` (~30 roles):** gobernanza documental. "✅" = *rol ya operado
  por una sesión*, **NO** *archivo de agente*. Ninguno tiene archivo `.claude/agents/`.
- **Mecanismo real de "1 frente = 1 sesión"** (`sprint.md`): el dueño abre N ventanas `claude` y pega el
  comando/charter, **o** el PMO despacha subagentes ad-hoc (Agent tool) con el charter como prompt. El
  "auto-abren las células" es aspiracional; mecánicamente es manual/ad-hoc. **Funciona** — pero conviene
  saberlo. Materializar agentes como archivos = trabajo de Balde B (opcional).

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
| **I6** | **Destino del oversell fix** de `calidad` — recuperar (cherry-pick a un frente + Gate) vs descartar | decisión dueño/PMO | evita perder un fix de bug real de POS (§6) |
| **I7** | **Material real de Shine y A Dos Manos** (bio/catálogo/precios/testimonios) o **acceso IG** — hoy el copy DX-5 quedó **provisional** (fuentes IG login-walled) | acción dueño (dato/marca) | cerrar las vidrieras de Shine/ADM a "forma final" (F1); atado a la autorización ADR-042 de I8 |
| **I8** | **Autorización de marca (ADR-042) de Shine Velas y A Dos Manos** — pedir y **registrar** el OK del cliente para replicar su identidad (como Magra). **Gap detectado por F1:** ninguno la tiene registrada; además el copy de Shine ya está en `main` **landeado antes** de la verificación y con reviews aparentemente inventadas. | acción dueño (autorización) | desbloquea el A2 real: copy DX-5 relevado de Shine/ADM + regulariza el copy de Shine ya en `main`. Ver `docs/estrategia/F1-vidrieras-calibracion-y-gate-adr042.md` |

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
   El sprint está **PAUSADO**, no cerrado: F1/F3 son WIP verdes sin mergear.
2. **Retomá por el Gate, NO abras de cero:** el PMO corre QA + **Gate en Opus** sobre **F1 (`09f668a`)** →
   merge → rebasa **F3 (`1334212`)** → Gate → merge. Fijar **modelo explícito** por frente (reversible → Sonnet, ver MP-9).
3. **Del dueño:** **§C·I7** (material real Shine/ADM) para cerrar F1 a forma final; y el resto de §C (deploys, datos Magra).
4. **Balde B (Opus):** cockpit operador → reingeniería, módulos ARCA/MP reales, repo de plugins (ADR-054/055, VARIANTE).
5. **Estado:** nada rojo en `main` (`29e9dcb`, sin cambios de código esta sesión); prod estable en Vercel.

> **Gates = acción del dueño.** Nada de deploy/alta/migraciones/secretos se corre solo. Este doc + los
> runbooks (`docs/runbooks/`) son el guion para ejecutarlos cuando el dueño dé el OK.

— Elaborado por GSG (PMO)
