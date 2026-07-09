# ADR-060: Estructura consolidada del producto (Comercio + Empresa) — BLUEPRINT MAESTRO

> **Qué es:** el **diseño de estructura cerrado, de una sola vez**, del producto completo GROW-AR —
> **Comercio** (perfil lite) + **Empresa** (perfil enterprise). Es el blueprint contra el que se construye
> **todo**: modelo de datos, pantallas, navegación y límites de módulo. Se fija **ahora** para no cambiarlo
> con clientes adentro (directiva del dueño: estándar de equipo experto, no se improvisa estructura).
>
> **Estado:** **Aceptado con los ajustes de la revisión adversarial de Opus (S5, commit `7774a8d`)** —
> 🟢 estructura CERRADA, lista para aprobación del dueño. Los 5 ajustes de S5 están incorporados (ver §0.1).
> **Autor:** Arquitecto de Solución (GSG) · **Revisor/Gate:** S5 (Opus). · **Fecha:** 2026-07-08 · **Rama:**
> `claude/sprint-startup-generic-rf6x0m` (sin Neon, sin merge a main). · **Naming:** Comercio/Empresa de cara
> al cliente (lite/enterprise solo en código, ADR-059 D7).
> **Depende de:** ADR-058 (filosofía) · ADR-059 (interfaz) · ADR-057 (dinero Decimal) · ADR-054/055 (módulos)
> · ADR-002 (Core/Blueprint/Plugin) · ADR-017 (RBAC) · ADR-030 (no invertir hasta vender).
>
> **Base cerrada sobre:** el **schema real** (`prisma/schema.prisma`, 35 modelos), el **mapa de cobertura
> validado** (`mapa-cobertura-scope-items.md` + desafío S1 + revisión S5), el **roadmap M0–M5**
> (`roadmap-dos-modelos.md`), el **set mínimo Empresa** (`set-minimo-empresa-2026-07-08.md`), las
> **decisiones S5** (`decisiones-set-empresa-2026-07-08.md`), la **nav ya cableada** (`src/modules/nav-groups.ts`)
> y el **veredicto S5/Opus** (`review-estructura-consolidada-S5-veredicto.md`).

---

## 0.1 Semáforo por capas (accionable para el dueño) — post-ajustes S5

No es un semáforo global: la mayor parte está **verde para construir**; **solo la capa de dinero/deuda**
espera cerrar los 2 ajustes estructurales, **ya incorporados a este ADR**.

| Capa | Semáforo | Se puede construir |
|---|---|---|
| Perfil · nav · home · Compras UI · Reportes · hardening (Fase A) | 🟢 verde | ✅ ya hecho |
| **`Supplier` (D1)** + compra formal plena (D6) + devolución de stock (D4) | 🟢 verde | sí (con la pata financiera de D4 anotada, ajuste 3) |
| **Libros / Exportar al contador (D7)** = Libro IVA estructurado | 🟢 verde | sí (ajuste 4: naming honesto + estructura Libro IVA) |
| **Modelo de cobranza `Collection` (D9)** + enlace `Invoice→origen` (D10) | 🟢 verde | sí — **son los ajustes 1 y 2, ahora fijados** → destraban la capa de dinero |
| **`AccountReceivable`/fiado (D3)** y **`AccountPayable`+cheque (D2)** | 🟢 verde *(era 🟡)* | sí, **después** de D9+D10 (orden en §4.3) — el amarillo se cierra al fijar cobranza+Invoice en este ADR |

**Resultado:** con los ajustes 1 y 2 incorporados como **D9** y **D10**, la estructura queda **🟢 cerrada**.
Los ajustes 3–5 son refinamientos de diseño, también incorporados. **Cero §C ejecutado** — todo es decisión
de diseño reversible; lo irreversible (migraciones) queda elevado a §C.

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
| **D1** | **`Supplier`** (proveedor maestro) | J45/18J · J59 · BMK | Tabla nueva `Supplier` (razón social, CUIT, contacto). FK **nullable** `StockPurchase.supplierId` (se conserva el `supplier` texto como snapshot/fallback) | ✅ | ✅ Gate 2 | Habilita compras formales/CxP/devoluciones. **Prerrequisito** de D2/D4/D6 |
| **D9** ⭐ | **`Collection` / `Receipt`** (cobranza/settlement unificado) — **ajuste 1 S5, el más estructural** | transversal (cobro) | Tabla nueva `Collection`(origen polimórfico `Order`\|`Appointment`\|`AccountReceivable`, monto `Decimal(14,2)`, método, fecha, actor). Registra **cobros PARCIALES contra un saldo**. **NO** se muta `Payment` (relajar su `@unique` no sería aditivo puro) | ✅ (tabla nueva, cero cambio a Payment/Order) | ✅ Gate 2 | **Fase C.5 — PRERREQUISITO de D2 y D3.** Cierra el hueco: hoy servicios cobran con `Payment` (1:1) y retail con `Order.paid` (booleano, sin parciales); el fiado (mostrador) no tiene dónde asentar cobros parciales |
| **D10** ⭐ | **Enlace `Invoice → origen`** (FK nullable) — **ajuste 2 S5, fiscal** | 1J2 | Campos aditivos `Invoice.orderId?` / `Invoice.appointmentId?` (o tabla de enlace). Hoy NO existe (la idempotencia del webhook parchea con `Payment.comprobanteNro`) | ✅ (columnas nullable) | ✅ Gate 2 | **Fijar AHORA:** agregarlo con facturas reales adentro = migración fiscal, lo más caro. Aditivo si se hace ya |
| **D2** | **`AccountPayable` + `PayableCheque`** (cuentas a pagar + cheque diferido) | **J59** | 2 tablas nuevas: `AccountPayable`(supplierId, montos `Decimal(14,2)`, saldo, estado) + `PayableCheque`(nro, banco, fecha emisión, **fecha diferida**, endoso, estado). El pago se asienta vía **`Collection`/análogo de egreso (D9)** | ✅ | ✅ Gate 2 | **DIFERIDO hasta lead Empresa** (ADR-030, decisión S5). **Después de D9.** Spec lista, no se construye al voleo |
| **D3** | **`AccountReceivable`** (cuentas a cobrar / fiado) | 2F3 / J60 | Tabla nueva `AccountReceivable`(clientId, monto `Decimal(14,2)`, saldo, vencimiento?, estado) + link opcional a `Order`/`Invoice`. Los cobros parciales que bajan el saldo se asientan en **`Collection` (D9)** | ✅ | ✅ Gate 2 | **Default OFF, gateado por RUBRO** (comercio de barrio). **Después de D9.** Comercio = fiado light (sin vencimiento); Empresa = + vencimiento/recordatorio (J60, aditivo sobre la misma tabla) |
| **D4** | **Devolución a proveedor** (BMK) — **stock + pata financiera (ajuste 3 S5)** | BMK | **Pata STOCK:** enum value `StockMovementType.DEVOLUCION_PROVEEDOR` (+ `purchaseId` al origen, sin FK). **Pata FINANCIERA:** nota de crédito / **baja del saldo que le debemos al proveedor en `AccountPayable` (D2)** — NO va en el ledger | ✅ (enum + asiento en D2) | ✅ Gate 2 | Prioridad baja; sub-pantalla de Compras. **La pata financiera se asienta cuando exista D2** — no construir "solo-stock" y rehacer |
| **D5** | **Recuento físico formal** (BMC) | BMC | Tabla nueva `StockCount`(estado, congelado) + `StockCountItem`(conteo vs sistema, diferencia) — genera `StockMovement.AJUSTE` al cerrar | ✅ | ✅ Gate 2 | **RESERVA.** El mínimo anti-oversell ya lo cubren `Ajustes`(AJUSTE) + `Compras`. Formal solo por demanda de rubro |
| **D6** | **Orden de compra formal** (J45/18J) | J45/18J | **Sin tabla nueva al lanzar:** hoy es **UI-only** sobre `StockPurchase` (razón social/CUIT/N° orden, S4 ya lo hizo). Si se formaliza estado borrador→enviada→recibida → campos aditivos en `StockPurchase` (+`supplierId` de D1) | ✅ | ✅ solo si se agregan campos | Comercio ya repone; Empresa profundiza. Formalización plena = con D1 |
| **D7** | **Libros / Exportar al contador** (J58) — **naming honesto (ajuste 4 S5)** | J58 | **Sin schema al lanzar:** **Libro IVA ESTRUCTURADO (Ventas + Compras)** con los campos que usa el contador/ARCA (CUIT, tipo de comprobante, neto/IVA/alícuota/total) — deriva 100% de `Invoice`/`Order`/`Payment`, **NO** un CSV plano (que subvende). Libro mayor formal (`JournalEntry`) = **RESERVA** | ✅ (export = cero schema) | export: no · JournalEntry: §C | Naming al cliente **"Libros / Exportar al contador"**, NUNCA "Contabilidad" (promete asientos que no hay). Export en M3; libro mayor solo por demanda |
| **D8** | **Perfil persistido** (ya hecho) | ADR-059 D1 | `Tenant.profile` — **YA aplicado** (§1.1) | ✅ | ✅ (la única migración autorizada del rediseño) | ✅ hecho |

> ⭐ **D9 y D10 son los 2 ajustes estructurales de S5** — las piezas que, si no se fijan ahora, **obligan a
> migrar dinero/fiscal con clientes adentro** (el caso que el dueño quiere evitar). **`Collection` (D9) es
> entidad NUEVA a propósito** (no se muta `Payment`): mantiene la aditividad 100% y unifica el cobro de
> servicios (`Appointment`) + retail (`Order`) + fiado (`AccountReceivable`) en un solo modelo de settlement
> con **pagos parciales contra saldo**.

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
Collection/Receipt (D9) ⭐ ── cobro parcial contra saldo, unifica servicios+retail+fiado
        │  (prerrequisito de D2 y D3)
        ├── AccountReceivable (D3, fiado, rubro-gated)  ── cobros parciales → D9
        └── AccountPayable+Cheque (D2, J59, diferido lead) ── egresos/cheque → D9
Supplier (D1) ──┬── AccountPayable (D2)  [también necesita D9]
                ├── Devolución proveedor (D4): stock (enum) + crédito en D2 (pata financiera)
                └── Orden compra formal (D6, campos aditivos)
Client (existe) ── AccountReceivable (D3)
Invoice (existe) ── enlace Invoice→origen (D10) ⭐ [Order/Appointment] ── fijar YA (fiscal)
Invoice/Order/Payment/Collection ── Libros/Export contador (D7, Libro IVA) ── [JournalEntry reserva]
StockMovement (existe) ── StockCount formal (D5, reserva)
```
**Dos cuellos, en orden:** **(1) `Collection` (D9)** es prerrequisito de toda la capa de deuda (D2/D3) —
sin él, el fiado no tiene dónde asentar cobros parciales. **(2) `Supplier` (D1)** es prerrequisito de CxP,
devoluciones y compra formal plena. **`Invoice→origen` (D10)** se fija ya (barato ahora, caro con facturas
reales adentro), independiente de la secuencia.

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
| `/admin/facturacion` | Facturación (ARCA) — **servicios Y retail** | Finanzas | lite | rubro (arca) | ✅ | 1J2 | Invoice (+enlace origen D10) |
| `/admin/reportes` | Reportes (Empresa: rentabilidad) — **ambos caminos de venta** | Finanzas | lite | rubro | ✅ | 16T | (derivado, ver nota ⚠️) |
| `/admin/cuentas-a-cobrar` | Cuentas a cobrar (fiado) | Finanzas | lite | **default-OFF rubro** | 🔨 | 2F3/J60 | AccountReceivable (D3) + Collection (D9) |
| `/admin/cuentas-a-pagar` | Cuentas a pagar (cheque diferido) | Finanzas | **enterprise** | — | 🔨 | J59 | AccountPayable (D2) + Collection (D9) |
| `/admin/libros` | **Libros / Exportar al contador** (Libro IVA) | Finanzas | **enterprise** | — | 🔨 | J58 | export estructurado (D7) |
| `/admin/auditoria` | Auditoría | Configuración | lite | rol | ✅ | — | AuditLog |
| `/admin/usuarios` | Usuarios | Configuración | lite | rol | ✅ | — | User |
| `/admin/localizacion` | Localización | Configuración | lite | rol | ✅ | — | BusinessSettings |
| `/admin/modulos` | Módulos | Configuración | lite | rol (`modules:manage`) | ✅ | — | Tenant.modules |

**Total: 22 rutas** — **17 existen**, **5 a construir** (`/admin/inventario`, `/admin/devoluciones-proveedor`,
`/admin/cuentas-a-cobrar`, `/admin/cuentas-a-pagar`, `/admin/libros`). Las 5 están en
`BACKLOG_SCOPE_ITEM_NAV`/`ENTERPRISE_NAV_ITEMS` con `ready:false` → **hoy no renderizan** (anti dead-end).
*(La ruta enterprise de J58 se renombra `/admin/contabilidad` → `/admin/libros`, naming honesto — ajuste 4.)*

> **⚠️ Nota transversal (ajuste 5 S5) — Reportes(16T) y Facturación abarcan los DOS caminos de venta.** Hay
> dos flujos de venta en el schema: **servicios** (`Appointment` → `Payment`) y **retail/mostrador**
> (`Order` → `Order.paid`/`Collection`). **Reportes de rentabilidad y Facturación DEBEN cubrir ambos** — si
> el margen (16T) solo lee `Order` o solo `Appointment`, queda **ciego a la mitad del negocio**. El cálculo
> de margen y el Libro IVA (D7) derivan de `Invoice` + `Order` + `Appointment`/`Payment` + `Collection`, no
> de una sola fuente.

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
- Facturación (lite, servicios+retail) · Reportes (lite; Empresa profundiza rentabilidad, ambos caminos de
  venta) · **Cuentas a cobrar / fiado** (lite, default-OFF por rubro, 🔨) · **Cuentas a pagar / cheque
  diferido** (enterprise, 🔨) · **Libros / Exportar al contador** (enterprise, 🔨) — *(el cobro parcial que
  alimenta cuentas a cobrar/pagar se asienta vía el modelo `Collection` D9, transversal, sin ítem propio de
  nav — vive dentro de Caja/Cuentas)*

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
| `cobranza` (D9) ⭐ | Modelo de cobro/settlement: cobros **parciales contra saldo**, unifica servicios+retail+fiado | pos/clients | lite (transversal) |
| `inventario` | Recuento físico formal + stock avanzado sobre el ledger | catalog, pos | lite (rubro) |
| `compras` | Proveedores + órdenes formales (Supplier D1) | catalog | lite→enterprise |
| `cuentas-a-cobrar` | Fiado: deuda de cliente, saldo (+venc./recordatorio Empresa) | clients, **`cobranza` (D9)** | lite (rubro, default-OFF) |
| `cuentas-a-pagar` | Deuda a proveedor + cheque diferido | **compras/Supplier (D1)**, **`cobranza` (D9)** | enterprise |
| `libros` | **Libro IVA estructurado** (Ventas+Compras) + export al contador | reports, arca | enterprise |

### 4.2 Reglas de límite (qué NO cruza cada módulo)

- **`arca` no calcula dinero**: el Core calcula (ADR-006/-057), `arca` solo emite. El redondeo único vive en
  `src/lib/round.ts`.
- **`inventario` no muta stock directo**: todo pasa por el ledger `StockMovement` (`recordMovement`, único
  mutador). `Product.stock` es proyección cacheada.
- **`cobranza` (D9) es el ÚNICO asiento de cobro parcial**: `cuentas-a-cobrar`/`cuentas-a-pagar` registran la
  **deuda/saldo**; el **cobro/pago real** (total o parcial) lo asienta **`Collection` (D9)**, no un booleano
  ni `Payment` 1:1. Separación dura **deuda ↔ settlement**. (Corrige el §4.2 previo que decía "lo asienta
  Payment" — falso para retail/fiado, ajuste 1 S5.)
- **No se muta `Payment` ni `Order`**: `Collection` (D9) es **entidad nueva**; `Payment` (servicios 1:1) y
  `Order.paid` (retail) siguen intactos → aditividad 100%.
- **Devolución (D4) tiene dos patas**: stock (enum en el ledger) **+** crédito en `AccountPayable` (D2). El
  módulo `compras`/`cuentas-a-pagar` cierra la financiera; el ledger, la física. No hacer "solo-stock".
- **`Invoice` conoce su origen (D10)**: FK nullable a `Order`/`Appointment`. La idempotencia fiscal deja de
  depender del parche `Payment.comprobanteNro`.
- **`compras` es el dueño de `Supplier`**: CxP y devoluciones **leen** el maestro, no lo duplican.
- **`libros` no inventa asientos**: deriva el Libro IVA de `Invoice`/`Order`/`Payment`/`Collection`; no
  promete libro mayor (eso es reserva `JournalEntry`). Naming honesto al cliente.
- **El perfil no crea módulos**: enciende/profundiza los que hay. Ningún módulo se forkea por perfil (D8).

### 4.3 Orden de construcción (secuencia con Gates)

```
FASE A — Empresa base (✅ HECHO / en curso): Tenant.profile ✅ · home analítico ✅ ·
         Compras formal (UI) ✅ · Reportes rentabilidad ✅ · set lite por rubro ✅ · hardening ✅
FASE B — Empresa aditivo sin entidad nueva de datos:            🟢
         1) Libros/Export al contador = Libro IVA (D7, cero schema)   ── Gate
FASE C — Requiere Supplier (D1) [§C Gate 2]:                     🟢
         2) Supplier (D1)  ── Gate 2 (migración)
         3) compras formal plena (D6) + devolución de STOCK (D4-stock)  ── Gate
FASE C.5 — ⭐ CIERRE DE LA CAPA DE DINERO (prerrequisito de D/E) [§C Gate 2]:   🟢 (ajustes 1+2)
         4) Collection/Receipt (D9) — cobro parcial contra saldo, unifica servicios+retail+fiado
         5) enlace Invoice→origen (D10) — FK nullable, fijar AHORA (fiscal)
         ── Gate 2 (migraciones aditivas). SIN esto NO se construye D2/D3.
FASE D — Gated por LEAD Empresa real (ADR-030) [§C Gate 2] — DESPUÉS de C.5:
         6) AccountPayable + Cheque (D2, J59) + pata financiera de la devolución (D4-fin)
         ── Gate 2 + Gate feature
FASE E — Gated por rubro de fiado (ADR-030) [§C Gate 2] — DESPUÉS de C.5:
         7) AccountReceivable (D3, fiado)  ── Gate 2 + Gate feature
RESERVA (solo por demanda): StockCount formal (D5) · JournalEntry libro mayor (D7-full)
```
**Cambio clave post-review (ajuste 1 S5):** la **Fase C.5 (cobranza D9 + Invoice→origen D10) se inserta
ANTES de D/E** — el modelo de cobro es prerrequisito del fiado (D3) y de CxP (D2); descubrirlo mid-build
obligaría a migrar dinero con clientes adentro. **Regla:** cada fase entrega verde
(`tsc`+`build`+`test`+`gate:rls`) y pasa el **Gate de Excelencia (Opus)** antes de merge. Cada tabla nueva
es **§C · Gate 2** (la eleva Data/DBA, la aprueba el dueño).

---

## 5. §C — lo que se ELEVA al dueño (no se ejecuta acá)

| Ref | Acción irreversible | Gate | Desbloquea |
|---|---|---|---|
| §C-1 | Aplicar `add_tenant_profile` en **prod** (aditiva, default lite) | Gate 2 | perfil persistido en prod (Empresa real) |
| §C-2 | Migración `Supplier` (D1) | Gate 2 | compras formales / CxP / devoluciones |
| §C-3 ⭐ | Migración `Collection`/`Receipt` (D9) — cobro parcial | Gate 2 | **destraba D2 y D3** (capa de dinero) |
| §C-4 ⭐ | Enlace `Invoice→origen` (D10) — FK nullable | Gate 2 | idempotencia fiscal sin parche; fijar AHORA |
| §C-5 | Migración `AccountPayable`+`PayableCheque` (D2) | Gate 2 + lead + **D9** | J59 cuentas a pagar |
| §C-6 | Migración `AccountReceivable` (D3) | Gate 2 + rubro fiado + **D9** | fiado formal |
| §C-7 | Enum `DEVOLUCION_PROVEEDOR` (D4) + `StockCount` (D5) | Gate 2 | devoluciones (stock) / recuento formal |
| §C-8 | Aplicar las 7 migraciones fiscales/stock ya escritas y **sin aplicar** a Neon | Gate 2 | inventario/fiscal avanzado |
| §C-9 | Cert + homologación ARCA (`ARCA_INVOICING_ENABLED`) | Gate 4 | facturación real |
| §C-10 | Neon plan pago + PITR + rotar secretos | acción dueño | confiabilidad pre-cobros |

**Todas las migraciones nuevas son ADITIVAS** (tablas/columnas nullable, enum values) → cumplen "crecé sin
migrar": ningún tenant existente pierde un dato ni requiere backfill. **`Collection` (D9) es entidad NUEVA a
propósito** — no se muta `Payment` (relajar su `@unique` no sería add puro), preservando la aditividad 100%.

---

## 6. Cierre — qué garantiza este blueprint

- **Cobertura sin huecos:** las 22 rutas, las **10 decisiones de datos (D1–D10)** y los 17 módulos cubren el
  **set validado completo** (micro ~6 + pyme ~15 scope items) sin dejar proceso afuera ni traer corporativo.
  Los 2 huecos que la revisión S5 destapó — **modelo de cobro parcial (D9)** y **enlace fiscal Invoice→origen
  (D10)** — quedan **fijados ahora**, que es donde eran baratos.
- **Reversibilidad total hasta el dato:** todo lo de UI/perfil es reversible por flag; lo irreversible es
  **solo** migración aditiva, elevada a §C. `Collection` (D9) es entidad nueva → aditividad 100%.
- **Estabilidad con clientes adentro:** al fijar entidades, rutas, grupos y perfiles **ahora**, construir
  cada pieza es *rellenar* el blueprint, no rediseñarlo — que es exactamente lo que evita el retrabajo con
  clientes en producción. Cerrar cobro (D9) e Invoice→origen (D10) **antes** de facturar/fiar en volumen es
  el corazón de esa garantía (ajustes 1–2 S5).
- **Lo explícitamente fuera (para que no se cuele como "aditivo"):** multi-sucursal/multi-depósito
  (verificado con grep: cero `sucursal|branch|warehouse|deposito` en el schema),
  tesorería/hedge/consolidación (corporativo, reserva), SuccessFactors/HR (reserva). Cada uno = ADR aparte.

## 7. Registro de los 5 ajustes de la revisión S5/Opus (trazabilidad)

| # | Ajuste S5 | Cómo quedó incorporado |
|---|---|---|
| 1 ⭐ | Modelo de cobro/settlement unificado con pagos parciales, entidad nueva (no mutar `Payment`) | **D9 `Collection`** + **Fase C.5** antes de D2/D3 + módulo `cobranza` + regla de límite |
| 2 ⭐ | Fijar `Invoice→origen` (FK nullable) ahora | **D10** + Fase C.5 + §C-4 |
| 3 | D4 devolución = stock (enum) **+** pata financiera (crédito en CxP) | D4 partido en D4-stock / D4-fin; regla de límite explícita |
| 4 | D7 = Libro IVA estructurado + naming "Libros / Exportar al contador" | D7 reescrito; ruta `/admin/contabilidad`→`/admin/libros`; módulo `libros` |
| 5 | Reportes(16T)/Facturación abarcan servicios **Y** retail | Nota transversal ⚠️ en §2 + columnas de la tabla |

**Estado final:** 🟢 estructura **CERRADA** — ADR-060 listo para **aprobación del dueño**.

— Elaborado por GSG (Arquitecto de Solución) · **ADR-060** · ajustes de la revisión adversarial de Opus (S5,
`7774a8d`) incorporados · **cero §C ejecutado**.
