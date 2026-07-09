# 🧨 Review adversarial de la estructura consolidada — Veredicto FINAL S5/Opus

> **Revisa:** `docs/estrategia/estructura-consolidada-producto.md` (commit `ecff120`, candidato ADR-060).
> **Anclada en el schema real** (`prisma/schema.prisma`, 35 modelos). **Marco:**
> `marco-review-estructura-consolidada-S5.md`. **Revisor:** S5 (Arquitecto senior / Gate, Opus) · 2026-07-08.
> **Objetivo del dueño:** estructura CERRADA antes de construir a fondo (no reestructurar con clientes adentro).

---

## 🚦 SEMÁFORO FINAL: 🟡 **AMARILLO — APTO CON AJUSTES** (por capas)

No es un amarillo global: la mayor parte está verde para construir; **frena solo la capa de dinero/deuda**
hasta cerrar 2 ajustes estructurales. Semáforo accionable para el dueño:

| Capa | Semáforo | Se puede construir |
|---|---|---|
| Perfil · nav · home · Compras UI · Reportes · hardening (Fase A) | 🟢 verde | ✅ ya hecho / sí |
| **`Supplier` (D1)** + compras formal plena (D6) + devolución stock (D4) | 🟢 verde | sí (con el ajuste 3 anotado) |
| **Contabilidad = export (D7)** | 🟢 verde | sí, **con el ajuste 4** (Libro IVA estructurado + naming honesto) |
| **`AccountReceivable`/fiado (D3)** y **`AccountPayable`+cheque (D2)** | 🟡 amarillo | **NO hasta cerrar ajuste 1** (modelo de cobro) |
| Enlace fiscal `Invoice ↔ origen` | 🟡 amarillo | cerrar **ajuste 2** antes de facturar en volumen |

**Con ajustes 1 y 2 incorporados → 🟢 VERDE, promovible a ADR-060.** Los ajustes 3–5 son refinamientos de
diseño (van al doc, no bloquean el verde). Ningún ajuste ejecuta §C.

---

## Respuesta a los 4 puntos que S1 pidió apretar (anclados en schema)

### (a) ¿D4 devolución como enum en el ledger alcanza, o necesita entidad propia?
**El enum ALCANZA para la pata de STOCK — no necesita entidad propia.** `StockMovement` ya tiene todo lo
necesario: `type` (enum), `qty` firmada, `unitCost` (snapshot para revertir COGS al costo original),
`balanceAfter`, y **rastros débiles al origen** (`purchaseId`, sin FK). Un `StockMovementType.DEVOLUCION_
PROVEEDOR` con `purchaseId` apuntando a la compra original cubre el movimiento físico. ✔
**PERO (ajuste 3):** una devolución a proveedor tiene **pata FINANCIERA** (nota de crédito / baja del saldo
que le debemos) que el enum **no** captura. Esa pata se asienta en **`AccountPayable` (D2)**, no en el
ledger. El doc debe **explicitar** que D4 = movimiento de stock (enum) **+** asiento de crédito en CxP —
para no construir la devolución "solo-stock" y tener que rehacerla cuando llegue CxP.

### (b) ¿El export contable (D7) sin schema aguanta como "contabilidad" vendible o subvende?
**Aguanta SIN schema, pero solo si se hace bien — y como está enunciado, roza el subvender.** Dos condiciones
(ajuste 4): **(1)** que el export sea **estructurado tipo Libro IVA (Ventas + Compras)** con los campos que
el contador/ARCA usan (CUIT, tipo de comprobante, neto/IVA/alícuota/total) —no un CSV plano de facturas, que
sí subvende—; deriva 100% de `Invoice`/`Order`/`Payment`, cero schema. **(2)** **naming honesto:** llamarlo
**"Libros / Exportar al contador"**, NO "Contabilidad" (que promete asientos/libro mayor que no hay). Con eso
es genuinamente vendible a la pyme (le ahorra data-entry al contador). El **libro mayor formal
(`JournalEntry`)** en RESERVA está bien.

### (c) ¿Separar `AccountReceivable` (D3) de Payment/Order es la partición correcta o duplica?
**La partición es CORRECTA — NO duplica.** AR = *obligación/saldo* (lo que el cliente debe); Payment/Order =
*la venta y su settlement*. Son conceptos distintos; separarlos es contabilidad sana.
**PERO el schema real destapa un hueco (ajuste 1, el más importante):** hay **DOS modelos de cobro
incompatibles** y **ninguno soporta pago parcial contra saldo** — que es exactamente lo que el fiado (AR)
necesita:
- **Servicios:** `Appointment` → **`Payment`** (rico: status, method, mpPaymentId, comprobanteNro; **1:1**
  vía `appointmentId @unique`).
- **Retail/mostrador:** `Order` → **`paymentMethod` + `paid Boolean` inline** (NO usa `Payment`). Un booleano
  sin parciales ni historial.

El fiado es **cultura de mostrador (Order)**, y ahí el cobro es un booleano. El doc §4.2 dice *"el cobro real
lo asienta Payment"* — **falso para retail**, que es justo donde vive el fiado. Entonces AR podría registrar
la deuda pero **no tiene dónde asentar los cobros parciales** que la van bajando. **Falta un modelo de
cobranza/settlement.** Ver ajuste 1.

### (d) ¿Multi-sucursal queda contenido y no se filtra por ninguna de las 22 rutas?
**CONTENIDO — confirmado con evidencia dura.** Grep del schema **entero**: `sucursal|branch|warehouse|
deposito|locationId|storeId` = **CERO**. `BusinessSettings` es `tenantId @unique` (singleton probado).
`StockMovement`/`StockPurchase`/`StockCount` son **tenant-level** (un solo pool de stock, sin depósito).
Ninguna de las 22 rutas asume sucursal; `3W0`/recepción de depósito está bien en RESERVA. **No se filtra por
ningún lado.** ✔ (Es, de hecho, el gap mejor cerrado del blueprint.)

---

## Ajustes concretos (para pasar de 🟡 a 🟢)

**1 — [ESTRUCTURAL, cierra antes de D2/D3] Modelo de COBRO/settlement unificado.** Definir una **entidad de
cobranza** (ej. `Collection`/`Receipt`: origen `Order|Appointment|AccountReceivable`, monto `Decimal(14,2)`,
método, fecha) que registre **cobros parciales contra un saldo**. **Preferir entidad NUEVA a mutar `Payment`**
(despegar `Payment.appointmentId @unique` sería modificación de constraint, no add puro → rompe "todo
aditivo"). Es **prerrequisito de D2 (CxP) y D3 (AR)** → ubicarlo en las fases **antes** de ellas, no
descubrirlo mid-build. Resuelve (c) y unifica el cobro servicios+retail.

**2 — [ESTRUCTURAL, fiscal] Fijar `Invoice → origen` ahora.** FK nullable `Invoice.orderId?` /
`Invoice.appointmentId?` (o tabla de enlace). Hoy no existe — la idempotencia del webhook tuvo que parchear
con `Payment.comprobanteNro`. Agregarlo con facturas reales adentro = migración fiscal (lo más caro).
Aditivo si se fija ya.

**3 — [refinamiento] D4 devolución:** el doc debe explicitar stock (enum) **+** crédito en `AccountPayable`.

**4 — [refinamiento] D7 export:** Libro IVA estructurado (no CSV plano) + naming "Libros/Exportar al
contador" (no "Contabilidad").

**5 — [refinamiento, de la pasada previa] Reportes(16T) y Facturación** deben declarar explícito que abarcan
**ambos** caminos de venta (Appointment/Payment **y** Order), o el margen Empresa queda ciego a la mitad.

---

## Completitud del modelo de datos (juicio de arquitecto senior)
- **Cobertura de entidades:** completa (D1–D8 + existentes) **salvo** el **modelo de cobranza/settlement**
  (ajuste 1) y el **enlace Invoice↔origen** (ajuste 2). Esas dos son las piezas que, si no se cierran ahora,
  **obligan a migrar dinero/fiscal con clientes adentro** — el caso que el dueño quiere evitar.
- **Orden de construcción por fases:** correcto en lo grueso; **corrección:** el modelo de cobranza (ajuste
  1) es prerrequisito de las Fases D/E (AR/AP) y hoy no figura → insertarlo como Fase C.5.
- **Aditividad ("crecé sin migrar"):** **verdadera para D1–D7** (tablas/columnas nullable, enum values).
  **Única trampa:** si para el cobro se *mutara* `Payment` (relajar el `@unique`), deja de ser add puro →
  por eso el ajuste 1 pide **entidad nueva**, que mantiene la aditividad 100%.

## Recomendación
**APTO CON AJUSTES (🟡).** Aprobar construir **ya** la capa verde (D1 Supplier · D6/D4 · D7 export con ajuste
4). **Frenar D2/D3** hasta cerrar el **ajuste 1** (modelo de cobro) y fijar el **ajuste 2** (Invoice↔origen).
Con 1 y 2 en el doc → **🟢 promovible a ADR-060**. Todo son decisiones de diseño reversibles; **cero §C
ejecutado**.

— Revisión adversarial anclada en schema por GSG (S5 · Arquitecto senior / Gate, Opus).
