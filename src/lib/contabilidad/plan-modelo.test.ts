import { test } from "node:test";
import assert from "node:assert/strict";
import { PLAN_MODELO_PROVISIONAL, RUBROS_CONTABLES, compararCodigos, planModelo } from "./plan-modelo";

test("el plan modelo está marcado provisional", () => {
  assert.equal(PLAN_MODELO_PROVISIONAL, true);
});

for (const rubro of RUBROS_CONTABLES) {
  test(`plan ${rubro}: árbol coherente`, () => {
    const plan = planModelo(rubro);
    const porCodigo = new Map(plan.map((c) => [c.codigo, c]));
    assert.equal(porCodigo.size, plan.length, "códigos únicos");
    assert.deepEqual(plan.filter((c) => c.padreCodigo === null).map((c) => c.codigo), ["1", "2", "3", "4", "5"]);
    const vistos = new Set<string>();
    for (const c of plan) {
      if (c.padreCodigo) {
        assert.ok(vistos.has(c.padreCodigo), `${c.codigo}: el padre va antes`);
        assert.ok(c.codigo.startsWith(`${c.padreCodigo}.`), `${c.codigo}: código hijo del padre`);
        assert.equal(porCodigo.get(c.padreCodigo)!.tipo, c.tipo, `${c.codigo}: mismo tipo que el padre`);
      }
      vistos.add(c.codigo);
      const tieneHijas = plan.some((h) => h.padreCodigo === c.codigo);
      assert.equal(c.imputable, !tieneHijas, `${c.codigo}: imputable sii es hoja`);
    }
    const nombres = plan.filter((c) => c.imputable).map((c) => c.nombre);
    for (const n of ["Caja", "Deudores por ventas", "IVA crédito fiscal", "IVA débito fiscal", "Percepciones IIBB sufridas", "Proveedores", "Capital", "Resultados no asignados"]) {
      assert.ok(nombres.includes(n), `${rubro} trae ${n}`);
    }
  });
}

test("rubros: comercio tiene CMV y mercaderías; servicios no tiene bienes de cambio; club cuotas; agencia pauta", () => {
  const nombres = (r: Parameters<typeof planModelo>[0]) => planModelo(r).map((c) => c.nombre);
  assert.ok(nombres("comercio").includes("Costo de mercaderías vendidas (CMV)"));
  assert.ok(nombres("comercio").includes("Mercaderías"));
  // Servicios (estética) sí tiene bienes de cambio desde la ola 2: los insumos; no tiene mercaderías.
  assert.ok(!nombres("servicios").includes("Mercaderías"));
  assert.ok(nombres("servicios").includes("Insumos"));
  assert.ok(!nombres("agencia").includes("Bienes de cambio"));
  assert.ok(nombres("club").includes("Cuotas sociales"));
  assert.ok(nombres("agencia").includes("Costo de pauta de terceros"));
});

test("naturaleza: regularizadoras al revés de su rubro", () => {
  const plan = planModelo("comercio");
  const de = (nombre: string) => plan.find((c) => c.nombre === nombre)!;
  assert.equal(de("Caja").naturaleza, "DEUDORA");
  assert.equal(de("Proveedores").naturaleza, "ACREEDORA");
  assert.equal(de("Ventas").naturaleza, "ACREEDORA");
  assert.equal(de("Amortizaciones acumuladas de bienes de uso").naturaleza, "ACREEDORA");
  assert.equal(de("Previsión para deudores incobrables").naturaleza, "ACREEDORA");
  assert.equal(de("Capital").tipo, "PATRIMONIO_NETO");
});

test("compararCodigos ordena por segmentos numéricos", () => {
  assert.deepEqual(["1.10", "1.2", "1", "1.1.01", "2"].sort(compararCodigos), ["1", "1.1.01", "1.2", "1.10", "2"]);
});
