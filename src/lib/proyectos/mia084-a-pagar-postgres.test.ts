// ============================================================================
// N8b (MIA-084): Rentabilidad «Por pagar a proveedores» y Administración «A pagar» no son el mismo número, y la diferencia
// tiene que verse con nombre. El UAT de MIA-083 encontró 580.000 de diferencia: el «Flete y armado» de un evento, un gasto
// cargado sin pagar y sin cuota. Rentabilidad lo suma (gastos sin pagar + cuotas de pago de los eventos); «A pagar» no,
// porque eran sólo cuotas (de los eventos y de la empresa). La decisión del dueño (18/11/2026, MIA-094): forma sumada.
// «A pagar» suma también los gastos sin pagar, y un renglón de Administración dice cuántos incluye y lleva a Proveedores.
//
// Con semilla fija, contra Postgres real y con los lectores reales de las dos pantallas, al centavo:
//   Σ Rentabilidad.porPagar = «A pagar» − cuotas de la empresa por pagar.
//
//   · P1 (presupuesto aprobado: va por la cobranza): cuota de pago 2.500.000,50 por pagar; otra pagada; una prevista sin
//     marcar (no es plata en ninguna pantalla). Gasto «Flete y armado» 580.000 sin IVA, sin pagar, con proveedor.
//   · P2 (sin presupuesto: sus cuotas van sueltas): cuota de pago 3.333.333,33. Gasto 100.000,10 + IVA 21.000,02 sin
//     pagar; uno pagado y uno anulado (ninguno de los dos debe).
//   · Empresa: «Licencias» US$ 6.800 a 1.350 = 9.180.000 por pagar; otra cuota de la empresa ya pagada.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

const DIA = 86_400_000;
const AHORA = Date.parse("2026-11-17T15:00:00Z");

test("N8b · «A pagar», «Por pagar a proveedores» y los gastos sin pagar cierran al centavo (forma sumada)", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "8", DB_CONNECT_TIMEOUT_MS: "5000" });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;

  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  await duenio.proyectoTipoCambio.create({ data: { tenantId: a.id, moneda: "USD", porUnidad: 1350 } });
  const flete = await duenio.supplier.create({ data: { tenantId: a.id, name: "Fletes del Sur" }, select: { id: true } });

  const proyecto = async (numero: number, aprobado: boolean) => {
    const p = await duenio.proyecto.create({ data: { tenantId: a.id, numero, clientId: a.clientes[0], nombre: `Evento ${numero}`, servicio: "ARQUITECTURA", etapa: aprobado ? "APROBADO" : "CONSULTA", moneda: "ARS" }, select: { id: true } });
    if (aprobado) {
      const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `tok-${p.id}`, ivaPct: 21 } });
      await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 10_000_000 } });
    }
    return p.id;
  };
  const pago = (proyectoId: string | null, concepto: string, monto: number, moneda: string, dias: number, extra: Record<string, unknown> = {}) =>
    duenio.proyectoCuota.create({ data: { tenantId: a.id, proyectoId, tipo: "PAGO", concepto, monto, moneda, venceEl: new Date(AHORA + dias * DIA), auto: false, ...extra } });
  const gasto = (proyectoId: string, descripcion: string, neto: number, iva: number, extra: Record<string, unknown> = {}) =>
    duenio.proyectoGasto.create({ data: { tenantId: a.id, proyectoId, descripcion, neto, iva, fecha: new Date(AHORA - 3 * DIA), ...extra } });

  const p1 = await proyecto(801, true);
  const p2 = await proyecto(802, false);
  await pago(p1, "Carpintería", 2_500_000.5, "ARS", 10);
  await pago(p1, "Seña carpintería", 1_000_000, "ARS", -20, { pagadoEl: new Date(AHORA - 19 * DIA), medio: "TRANSFERENCIA" });
  await pago(p1, "Iluminación (prevista)", 700_000, "ARS", 15, { prevista: true });
  await pago(p2, "Imprenta", 3_333_333.33, "ARS", 5);
  await gasto(p1, "Flete y armado", 580_000, 0, { supplierId: flete.id });
  await gasto(p2, "Catering montaje", 100_000.1, 21_000.02);
  await gasto(p2, "Ploteo", 50_000, 10_500, { pagadoEl: new Date(AHORA - DIA), medio: "EFECTIVO" });
  await gasto(p2, "Alquiler anulado", 999_999, 0, { anuladoEl: new Date(AHORA - DIA), anuladoPor: "test" });
  await pago(null, "Licencias", 6_800, "USD", 12);
  await pago(null, "Contador", 400_000, "ARS", -5, { pagadoEl: new Date(AHORA - 4 * DIA), medio: "TRANSFERENCIA" });
  // Lo de otro negocio no entra en ninguna pantalla de A.
  const deB = await duenio.proyecto.create({ data: { tenantId: b.id, numero: 801, clientId: b.clientes[0], nombre: "Evento de B", servicio: "ARQUITECTURA", etapa: "CONSULTA", moneda: "ARS" }, select: { id: true } });
  await duenio.proyectoGasto.create({ data: { tenantId: b.id, proyectoId: deB.id, descripcion: "Gasto de B", neto: 123_456, iva: 0 } });

  const { reporteProyectos } = await import("./datos.server");
  const { recuadrosDeCuotas } = await import("./empresa.server");
  const { redondear } = await import("./core");

  const r = await ejecutarAccion({ negocio: a, usuario: { id: a.duenia.id } }, async () => {
    const filas = await reporteProyectos();
    const admin = await recuadrosDeCuotas(a.id);
    return {
      // Lo que suma la pantalla de Rentabilidad (reportes/page.tsx: Σ real.porPagar).
      porPagarRentabilidad: redondear(filas.reduce((s, f) => s + f.real.porPagar, 0)),
      aPagar: admin.resumen.aPagar,
      gastosSinPagar: admin.gastosSinPagar.map((g) => g.total),
      resumenGastos: admin.gastosSinPagarResumen,
    };
  });
  assert.equal(r.tipo, "respuesta", JSON.stringify(r));
  const { porPagarRentabilidad, aPagar, gastosSinPagar, resumenGastos } = (r as { valor: { porPagarRentabilidad: number; aPagar: number; gastosSinPagar: number[]; resumenGastos: { total: number; cantidad: number } } }).valor;

  const cuotasDeEventos = 2_500_000.5 + 3_333_333.33;
  const cuotasDeLaEmpresa = 6_800 * 1350;
  const deGastos = 701_000.12;
  assert.equal(aPagar, redondear(cuotasDeEventos + cuotasDeLaEmpresa + deGastos), "«A pagar» = las cuotas por pagar (de los eventos y de la empresa) más los gastos sin pagar: 15.714.333,95");
  assert.deepEqual(resumenGastos, { total: deGastos, cantidad: 2 }, "el renglón «incluye 2 gastos»: el flete (580.000) y el catering con IVA (121.000,12); ni el pagado, ni el anulado, ni el de B");
  assert.deepEqual([...gastosSinPagar].sort((x, y) => x - y), [121_000.12, 580_000], "la lista de la pestaña A pagar tiene los mismos dos y suma lo mismo");
  assert.equal(porPagarRentabilidad, 6_534_333.95, "Rentabilidad: las cuotas de los eventos más los gastos sin pagar");
  assert.equal(redondear(aPagar - cuotasDeLaEmpresa), porPagarRentabilidad, "la relación entre las dos pantallas, al centavo: sólo las cuotas de la empresa, que no son de ningún evento");
});
