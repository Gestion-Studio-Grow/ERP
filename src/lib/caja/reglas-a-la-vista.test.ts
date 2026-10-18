// Cada frase de «reglas a la vista» dice lo que el código hace: si la regla cambia, este test cae.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { REGLAS_A_LA_VISTA, reglaALaVista } from "./reglas-a-la-vista";
import { fronteraDeVenta, mensajeVentaEnDiaCerrado, planAnulacionVenta } from "@/lib/order-anulacion";
import { mensajeFacturaViva } from "@/lib/factura-viva";

const leer = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

test("sólo en un mostrador: en CH (servicios) no hay frase", () => {
  for (const p of ["vender", "caja", "cierre", "ventas"] as const) {
    assert.equal(reglaALaVista(p, false), null);
    assert.equal(reglaALaVista(p, true), REGLAS_A_LA_VISTA[p]);
  }
});

test("una frase por pantalla, corta y sin prometer lo que no pasa («entra mañana»)", () => {
  for (const frase of Object.values(REGLAS_A_LA_VISTA)) {
    assert.ok(frase.length <= 140, frase);
    assert.doesNotMatch(frase, /mañana|automáticamente|solo/i, frase);
    assert.equal(frase.split(". ").length, 1, `una sola frase: ${frase}`);
  }
});

test("vender: con el día cerrado la venta cobrada se bloquea y la salida es dejarla sin cobrar", () => {
  const cerrado = (dia: string, hasta: string) => dia <= hasta;
  const base = { paymentMethod: "EFECTIVO", hoy: "2026-10-18", cerradoHasta: "2026-10-18", esDiaCerrado: cerrado };
  assert.equal(fronteraDeVenta({ ...base, paid: true }).bloquea, true);
  assert.equal(fronteraDeVenta({ ...base, paid: false }).bloquea, false, "sin cobrar se registra");
  assert.match(mensajeVentaEnDiaCerrado("2026-10-18", "2026-10-18"), /Destildá «Cobrado»/);
  assert.match(REGLAS_A_LA_VISTA.vender, /se registra sin cobrar y se marca cobrada cuando la caja vuelve a abrir/);
});

test("caja: el arqueo del turno cuenta sólo el efectivo", () => {
  const registro = leer("./cash-register.ts");
  assert.match(registro, /return \(m\.method \?\? "EFECTIVO"\) === "EFECTIVO";/);
  assert.match(leer("./cash-sale.ts"), /El ARQUEO \(cash-register\.ts\) filtra por medio y cuenta sólo EFECTIVO/);
  assert.match(REGLAS_A_LA_VISTA.caja, /sólo el efectivo/);
});

test("cierre: una venta de un día cerrado no se anula (tampoco el dueño)", () => {
  const plan = planAnulacionVenta({ existe: true, yaAnulada: false, diaCerrado: true, factura: "sin-factura-viva" } as Parameters<typeof planAnulacionVenta>[0]);
  assert.deepEqual(plan, { ok: false, motivo: "dia-cerrado" });
  assert.match(leer("../order-anulacion.ts"), /EGRESO en el libro de caja con la fecha de hoy/);
  assert.match(REGLAS_A_LA_VISTA.cierre, /egreso con la fecha de hoy/);
});

test("ventas: con factura autorizada no se anula; primero la nota de crédito, que el sistema no emite", () => {
  const plan = planAnulacionVenta({ existe: true, yaAnulada: false, diaCerrado: false, factura: "autorizada" } as Parameters<typeof planAnulacionVenta>[0]);
  assert.deepEqual(plan, { ok: false, motivo: "facturada" });
  assert.match(mensajeFacturaViva("autorizada", "venta"), /nota de crédito que la cancela, y el sistema todavía no la emite/);
  assert.match(REGLAS_A_LA_VISTA.ventas, /nota de crédito/);
});
