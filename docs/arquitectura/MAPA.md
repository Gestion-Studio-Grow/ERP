# Mapa de arquitectura — estetica-erp

> **Qué es:** la foto estructural del sistema (capas, dependencias, límites de dominio, puntos
> de acoplamiento) que produce y mantiene el **frente de Excelencia en Arquitectura**. Complementa
> `docs/ESTADO-ACTUAL.md` (foto operativa: main/prod/gates/tenants) con la **foto de diseño**.
> El detalle de *decisiones* vive en `docs/adr/`; acá va el *estado del código* contra esas decisiones.

- **Actualizado:** 2026-07-06 · **Autor:** frente Arquitectura (relevamiento con 3 exploradores read-only sobre `main` @ `478fdfc`)
- **Método:** barrido estático del repo (`src/`, `prisma/`, `docs/adr/`). **Cero queries a Neon** (política free-plan). Métricas de líneas/importadores son del árbol de `main`.

---

## 1. Vista de capas (de afuera hacia adentro)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  BORDE / RUTAS  (src/app)                                                 │
│  (site)  admin/(dashboard)  operador/(console)  contador  tienda  premium │
│  api/ (cron · webhooks/mercadopago · public/v1 · health)                  │
│      │  Server Actions ("use server")        │  Route Handlers (api/)     │
└──────┼──────────────────────────────────────┼─────────────────────────────┘
       ▼                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  APLICACIÓN / DOMINIO  (src/lib/*-actions.ts + *-core.ts)                 │
│  actions.ts · catalog-actions · order-actions · caja-actions · stock-*   │
│  commission · coupon · client · user · waitlist · reminders · reviews    │
│  ── núcleos puros (sin efectos): booking-core · order-core · *-core ──    │
│  ── motores puros de reporte: report-kpis · owner-insights · owner-trends │
└──────┬──────────────────────────────────────┬─────────────────────────────┘
       ▼                                       ▼
┌──────────────────────────┐   ┌──────────────────────────────────────────┐
│  PLATAFORMA (transversal) │   │  INTEGRACIONES (glue Core↔Plugin)         │
│  tenant · tenant-context  │   │  arca-dispatch · mercadopago-dispatch     │
│  rls · prisma/db/base     │   │  invoice-core (hub) · invoice-from-*      │
│  session · auth · authz   │   │  public-api-auth · external-orders        │
│  capabilities · audit     │   └───────────────┬──────────────────────────┘
│  logger · datetime        │                   ▼
└──────────┬────────────────┘   ┌──────────────────────────────────────────┐
           │                    │  PLUGINS (src/plugins) — hexagonal, ADR-002│
           ▼                    │  arca/ (WSAA+WSFEv1)   mercadopago/  pagos/ │
┌──────────────────────────┐   │  hablan por evento (outbox) + comando; NUNCA│
│  DATOS  (prisma)          │   │  importan el Core (verificado: 0 imports)  │
│  schema · migrations · rls│   └──────────────────────────────────────────┘
│  Postgres/Neon            │
└──────────────────────────┘

  BLUEPRINTS (src/blueprints) = configuración pura por rubro (servicios · carniceria · retail/*
  · generico pendiente). Cero schema propio. Se ingesta en provisioning y control-plane.
```

**Números de referencia (main @ `478fdfc`):** `src/lib` ≈ 89 archivos / ~11.6k líneas · `src/plugins` 36 archivos · `src/blueprints` 10 · `src/components` 11 (UI pura) · 28 migraciones · 27 archivos de test.

---

## 2. Contratos y reglas de diseño vigentes (contra las que se mide el código)

| Regla | Fuente | Estado en el código |
|---|---|---|
| Un Core, cada cliente = tenant (datos, no fork) | FUNDAMENTOS §1 | ✅ respetado |
| Aislamiento por `tenantId` + RLS es la línea roja | ADR-001/018 | ⚠️ RLS **escrito, apagado** (`RLS_ENFORCEMENT=off`); hoy aislamiento app-level |
| Resolución de tenant fail-closed | ADR-015 | ✅ `tenant.ts` lanza si ≠1 sin subdominio/pin |
| Plugin no toca DB/Core; habla por evento+comando | ADR-002 | ✅ 0 imports inversos plugin→Core |
| Server Actions = contrato de API del Core | ADR-020 | ✅ ~90 actions por dominio |
| Blueprint = config pura, cero schema | ADR-002 | ✅ |
| Verde antes de commitear (tsc+build, test si aplica) | METODOLOGIA-SPRINT | ⚠️ `test` **no** es gate formal; `tsc` no está en `predeploy-check` |

---

## 3. Puntos de acoplamiento (hubs y hojas)

**Hojas transversales sanas** (las importa medio repo, pero ellas casi no importan nada → bajo riesgo de cambio):
- `tenant.ts` (142 ln, **27+ importadores**) — resuelve `tenantId`. Hoja por diseño.
- `prisma.ts` (12 ln, **28 importadores**) — conmutador `basePrisma`↔`rlsPrisma` según flag. Exposición mínima.
- `rls.ts` (155 ln, **12 importadores**) — extensión `$allOperations` + `tenantTransaction`/`bookingTransaction`. Inyecta el tenant, no lo resuelve.
- `audit.ts`, `logger.ts`, `datetime.ts` — utilidades de entrada, sin fan-out.

**Hub de dominio:** `invoice-core.ts` (159 ln) — centro de facturación; lo consumen `invoice-from-{appointment,order,mp}`, `arca-dispatch`, `mercadopago-dispatch`. Bien estructurado (Core→outbox; plugin→comando).

**Acceso a datos:** directo `prisma.model.*` (28 archivos, lecturas) · `tenantTransaction` (12, escrituras multi-tabla) · `bookingTransaction` (2, Serializable+retry anti-TOCTOU). `basePrisma` crudo solo en `tenant.ts`/`rls.ts`/`session.ts`/`operator-db.ts`/`public-api-auth.ts` (resolución/bootstrap pre-contexto, a propósito).

**Sin dependencias circulares detectadas.**

---

## 4. God-files y concentración de responsabilidad

| Archivo | Líneas | Diagnóstico |
|---|---|---|
| `src/lib/actions.ts` | **1.026** · 18 funciones · 16 imports | 🔴 **God-file**: mezcla booking + facturación + reportes + stock + caja en un archivo. Cambiar un dominio arriesga otro. Candidato #1 de split (booking / invoice / report). Históricamente el archivo del choque ADR-024. |
| `src/lib/catalog-actions.ts` | **547** · 25+ funciones | 🟡 monolito CRUD, **sin** acoplamiento transversal (solo audit/authz). Split por entidad (boxes/services/professionals/products/resources) es cosmético, baja prioridad. |
| `src/lib/wa-intent.ts` | 493 | 🟢 puro (parser NL), sin DB. Tamaño OK para su rol. |

---

## 5. Límites de dominio — respetados vs. tensionados

✅ **Respetados:** Core↔Plugin (ARCA, MP), Blueprints↔provisioning, componentes UI sin lógica de negocio, motores de reporte puros sin Prisma.

⚠️ **Tensionados (deuda de diseño, no bug):**
- `actions.ts` cruza booking→(facturación, stock, reportes) dentro del mismo archivo (ver §4).
- `order-actions.ts` importa directo `caja/cash-sale` (order→caja acoplado; candidato a puerto `CashRecorder` inyectable).
- Aislamiento por tenant depende de disciplina del dev mientras RLS esté apagado: **`booking-core.assertSlotAvailable` no valida que `professionalId`/`boxId`/`serviceId` sean del tenant actual** (mitigado hoy porque solo lo alcanzan actions con `requireCapability`; RLS lo cerraría de raíz).

---

## 6. Riesgos vivos con evidencia (resumen; detalle y prioridad en BACKLOG-MEJORAS.md)

| # | Riesgo | Evidencia | Severidad |
|---|---|---|---|
| R1 | Webhook MP **sin verificación de firma** `x-signature` | `src/app/api/webhooks/mercadopago/route.ts` (TODO ADR-024) | 🔴 crítico *cuando* se prenda facturación (hoy flag OFF → inerte) |
| R2 | RLS apagado → aislamiento solo app-level + queries sin predicado `tenantId` (perf F1) | `RLS_ENFORCEMENT=off`; ADR-023 F1 | 🔴 gate del 2º tenant (Gate 2 dueño) |
| R3 | Dinero como `Float` en 31+ campos, incl. `Invoice.neto/iva/total` | `prisma/schema.prisma` (nota §divergencia) | 🟡 alto — decisión de arquitectura (ADR pendiente) |
| R4 | Redondeo de dinero **inconsistente**: fiscal usa EPSILON-safe, POS (caja/order/compra) no | `fiscal.ts` `redondear` vs `src/lib/round.ts` `round2` | 🟡 medio — **abierto**: las 4 copias del POS ya se unificaron (dedup, `round.ts`, 2026-07-06); unificar POS↔fiscal en EPSILON **cambia el redondeo del POS al medio centavo** → decisión PMO/ADR (BACKLOG M1) |
| R5 | `CRON_SECRET` comparado sin timing-safe | `src/app/api/cron/reminders/route.ts` | 🟡 medio |
| R6 | `actions.ts`/`booking-core`/auth/authz/webhooks **sin tests** | 27 tests no cubren el borde de dominio | 🟡 alto |
| R7 | Config fiscal **provisional** (CUIT/PV/alícuota hardcodeados) | `fiscal.ts:35-51` | 🟡 alto — bloquea facturación real |
| R8 | `test` y `tsc` no son gate formal de predeploy | `package.json` / `predeploy-check.mts` | 🟡 medio |

**Fortalezas confirmadas:** 0 `@ts-ignore`/`any` explícito en `src/` (type-safe), economía de deps (ADR-008), plugins hexagonales limpios, transacciones consistentes, fail-closed en tenant y API pública (comparación timing-safe de api-keys).

---

## 7. Cómo se mantiene este mapa
Frente continuo: cada tanda de arquitectura re-corre el relevamiento (o el delta), actualiza §3–§6 y sincroniza el backlog. Cambios que toquen cimientos (schema/tenancy/auth) → los **secuencia el PMO** (regla 5 de METODOLOGIA-SPRINT), no se integran unilateralmente.
