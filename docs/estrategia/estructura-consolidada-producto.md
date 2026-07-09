# 🏛️ Estructura consolidada del producto (Comercio + Empresa) — BLUEPRINT MAESTRO

> **Qué es:** el **diseño de estructura cerrado, de una sola vez**, del producto completo GROW-AR —
> **Comercio** (perfil lite) + **Empresa** (perfil enterprise). Es el blueprint contra el que se construye
> **todo**: modelo de datos, pantallas, navegación y límites de módulo. Se fija **ahora** para no cambiarlo
> con clientes adentro (directiva del dueño: estándar de equipo experto, no se improvisa estructura).
>
> **Autor:** Arquitecto de Solución (GSG) · **Fecha:** 2026-07-08 · **Estado:** propuesto — **candidato a
> ADR-060**, para revisión adversarial de Opus (S5). · **Rama:** `claude/sprint-startup-generic-rf6x0m`
> (sin Neon, sin merge a main). · **Naming:** Comercio/Empresa de cara al cliente (lite/enterprise solo en
> código, ADR-059 D7).
>
> **Base cerrada sobre:** el **schema real** (`prisma/schema.prisma`, 30+ modelos), el **mapa de cobertura
> validado** (`mapa-cobertura-scope-items.md` + desafío S1 + revisión S5), el **roadmap M0–M5**
> (`roadmap-dos-modelos.md`), el **set mínimo Empresa** (`set-minimo-empresa-2026-07-08.md`), las
> **decisiones S5** (`decisiones-set-empresa-2026-07-08.md`) y la **nav ya cableada** (`src/modules/nav-groups.ts`).

---

## 0. Principios de estructura (invariantes que NO se rompen)

1. **Un Core, dos motores (ADR-058).** Comercio y Empresa son **el mismo código y el mismo schema**,
   distinto **perfil**. El perfil es una **dimensión ortogonal** al rol (RBAC) y al rubro (blueprint).
2. **`enterprise ⊇ lite` — crecé sin migrar (ADR-058 P3).** Empresa **nunca** ve menos que Comercio; subir
   de perfil **enciende** cosas, **nunca** migra ni reescribe datos. Toda entidad/pantalla nueva es
   **aditiva**.
3. **El perfil NO es seguridad (ADR-017).** La barrera de datos es el **rol/capability**. El perfil decide
   **presentación y profundidad**, no permisos sobre datos.
4. **Definir ≠ construir (ADR-055).** Este doc **define** la estructura completa; construir cada pieza es su
   propia `/sesion-feature` con su Gate. Fijar el mapa ahora es barato; rehacerlo con clientes adentro, caro.
5. **§C se eleva, no se ejecuta (ADR-048).** Toda migración de DB, deploy, secreto o dato real es **§C**
   (acción del dueño / Gate 2). Este doc los **marca**, no los corre.
6. **No invertir hasta vender (ADR-030).** Lo que no tiene demanda real hoy se **define y queda diferido**
   (no se construye especulativamente). El caso testigo: **J59 diferido hasta lead Empresa**.
7. **Anti dead-end (ADR-059 D3 fix #4 / MP-14).** Un ítem entra a la nav **solo cuando su pantalla existe**.

---

## 1. MODELO DE DATOS COMPLETO

### 1.1 Lo que YA EXISTE en el schema (no se toca — es la base probada)

**Núcleo servicios/operación (Comercio, en prod):** `Tenant` · `BusinessSettings` · `User` ·
`Professional` · `Service` · `ServiceCategory` · `Box` · `WorkingHours` · `Product` · `ServiceProduct` ·
`Client` · `Appointment` · `CommissionPayout` · `ProfessionalServiceCommission` · `ProfessionalBlock` ·
`Review` · `Coupon` · `AuditLog` · `MessageTemplate` · `ProfessionalNews` · `Resource` · `ServiceResource` ·
`WaitlistEntry` · `Payment`.

**POS / retail / caja / stock (Comercio mostrador):** `Order` · `OrderItem` · `CashSession` ·
`CashMovement` · `StockPurchase` · `StockPurchaseItem` · `StockMovement` (ledger F1b/F2, única fuente de
verdad del stock).

**Fiscal (ARCA):** `Invoice` (`Decimal(14,2)`, ADR-057) · `OutboxEvent` (transaccional) · config fiscal en
`Tenant` (`arcaCuit`/`arcaPuntoVenta`/`arcaHomologacion`).

**Perfil GROW-AR:** `Tenant.profile : TenantProfile(lite|enterprise) @default(lite)` — **YA en el schema**
(migración `20260708213237_add_tenant_profile`, aditiva con default). Es la **única** columna del rediseño
ya materializada.

### 1.2 Lo que FALTA — entidades nuevas del producto completo

Cada una: **cambio de schema**, **aditiva** (¿preserva los datos existentes sin backfill?), **§C** (¿es
migración = Gate 2?), y **cuándo** (gate de negocio). **Todas son aditivas** por diseño (invariante
`enterprise ⊇ lite`): agregan tablas/columnas nullable o enum values, nunca alteran/eliminan lo existente.

| # | Entidad nueva | Scope | Cambio de schema | Aditiva | §C | Cuándo se construye |
|---|---|---|---|---|---|---|
| **D1** | **`Supplier`** (proveedor maestro) | J45/18J · J59 · BMK | Tabla nueva `Supplier` (razón social, CUIT, contacto). FK **nullable** `StockPurchase.supplierId` (se conserva el `supplier` texto como snapshot/fallback) | ✅ | ✅ Gate 2 | Habilita compras formales/CxP/devoluciones. **Prerrequisito** de D2/D3/D6 |
| **D2** | **`AccountPayable` + `PayableCheque`** (cuentas a pagar + cheque diferido) | **J59** | 2 tablas nuevas: `AccountPayable`(supplierId, montos `Decimal(14,2)`, saldo, estado) + `PayableCheque`(nro, banco, fecha emisión, **fecha diferida**, endoso, estado) | ✅ | ✅ Gate 2 | **DIFERIDO hasta lead Empresa** (ADR-030, decisión S5). Spec lista, no se construye al voleo |
| **D3** | **`AccountReceivable`** (cuentas a cobrar / fiado) | 2F3 / J60 | Tabla nueva `AccountReceivable`(clientId, monto `Decimal(14,2)`, saldo, vencimiento?, estado) + link opcional a `Order`/`Invoice` | ✅ | ✅ Gate 2 | **Default OFF, gateado por RUBRO** (comercio de barrio). Comercio = fiado light (sin vencimiento); Empresa = + vencimiento/recordatorio (J60, aditivo sobre la misma tabla) |
| **D4** | **Devolución a proveedor** (BMK) | BMK | **Enum value nuevo** `StockMovementType.DEVOLUCION_PROVEEDOR` (+ `supplierId?` en el rastro). **NO** tabla nueva: reusa el ledger `StockMovement` | ✅ (enum additive) | ✅ Gate 2 (enum en migración) | Prioridad baja; sub-pantalla de Compras. Con D1 disponible |
| **D5** | **Recuento físico formal** (BMC) | BMC | Tabla nueva `StockCount`(estado, congelado) + `StockCountItem`(conteo vs sistema, diferencia) — genera `StockMovement.AJUSTE` al cerrar | ✅ | ✅ Gate 2 | **RESERVA.** El mínimo anti-oversell ya lo cubren `Ajustes`(AJUSTE) + `Compras`. Formal solo por demanda de rubro |
| **D6** | **Orden de compra formal** (J45/18J) | J45/18J | **Sin tabla nueva al lanzar:** hoy es **UI-only** sobre `StockPurchase` (razón social/CUIT/N° orden, S4 ya lo hizo). Si se formaliza estado borrador→enviada→recibida → campos aditivos en `StockPurchase` (+`supplierId` de D1) | ✅ | ✅ solo si se agregan campos | Comercio ya repone; Empresa profundiza. Formalización plena = con D1 |
| **D7** | **Libro mayor / contabilidad** (J58) | J58 | **Sin schema al lanzar:** es un **EXPORT** (CSV/Excel para el contador) sobre datos ya existentes (Invoice/Order/Payment). Libro mayor formal (`JournalEntry`) = **RESERVA** | ✅ (export = cero schema) | export: no · JournalEntry: §C | Export en M3; libro mayor formal solo si un cliente lo pide (el contador ya tiene su software) |
| **D8** | **Perfil persistido** (ya hecho) | ADR-059 D1 | `Tenant.profile` — **YA aplicado** (§1.1) | ✅ | ✅ (la única migración autorizada del rediseño) | ✅ hecho |

**Regla de dinero (ADR-057):** toda entidad con montos fiscales/deuda (`AccountPayable`, `AccountReceivable`,
`PayableCheque`) usa **`Decimal(14,2)`** en persistencia; el contrato del Core sigue en `number`, con la
conversión confinada al borde del repositorio (mismo patrón que `Invoice`).

**Multi-sucursal / multi-depósito:** **NO entra a esta estructura** (ADR-059 D8 fix Challenger #3):
`BusinessSettings` es singleton por tenant, "sucursal" no existe como entidad. Es **reingeniería aparte con
su propio ADR** — se declara **fuera de alcance** aquí a propósito (no se contrabandea como "aditivo").

### 1.3 Orden de dependencia de datos

```
Tenant.profile ✅ (hecho)
        │
Supplier (D1) ──┬── AccountPayable+Cheque (D2, J59, diferido lead)
                ├── Devolución proveedor (D4, enum, baja)
                └── Orden compra formal (D6, campos aditivos)
Client (existe) ── AccountReceivable (D3, fiado, rubro-gated)
Invoice/Order/Payment (existen) ── Export contable (D7) ── [JournalEntry reserva]
StockMovement (existe) ── StockCount formal (D5, reserva)
```
**Cuello:** `Supplier` (D1) es prerrequisito de CxP, devoluciones y compra formal plena → es la **primera
tabla nueva** a construir cuando se active el tramo Empresa con datos de proveedor.

---

## 2. MAPA COMPLETO DE PANTALLAS (/admin/*)

**Estado:** ✅ existe (ruta construida) · 🔨 a construir (hoy `ready:false`, no se cablea hasta existir).
**perfilMin:** `lite` = Comercio y Empresa · `enterprise` = solo Empresa (aditivo). **Gating:** universal ·
rubro (module-gating por blueprint) · default-OFF (opt-in).

| Ruta | Pantalla | Grupo nav | perfilMin | Gating | Estado | Scope | Entidad |
|---|---|---|---|---|---|---|---|
| `/admin` | Dashboard (home por rol/perfil) | Operación | lite | universal | ✅ | — | — |
| `/admin/turnos` | Agenda | Operación | lite | rubro (servicios) | ✅ | — | Appointment |
| `/admin/espera` | Lista de espera | Operación | lite | rubro (servicios) | ✅ | — | WaitlistEntry |
| `/admin/pedidos` | Pedidos | Operación | lite | rubro (retail) | ✅ | BD9 | Order |
| `/admin/caja` | Caja | Operación | lite | rubro (retail) | ✅ | BD9 | CashSession |
| `/admin/clientes` | Clientes | Clientes | lite | universal | ✅ | — | Client |
| `/admin/recordatorios` | Recordatorios | Clientes | lite | rubro | ✅ | — | MessageTemplate |
| `/admin/resenas` | Reseñas | Clientes | lite | rubro | ✅ | — | Review |
| `/admin/catalogo` | Catálogo | Inventario y compras | lite | universal | ✅ | — | Product/Service |
| `/admin/compras` | Compras (Empresa: órdenes formales) | Inventario y compras | lite | rubro | ✅ | J45/18J | StockPurchase (+D1/D6) |
| `/admin/ajustes` | Ajustes y mermas | Inventario y compras | lite | rubro | ✅ | BMC-lite | StockMovement.AJUSTE |
| `/admin/inventario` | Inventario (recuento formal) | Inventario y compras | lite | rubro | 🔨 | BMC | StockCount (D5) |
| `/admin/devoluciones-proveedor` | Devoluciones a proveedor | Inventario y compras | **enterprise** | — | 🔨 | BMK | StockMovement+D4 |
| `/admin/facturacion` | Facturación (ARCA) | Finanzas | lite | rubro (arca) | ✅ | 1J2 | Invoice |
| `/admin/reportes` | Reportes (Empresa: rentabilidad) | Finanzas | lite | rubro | ✅ | 16T | (derivado) |
| `/admin/cuentas-a-cobrar` | Cuentas a cobrar (fiado) | Finanzas | lite | **default-OFF rubro** | 🔨 | 2F3/J60 | AccountReceivable (D3) |
| `/admin/cuentas-a-pagar` | Cuentas a pagar (cheque diferido) | Finanzas | **enterprise** | — | 🔨 | J59 | AccountPayable (D2) |
| `/admin/contabilidad` | Contabilidad (export contador) | Finanzas | **enterprise** | — | 🔨 | J58 | export (D7) |
| `/admin/auditoria` | Auditoría | Configuración | lite | rol | ✅ | — | AuditLog |
| `/admin/usuarios` | Usuarios | Configuración | lite | rol | ✅ | — | User |
| `/admin/localizacion` | Localización | Configuración | lite | rol | ✅ | — | BusinessSettings |
| `/admin/modulos` | Módulos | Configuración | lite | rol (`modules:manage`) | ✅ | — | Tenant.modules |

**Total: 22 rutas** — **17 existen**, **5 a construir** (`/admin/inventario`, `/admin/devoluciones-proveedor`,
`/admin/cuentas-a-cobrar`, `/admin/cuentas-a-pagar`, `/admin/contabilidad`). Las 5 están en
`BACKLOG_SCOPE_ITEM_NAV`/`ENTERPRISE_NAV_ITEMS` con `ready:false` → **hoy no renderizan** (anti dead-end).

---

## 3. NAVEGACIÓN CONSOLIDADA — los 5 grupos con TODOS sus ítems finales

Orden fijo (ADR-059 D3, naming profesional neutro). Cada ítem se muestra si **rol × módulo × perfil** lo
permiten (`visibleNavItems`) **y** su pantalla existe. Empresa ve el mismo árbol **+** los `enterprise`-only.

**1 · Operación** — el día a día
- Dashboard (lite) · Agenda (lite, servicios) · Lista de espera (lite, servicios) · Pedidos (lite, retail) ·
  Caja (lite, retail)

**2 · Clientes** — base y comunicación
- Clientes (lite) · Recordatorios (lite) · Reseñas (lite)

**3 · Inventario y compras** — lo que se vende, repone y ajusta
- Catálogo (lite) · Compras (lite; Empresa profundiza órdenes formales) · Ajustes y mermas (lite) ·
  **Inventario/recuento formal** (lite, 🔨) · **Devoluciones a proveedor** (enterprise, 🔨)

**4 · Finanzas** — facturación, deudas y resultados
- Facturación (lite) · Reportes (lite; Empresa profundiza rentabilidad) · **Cuentas a cobrar / fiado**
  (lite, default-OFF por rubro, 🔨) · **Cuentas a pagar / cheque diferido** (enterprise, 🔨) ·
  **Contabilidad / export** (enterprise, 🔨)

**5 · Configuración** — administración del sistema
- Auditoría (lite) · Usuarios (lite) · Localización (lite) · Módulos (lite)

> **Comercio hoy** ve grupos 1–5 con lo `ready:true` de su rubro. **Empresa hoy** = lo mismo (los
> `enterprise`-only están `ready:false`) — la diferencia real aparece a medida que se construyen las 5
> pantallas 🔨. El **invariante `⊇`** garantiza que Empresa jamás vea menos.

---

## 4. LÍMITES DE MÓDULO (qué hace cada uno · dependencias · orden de construcción)

### 4.1 Módulos del catálogo (qué hace cada uno)

**Existentes (nativos + plugins, `src/modules/descriptors`):**
| Módulo | Hace | Depende de |
|---|---|---|
| `agenda` | Turnos por profesional/box/horario | — |
| `waitlist` | Cola de cancelaciones/no-shows | **agenda** |
| `pos` | Venta de mostrador + pedidos (Order) | — |
| `catalog` | Servicios y productos | — |
| `clients` | Ficha de clientes e historial | — |
| `reminders` | Avisos/difusión (WhatsApp) | — |
| `reports` | Ingresos, comisiones, métricas (+ rentabilidad Empresa) | — |
| `commissions` | Liquidación por profesional | **reports** (rubro servicios) |
| `reviews` | Opiniones/calificaciones | — |
| `arca` (plugin) | Facturación electrónica (Invoice + outbox) | catalog/pos (algo que facturar) |
| `mercadopago` (plugin) | Cobro online | pos/orders |

**Nuevos (a definir en el catálogo, hoy backlog del PO):**
| Módulo | Hace | Depende de | Perfil |
|---|---|---|---|
| `inventario` | Recuento físico formal + stock avanzado sobre el ledger | catalog, pos | lite (rubro) |
| `compras` | Proveedores + órdenes formales (Supplier D1) | catalog | lite→enterprise |
| `cuentas-a-cobrar` | Fiado: deuda de cliente, saldo (+venc./recordatorio Empresa) | clients | lite (rubro, default-OFF) |
| `cuentas-a-pagar` | Deuda a proveedor + cheque diferido | **compras/Supplier (D1)** | enterprise |
| `contabilidad` | Export para el contador (→ libro mayor si se pide) | reports, arca | enterprise |

### 4.2 Reglas de límite (qué NO cruza cada módulo)

- **`arca` no calcula dinero**: el Core calcula (ADR-006/-057), `arca` solo emite. El redondeo único vive en
  `src/lib/round.ts`.
- **`inventario` no muta stock directo**: todo pasa por el ledger `StockMovement` (`recordMovement`, único
  mutador). `Product.stock` es proyección cacheada.
- **`cuentas-a-pagar`/`cuentas-a-cobrar` no tocan caja fiscal**: registran deuda; el cobro/pago real lo
  asienta Caja/Payment. Separación deuda ↔ movimiento de dinero.
- **`compras` es el dueño de `Supplier`**: CxP y devoluciones **leen** el maestro, no lo duplican.
- **El perfil no crea módulos**: enciende/profundiza los que hay. Ningún módulo se forkea por perfil (D8).

### 4.3 Orden de construcción (secuencia con Gates)

```
FASE A — Empresa base (✅ HECHO / en curso): Tenant.profile ✅ · home analítico ✅ ·
         Compras formal (UI) ✅ · Reportes rentabilidad ✅ · set lite por rubro ✅ · hardening ✅
FASE B — Empresa aditivo sin entidad nueva de datos:
         1) contabilidad = EXPORT (D7, cero schema)   ── Gate
FASE C — Requiere Supplier (D1) [§C Gate 2]:
         2) Supplier (D1)  ── Gate 2 (migración)
         3) compras formal plena (D6) + devoluciones (D4)  ── Gate
FASE D — Gated por LEAD Empresa real (ADR-030) [§C Gate 2]:
         4) AccountPayable + Cheque (D2, J59)  ── Gate 2 + Gate feature
FASE E — Gated por rubro de fiado (ADR-030) [§C Gate 2]:
         5) AccountReceivable (D3, fiado)  ── Gate 2 + Gate feature
RESERVA (solo por demanda): StockCount formal (D5) · JournalEntry libro mayor (D7-full)
```
**Regla:** cada fase entrega verde (`tsc`+`build`+`test`+`gate:rls`) y pasa el **Gate de Excelencia (Opus)**
antes de merge. Cada tabla nueva es **§C · Gate 2** (la eleva Data/DBA, la aprueba el dueño).

---

## 5. §C — lo que se ELEVA al dueño (no se ejecuta acá)

| Ref | Acción irreversible | Gate | Desbloquea |
|---|---|---|---|
| §C-1 | Aplicar `add_tenant_profile` en **prod** (aditiva, default lite) | Gate 2 | perfil persistido en prod (Empresa real) |
| §C-2 | Migración `Supplier` (D1) | Gate 2 | compras formales / CxP / devoluciones |
| §C-3 | Migración `AccountPayable`+`PayableCheque` (D2) | Gate 2 + lead | J59 cuentas a pagar |
| §C-4 | Migración `AccountReceivable` (D3) | Gate 2 + rubro fiado | fiado formal |
| §C-5 | Enum `DEVOLUCION_PROVEEDOR` (D4) + `StockCount` (D5) | Gate 2 | devoluciones / recuento formal |
| §C-6 | Aplicar las 7 migraciones fiscales/stock ya escritas y **sin aplicar** a Neon | Gate 2 | inventario/fiscal avanzado |
| §C-7 | Cert + homologación ARCA (`ARCA_INVOICING_ENABLED`) | Gate 4 | facturación real |
| §C-8 | Neon plan pago + PITR + rotar secretos | acción dueño | confiabilidad pre-cobros |

**Todas las migraciones nuevas son ADITIVAS** (tablas/columnas nullable, enum values) → cumplen "crecé sin
migrar": ningún tenant existente pierde un dato ni requiere backfill.

---

## 6. Cierre — qué garantiza este blueprint

- **Cobertura sin huecos:** las 22 rutas, las 8 decisiones de datos (D1–D8) y los 16 módulos cubren el
  **set validado completo** (micro ~6 + pyme ~15 scope items) sin dejar proceso afuera ni traer corporativo.
- **Reversibilidad total hasta el dato:** todo lo de UI/perfil es reversible por flag; lo irreversible es
  **solo** migración aditiva, elevada a §C.
- **Estabilidad con clientes adentro:** al fijar entidades, rutas, grupos y perfiles **ahora**, construir
  cada pieza es *rellenar* el blueprint, no rediseñarlo — que es exactamente lo que evita el retrabajo con
  clientes en producción.
- **Lo explícitamente fuera (para que no se cuele como "aditivo"):** multi-sucursal/multi-depósito,
  tesorería/hedge/consolidación (corporativo, reserva), SuccessFactors/HR (reserva). Cada uno = ADR aparte.

— Elaborado por GSG (Arquitecto de Solución) · candidato **ADR-060** · para revisión adversarial de Opus (S5).
