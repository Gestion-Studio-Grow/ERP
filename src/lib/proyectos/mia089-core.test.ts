// ============================================================================
// GSG-MIA-089 · reglas puras de la plata de Proyectos (reloj inyectado: nada depende del día en que corre).
//   V1: una cuota que ya fue firme no vuelve a ser previsión ni cambia su vencimiento al ir y volver de etapa.
//       Caso PRY-098: seña firme que vencía el 26/10; hoy 17/11. Lead → Confirmado la corría al 17/11.
//   P1: con un cobro o un pago hecho, no se vuelve a una etapa anterior a Confirmado (provisional a confirmar por el dueño).
//   V2: un proyecto perdido no debe nada: lo cobrado queda como cobrado (provisional a confirmar por el dueño).
//   V3: reabrir vuelve a la etapa que tenía al perderse, se suelte donde se suelte (provisional a confirmar por el dueño).
//   T:  Cuentas a cobrar y a pagar generales viven en Proyectos → Administración en un negocio con Proyectos.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { previstaDeLaCuota, venceDeLaCuota } from "./gestion-core";
import { cobranza, cobranzaDePerdido, cobranzaEnMoneda } from "./cobranza-core";
import { destinoAlMover, retrocesoConPlata } from "./ficha-core";
import { appPorId } from "@/apps/registro";
import { appsVisibles, cuentaQueViveEnProyectos, motivoNoDisponible, type NegocioApps } from "@/apps/visibles";

const d = (s: string) => new Date(`${s}T12:00:00Z`);
const CLAVE = "p1:cliente:anticipo";
const CONFIRMADA = d("2026-10-26"); // la seña quedó firme ese día
const HOY = d("2026-11-17");
const CREADO = d("2026-10-01"); // fecha del plan de una seña en un lead (nace con la fecha de alta)

test("V1 · Confirmado → Lead: la seña firme que vencía el 26/10 sigue firme y con su fecha", () => {
  const previa = { venceEl: CONFIRMADA, venceManual: false, prevista: false };
  // En Lead el plan la pide como previsión, con la fecha de alta: una cuota que ya fue firme no vuelve atrás.
  assert.equal(previstaDeLaCuota({ prevista: true, previa }), false);
  assert.equal(venceDeLaCuota({ clave: CLAVE, plan: CREADO, prevista: true, hoy: HOY, previa }).toISOString(), CONFIRMADA.toISOString());
});

test("V1 · Lead → Confirmado: la seña firme NO se corre al 17/11 (el caso PRY-098)", () => {
  const previa = { venceEl: CONFIRMADA, venceManual: false, prevista: false };
  assert.equal(venceDeLaCuota({ clave: CLAVE, plan: CREADO, prevista: false, hoy: HOY, previa }).toISOString(), CONFIRMADA.toISOString());
  assert.equal(previstaDeLaCuota({ prevista: false, previa }), false);
});

test("V1 · una seña que nunca fue firme vence el día que se confirma; sin confirmar es previsión", () => {
  const nuncaFirme = { venceEl: CREADO, venceManual: false, prevista: true };
  assert.equal(venceDeLaCuota({ clave: CLAVE, plan: CREADO, prevista: false, hoy: HOY, previa: nuncaFirme }).toISOString(), HOY.toISOString());
  assert.equal(previstaDeLaCuota({ prevista: true, previa: nuncaFirme }), true);
  assert.equal(previstaDeLaCuota({ prevista: true }), true);
  assert.equal(previstaDeLaCuota({ prevista: false }), false);
  // La fecha corregida a mano manda siempre.
  const manual = { venceEl: d("2026-12-01"), venceManual: true, prevista: false };
  assert.equal(venceDeLaCuota({ clave: CLAVE, plan: CREADO, prevista: true, hoy: HOY, previa: manual }).toISOString(), d("2026-12-01").toISOString());
});

test("P1 · con un cobro o un pago hecho no se vuelve antes de Confirmado; sin plata, sí; entre etapas confirmadas, sí", () => {
  assert.match(retrocesoConPlata({ desde: "APROBADO", hacia: "PROPUESTA", cobros: 1, pagos: 0 }) ?? "", /cobro/);
  assert.match(retrocesoConPlata({ desde: "PRODUCCION", hacia: "PEDIDO", cobros: 0, pagos: 2 }) ?? "", /pago/);
  assert.equal(retrocesoConPlata({ desde: "APROBADO", hacia: "PROPUESTA", cobros: 0, pagos: 0 }), null);
  assert.equal(retrocesoConPlata({ desde: "DESARME", hacia: "APROBADO", cobros: 3, pagos: 3 }), null);
  assert.equal(retrocesoConPlata({ desde: "PROPUESTA", hacia: "PEDIDO", cobros: 1, pagos: 0 }), null);
});

test("V3 · reabrir vuelve a la etapa guardada, se suelte en la columna que se suelte; sin perder, va a la elegida", () => {
  assert.deepEqual(destinoAlMover({ etapa: "PRODUCCION", perdido: true }, "PEDIDO"), { etapa: "PRODUCCION", reabre: true });
  assert.deepEqual(destinoAlMover({ etapa: "PROPUESTA", perdido: true }, "PROPUESTA"), { etapa: "PROPUESTA", reabre: true });
  assert.deepEqual(destinoAlMover({ etapa: "APROBADO", perdido: false }, "ARMADO"), { etapa: "ARMADO", reabre: false });
});

test("V2 · perdido con seña cobrada: no debe nada y lo cobrado sigue como cobrado (en pesos y en dólares)", () => {
  const c = cobranzaDePerdido(cobranza(1210, [{ monto: 605 }]));
  assert.equal(c.porCobrar, 0);
  assert.equal(c.saldo, 0);
  assert.equal(c.cobrado, 605);
  assert.equal(c.total, 605);
  const u = cobranzaDePerdido(cobranzaEnMoneda(121_000, [{ monto: 36_000 }], { moneda: "USD", cambioVenta: 1000, tcHoy: 1200 }));
  assert.equal(u.porCobrar, 0);
  assert.equal(u.saldo, 0);
  assert.equal(u.cobrado, 36_000);
  assert.equal(u.enMoneda?.saldo, 0);
  assert.equal(u.enMoneda?.total, u.enMoneda?.cobrado);
  // Sin nada cobrado: nada.
  assert.equal(cobranzaDePerdido(cobranza(1210, [])).total, 0);
});

const negocio = (modulosAsignados: string[]): NegocioApps => ({ role: "OWNER", contexto: null, modulosAsignados, perfil: "enterprise", esMostrador: false, carniceriaLista: false });

test("T · en un negocio con Proyectos, Cuentas a cobrar y a pagar generales llevan a Proyectos → Administración y no se ofrecen", () => {
  const mia = negocio(["proyectos", "cuentas-a-cobrar", "cuentas-a-pagar"]);
  assert.equal(cuentaQueViveEnProyectos(appPorId("cuentas-a-cobrar"), mia), "/admin/proyectos/administracion?tab=cobrar");
  assert.equal(cuentaQueViveEnProyectos(appPorId("cuentas-a-pagar"), mia), "/admin/proyectos/administracion?tab=pagar");
  assert.notEqual(motivoNoDisponible(appPorId("cuentas-a-cobrar"), mia), null);
  const ids = appsVisibles(mia).map((a) => a.id);
  assert.ok(!ids.includes("cuentas-a-cobrar") && !ids.includes("cuentas-a-pagar"), ids.join(","));
  // Un negocio sin Proyectos (CH y el resto) sigue igual.
  const otro = negocio(["cuentas-a-cobrar", "cuentas-a-pagar"]);
  assert.equal(cuentaQueViveEnProyectos(appPorId("cuentas-a-cobrar"), otro), null);
  assert.equal(motivoNoDisponible(appPorId("cuentas-a-cobrar"), otro), null);
  assert.ok(appsVisibles(otro).some((a) => a.id === "cuentas-a-cobrar"));
});
