// Etapa 2 · T2 — el armado PURO de la factura de una cuota de cobro (sin base).
import { test } from "node:test";
import assert from "node:assert/strict";
import { alicuotaDeIvaPct, armarFacturaDeCuota, esFacturaViva, motivoParaNoFacturar, type DatosParaFacturarCuota } from "./facturar-cuota-core";

const AHORA = new Date("2026-11-10T15:00:00-03:00");
const base = (cambios: Partial<DatosParaFacturarCuota> = {}, cuota: Partial<DatosParaFacturarCuota["cuota"]> = {}): DatosParaFacturarCuota => ({
  tenantId: "t1",
  cuota: { id: "c1", proyectoId: "p1", tipo: "COBRO", concepto: "Stand Arte — anticipo del cliente", monto: 1210, moneda: "ARS", venceEl: new Date("2026-11-20T12:00:00-03:00"), prevista: false, anuladoEl: null, factura: null, ...cuota },
  proyecto: { numero: 7, fechaArmado: new Date("2026-12-01T12:00:00-03:00"), fechaEvento: new Date("2026-12-03T12:00:00-03:00"), fechaDesarme: new Date("2026-12-05T12:00:00-03:00") },
  cliente: null,
  emisor: { cuit: 20111111112, condicionIva: "RESPONSABLE_INSCRIPTO", puntoVenta: 1, regimenFacturaA: null },
  ivaPct: 21,
  ahora: AHORA,
  ...cambios,
});

test("alícuota del presupuesto: 21 → 5, 10,5 → 4, 27 → 6; otra o sin dato → null", () => {
  assert.equal(alicuotaDeIvaPct(21), 5);
  assert.equal(alicuotaDeIvaPct(10.5), 4);
  assert.equal(alicuotaDeIvaPct(27), 6);
  assert.equal(alicuotaDeIvaPct(0), null);
  assert.equal(alicuotaDeIvaPct(19), null);
  assert.equal(alicuotaDeIvaPct(null), null);
  assert.equal(alicuotaDeIvaPct(Number.NaN), null);
});

test("inscripto a consumidor final: B por el total con IVA adentro, servicios, período del proyecto, origen la cuota", () => {
  const r = armarFacturaDeCuota(base());
  assert.ok(r.ok, JSON.stringify(r));
  const i = r.input;
  assert.equal(i.concepto, 2);
  assert.equal(i.total, 1210);
  assert.equal(i.neto, 1000);
  assert.deepEqual(i.iva, [{ alicuotaId: 5, base: 1000, importe: 210 }]);
  assert.equal(i.ivaPorProducto, true);
  assert.equal(i.receptor.docTipo, 99);
  assert.equal(i.fecha, "20261110");
  assert.equal(i.servicioDesde, "20261201");
  assert.equal(i.servicioHasta, "20261205");
  assert.equal(i.vencimientoPago, "20261120");
  assert.deepEqual(i.origin, { type: "PROYECTO_CUOTA", id: "c1" });
  assert.equal(i.reabrirSiRechazada, true);
  assert.equal(i.descripcion, "Proyecto #7 · Stand Arte — anticipo del cliente");
});

test("10,5 %: neto e IVA con alícuota 4, al centavo", () => {
  const r = armarFacturaDeCuota(base({ ivaPct: 10.5 }, { monto: 1105 }));
  assert.ok(r.ok);
  assert.equal(r.input.neto, 1000);
  assert.deepEqual(r.input.iva, [{ alicuotaId: 4, base: 1000, importe: 105 }]);
});

test("monotributo: C sin IVA discriminado, el IVA del presupuesto no se usa (ni frena)", () => {
  const r = armarFacturaDeCuota(base({ emisor: { cuit: 20111111112, condicionIva: "MONOTRIBUTO", puntoVenta: 2 }, ivaPct: 0 }));
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.input.neto, 1210);
  assert.equal(r.input.total, 1210);
  assert.equal(r.input.ivaPorProducto, undefined);
  assert.equal(r.input.iva.reduce((s, x) => s + x.importe, 0), 0);
});

test("inscripto con IVA raro o sin presupuesto: no se emite, con el porqué", () => {
  const raro = armarFacturaDeCuota(base({ ivaPct: 19 }));
  assert.equal(raro.ok, false);
  assert.match((raro as { error: string }).error, /19 %/);
  const sin = armarFacturaDeCuota(base({ ivaPct: null }));
  assert.equal(sin.ok, false);
  assert.match((sin as { error: string }).error, /no tiene presupuesto/);
});

test("vencimiento de pago: nunca antes de hoy", () => {
  const r = armarFacturaDeCuota(base({}, { venceEl: new Date("2026-10-01T12:00:00-03:00") }));
  assert.ok(r.ok);
  assert.equal(r.input.vencimientoPago, "20261110");
});

test("período: sin armado/desarme usa la fecha del evento; sin ninguna fecha no se emite", () => {
  const soloEvento = armarFacturaDeCuota(base({ proyecto: { numero: 7, fechaArmado: null, fechaEvento: new Date("2026-12-03T12:00:00-03:00"), fechaDesarme: null } }));
  assert.ok(soloEvento.ok);
  assert.equal(soloEvento.input.servicioDesde, "20261203");
  assert.equal(soloEvento.input.servicioHasta, "20261203");
  const sinFechas = armarFacturaDeCuota(base({ proyecto: { numero: 7, fechaArmado: null, fechaEvento: null, fechaDesarme: null } }));
  assert.equal(sinFechas.ok, false);
  const alReves = armarFacturaDeCuota(base({ proyecto: { numero: 7, fechaArmado: new Date("2026-12-05T12:00:00-03:00"), fechaEvento: null, fechaDesarme: new Date("2026-12-01T12:00:00-03:00") } }));
  assert.equal(alReves.ok, false);
});

test("la cuota: sólo cobro de proyecto, no anulada, no prevista, sin texto de factura, en pesos, con monto", () => {
  assert.equal(motivoParaNoFacturar(base().cuota), null);
  assert.match(motivoParaNoFacturar(base({}, { tipo: "PAGO" }).cuota) ?? "", /cobro/);
  assert.match(motivoParaNoFacturar(base({}, { proyectoId: null }).cuota) ?? "", /cobro/);
  assert.match(motivoParaNoFacturar(base({}, { anuladoEl: new Date() }).cuota) ?? "", /anulada/);
  assert.match(motivoParaNoFacturar(base({}, { prevista: true }).cuota) ?? "", /previsión/);
  assert.match(motivoParaNoFacturar(base({}, { factura: "FC B 0001-00000045" }).cuota) ?? "", /fuera del sistema/);
  assert.equal(motivoParaNoFacturar(base({}, { factura: "   " }).cuota), null, "sólo espacios = vacío");
  assert.match(motivoParaNoFacturar(base({}, { moneda: "USD" }).cuota) ?? "", /pesos/);
  assert.match(motivoParaNoFacturar(base({}, { monto: 0.004 }).cuota) ?? "", /monto/);
  const usd = armarFacturaDeCuota(base({}, { moneda: "USD" }));
  assert.equal(usd.ok, false);
});

test("monto con flotante: el total sale al centavo (0,1 + 0,2)", () => {
  const r = armarFacturaDeCuota(base({ emisor: { cuit: 20111111112, condicionIva: "MONOTRIBUTO", puntoVenta: 2 } }, { monto: 0.1 + 0.2 }));
  assert.ok(r.ok);
  assert.equal(r.input.total, 0.3);
});

test("inscripto, A a un inscripto sin domicilio en la ficha: no se promete (el impreso no sale)", () => {
  const r = armarFacturaDeCuota(
    base({
      emisor: { cuit: 20111111112, condicionIva: "RESPONSABLE_INSCRIPTO", puntoVenta: 1, regimenFacturaA: "A" },
      cliente: { docTipo: 80, docNro: "30712345671", razonSocial: "Cliente SA", condicionIva: "RESPONSABLE_INSCRIPTO", domicilio: null },
    }),
  );
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /domicilio/);
});

test("factura viva: PENDING y AUTHORIZED; la rechazada no congela", () => {
  assert.equal(esFacturaViva("PENDING"), true);
  assert.equal(esFacturaViva("AUTHORIZED"), true);
  assert.equal(esFacturaViva("REJECTED"), false);
  assert.equal(esFacturaViva(undefined), false);
});

test("aviso: presupuesto con IVA y negocio que factura C", async () => {
  const { avisoIvaEnFacturaC } = await import("./facturar-cuota-core");
  assert.match(avisoIvaEnFacturaC("MONOTRIBUTO", 21) ?? "", /monotributista y factura C/);
  assert.match(avisoIvaEnFacturaC("EXENTO", 10.5) ?? "", /exento de IVA/);
  assert.equal(avisoIvaEnFacturaC("MONOTRIBUTO", 0), null);
  assert.equal(avisoIvaEnFacturaC("MONOTRIBUTO", null), null);
  assert.equal(avisoIvaEnFacturaC("RESPONSABLE_INSCRIPTO", 21), null);
  assert.equal(avisoIvaEnFacturaC(null, 21), null);
});
