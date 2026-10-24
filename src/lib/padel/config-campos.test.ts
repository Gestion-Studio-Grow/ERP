import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANTILLAS_DEFAULT } from "./core";
import { errorDeTramo, plantillasConCambio, validarCampoConfig, validarTramos } from "./config-campos";

const valor = (clave: unknown, v: unknown) => {
  const r = validarCampoConfig(clave, v);
  assert.ok(r.ok, `${String(clave)} debería pasar: ${r.ok ? "" : r.error}`);
  return r.v;
};
const error = (clave: unknown, v: unknown) => {
  const r = validarCampoConfig(clave, v);
  assert.equal(r.ok, false, `${String(clave)} = ${JSON.stringify(v)} no debería pasar`);
  return r.ok ? "" : r.error;
};

test("lista blanca: una clave que no es un ajuste nunca se guarda", () => {
  for (const k of ["tenantId", "id", "plantillas", "plantilla.", "plantilla.inventada", "__proto__", "updatedAt", "", 3, null, "x".repeat(50)]) {
    error(k, "1");
  }
});

test("precios: 25000, «$ 25.000» y vacío; nada negativo ni absurdo (M-077)", () => {
  assert.deepEqual(valor("precioIndividual", "25000"), { tipo: "campo", campo: "precioIndividual", valor: 25000 });
  assert.deepEqual(valor("precioIndividual", "$ 25.000"), { tipo: "campo", campo: "precioIndividual", valor: 25000 });
  assert.deepEqual(valor("precioGrupal", ""), { tipo: "campo", campo: "precioGrupal", valor: 0 });
  assert.deepEqual(valor("precioGrupal", 12000), { tipo: "campo", campo: "precioGrupal", valor: 12000 });
  error("precioIndividual", "-5");
  error("precioIndividual", "veinte");
  error("precioIndividual", 99_000_000);
});

test("reglas con topes: duración múltiplo de 15, anticipación hasta 2 días, días 1–60, pedidos 1–10", () => {
  assert.equal((valor("duracionMin", 90) as { valor: number }).valor, 90);
  error("duracionMin", 70);
  error("duracionMin", 300);
  assert.equal((valor("anticipacionMin", "0") as { valor: number }).valor, 0);
  assert.equal((valor("anticipacionMin", 1440) as { valor: number }).valor, 1440);
  error("anticipacionMin", 5000);
  error("anticipacionMin", 1.5);
  error("diasAdelante", 0);
  error("maxPendientesPorTel", 11);
});

test("cobro: alias limpio, vacío = sin alias, celular argentino", () => {
  assert.deepEqual(valor("aliasCbu", "  matias.padel\n"), { tipo: "campo", campo: "aliasCbu", valor: "matias.padel" });
  assert.deepEqual(valor("aliasCbu", ""), { tipo: "campo", campo: "aliasCbu", valor: null });
  assert.deepEqual(valor("whatsappProfe", "+54 9 11 5555-1234"), { tipo: "campo", campo: "whatsappProfe", valor: "1155551234" });
  assert.deepEqual(valor("whatsappProfe", ""), { tipo: "campo", campo: "whatsappProfe", valor: null });
  error("whatsappProfe", "123");
});

test("textos: editar uno, y vacío o igual al de fábrica = restaurar original (M-084)", () => {
  assert.deepEqual(valor("plantilla.confirmada", "Hola {nombre}!"), { tipo: "plantilla", clave: "confirmada", texto: "Hola {nombre}!" });
  assert.deepEqual(valor("plantilla.confirmada", ""), { tipo: "plantilla", clave: "confirmada", texto: null });
  assert.deepEqual(valor("plantilla.confirmada", PLANTILLAS_DEFAULT.confirmada), { tipo: "plantilla", clave: "confirmada", texto: null });
  error("plantilla.confirmada", "x".repeat(601));
});

test("plantillasConCambio: suma o borra una sola clave y tira lo desconocido", () => {
  const guardadas = { rechazada: "No puedo", inventada: "x", confirmada: "Vieja" };
  assert.deepEqual(plantillasConCambio(guardadas, "confirmada", "Nueva"), { rechazada: "No puedo", confirmada: "Nueva" });
  assert.deepEqual(plantillasConCambio(guardadas, "confirmada", null), { rechazada: "No puedo" });
  assert.deepEqual(plantillasConCambio(null, "pagoOk", "Gracias"), { pagoOk: "Gracias" });
});

test("tramos: «Termina antes de empezar» y «se pisa» (M-080)", () => {
  assert.equal(errorDeTramo({ desde: "16:00", hasta: "15:00" }), "Termina antes de empezar");
  assert.equal(errorDeTramo({ desde: "16:00", hasta: "16:00" }), "Termina antes de empezar");
  assert.equal(errorDeTramo({ desde: "08:00", hasta: "12:00" }), null);
  assert.match(errorDeTramo({ desde: "11:00", hasta: "13:00" }, [{ desde: "08:00", hasta: "12:00" }]) ?? "", /pisa/);
  // Uno que termina cuando el otro empieza no se pisa.
  assert.equal(errorDeTramo({ desde: "12:00", hasta: "13:00" }, [{ desde: "08:00", hasta: "12:00" }]), null);
});

test("horarios: la grilla entera en un guardado, ordenada; un tramo malo frena todo (M-079)", () => {
  const r = validarTramos([
    { diaSemana: 2, desde: "08:00", hasta: "12:00" },
    { diaSemana: 1, desde: "16:00", hasta: "21:00" },
    { diaSemana: 1, desde: "08:00", hasta: "12:00" },
  ]);
  assert.ok(r.ok);
  assert.deepEqual(r.tramos.map((t) => `${t.diaSemana} ${t.desde}`), ["1 08:00", "1 16:00", "2 08:00"]);
  const malo = validarTramos([{ diaSemana: 1, desde: "16:00", hasta: "15:00" }]);
  assert.equal(malo.ok, false);
  assert.match(malo.ok ? "" : malo.error, /Lunes 16:00–15:00: termina antes de empezar/);
  assert.equal(validarTramos("08:00-12:00").ok, false);
  assert.equal(validarTramos([{ diaSemana: 9, desde: "08:00", hasta: "12:00" }]).ok, false);
  assert.ok(validarTramos([]).ok, "sin horarios = no da clases (se puede)");
  const v = validarCampoConfig("horarios", [{ diaSemana: 1, desde: "08:00", hasta: "12:00" }]);
  assert.ok(v.ok && v.v.tipo === "horarios" && v.v.tramos.length === 1);
});
