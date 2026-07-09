# 🧨 Review adversarial de la estructura consolidada — Veredicto S5/Opus

> **Revisa:** `docs/estrategia/estructura-consolidada-producto.md` (Arquitecto de Solución, candidato ADR-060).
> **Marco:** `docs/estrategia/marco-review-estructura-consolidada-S5.md` (8 gaps + rúbrica).
> **Objetivo del dueño:** estructura **CERRADA** antes de salir en vivo (no reestructurar con clientes adentro).
> **Revisor:** S5 (Arquitecto senior / Gate, Opus) · **Fecha:** 2026-07-08.

---

## Veredicto: **APTO CON AJUSTES**

La estructura está **~90% cerrada** y es genuinamente sólida donde más importa: resuelve **7 de los 8 gaps
estructurales** pre-identificados con criterio de arquitecto (entidades maestras, dependencias, aditividad,
multi-sucursal excluido explícitamente). Los ajustes son **acotados pero de alto apalancamiento**: caen todos
en el **plumbing de dinero/fiscal cruzando los dos caminos de venta** — que es justamente la categoría **cara
de cambiar con clientes adentro** (migrar `Invoice`/`Payment` con datos reales). Cerrar esos 3 puntos deja la
estructura **CERRADA de verdad**.

## Gaps del marco — cómo quedaron

| Gap | Resultado | Nota |
|---|---|---|
| G1 Supplier | ✅ **resuelto** | D1 `Supplier` maestro, FK nullable + snapshot, prerrequisito declarado |
| G2 cuentas-a-cobrar (fiado) | ✅ **resuelto** | D3 `AccountReceivable`, rubro-gated default-OFF, light↔formal aditivo |
| G3 cuentas-a-pagar / cheque | ✅ **resuelto** | D2 `AccountPayable`+`PayableCheque` (fecha diferida/endoso), diferido a lead |
| G4 contabilidad J58 | ✅ **resuelto** | D7 = EXPORT (cero schema); libro mayor formal a RESERVA |
| G5 multi-sucursal | ✅ **resuelto** | Excluido explícito, no contrabandeado, ADR aparte |
| **G6 enlace Invoice↔origen** | ⚠️ **ABIERTO** | ajuste 1 |
| **G7 dos caminos de venta (servicios/retail) en reportes+facturación** | ⚠️ **parcial** | ajuste 3 |
| **G8 `Payment` 1:1 con `Appointment`** | ⚠️ **ABIERTO** | ajuste 2 |

---

## Ajustes requeridos (acotados, cerrar antes de consolidar)

### Ajuste 1 — Fijar el enlace `Invoice → origen` AHORA (G6, fiscal, caro después)
`Invoice` no tiene FK a su origen (`Order`/`Appointment`/`Payment`). El hardening de idempotencia tuvo que
usar `Payment.comprobanteNro` como parche **precisamente** por esta falta. Agregar la FK con **facturas
reales adentro** = migración sobre datos fiscales (lo más caro). **La estructura debe decidir el origen de la
factura ahora** (ej. `Invoice.orderId?` + `Invoice.appointmentId?` nullable, o tabla de enlace). Es aditivo
(nullable) → entra sin backfill si se fija ya.

### Ajuste 2 — Unificar el modelo de COBRO across servicios y retail (G8, el que rompe el fiado)
`Payment` está atado 1:1 a `Appointment` (`appointmentId @unique`). Pero §4.2 dice *"CxC/CxP no tocan caja;
el cobro real lo asienta **Payment**"* — y una venta de **mostrador (Order)** hoy **no puede** colgar un
`Payment`. Esto es un hueco real: **el fiado (D3) es cultura de comercio de barrio = ventas de MOSTRADOR**,
no de turnos. Si el cobro de un `Order` no tiene dónde asentarse, el fiado sobre retail queda sin plumbing.
**Decidir ahora:** o se generaliza `Payment` a `(Appointment | Order)` (despegar el `@unique`), o se define
el modelo de cobro de retail explícito y CxC/CxP se atan a ÉL. Sin esta decisión, D3 (el driver del fiado)
no tiene fundación coherente.

### Ajuste 3 — Declarar que Reportes(rentabilidad) y Facturación abarcan AMBOS caminos (G7)
Hay dos cabezas de venta: servicios (`Appointment`+`Payment`) y retail (`Order`+`OrderItem`). El margen
Empresa (16T) y la facturación (1J2) deben **sumar ambas** o el reporte queda **ciego a la mitad de las
ventas**. El doc lo deja implícito ("derivado"); debe **declararlo explícito** (qué entidades alimentan el
margen y la factura) para que no se construya un reporte que solo ve una cabeza.

### Ajuste 4 (ejecución, no del doc) — WATCH: 5 pantallas 🔨 en scaffolding AHORA
Detecté scaffolds sin commitear de `cuentas-a-cobrar/`, `cuentas-a-pagar/`, `contabilidad/`,
`devoluciones-proveedor/`, `inventario/` + un `data-table-sort`. El propio blueprint las **faseó** (Fase
C/D/E, gated por §C/lead/rubro). **Riesgo:** construirlas ANTES de sus entidades (Supplier/AccountPayable/
AccountReceivable, que son §C) o del lead (J59, ADR-030) viola el phasing del propio doc. **Al Gate:**
verificar que sigan `ready:false`, sin acceso a entidades inexistentes, y que J59 respete el gate de lead.

---

## Lo que está muy bien (no tocar)
- **Orden de construcción con cuello explícito** (`Supplier` primero) y fases A–E con Gates — impecable.
- **Aditividad probada** entidad por entidad (nullable/enum) → cumple `enterprise ⊇ lite` sin backfill.
- **Multi-sucursal y corporativo excluidos explícitamente** (no contrabandeados como "aditivo") — exactamente
  la disciplina que evita reestructurar después.
- **§C tabulado y elevado** (§5), naming Comercio/Empresa, variante ADR-055 (`compras` dueño de `Supplier`).

## Recomendación
**APTO CON AJUSTES.** Con los ajustes 1–3 incorporados (plumbing de dinero/fiscal cerrado) la estructura queda
**CERRADA** y puede promoverse a **ADR-060**. El ajuste 4 es un watch de ejecución para el Gate de la ola.
Los ajustes son de diseño (doc), reversibles, cero §C ejecutado.

— Revisión adversarial por GSG (S5 · Arquitecto senior / Gate, Opus).
