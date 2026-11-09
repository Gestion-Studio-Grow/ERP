// Invariantes del plan modelo ampliado (ola 2 = T0 de Control de gestión, GSG-CTRL-001):
// atributos de gestión coherentes por cuenta, códigos de la ola 1 estables, 5.2 separado.

import { test } from "node:test";
import assert from "node:assert/strict";
import { FUNCIONES, PLAZOS, RITMOS, RUBROS_CONTABLES, RUBROS_ESTADO, planModelo } from "./plan-modelo";

/** El plan de la ola 1 tal como se publicó (código → nombre): un código publicado no cambia de significado. */
const OLA1: Record<string, string> = {
  "1.1.1.01": "Caja", "1.1.1.02": "Banco cuenta corriente", "1.1.1.03": "Mercado Pago y billeteras",
  "1.1.2.01": "Deudores por ventas", "1.1.2.02": "Tarjetas a cobrar", "1.1.2.03": "Previsión para deudores incobrables",
  "1.1.3.01": "IVA crédito fiscal", "1.1.3.02": "Percepciones IIBB sufridas", "1.1.3.03": "Retenciones IIBB sufridas",
  "1.1.3.04": "Percepciones y retenciones IVA sufridas", "1.2.1.01": "Muebles y útiles", "1.2.1.02": "Equipos de computación",
  "1.2.1.03": "Amortizaciones acumuladas de bienes de uso", "2.1.1.01": "Proveedores", "2.1.2.01": "IVA débito fiscal",
  "2.1.2.02": "IVA a pagar", "2.1.2.03": "IIBB a pagar", "2.1.2.04": "Ganancias a pagar", "2.1.3.01": "Sueldos a pagar",
  "2.1.3.02": "Cargas sociales a pagar", "3.1.01": "Capital", "3.2.01": "Resultados no asignados", "3.2.02": "Resultado del ejercicio",
  "4.2.01": "Intereses ganados", "4.2.02": "Otros ingresos", "5.2.01": "Sueldos y cargas sociales", "5.2.02": "Alquileres",
  "5.2.03": "Servicios (luz, gas, internet)", "5.2.04": "Honorarios profesionales", "5.2.06": "Gastos varios",
  "5.3.01": "Gastos bancarios y comisiones", "5.3.02": "Impuesto sobre los ingresos brutos", "5.3.03": "Impuesto a los débitos y créditos bancarios",
};

for (const rubro of RUBROS_CONTABLES) {
  test(`ola 2 · ${rubro}: atributos de gestión coherentes en cada cuenta`, () => {
    const plan = planModelo(rubro);
    for (const c of plan) {
      const raiz = c.codigo.split(".")[0];
      const resultado = raiz === "4" || raiz === "5";
      if (!c.imputable) {
        assert.equal(c.monetaria, null, `${c.codigo}: un agrupador no dice monetaria`);
        assert.equal(c.ritmo, null, `${c.codigo}: un agrupador no tiene ritmo`);
        continue;
      }
      assert.ok(c.rubro && (RUBROS_ESTADO as readonly string[]).includes(c.rubro), `${c.codigo}: rubro RT 54 válido`);
      assert.equal(typeof c.monetaria, "boolean", `${c.codigo}: monetaria definida`);
      if (raiz === "1" || raiz === "2") assert.ok(c.plazo && (PLAZOS as readonly string[]).includes(c.plazo), `${c.codigo}: plazo`);
      else assert.equal(c.plazo, null, `${c.codigo}: PN y resultados sin plazo`);
      if (c.tipo === "RESULTADO_NEGATIVO" && c.rubro !== "IMPUESTO_A_LAS_GANANCIAS") {
        assert.ok(c.funcion && (FUNCIONES as readonly string[]).includes(c.funcion), `${c.codigo}: egreso con función`);
      } else {
        assert.equal(c.funcion, null, `${c.codigo}: sólo los egresos operativos llevan función`);
      }
      if (resultado) {
        assert.ok(c.ritmo && (RITMOS as readonly string[]).includes(c.ritmo), `${c.codigo}: ritmo`);
        assert.ok(c.nombreDueno && c.nombreDueno.trim().length > 0, `${c.codigo}: nombre para el dueño`);
        assert.ok(!/debe|haber|imputable/i.test(c.nombreDueno!), `${c.codigo}: sin jerga en el nombre del dueño`);
      } else {
        assert.equal(c.ritmo, null);
        assert.equal(c.nombreDueno, null);
      }
      // Plazo y rama coinciden: 1.2 / 2.2 no corriente.
      if (/^[12]\.2\./.test(c.codigo)) assert.equal(c.plazo, "NO_CORRIENTE", c.codigo);
      if (/^[12]\.1\./.test(c.codigo)) assert.equal(c.plazo, "CORRIENTE", c.codigo);
    }
  });

  test(`ola 2 · ${rubro}: monetarias y no monetarias para el ajuste por inflación`, () => {
    const de = new Map(planModelo(rubro).map((c) => [c.codigo, c]));
    for (const codigo of ["1.1.1.01", "1.1.2.01", "1.1.3.01", "2.1.1.01", "2.1.2.01", "2.1.5.01"]) assert.equal(de.get(codigo)!.monetaria, true, codigo);
    for (const codigo of ["1.2.1.01", "1.2.1.03", "2.1.4.01", "2.1.4.02", "3.1.01", "3.2.01", "4.1.01", "5.2.02"]) assert.equal(de.get(codigo)!.monetaria, false, codigo);
    for (const c of de.values()) {
      if (c.imputable && (c.rubro === "BIENES_DE_USO" || c.rubro === "BIENES_DE_CAMBIO")) assert.equal(c.monetaria, false, c.codigo);
    }
  });

  test(`ola 2 · ${rubro}: los códigos de la ola 1 no cambian de significado`, () => {
    const de = new Map(planModelo(rubro).map((c) => [c.codigo, c]));
    for (const [codigo, nombre] of Object.entries(OLA1)) assert.equal(de.get(codigo)?.nombre, nombre, codigo);
    assert.equal(de.has("5.2.05"), false, "5.2.05 queda vacante (Publicidad pasó a 5.4.01)");
  });
}

test("ola 2: 5.2 separado en administración (5.2) y comercialización (5.4)", () => {
  const de = new Map(planModelo("comercio").map((c) => [c.codigo, c]));
  assert.equal(de.get("5.2")!.nombre, "Gastos de administración");
  assert.equal(de.get("5.4")!.nombre, "Gastos de comercialización");
  assert.equal(de.get("5.4.01")!.nombre, "Publicidad y promoción");
  assert.equal(de.get("5.4.01")!.funcion, "COMERCIALIZACION");
  assert.equal(de.get("5.2.02")!.funcion, "ADMINISTRACION");
  assert.equal(de.get("5.2.02")!.ritmo, "FIJO_MENSUAL");
  assert.equal(de.get("5.3.02")!.funcion, "COMERCIALIZACION", "IIBB grava la venta");
  assert.equal(de.get("5.3.05")!.funcion, "FINANCIACION", "la comisión de cobro es financiera, fuera del margen");
});

test("ola 2: cuentas faltantes que pidió el contador", () => {
  const nombres = (r: (typeof RUBROS_CONTABLES)[number]) => new Set(planModelo(r).map((c) => c.nombre));
  for (const r of RUBROS_CONTABLES) {
    const n = nombres(r);
    for (const cuenta of [
      "Mercado Pago a liquidar", "Retenciones de Ganancias sufridas", "Impuesto a los débitos y créditos a cuenta",
      "Provisión SAC y cargas sociales", "Provisión vacaciones y cargas sociales", "Anticipos de clientes (señas)",
      "Vouchers y gift cards a canjear", "Vouchers vencidos no canjeados", "Ajuste de capital",
      "Ajustes de resultados de ejercicios anteriores", "Resultado por exposición a la inflación (RECPAM)",
      "Comisiones de Mercado Pago y tarjetas", "Amortizaciones de bienes de uso", "Cuenta particular del dueño",
      "Préstamos bancarios (porción no corriente)",
    ]) assert.ok(n.has(cuenta), `${r} trae ${cuenta}`);
  }
  assert.ok(nombres("servicios").has("Aparatología y equipamiento profesional"));
  assert.ok(nombres("agencia").has("Fondos de clientes para pauta"));
});
