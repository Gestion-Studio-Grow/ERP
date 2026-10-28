# Pedidos al motor de facturación — desde la consola del contador

**Quién pide:** frente «Consola del contador» (rama `claude/facturacion-automatica-contador`).
**A quién:** el frente del motor (`src/lib/facturacion/**`, `src/lib/invoice-core.ts`,
`src/lib/arca-*.ts`, `src/plugins/arca/**`, `src/lib/fiscal/**`, `prisma/**`).
**Regla:** la consola NO edita nada de eso. Consume el contrato del motor
(`src/lib/facturacion/README.md`) y, donde falta algo, usa un adaptador en `src/app/contador/` o
`src/lib/cartera-*.ts` y lo anota acá.

**Estado al 2026-10-22 (2ª vuelta):** los pedidos 1 a 6 los resolvió el motor (`ba965cc3`) y la
consola ya los consume; los adaptadores de la 1ª vuelta se borraron. Quedan abiertos el 7 y el 8.

> ⚠️ Gate 2: los pedidos 2, 3 y 5 viven en las migraciones `20261022140000_invoice_abono_descripcion`
> y `20261022140100_regla_facturacion`, generadas y SIN aplicar en Neon. Hasta que el dueño las
> aplique, la consola lo dice en «Abonos» y «Lote del mes» (sin 500) y el CSV sale sin descripción.

---

## 1. Emitir una nota de crédito asociada — ✅ RESUELTO

`crearNotaDeCredito(input)` / `crearNotaDeCreditoInTx(tx, input)`. La consola la llama desde
«Anular» en la lista de comprobantes del cliente (`anularFacturaAction`), con el `tenantId` del
cliente después de verificar la cartera: total o parcial, con motivo. Probado contra Postgres
(parcial y «más de lo que queda» rechazado).

## 2. Origen «abono» con idempotencia en la base — ✅ RESUELTO

`origin: { type: "ABONO", id: claveDeAbono(regla, mes) }` + `@@unique([tenantId, abonoClave])`, y
`reabrirSiRechazada` para volver a emitir. **Se cayó en la consola:** el candado
`pg_advisory_xact_lock` y las filas `cartera.abono.emitido`. Dos lotes a la vez: el segundo choca
con el índice (P2002) y se cuenta como «ya emitida». Probado contra Postgres.

## 3. Tabla `ReglaFacturacion` — ✅ RESUELTO (migración = Gate 2)

La consola lee y escribe la tabla (`leerReglasDelEstudio`, `guardarReglaDelEstudio`,
`darDeBajaReglaDelEstudio`). **Se cayeron** las versiones en `AuditLog` del estudio: nunca
llegaron a producción, así que no hay reglas viejas que migrar ni leer. Lo que se guarda o se da
de baja queda además en la auditoría (`cartera.abono.guardado` / `cartera.abono.baja`).

## 4. Abonos de responsable inscripto — ✅ RESUELTO (con una limitación, ver §7)

`montosDeRenglones("RESPONSABLE_INSCRIPTO", [{ total, alicuotaIva }])`. La consola lo usa con la
alícuota general (21 %, código 5): el importe de la regla es IVA incluido.

## 5. Descripción del comprobante — ✅ RESUELTO (migración = Gate 2)

`CreateInvoiceInput.descripcion`. El abono la manda con el mes («Honorarios mensuales · octubre
2026») y el CSV de la cartera la muestra en «Qué se facturó».

## 6. Contar pendientes de un negocio — ✅ RESUELTO

`contarPendientesDelNegocio(tenantId)`: la consola dejó su propia cuenta.

---

## 7. Alícuota de IVA en la regla de abono (ABIERTO · prioridad MEDIA · migración = Gate 2)

`ReglaFacturacion` no guarda la alícuota, así que un abono de inscripto sale SIEMPRE al 21 %. Hay
servicios al 10,5 % (y 27 % en algunos servicios públicos). Pedido:

```prisma
model ReglaFacturacion {
  …
  alicuotaIva Int? // código de ARCA (4 = 10,5 %, 5 = 21 %, 6 = 27 %); nula = 21 % (lo de hoy)
}
```

Con eso la consola suma el campo al formulario y pasa el código a `montosDeRenglones`.
**Adaptador hoy:** `ALICUOTA_GENERAL = 5` en `src/app/contador/abonos/abonos-core.ts`.

## 8. La descripción en la lista de comprobantes (ABIERTO · prioridad BAJA)

`leerParaExportar` / `paginaDeComprobantesEn` (`src/lib/facturacion/lista.server.ts`) no traen
`Invoice.descripcion`, y `camposCsv` no tiene la columna. La consola la lee con una consulta más
por cliente (`descripcionesDelMes` en `src/app/contador/exportar/route.ts`). Pedido: sumar
`descripcion: string | null` a `RenglonComprobante` y a `CABECERA_CSV`/`camposCsv`. **Se cae:**
esa consulta extra (y Facturación de cada negocio también la muestra).

— Elaborado por GSG
