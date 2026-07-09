# 🏛️ Marco de revisión adversarial — Estructura consolidada del producto (S5/Opus)

> **Qué es:** el marco con el que S5 (arquitecto senior) revisará **adversarialmente**
> `docs/estrategia/estructura-consolidada-producto.md` (a entregar por S1) **cuando exista**. Objetivo del
> dueño: dejar la estructura **CERRADA** antes de salir en vivo — no cambiar la estructura *después, con
> clientes adentro* (una migración estructural con datos reales es cara e irreversible). Este doc deja el
> **criterio** + el **ground truth** del sistema actual + los **gaps ya detectados** contra los que se va a
> contrastar el doc. **Aún no reviso** (el doc no fue entregado); esto es la vara.
>
> **Autor:** S5 (Juicio Crítico / Arquitecto senior, Opus) · **Fecha:** 2026-07-08.

---

## 1. Ground truth del sistema HOY (contra esto se chequea completitud)

**Entidades (35 modelos Prisma):** Appointment · AuditLog · Box · BoxBlock · BusinessSettings · CashMovement
· CashSession · Client · CommissionPayout · Coupon · Invoice · MessageTemplate · Order · OrderItem ·
OutboxEvent · Payment · Product · Professional · ProfessionalBlock · ProfessionalNews ·
ProfessionalServiceCommission · Resource · Review · Service · ServiceCategory · ServiceProduct ·
ServiceResource · StockMovement · StockPurchase · StockPurchaseItem · **Tenant (+profile)** · User ·
WaitlistEntry · WorkingHours.

**Módulos del catálogo (10):** agenda · catalog · clients · commissions · mercadopago · pos · reminders ·
reports · reviews · waitlist.

**Pantallas backoffice (~18):** dashboard · turnos(+lista) · clientes(+ficha) · espera · pedidos · caja ·
catalogo · compras · ajustes · resenas · recordatorios · facturacion · reportes · auditoria · usuarios ·
localizacion · modulos.

**Perfil:** `Tenant.profile` (enum lite/enterprise) — YA en schema (migración `add_tenant_profile`, sin
aplicar a prod, §C-frozen).

---

## 2. Gaps estructurales YA detectados (la review DEBE ver si el doc los resuelve o los deja abiertos)

Un arquitecto senior no pregunta "¿está lindo?", pregunta **"¿qué me va a obligar a migrar con clientes
adentro?"**. Pre-identificados contra el ground truth + el mapa de cobertura:

| # | Gap estructural | Por qué obliga a cambiar estructura después | Qué debe decidir el doc |
|---|---|---|---|
| G1 | **No existe entidad `Proveedor`/`Supplier`.** Compras (J45/18J) se "profundizó" esta ola con *órdenes formales*, pero `StockPurchase` no tiene un maestro de proveedor con ABM. | Cuentas-a-pagar (J59), órdenes formales y devoluciones (BMK) cuelgan de proveedor. Agregarlo con compras cargadas = migración + backfill. | ¿Proveedor es entidad maestra ya (con ABM, ADR-055) o se difiere? Si se difiere, ¿la orden formal de esta ola guarda proveedor como texto libre (deuda) o FK nula? |
| G2 | **No existe `cuentas-a-cobrar` (fiado, J60/2F3).** `Client` existe, pero no hay ledger de crédito/saldo del cliente. | El fiado (rubro barrio) necesita movimientos de cuenta corriente por cliente. Meterlo después = entidad + relación nuevas. | ¿La cuenta corriente del cliente es una entidad (CreditAccount/CustomerLedger) definida ahora (aunque default-OFF, ADR-030) o queda sin forma? |
| G3 | **No existe `cuentas-a-pagar` (J59) ni `Cheque` (diferido).** | Cheque diferido (fecha/banco/endoso) es central en B2B AR; agregarlo con pagos reales = migración. | ¿Se define el objeto Cheque/CuentaPagar en la estructura (aunque no se construya)? |
| G4 | **No existe contabilidad/libro mayor (J58).** | Export al contador; si mañana se linkea a asientos, cambia el modelo. | ¿Se declara como export (no entidad) o como ledger? |
| G5 | **Multi-sucursal NO existe** (`BusinessSettings` es singleton por tenant; sin entidad Branch). | Cualquier feature Empresa que asuma sucursal/depósito (3W0, stock por depósito) fuerza reestructura profunda. | ¿La estructura declara explícitamente **single-branch** como límite y saca todo lo multi-sucursal a un ADR aparte? (ya elevado; el doc no debe contrabandearlo). |
| G6 | **`Invoice` no tiene enlace a su ORIGEN** (Appointment/Order/Payment). Ya mordió en la idempotencia (hardening usó `Payment.comprobanteNro`). | Sin FK invoice↔origen, trazabilidad fiscal y reversas son frágiles; agregar la FK con facturas reales = migración sobre datos fiscales. | ¿La estructura fija el enlace `Invoice → (Order|Appointment|Payment)` ahora? Es dato fiscal: caro de cambiar después. |
| G7 | **Dos caminos de venta paralelos:** servicios (Appointment+Payment) y retail (Order+OrderItem). | Reportes Empresa (margen 16T) y facturación deben abarcar AMBOS; si el modelo no los unifica, hay ceguera o doble lógica. | ¿El doc reconcilia los dos caminos (venta unificada o dos claramente separados con reportes que suman ambos)? |
| G8 | **`Payment` atado 1:1 a `Appointment`** (`appointmentId @unique`). Retail (Order) cobra por otro lado. | Un modelo de cobro unificado (fiado, MP, efectivo) sobre ambos caminos puede requerir despegar Payment de Appointment. | ¿El doc define un modelo de cobro único o asume el actual (Payment=servicios)? |

> Estos 8 son la **munición adversarial**. La review NO es completa si el doc no toma posición (resolver o
> declarar límite explícito) sobre cada uno.

---

## 3. Rúbrica de la review (veredicto APTO / ajustes)

**A. Completitud del modelo de datos**
- [ ] ¿Están TODAS las entidades del set Empresa vendible con **forma definida** (aunque no construidas, ADR-055)? Cruce contra G1–G4.
- [ ] ¿Cada entidad nueva declara su **ABM propio + relación de asignación** (principio de variante ADR-055), no "a todos con todo"?
- [ ] ¿Los enlaces fiscales/dinero (G6) están fijados? (lo más caro de cambiar con clientes adentro).

**B. Entidades/pantallas faltantes que forzarían reestructura**
- [ ] ¿El doc lista lo que NO se construye y lo saca a §C/ADR aparte (no lo contrabandea como reversible)? (G5 multi-sucursal es el test).
- [ ] ¿Hay alguna pantalla del roadmap Empresa sin entidad de respaldo (dead-end estructural)?
- [ ] ¿Los dos caminos de venta (G7/G8) están reconciliados o separados con criterio explícito?

**C. Límites de módulo + orden de construcción**
- [ ] ¿Los **límites de módulo** (los 10 actuales + los nuevos) son coherentes con la fundación (ADR-054): contrato/registry/activación/flag, gateado por rubro y por perfil?
- [ ] ¿El **orden de construcción** respeta dependencias? (ej.: Proveedor ANTES que cuentas-a-pagar; enlace Invoice↔origen ANTES de facturar en volumen; perfil ANTES de sets Empresa).
- [ ] ¿Respeta ADR-030 (no construir hasta vender) y el invariante `enterprise ⊇ lite`?

**D. Estándar GSG**
- [ ] ¿Naming Comercio/Empresa (nunca lite/enterprise al cliente), tier neutro, argentino?
- [ ] ¿Todo lo irreversible (migraciones/entidades nuevas) marcado §C y elevado, no ejecutado?

**Veredicto:** **APTO** (estructura cerrada, se puede construir sobre ella) · **APTO CON AJUSTES** (lista
concreta y acotada) · **NO APTO** (gaps que forzarían reestructura con clientes → cerrar antes de salir).

---

## 4. Cómo se corre (cuando S1 entregue)
1. Leer `docs/estrategia/estructura-consolidada-producto.md`.
2. Contrastar contra §1 (ground truth) y §2 (los 8 gaps): ¿toma posición en cada uno?
3. Tildar §3 (rúbrica).
4. Devolver veredicto + ajustes concretos. Registrar el criterio (traza, lección MP-15).

— Elaborado por GSG (S5 · Arquitecto senior / Gate, Opus).
