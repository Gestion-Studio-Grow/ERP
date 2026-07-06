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
> runbook. **✅ Repo YA actualizado al rol nuevo (`b01eb78`, 2026-07-05):** `0002_app_role.sql` crea
> `app_rls` (ya no patchea `app_user`); `check-rls-live.mjs`, `verify-rls.mjs`, `verify-provision-gate.mts`,
> `verify-wiring.mts`, `verify-tenant-resolution.mts`, README y runbooks apuntan a `app_rls`. Vallas
> verdes (tsc·229 tests·3 nets RLS·build).

> **✅ BLOQUE A APLICADO A PROD (2026-07-05, OK del dueño):** con la conexión de owner (`neondb_owner`)
> se aplicó `0001` (**RLS 33/33, SIN DRIFT** — cerrado el drift de las 9 tablas) y `0002` (**rol `app_rls`
> creado**: canlogin=true, bypassrls=false, super=false, **SIN password** = inerte hasta que el dueño le
> ponga una). `app_user` legacy intacto (no se tocó). **Prod NO cambió de comportamiento** (la app sigue
> conectando como `neondb_owner` → RLS dormido; CH intacto). **Hallazgo del apply:** `ALTER ROLE app_rls
> … NOBYPASSRLS` también da *permission denied* en Neon (atributo BYPASSRLS es superuser-only) → se quitó
> del `0002` esa línea redundante (el CREATE ya nace `NOBYPASSRLS`); repo corregido. **Detenido acá a
> propósito** (no se rotó `DATABASE_URL` ni Netlify ni alta). **Falta:** password de `app_rls` (dueño) +
> rotación de env vars + deploy + alta.

### PASOS DEL GO-LIVE de Magra — CASI COMPLETO
1. ✅ **BLOQUE A** — RLS 33/33 en prod + rol `app_rls` creado (recuadro arriba).
2. ✅ **Password de `app_rls` + rotación de env vars en Netlify + deploy** (hechos por el dueño):
   **CH corriendo con `app_rls`, `RLS_ENFORCEMENT=on`** → RLS ACTIVO y enforced en prod.
3. ✅ **Alta de Magra — HECHA (2026-07-06, 2º tenant real)** vía `scripts/provision-tenant.ts` con el
   rol owner. `tenantId=cmr8nncxj0000aoh7cqpn7yyg`, slug `magra`, blueprint `carniceria`, OWNER +
   BusinessSettings + catálogo demo sembrados. **El gate ADR-018 ABRIÓ** (RLS activo → permitió el 2º
   tenant). **Aislamiento verificado en prod como `app_rls`:** ctx=CH ve solo CH, ctx=Magra ve solo
   Magra, sin ctx → 0 filas (fail-closed). 🟢
4. 🔴 **Deploy `magra-erp`** → 2º sitio Netlify (mismo repo) con `FORCE_TENANT_SLUG=magra`. **Único paso
   que falta** (lo hace el dueño con sus secrets). Sin dominio propio, es la Opción A (URL gratis por tenant).
5. ⚠️ **Email del OWNER de Magra es PROVISIONAL** (`dueno@magra.com.ar`) → confirmar/reemplazar por el real
   y comunicar/rotar la contraseña de bootstrap por canal seguro.

**Template de `DATABASE_URL` para `app_rls`** (ya cargado en Netlify por el dueño; queda de referencia):
`postgresql://app_rls:<PASSWORD>@ep-little-credit-act3cxpe-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`

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

| Tenant | Slug | Subdomain | Blueprint | Estado |
|---|---|---|---|---|
| **CH Estética** (Carolina Haponiuk) | `beauty-spa` | `chestetica` | `estetica`/servicios (col `blueprintId` null → default) | ✅ **VIVO en prod** — corriendo con `app_rls` + RLS enforced. Subdomain seteado 2026-07-06 |
| **Magra** (carnicería boutique) | `magra` | `magra` | `carniceria` | ✅ **ALTA HECHA (2026-07-06)** — `tenantId=cmr8nncxj0000aoh7cqpn7yyg`. Subdomain seteado. Email OWNER **provisional** |
| **Shine Velas** (velas artesanales) | `shinevelas` | `shinevelas` | `velas` (retail/tienda) | ✅ **ALTA HECHA (2026-07-06)** — `tenantId=cmr9b3b5a0000m8h7913rkvf3`, OWNER+Settings+catálogo velas sembrados; aislamiento (policy+RLS) verificado. Email OWNER **provisional** (`dueno@shinevelas.com.ar`); pass bootstrap en `estetica-erp/.env` |
| **A Dos Manos** (cancha de pádel) | `adosmanos` | `adosmanos` | `servicios` (turnos) | ✅ **ALTA HECHA (2026-07-06)** — `tenantId=cmr9b3kij0000fkh73ax0d85h`, OWNER+Settings+catálogo servicios sembrados; aislamiento (policy+RLS) verificado. Email OWNER **provisional** (`dueno@adosmanos.com.ar`); pass bootstrap en `estetica-erp/.env` |

**4 tenants listos** para el deploy único de Vercel por subdominio (`<sub>.<APP_BASE_DOMAIN>`). Migración
`control_plane_tenant` (columna `subdomain`) confirmada **aplicada** en prod. Nuevo rubro retail `velas`
(`src/blueprints/retail/rubros.ts`) + mapeo `shinevelas→velas` para la vidriera `/tienda`. Verificador
read-only reusable: `prisma/rls/verify-tenant-isolation.mjs`.

**Gate de negocio de Magra (decisión de dueño, no técnica):** cobro MP online, fotos, precios reales.

---

## 4. Gates pendientes (acción del dueño) — el camino para prender Magra

Orden lógico para dar de alta Magra end-to-end:

| # | Gate | Qué destraba | Estado |
|---|---|---|---|
| 1 | **RLS a prod (Gate 2)** | aislamiento por fila a nivel DB → **prerrequisito duro del 2º tenant** | 🔒 **⚠️ Prod NO está "de cero" (auditado 2026-07-05, solo lectura vía `check-rls-live.mjs`):** RLS ya aplicado en **24/33 tablas**; **DRIFT — 9 tablas sin proteger** (`Order, OrderItem, Invoice, OutboxEvent, CashMovement, CashSession, StockMovement, StockPurchase, StockPurchaseItem`) → filtrarían entre tenants; y **`app_user` con `BYPASSRLS=true`** → rotar a él daría CERO aislamiento (hoy prod no se rompe: conecta como `neondb_owner`, RLS dormido). **Ensayo offline PASADO** (`verify-provision-gate.mts`): gate bloquea sin RLS → abre con RLS → aislamiento + fail-closed. **Bugs hallados y corregidos (repo):** el sentinel del gate incluía `Tenant` → nunca abría (`8b9d989`); `0002` no forzaba `NOBYPASSRLS` en rol existente (fix 2026-07-05). **ENSAYO EN BRANCH DE NEON REAL: 🟢 VERDE 8/8 (2026-07-05, branch borrado):** el branch replicó el drift (24/33) → `0001` cerró a 33/33 → aislamiento OK conectando como rol de app → fail-closed. **Hallazgo que cambia el plan:** `app_user` con BYPASSRLS es INARREGLABLE por `neondb_owner` (necesita superuser) → **usar rol NUEVO `app_rls`** (`CREATE ROLE … NOBYPASSRLS`, probado). **✅ Repo ya actualizado al rol nuevo (`b01eb78`): `0002`/guards/runbooks apuntan a `app_rls`, vallas verdes.** Falta: OK final + password de `app_rls` (secret). Runbook: `docs/runbooks/alta-magra.md` |
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
- **✅ Redirect / home `/` — CERRADO (`b01eb78`, 2026-07-05):** el root (`src/app/(site)/page.tsx`)
  ahora es **blueprint-aware**: un tenant Retail/Mostrador (Magra y rubros de `src/blueprints/retail`)
  redirige `/`→`/tienda` en vez de servir la landing de estética de CH; un tenant de servicios (CH)
  sigue con su landing. Reusa `getCurrentTenantSlug` + `resolveRubroIdBySlug`; fail-open (slug null /
  rubro no-retail → landing histórica). Combinado con `FORCE_TENANT_SLUG` (`685b5c9`, pin por sitio,
  Opción A), cada sitio Netlify sirve su tenant con el home correcto. La resolución por dominio (Opción
  B) sigue atada a dominio propio (§4), pero el bug del home equivocado ya no existe.
- **Wiring `completeAppointment` (ADR-024)** pendiente de commitear limpio (ver `PROXIMOS-PASOS.md`).
- **WIP inconcluso fuera de main:** ARCA `signer.ts` (falta dep `node-forge` + wiring); y un refactor
  en curso en el checkout de `main` (borra `pagos-dispatch.ts`/`request-context.ts`, folds en
  `mercadopago-dispatch`/`logger`, toca api routes) **sin commitear** — de otra sesión, pendiente de
  que su dueño lo cierre.
- Deuda técnica priorizada: `docs/ROADMAP.md §2.3` (F1/F3/F8) y `PROXIMOS-PASOS.md`.

---

## 7. Estado por frente/core — GESTIÓN STUDIO GROW + SUS TRES UNIDADES

**Estructura de la compañía (regla definitiva del dueño, 2026-07-05):** el **estudio paraguas
Gestión Studio Grow** tiene **TRES** unidades, no dos:

| Unidad | Qué es | ¿Gira alrededor del ERP? | Charter |
|---|---|---|---|
| **1. ERP multi-tenant** | El producto SaaS core | — (es el producto) | `FUNDAMENTOS-Y-VISION.md` |
| **2. Agencia Digital** | Satélite del ERP: marketing + dev + innovación para venderlo y sumarle features | ✅ Sí | `docs/sectores/agencia-digital.md` |
| **3. Agencia Grow** | Los **negocios propios del grupo**, con beneficio | ❌ No | `docs/sectores/agencia-grow.md` |

> Antes esto figuraba como "2 sectores" (ERP + Agencia Digital), con Grow **fusionada** dentro de
> Digital. Separadas el 2026-07-05: el Panel del Dueño pasó a Grow; Digital quedó limpia (satélite ERP).

Modelo: cada sesión es dueña de un core/frente; PMO por encima de las tres unidades (ver
`docs/METODOLOGIA-SPRINT.md`).

### Unidad 1 — ERP multi-tenant
| Core | Estado del frente |
|---|---|
| **Pagos** | adapter REST MP + dispatch de gateway por tenant en main; falta checkout/seña + credenciales OAuth |
| **Caja** | arqueo en vivo + rediseño `/admin/caja` en main; `add_cash_register` SIN aplicar |
| **Inventario/POS** | compras/reposición + ledger `StockMovement` cableado en main; migraciones SIN aplicar |
| **Fiscal** | soap adapter + worker wiring + config fiscal por tenant en main; falta `TraSigner`+cert (Gate 4) |
| **Plataforma** | observabilidad v2 + reporting + `FORCE_TENANT_SLUG` + **fix del gate RLS** en main; **RLS a prod es su Gate clave (#1)** |
| **Confiabilidad/SRE** (Célula 2) | **en main (2026-07-06):** runbook de hardening (`docs/runbooks/hardening-produccion.md`) + vallas (`npm run gates` = tsc+tests+regresión RLS · `npm run load-test` · `global-error.tsx`); **rate limiting** en logins `/admin` y `/operador` (`src/lib/rate-limit.ts`, 5 fallos/15min por IP); **firma del webhook MP** validada (HMAC fail-closed, `src/plugins/mercadopago/signature.ts`). Follow-ups en el runbook: rate-limit API pública, cron fail-closed, plan pago Neon. **Nuevo secreto de prod: `MP_WEBHOOK_SECRET`** (al activar MP real). **PREP DEPLOY VERCEL (2026-07-06):** `vercel.json` (build `prisma generate && next build` + cron **diario** — Hobby no permite horario) + CI `.github/workflows/gates.yml` (`npm run gates` en cada push) + runbook `docs/runbooks/deploy-vercel.md` (un solo deploy, subdominios por tenant vía `APP_BASE_DOMAIN`+`Tenant.subdomain`, env vars, apex fail-closed con >1 tenant). ⚠️ **Gate de lint de `npm run gates` viene ROJO en main** (13 errores preexistentes de otros frentes en `_ch/`+admin dashboard, agregado por otra sesión) → el CI arrancará rojo hasta que los dueños los limpien. |
| **Diseño** (ahora core) | sistema de diseño/tokens/branding; adopción por pantallas admin pendiente |

### Unidad 2 — Agencia Digital (satélite del ERP)
Charter `docs/sectores/agencia-digital.md` + `FUNDAMENTO.md`. **Misma metodología y PMO, repos/deploys
SEPARADOS** del ERP. Visión: **satélite del ERP** — vender el ERP y sumarle features (go-to-market).
| Frente | Estado |
|---|---|
| **Consultores / Análisis de mercado** | 5 análisis en `analisis-mercado/`; alcance **CABA + local + online** |
| **Desarrolladores** | **WhatsApp conversacional** (`src/lib/wa-intent.ts` + test 🟢) + **benchmarking cross-tenant** (`src/lib/benchmark-aggregate.ts` + test 🟢, ADR-027) — ambos ERP-órbita |
| **PMO proactivo (Agencia)** | visión y alcance definidos; coordina construcción + informe nocturno |

### Unidad 3 — Agencia Grow (negocios propios del grupo)
Charter `docs/sectores/agencia-grow.md`. **NO es satélite del ERP:** desarrolla los negocios propios del
grupo, con beneficio para los dueños. Separada de Digital el 2026-07-05.
| Frente | Estado |
|---|---|
| **Panel del Dueño** | `src/lib/owner-insights.ts` + `src/lib/owner-trends.ts` (+ tests 🟢) — insights/tendencias de negocio single-tenant. Spec en `docs/sectores/agencia-digital/2026-07-05-pmo-propuesta-producto-1.md` (queda ahí por refs de código; es de Grow) |
| **Cartera de negocios propios** | ⚠️ **a confirmar por el dueño:** `dos-manos-padel`, `shine-velas`, `crypto-bot`, `standup-board` (carpetas hermanas fuera de `estetica-erp`) — candidatos, sin tocar |

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
