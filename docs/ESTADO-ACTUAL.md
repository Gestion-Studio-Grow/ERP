# ESTADO ACTUAL — la foto completa (para retomar sin perderse)

**Qué es:** la foto viva del sistema para arrancar cualquier sprint/sesión sin re-descubrir el
contexto. La **produce/actualiza el PMO en la FASE 0 (Exploración)** de cada `sprint` y se
**re-taggea en la FASE FINAL (Backup)** (ver `docs/METODOLOGIA-SPRINT.md`). Si algo de acá no
coincide con el repo/prod, gana el repo y este doc se corrige en el acto.

- **Actualizado:** 2026-07-05 (post-deploy) · **Autor:** PMO (sesión autónoma)
- **Método:** barrido del repo (`git log`, `prisma/migrations/`, `src/blueprints/`, docs) +
  datos del dueño. **NO se consultó Neon prod** en esta sesión (política: diagnóstico, no tocar
  prod/DB) → el estado de migraciones *aplicadas* se deriva de la documentación y se marca
  "a confirmar" donde no hay evidencia dura.

---

## 1. Git / código

| Ítem | Valor |
|---|---|
| **main HEAD (origin)** | `d258579` — `docs(runbook): alta de Magra en prod (2º tenant) + activación de RLS` |
| **Deployado en prod** | **`f0a13f0`** (merge `land-inventario-f1b`) |
| **Delta prod → main** | 1 commit **solo-docs** (`d258579`, el runbook) → **prod y main son iguales en código** |
| **Snapshot tag** | **`snapshot/2026-07-05-postdeploy`** (anotado) → apunta a `f0a13f0`, pusheado a origin |

> El runbook `d258579` **describe** el alta de Magra + activación de RLS; **no los ejecuta**.
> Ambos siguen pendientes (Gate 2, ver §4).

**Cores activos (últimos commits en main):** Pagos (gateway de cobros por tenant), Caja (arqueo en
vivo + rediseño `/admin/caja`), Inventario/POS (ledger `StockMovement` cableado a venta/compra/
consumo), Fiscal (wiring `clientePara` del worker ARCA + config fiscal por tenant), Plataforma
(observabilidad v2 con `requestId`).

---

## 2. Prod: qué está vivo

- **App deployada** en Netlify + Neon (Postgres), corriendo `f0a13f0`.
- **Auto-publish de Netlify APAGADO** (`stop_builds`): push a `main` **no** publica. Deploy = acción
  del dueño (Gate 1). El deploy de `f0a13f0` ya fue hecho por el dueño.
- **Vertical maduro en prod:** núcleo de servicios/estética (agenda, clientes, catálogo, cobro
  manual, comisiones, reseñas, recordatorios, RBAC, auditoría).

---

## 3. Tenants

| Tenant | Slug | Blueprint | Estado |
|---|---|---|---|
| **CH Estética** (Carolina Haponiuk) | `beauty-spa` | `estetica` | ✅ **VIVO en prod** — único tenant real operando |
| **Magra** (carnicería boutique) | `magra` | `carniceria` | 🚧 **CONSTRUIDO, SIN ALTA en prod** — tenant + playbook de preventa listos; el alta del 2º tenant está **gated por RLS** (el provisioning se niega a crear la 2ª fila `Tenant` sin RLS activo) |

**Gate de prod de Magra (decisión de dueño, no técnica):** cobro MP online, fotos, precios reales.

---

## 4. Gates pendientes (acción del dueño)

| Gate | Qué destraba | Estado |
|---|---|---|
| **RLS a prod (Gate 2)** | aislamiento por fila a nivel DB → habilita el **2º tenant (Magra)** y todo el negocio multi-tenant | 🔒 diseño+SQL escritos y verificados offline (`prisma/rls/`, 28/28); falta ensayo en branch de Neon + cablear app + rotar `DATABASE_URL` a `app_user` + aplicar |
| **Certificado + homologación ARCA** | facturación electrónica viva (firma CMS del `TraSigner`) | 🔑 adapter SOAP escrito; falta cert del emisor + homologación + flag `ARCA_INVOICING_ENABLED` |
| **Dominio propio** | servir tenants por dominio/subdominio (hoy el root sirve CH hardcodeado, ver §6) | 🔑 pendiente registrar/apuntar dominio + resolución por request |
| **Deploy a prod (Gate 1)** | publicar en Netlify | ✅ usado para `f0a13f0`; futuros pushes requieren nuevo OK ("deployá") |

**Credenciales que encienden features ya construidas:** WhatsApp (proveedor Meta/Twilio), Mercado
Pago (OAuth por comercio) — infra/adapters listos, esperan credencial.

---

## 5. Migraciones: aplicadas vs SIN aplicar

> ⚠️ **No verificado contra Neon esta sesión.** "Aplicada" = hay evidencia en docs
> (`BACKLOG.md` / `ESTADO-FRENTES.md` / `PROXIMOS-PASOS.md`). "SIN aplicar" = Gate 2 pendiente.

**✅ Aplicadas a Neon (hasta `add_waitlist`):** `init` → … → `20260703170000_add_users_rbac` →
`20260704120000_add_business_settings` → `20260704130000_add_commission_payouts` →
`20260704140000_add_waitlist`. *(evidencia explícita: business_settings, commission_payouts,
waitlist "aplicada a Neon"; el resto sostiene la app en prod).*

**🔒 SIN aplicar — Gate 2 (código deployado, DB no migrada):**
- `20260704160000_add_invoice_outbox` — Invoice/Outbox del Plugin ARCA (doc: "NO aplicada a Neon").
- `20260704180000_add_pos_orders` — POS/órdenes. **⚠️ a confirmar** contra Neon (POS venta opera; puede estar aplicada).
- `20260705120000_control_plane_tenant` — plano de control / super-admin.
- `20260705124318_add_cash_register` — caja del POS (doc: SIN aplicar).
- `20260705130000_add_product_track_stock` — `trackStock` (doc: SIN aplicar).
- `20260705140000_add_stock_purchases` — compras/reposición (integrada este sprint, SIN aplicar).
- `20260705150000_add_stock_ledger` — ledger `StockMovement`.
- `20260705150000_add_tenant_fiscal_config` — config fiscal por tenant.

**🛑 RIESGO DE ORDEN — colisión de timestamp:** **dos** migraciones comparten prefijo
`20260705150000` (`add_stock_ledger` y `add_tenant_fiscal_config`). Prisma las ordena por el nombre
completo (alfabético → `ledger` antes que `tenant_fiscal_config`), pero es **frágil y confuso**.
**Resolver ANTES del próximo `migrate deploy`**: renombrar una a un timestamp posterior (p. ej.
`20260705150001_add_tenant_fiscal_config`) para dejar el orden explícito. Es justo el tipo de error
de migración que la FASE 0/BACKUP busca prevenir.

**RLS:** los SQL de RLS viven **fuera** de `prisma/migrations/` a propósito (`prisma/rls/`) — ningún
`migrate deploy` los aplica solo (ver `prisma/rls/README.md`).

---

## 6. Bugs / deuda conocida

- **🐞 Redirect / home `/`:** el root (`src/app/(site)/page.tsx`) sirve la **landing de CH
  hardcodeada** (componentes `_ch/*`, `force-dynamic`), **sin resolución por dominio/tenant**. Con
  más de un tenant, `/` no enruta al tenant correcto. *(Detalle exacto del redirect reportado por el
  dueño: a confirmar/reproducir — queda como bug conocido a atacar junto con RLS + dominio propio.)*
- **Wiring `completeAppointment` (ADR-024)** pendiente de commitear limpio (ver `PROXIMOS-PASOS.md`).
- **WIP inconcluso fuera de main** (del sprint anterior): ARCA `signer.ts` (falta dep `node-forge`
  + wiring), y sin-commitear en worktrees viejos (`caja/CajaForms.tsx`, mods de `caja-actions.ts`).
- Detalle de deuda técnica priorizada: `docs/ROADMAP.md §2.3` (F1/F3/F8) y `PROXIMOS-PASOS.md`.

---

## 7. Cores y quién está a cargo (modelo por dominio)

Cada sesión es dueña de un core; el PMO por encima (ver `docs/METODOLOGIA-SPRINT.md`).

| Core | Alcance | Estado de su frente |
|---|---|---|
| **Pagos** | adapters/gateway de cobros (MP, checkout/seña, webhooks, conciliación) | adapter REST MP + dispatch por tenant en main; falta checkout/seña + credenciales |
| **Caja** | caja del POS + UX `/admin/caja` | arqueo en vivo + rediseño en main; migración `add_cash_register` SIN aplicar |
| **Inventario/POS** | stock, productos, compras/reposición, proveedores, ledger | compras + ledger cableado en main; migraciones SIN aplicar |
| **Fiscal** | ARCA/WSFEv1, facturación, certs | soap adapter + worker wiring en main; falta `TraSigner`+cert (Gate) |
| **Plataforma** | RLS/tenancy, perf, auth, observabilidad, reporting | observabilidad v2 + reporting en main; **RLS es su Gate 2 clave** |
| **PMO** | estrategia, secuenciación de cimientos, merge-master | esta sesión (sobre `main`) |

---

## 8. Para retomar (checklist rápido)

1. Leé esta foto + `docs/ESTADO-FRENTES.md` (tablero por frente) + `## Sprint activo` de
   `docs/SPRINT-MOVIL.md`.
2. **Antes de cualquier `migrate deploy`:** resolvé la colisión de timestamp `20260705150000` (§5).
3. El desbloqueo de mayor palanca sigue siendo **RLS a prod → alta de Magra** (Gate 2).
4. No hay nada rojo en main: `f0a13f0` está deployado y estable.
