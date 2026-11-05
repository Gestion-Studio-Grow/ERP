// La rendición recibida (NAIL-ARTIST.md §5), PURA: centavos exactos, período sin turnos, sin config y textos.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularRendicion,
  cobradoDelTurno,
  cobrosDeLaProfesional,
  periodoTerminado,
  leerConfigDeRendicion,
  mesAnterior,
  motivoDelIngreso,
  periodoMensual,
  textoComprobanteRendicion,
  tieneRendicion,
  avisoSinTelefono,
  ingresosSinLoDeLasProfesionales,
} from "./rendiciones";

const turno = (id: string, ...montos: number[]) => ({ id, cobros: montos.map((amount) => ({ amount, note: null })) });

test("33 % de lo cobrado, al centavo y una sola vez: 33 % de $10.000,01 = $3.300,00", () => {
  const r = calcularRendicion([turno("a", 5000), turno("b", 5000.01)], { boxRentAmount: null, rentPercent: 33 });
  assert.equal(r.collectedTotal, 10000.01);
  assert.equal(r.percentAmount, 3300); // 3300,0033 → 3300,00
  assert.equal(r.amount, 3300);
  assert.equal(r.appointmentCount, 2);
});

test("33 % de $100,05 = $33,02 (33,0165 redondea medio centavo para arriba) + alquiler $0,01", () => {
  const r = calcularRendicion([turno("a", 100.05)], { boxRentAmount: 0.01, rentPercent: 33 });
  assert.equal(r.percentAmount, 33.02);
  assert.equal(r.rentAmount, 0.01);
  assert.equal(r.amount, 33.03);
});

test("$0,01 cobrado al 33 % = $0 (no inventa centavos); 0,1 + 0,2 sin error de binario", () => {
  assert.equal(calcularRendicion([turno("a", 0.01)], { boxRentAmount: null, rentPercent: 33 }).percentAmount, 0);
  assert.equal(calcularRendicion([turno("a", 0.1, 0.2)], { boxRentAmount: null, rentPercent: null }).collectedTotal, 0.3);
});

test("período sin turnos = sólo el alquiler", () => {
  const r = calcularRendicion([], { boxRentAmount: 45000, rentPercent: 30 });
  assert.deepEqual(r, { collectedTotal: 0, rentPercent: 30, percentAmount: 0, rentAmount: 45000, amount: 45000, appointmentCount: 0 });
});

test("sin config = 0 y no rinde", () => {
  const config = { boxRentAmount: null, rentPercent: null };
  assert.equal(calcularRendicion([turno("a", 20000)], config).amount, 0);
  assert.equal(tieneRendicion(config), false);
  assert.equal(tieneRendicion({ boxRentAmount: 0, rentPercent: 0 }), false);
  assert.equal(tieneRendicion({ boxRentAmount: null, rentPercent: 10 }), true);
});

test("lo anulado resta (con cualquier signo), la condonación no cuenta y un turno nunca da negativo", () => {
  assert.equal(
    cobradoDelTurno([
      { amount: 5000, note: null },
      { amount: 15000, note: null },
      { amount: -5000, note: "ANULACION:c1 — se equivocó" },
      { amount: 1000, note: "CONDONACION: regalo" },
    ]),
    15000,
  );
  assert.equal(cobradoDelTurno([{ amount: 100, note: null }, { amount: 300, note: "ANULACION:x — y" }]), 0);
});

test("período mensual en la zona del negocio: [1/11 00:00 AR, 1/12 00:00 AR); diciembre pasa de año", () => {
  const p = periodoMensual("2026-11");
  assert.ok(p);
  assert.equal(p.desde.toISOString(), "2026-11-01T03:00:00.000Z");
  assert.equal(p.hasta.toISOString(), "2026-12-01T03:00:00.000Z");
  assert.equal(periodoMensual("2026-12")?.hasta.toISOString(), "2027-01-01T03:00:00.000Z");
  assert.equal(periodoMensual("2026-13"), null);
  assert.equal(periodoMensual("nov"), null);
  assert.equal(mesAnterior("2026-01"), "2025-12");
});

test("config del formulario: criollo y numérico, vacío = sin cargar, fuera de rango rechaza", () => {
  assert.deepEqual(leerConfigDeRendicion({ boxRentAmount: "45.000,50", rentPercent: "33.5" }), {
    ok: true,
    config: { boxRentAmount: 45000.5, rentPercent: 33.5 },
  });
  assert.deepEqual(leerConfigDeRendicion({ boxRentAmount: "", rentPercent: "" }), { ok: true, config: { boxRentAmount: null, rentPercent: null } });
  assert.equal(leerConfigDeRendicion({ boxRentAmount: "-1", rentPercent: "" }).ok, false);
  assert.equal(leerConfigDeRendicion({ boxRentAmount: "", rentPercent: "101" }).ok, false);
  assert.equal(leerConfigDeRendicion({ boxRentAmount: "abc", rentPercent: "" }).ok, false);
});

test("comprobante y motivo del ingreso (§5)", () => {
  assert.equal(motivoDelIngreso("Mica", "2026-11"), "Rendición Nail Artist · Mica · noviembre 2026");
  const base = { mes: "2026-11", negocio: "CH", collectedTotal: 120000, appointmentCount: 6, recibidoEl: "30/11", metodo: "TRANSFERENCIA" };
  assert.equal(
    textoComprobanteRendicion({ ...base, rentPercent: 30, percentAmount: 36000, rentAmount: 45000, amount: 81000 }),
    "Rendición noviembre 2026: cobraste $120.000 en 6 turnos; 30 % = $36.000 + alquiler del box $45.000 = *$81.000*, recibido por CH el 30/11 por transferencia. ¡Gracias!",
  );
  assert.match(
    textoComprobanteRendicion({ ...base, appointmentCount: 1, rentPercent: 0, percentAmount: 0, rentAmount: 0.01, amount: 0.01 }),
    /en 1 turno; alquiler del box \$0,01 = \*\$0,01\*/,
  );
});

test("destino del cobro: con asiento en la caja es de CH aunque el servicio esté marcado; la anulación sigue a su cobro", () => {
  const c = (id: string, amount: number, conAsientoEnCaja: boolean, note: string | null = null) => ({ id, amount, note, conAsientoEnCaja });
  const seniaAlAlias = "a Mica (mica.uñas) — no entra a la caja del negocio";
  const cobros = [
    c("senia", 3000, false, seniaAlAlias),
    c("saldo", 7000, false),
    c("deCH", 5000, true),
    c("anulaDeCH", -5000, false, "ANULACION:deCH — error"),
    c("anulaSaldo", -2000, false, "ANULACION:saldo — error"),
    c("condona", 1000, false, "CONDONACION: regalo"),
  ];
  assert.equal(cobradoDelTurno(cobrosDeLaProfesional(cobros, true)), 8000);
  // Servicio desmarcado después: el saldo sin nota ya no se atribuye; la seña al alias, sí (snapshot en la nota).
  assert.equal(cobradoDelTurno(cobrosDeLaProfesional(cobros, false)), 3000);
});

test("período terminado: el mes en curso no, el anterior sí", () => {
  const p = periodoMensual("2026-10")!;
  assert.equal(periodoTerminado(p, new Date("2026-10-31T23:00:00Z")), false);
  assert.equal(periodoTerminado(p, new Date("2026-11-01T03:00:00Z")), true);
});

// ── QA de Tanda 2: Inicio sin lo de ella; comprobante sin teléfono ───────────

test("Ingresos 7 días: descuenta lo cobrado por la profesional por turno, nunca más que su pago", () => {
  const pagos = [
    { appointmentId: "a", amount: 20000 }, // 5.000 de seña a ella + 15.000 de saldo a ella
    { appointmentId: "b", amount: 18000 }, // servicio de CH
    { appointmentId: "c", amount: 3000.1 }, // ella cobró 3.000,10
    { appointmentId: "d", amount: 1000 }, // dato raro: «de ella» mayor que el pago → 0, nunca negativo
  ];
  assert.equal(ingresosSinLoDeLasProfesionales(pagos, { a: 20000, c: 3000.1, d: 5000 }), 18000);
  assert.equal(ingresosSinLoDeLasProfesionales(pagos, {}), 42000.1);
  assert.equal(ingresosSinLoDeLasProfesionales([{ appointmentId: "a", amount: 10000.3 }], { a: 0.1 }), 10000.2);
});

test("rendición sin teléfono: se pide cargarlo, con su nombre", () => {
  assert.equal(avisoSinTelefono("Mica"), "Para mandarle el comprobante, cargá el teléfono de Mica en su ficha.");
});
