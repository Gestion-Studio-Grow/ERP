# ESTADO ACTUAL — la foto completa (para retomar sin perderse)

**Qué es:** la foto viva del sistema para arrancar cualquier sesión/sprint sin re-descubrir el
contexto. La **produce/actualiza el PMO en la FASE 0 (Exploración)** y se **re-taggea en la FASE
FINAL (Backup)** (ver `docs/METODOLOGIA-SPRINT.md`). **Si abrís una sesión nueva y pegás tu prompt,
este documento es la fuente de verdad para continuar exactamente desde acá.** Si algo no coincide con
el repo/prod, gana el repo y este doc se corrige en el acto.

- **Actualizado:** 2026-07-05 (FASE FINAL / backup de fin de jornada) · **Autor:** PMO (sesión autónoma)
- **Snapshot / punto de retorno:** tag **`snapshot/2026-07-05-eod`** → el commit de este backup
  (incluye esta foto; código en `35603bd`) (+ el previo `snapshot/2026-07-05-postdeploy` → `f0a13f0`).
  Para retomar: `git checkout snapshot/2026-07-05-eod` o simplemente leer este doc en `main`.
- **Método:** barrido del repo (`git log`, `prisma/migrations/`, `src/blueprints/`, docs). **NO se
  consultó Neon prod** (política: diagnóstico, no tocar prod/DB) → el estado de migraciones *aplicadas*
  se deriva de docs y se marca "a confirmar" donde no hay evidencia dura.

---

## 🚨 HANDOFF URGENTE (2026-07-05 — laptop se desconecta, sesiones se frenan)

**Prod intacto y estable:** deploy `f0a13f0`, **CH Estética vivo (1 tenant)**. **Cero riesgo por la
desconexión:** el **ensayo de RLS se completó en un BRANCH de Neon** (no prod) y quedó **🟢 VERDE
8/8**; el branch **se borró** (solo queda `main`). Prod NUNCA se tocó. Todo pusheado.

> **🔑 HALLAZGO DEL ENSAYO EN BRANCH (2026-07-05) — cambia el plan:** el `app_user` de prod con
> `BYPASSRLS` es **INARREGLABLE** por `neondb_owner` (`ALTER ROLE … NOBYPASSRLS` → *"permission denied"*;
> quitar BYPASSRLS necesita superuser, que Neon no da). El `0002` "patcheado" **fallaría en prod**. La
> solución **probada en verde**: NO tocar `app_user`; **crear un rol NUEVO `app_rls`** con `CREATE ROLE
> app_rls LOGIN PASSWORD '<secret>' NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE` + grants, y rotar
> `DATABASE_URL` a ESE rol. `app_rls` autentica por el proxy de Neon y aísla correctamente
> (ctx=A→A, ctx=B→B, WITH CHECK bloquea cross-tenant, fail-closed sin ctx). Diff mínimo de prod en el
> runbook. **Pendiente de repo:** actualizar `0002`/`check-rls-live`/`verify-rls` al rol nuevo (hoy
> apuntan a `app_user`). **Falta para prod:** OK final del dueño + password de `app_rls` (secret).

### ✅ PASOS DEL DUEÑO para el go-live de Magra (en orden, al retomar)
1. **`app_rls`** (rol NUEVO, no `app_user`) → definir su **contraseña en Neon** (secret; nunca al repo).
2. **RLS a prod** → re-correr `0001` (cierra el DRIFT de 9 tablas → 33/33) + **crear `app_rls`** (ver
   hallazgo arriba) + auditar con `prisma/rls/check-rls-live.mjs`. **Ensayar SIEMPRE en branch primero**
   (ya salió verde una vez); recién después prod.
3. **Env vars en Netlify** (+ redeploy): `DATABASE_URL=<app_rls>` · `OPERATOR_DATABASE_URL=<neondb_owner>`
   · `RLS_ENFORCEMENT=on`.
4. **Alta de Magra** → `/operador/alta` (2º tenant, blueprint `carniceria`).
5. **Deploy `magra-erp`** → 2º sitio Netlify con `FORCE_TENANT_SLUG=magra`.

Comandos y detalle: **`docs/runbooks/alta-magra.md`**. Fundamento de los hallazgos: §4 y §6.

### 🔐 SEGURIDAD — acción del dueño
**`NEON_API_KEY` quedó en `.env` (comentada) y pasó por el chat → ROTARLA en Neon** por precaución.
El `.env` no se versiona, pero rotá la key igual (asumila comprometida).

---

## 1. Git / código

| Ítem | Valor |
|---|---|
| **main HEAD (origin)** | **`35603bd`** — `docs(sector): visión estratégica en FUNDAMENTO — la Agencia es el go-to-market del propio ERP` |
| **Último deploy conocido a prod** | **`f0a13f0`** (merge `land-inventario-f1b`) — *confirmar si se redeployó tras esto* |
| **Delta main → prod (sin deployar)** | fixes + docs post-`f0a13f0`: `8b9d989` fix del gate RLS, `685b5c9` override `FORCE_TENANT_SLUG`, y el sector Agencia Digital (charter + FUNDAMENTO + 2 análisis de mercado). **Nada de esto rompe prod; son fixes/docs.** |
| **Snapshot tags** | `snapshot/2026-07-05-eod` → commit de este backup (código `35603bd`) · `snapshot/2026-07-05-postdeploy` → `f0a13f0` |

**Cores con trabajo en main (ERP):** Pagos (gateway de cobros por tenant), Caja (arqueo en vivo +
rediseño `/admin/caja`), Inventario/POS (ledger `StockMovement` cableado a venta/compra/consumo),
Fiscal (wiring `clientePara` del worker ARCA + config fiscal por tenant), Plataforma (observabilidad
v2 con `requestId` + override `FORCE_TENANT_SLUG` + **fix del gate RLS**). **Sector Agencia Digital:**
charter + FUNDAMENTO + 2 análisis de mercado en `docs/sectores/agencia-digital/`.

---

## 2. Prod: qué está vivo

- **App deployada** en Netlify + Neon (Postgres), corriendo `f0a13f0` (último deploy conocido).
- **Auto-publish de Netlify APAGADO** (`stop_builds`): push a `main` **no** publica. Deploy = acción
  del dueño (Gate 1).
- **Vertical maduro en prod:** núcleo de servicios/estética (agenda, clientes, catálogo, cobro
  manual, comisiones, reseñas, recordatorios, RBAC, auditoría) — tenant CH operando.

---

## 3. Tenants

| Tenant | Slug | Blueprint | Estado |
|---|---|---|---|
| **CH Estética** (Carolina Haponiuk) | `beauty-spa` | `estetica` | ✅ **VIVO en prod** — único tenant real operando |
| **Magra** (carnicería boutique) | `magra` | `carniceria` | 🚧 **CONSTRUIDO, SIN ALTA en prod** — tenant + playbook de preventa listos; el alta del 2º tenant está **bloqueada por el gate RLS** (el provisioning se niega a crear la 2ª fila `Tenant` sin RLS activo). Su sitio **magra-erp tampoco está deployado** (ver §4) |

**Gate de negocio de Magra (decisión de dueño, no técnica):** cobro MP online, fotos, precios reales.

---

## 4. Gates pendientes (acción del dueño) — el camino para prender Magra

Orden lógico para dar de alta Magra end-to-end:

| # | Gate | Qué destraba | Estado |
|---|---|---|---|
| 1 | **RLS a prod (Gate 2)** | aislamiento por fila a nivel DB → **prerrequisito duro del 2º tenant** | 🔒 **⚠️ Prod NO está "de cero" (auditado 2026-07-05, solo lectura vía `check-rls-live.mjs`):** RLS ya aplicado en **24/33 tablas**; **DRIFT — 9 tablas sin proteger** (`Order, OrderItem, Invoice, OutboxEvent, CashMovement, CashSession, StockMovement, StockPurchase, StockPurchaseItem`) → filtrarían entre tenants; y **`app_user` con `BYPASSRLS=true`** → rotar a él daría CERO aislamiento (hoy prod no se rompe: conecta como `neondb_owner`, RLS dormido). **Ensayo offline PASADO** (`verify-provision-gate.mts`): gate bloquea sin RLS → abre con RLS → aislamiento + fail-closed. **Bugs hallados y corregidos (repo):** el sentinel del gate incluía `Tenant` → nunca abría (`8b9d989`); `0002` no forzaba `NOBYPASSRLS` en rol existente (fix 2026-07-05). **ENSAYO EN BRANCH DE NEON REAL: 🟢 VERDE 8/8 (2026-07-05, branch borrado):** el branch replicó el drift (24/33) → `0001` cerró a 33/33 → aislamiento OK conectando como rol de app → fail-closed. **Hallazgo que cambia el plan:** `app_user` con BYPASSRLS es INARREGLABLE por `neondb_owner` (necesita superuser) → **usar rol NUEVO `app_rls`** (`CREATE ROLE … NOBYPASSRLS`, probado). Falta: OK final + password de `app_rls` (secret) + actualizar repo (`0002`/guards) al rol nuevo. Runbook: `docs/runbooks/alta-magra.md` |
| 2 | **Alta de Magra (2º tenant)** | Magra existe en la DB de prod | 🔒 depende de #1. `scripts/provision-tenant.ts` ya siembra tenant+OWNER+blueprint `carniceria`; correr con OK explícito tras RLS |
| 3 | **Deploy del sitio `magra-erp`** | Magra accesible por URL propia | 🔑 **2º sitio Netlify** apuntando a la misma app con **`FORCE_TENANT_SLUG=magra`** (Opción A, URL gratis por tenant; ver `docs/runbooks/alta-magra.md`). Sin dominio propio el `.netlify.app` no separa por subdominio → un sitio por tenant, o pasar a Opción B (dominio + wildcard) |
| 4 | **Certificado + homologación ARCA** | facturación electrónica viva (firma CMS del `TraSigner`) | 🔑 adapter SOAP escrito; falta cert del emisor + homologación + flag `ARCA_INVOICING_ENABLED` |

**Dominio propio (Opción B, a futuro):** `APP_BASE_DOMAIN` + DNS wildcard `*.tudominio.com` → un solo
sitio sirve `chestetica.` y `magra.` por subdominio (ver runbook). Hoy se va por Opción A (un sitio
por tenant con `FORCE_TENANT_SLUG`).

**Credenciales que encienden features ya construidas:** WhatsApp (proveedor Meta/Twilio), Mercado
Pago (OAuth por comercio) — infra/adapters listos, esperan credencial.

---

## 5. Migraciones: aplicadas vs SIN aplicar

> ⚠️ **No verificado contra Neon esta sesión.** "Aplicada" = evidencia en docs. "SIN aplicar" = Gate 2.

**✅ Aplicadas a Neon (hasta `add_waitlist`):** `init` → … → `20260703170000_add_users_rbac` →
`20260704120000_add_business_settings` → `20260704130000_add_commission_payouts` →
`20260704140000_add_waitlist`.

**🔒 SIN aplicar — Gate 2 (código en repo, DB no migrada):**
- `20260704160000_add_invoice_outbox` — Invoice/Outbox del Plugin ARCA.
- `20260704180000_add_pos_orders` — POS/órdenes. **⚠️ a confirmar** (POS venta opera; puede estar aplicada).
- `20260705120000_control_plane_tenant` — plano de control / super-admin.
- `20260705124318_add_cash_register` — caja del POS.
- `20260705130000_add_product_track_stock` — `trackStock`.
- `20260705140000_add_stock_purchases` — compras/reposición.
- `20260705150000_add_stock_ledger` — ledger `StockMovement`.
- `20260705150001_add_tenant_fiscal_config` — config fiscal por tenant (**renombrada** desde `150000`).
- `20260705150002_fiscal_invoice_align` — Invoice alineado al spec: `ivaDesglose` (Json), `authorizedAt`, unique `(tenantId, puntoVenta, tipoComprobante, numero)`.

**✅ COLISIÓN DE TIMESTAMP — RESUELTA (2026-07-05, frente Fiscal):** la doble `20260705150000`
(`add_stock_ledger` vs `add_tenant_fiscal_config`) se cerró renombrando la fiscal a
`20260705150001_…`; orden explícito `ledger(150000) < tenant_fiscal_config(150001) < fiscal_invoice_align(150002)`.
Sin colisiones. RLS de Plataforma vive en `prisma/rls/` (fuera de `migrations/`) → no cruza con esto.

**⚠️ DECISIÓN PENDIENTE (PMO/ADR) — dinero `Float` vs `Decimal`:** el spec fiscal pide `Decimal(14,2)`
para `neto/iva/total` de `Invoice`; hoy son `Float`, coherente con que todo el sistema mueve importes
como `number` (contrato del plugin ARCA). Migrar cruza ese contrato de punta a punta y solo impacta con
ARCA en real (hoy stub/gateado). **No se tocó unilateralmente**: requiere decisión de arquitectura antes
de integrar el cambio de representación de dinero.

**RLS:** los SQL viven **fuera** de `prisma/migrations/` a propósito (`prisma/rls/`) — ningún
`migrate deploy` los aplica solo (ver `prisma/rls/README.md`).

---

## 6. Bugs / deuda conocida

- **🔥 RLS de prod con DRIFT + `app_user` con BYPASSRLS (auditado 2026-07-05).** RLS aplicado en
  24/33 tablas; 9 de-tenant sin proteger (`Order/OrderItem/Invoice/OutboxEvent/Cash*/Stock*`);
  `app_user` evade RLS. **NO dar de alta el 2º tenant ni rotar `DATABASE_URL` a `app_user` sin
  antes** re-correr `0001` (33/33) y `0002` patcheado (fuerza NOBYPASSRLS). Detalle y secuencia en
  §4 y en `docs/runbooks/alta-magra.md`. Guardas: `prisma/rls/check-rls-live.mjs` (auditoría en vivo)
  + `verify-provision-gate.mts` (offline). *(fixes de repo en main; falta ejecutar en Neon con OK.)*
- **🐞 Redirect / home `/`:** el root (`src/app/(site)/page.tsx`) sirve la **landing de CH
  hardcodeada** (`_ch/*`, `force-dynamic`), sin resolución por dominio/tenant nativa. **Mitigación ya
  en repo:** `FORCE_TENANT_SLUG` (`685b5c9`) permite pinnear el tenant por sitio (Opción A) → cada
  sitio Netlify sirve su tenant. La resolución multi-tenant "de verdad" por dominio (Opción B) queda
  atada a dominio propio (§4). *(Detalle exacto del redirect reportado por el dueño: reproducir y
  cerrar junto con dominio propio.)*
- **Wiring `completeAppointment` (ADR-024)** pendiente de commitear limpio (ver `PROXIMOS-PASOS.md`).
- **WIP inconcluso fuera de main:** ARCA `signer.ts` (falta dep `node-forge` + wiring); y un refactor
  en curso en el checkout de `main` (borra `pagos-dispatch.ts`/`request-context.ts`, folds en
  `mercadopago-dispatch`/`logger`, toca api routes) **sin commitear** — de otra sesión, pendiente de
  que su dueño lo cierre.
- Deuda técnica priorizada: `docs/ROADMAP.md §2.3` (F1/F3/F8) y `PROXIMOS-PASOS.md`.

---

## 7. Estado por frente/core — LOS DOS SECTORES

Modelo: cada sesión es dueña de un core/frente; PMO por encima de ambos sectores (ver
`docs/METODOLOGIA-SPRINT.md`).

### Sector A — ERP multi-tenant
| Core | Estado del frente |
|---|---|
| **Pagos** | adapter REST MP + dispatch de gateway por tenant en main; falta checkout/seña + credenciales OAuth |
| **Caja** | arqueo en vivo + rediseño `/admin/caja` en main; `add_cash_register` SIN aplicar |
| **Inventario/POS** | compras/reposición + ledger `StockMovement` cableado en main; migraciones SIN aplicar |
| **Fiscal** | soap adapter + worker wiring + config fiscal por tenant en main; falta `TraSigner`+cert (Gate 4) |
| **Plataforma** | observabilidad v2 + reporting + `FORCE_TENANT_SLUG` + **fix del gate RLS** en main; **RLS a prod es su Gate clave (#1)** |
| **Diseño** (ahora core) | sistema de diseño/tokens/branding; adopción por pantallas admin pendiente |

### Sector B — Agencia Grow *(antes "Agencia Digital")*
**Nombre oficial: Agencia Grow** (ADR-030). **Misión:** hacer **escalar el patrimonio de los dueños**
desarrollando **negocios automatizados —online o físicos—** con expertos de todas las áreas operando como
agentes. Charter `docs/sectores/agencia-digital.md` + `FUNDAMENTO.md` §0. **Misma metodología y PMO,
repos/deploys SEPARADOS** del ERP. Visión: **la Agencia es el go-to-market del propio ERP** (vende
ERP/ARCA/storefront) — uno de los negocios automatizados que sabe montar.
| Frente | Estado |
|---|---|
| **Consultores / Análisis de mercado** | análisis en `analisis-mercado/`; **alcance definido: CABA + local + online**; **informe nocturno en preparación** |
| **Desarrolladores** | **construyendo productos** (los que Consultores validan; go-to-market del propio ERP/ARCA/storefront) |
| **PMO proactivo (Agencia)** | visión y alcance definidos; coordinando la construcción de productos + el informe nocturno. **Sector ratificado como ADR (2026-07-05):** ADR-028 (gobierno único, repos separados, puente productizado) + ADR-029 (modelo de pricing de los dos motores + planes por Feature Flags; montos = gate de dueño). Trabajo abierto en `PROXIMOS-PASOS.md` → "SECTOR AGENCIA DIGITAL" (crear espacio `agencia-digital`, `/sesion-feature` Panel del Dueño, mapeo plan→flags) |

---

## 8. Para retomar — próximos pasos claros

1. **Leé esta foto** + `docs/ESTADO-FRENTES.md` (tablero) + `## Sprint activo` de `docs/SPRINT-MOVIL.md`.
   Si abrís con `sprint`, esto ES la FASE 0 (no salteable).
2. **Palanca #1 — prender Magra (secuencia del §4):** RLS a prod (ensayo en branch de Neon → cablear
   app → rotar `DATABASE_URL` → aplicar) → alta de Magra (`provision-tenant.ts`) → deploy sitio
   `magra-erp` (`FORCE_TENANT_SLUG=magra`). Todo con OK explícito por gate.
3. **✅ Colisión de timestamp `20260705150000` — RESUELTA** (frente Fiscal, §5). Antes de `migrate deploy`,
   verificá que no aparezcan colisiones NUEVAS de otros frentes.
4. **Higiene:** cerrar el refactor sin commitear en el tree de `main` (§6) y el wiring `completeAppointment`.
5. **Sector Agencia:** el PMO de Agencia baja la visión (§7) a backlog de productos vendibles.
6. **Estado:** no hay nada rojo en `main` (`35603bd`); prod estable en `f0a13f0`. El delta sin deployar
   son fixes/docs (no urgen deploy).

> **Gates = acción del dueño.** Nada de RLS/alta/deploy/migraciones se corre solo. Este doc + los
> runbooks (`docs/runbooks/`) son el guion para ejecutarlos cuando el dueño dé el OK.
