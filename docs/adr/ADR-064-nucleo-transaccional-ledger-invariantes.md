---
id: ADR-064
nivel: fundacional
dominio: [Arquitectura, Datos]
depends_on: [ADR-002, ADR-006, ADR-022, ADR-024, ADR-057]
---
# ADR-064: Núcleo transaccional — ledger append-only + calculadoras puras en Decimal + invariantes I1–I7

**Estado:** Aceptado — **fundamento de arquitectura del núcleo (plata y stock)**. Formaliza como ADR el diseño
decision-grade ya elaborado en `docs/estrategia/addendum-nucleo-transaccional.md` (fuente de verdad del detalle).
**Fecha:** 2026-07-10
**Depende de:** ADR-002 (Core/Plugin), ADR-006 (motores/Tax Engine), ADR-022 (plugin ARCA, outbox),
ADR-024 (disparadores de facturación), ADR-057 (representación de dinero + redondeo único)
**Relacionado:** ADR-061 (motor compartido), ADR-063 (endurecer, no reconstruir), ADR-040 (Gate),
ADR-055 (variante: rubro como config) · **Detalle completo:** `docs/estrategia/addendum-nucleo-transaccional.md`

---

## Contexto

La plata y el stock son el corazón del ERP: un error acá es caro e irreversible. El repo **ya tiene los
cimientos correctos** (calculadoras puras de pricing/IVA/arqueo/márgenes, ledger append-only de stock y caja,
settlement con cobro parcial guardado por concurrencia, venta atómica orden+stock con outbox fiscal), pero el
diseño estaba **repartido** y con huecos. El addendum (`addendum-nucleo-transaccional.md`, Arquitecto de
Solución, 2026-07-10) fijó el diseño decision-grade y los invariantes verificables. Este ADR lo **eleva a
fundamento** para que sea criterio rector y quede enganchado al grafo y al Gate; el addendum sigue siendo la
**fuente de verdad del detalle** (índice-puntero, ADR-008/H1).

## Decisión

El núcleo transaccional se organiza en **cuatro capas**, de adentro hacia afuera, y se **verifica por
invariantes** que el consultor funcional firma (ADR-068) y que corren como tests en el Gate (ADR-040):

1. **Calculadoras PURAS** (sin DB, unit-testeables, **Decimal** en la firma pública, config por rubro/régimen
   fiscal del tenant): `computeSaleTotals` (pricing en una sola tubería `precio→descuento→impuestos→total`),
   `valuateInventory` (ULTIMO_COSTO/PPP), arqueo (`expectedCash`), márgenes. **Deciden cuánto.**
2. **Ledger append-only** = única fuente de verdad: cada hecho económico es un **movimiento inmutable** (se
   corrige con inverso, nunca se edita/borra). **Registra qué pasó.**
3. **Proyecciones**: los saldos (stock actual, caja, cuenta corriente, ingresos) se **derivan** de los
   movimientos; los campos vivos (`Product.stock`, cierres de caja) son **caché**, no verdad mutable
   ("ledger primero, campo como caché"). **Derivan el saldo.**
4. **Fronteras transaccionales**: cada transacción de negocio es **atómica** (todo-o-nada) + **idempotencia
   fiscal** por outbox. La llamada a ARCA queda FUERA de la tx (asíncrona; no se atomiza un tercero).

**Los invariantes I1–I7** (detalle en el addendum §4) son la definición de "el núcleo cumple":
I1 Σmovimientos = saldo proyectado · I2 no hay comprobante sin venta ni venta facturable sin comprobante ·
I3 stock nunca negativo sin autorización · I4 toda plata pasa por la calculadora central · I5 cobro parcial
nunca sobre-cobra + saldo cierra al centavo · I6 redondeo único (`round2` EPSILON-safe, ADR-057) · I7 venta
al contado atómica (orden+stock+cobro+caja).

### Los TRES cierres priorizados (hoy en rojo/parcial)
El ground-truth marca **I3/I5/I6 verdes; I1/I4 parciales; I2/I7 en rojo**. El trabajo de construcción es
cerrar tres huecos:
- **(a) Idempotencia de factura POR VENTA** (I2): `createInvoice` upsertea por `(tenantId, originType,
  originId)` (enlace D10) → **una factura por venta**, reintento = no-op → **no duplica comprobante/CAE**.
- **(b) Venta al contado atómica con caja** (I7): una sola tx que abarque orden+líneas, descuento de stock,
  cobro (ledger de cobranza) y movimiento de caja si es efectivo — hoy la caja va en tx separada.
- **(c) Pricing unificado / plata Float→Decimal** (I4 + ADR-057): una tubería central `computeSaleTotals`
  (POS y turno llaman la MISMA), con Decimal en el borde fiscal — hoy el cálculo está partido.

> **Regla:** los cierres son **aditivos** (entidad/índice nuevos, upsert, tx ampliada), no mutación de campos
> vivos → reversibles y detrás de flag donde toquen UI (ADR-063).

## Consecuencias

- **(+)** Todo saldo es **reconstruible y auditable** desde su ledger (I1); toda factura enlaza a su venta
  (I2); la plata se calcula en un solo lugar (I4) → trazabilidad y confianza fiscal.
- **(+)** **Extensible por rubro sin reescribir**: el rubro/edición entra como config (régimen fiscal, método
  de valuación, módulos) — la tubería no cambia (principio de VARIANTE, ADR-055; motor compartido, ADR-061).
- **(+)** Los invariantes como **gates** convierten "cumple transaccionalmente" en algo **verificable**, no
  opinable — el consultor firma sobre tests, no sobre promesas (ADR-068).
- **(−)** Cerrar I2/I7 toca caminos calientes (facturación, venta al contado) → exige cuidado, flags y tests de
  inyección de fallo. Es construcción, con su Gate (ADR-040) y su migración (Gate 2 si toca schema).
- **(−)** Convivencia ledger + campo-caché durante la transición (más superficie; ADR-063 la asume).

## Alternativas descartadas

- **Saldos como verdad mutable** (guardar el stock/caja y actualizarlo en el lugar, sin ledger). Simple pero
  **no auditable** ni reconstruible; un bug corrompe el saldo sin rastro. Rechazada: el ledger append-only ya
  es la base y es lo correcto.
- **Atomizar la llamada a ARCA dentro de la tx de venta.** Garantizaría 1:1 venta-comprobante síncrono, pero
  **acopla la venta a un tercero** (si ARCA cae, no se vende). Rechazada: outbox asíncrono + idempotencia por
  venta (ADR-022) logra el 1:1 sin acoplar.
- **Reescribir el núcleo "bien de una".** Rechazada por ADR-063: los cimientos son correctos; se cierran tres
  huecos, no se reconstruye.
- **Centavos-enteros en vez de Decimal.** Evaluada y **rechazada en ADR-057**; se mantiene `number`/Decimal con
  redondeo único.

— Elaborado por GSG (Arquitecto de Solución — fundamento; detalle vivo en el addendum. Los 3 cierres son construcción con Gate)
