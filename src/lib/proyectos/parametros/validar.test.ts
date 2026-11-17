// Parámetros del módulo (MIA T03, O45): catálogo completo del plan § 4.1, validación de tipo, rango y sumas, y
// «sin fila rige el valor del rubro». Puro: sin base.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ETAPAS } from "../core";
import { CATALOGO, CLAVES, GRUPOS, defDe, delGrupo, EMPRESA, type Valores } from "./catalogo";
import { huerfanosAlCambiar, idDeNombre, leerNumeroSimple, resolverParametros, textoDelValor, validarValor, valorDelFormulario, valoresDe, type LectorForm } from "./validar";

const rubro = valoresDe(resolverParametros([]));
const form = (campos: Record<string, string | string[]>): LectorForm => ({
  get: (k) => (Array.isArray(campos[k]) ? (campos[k] as string[])[0] : (campos[k] as string | undefined)) ?? null,
  getAll: (k) => (Array.isArray(campos[k]) ? (campos[k] as string[]) : campos[k] !== undefined ? [campos[k] as string] : []),
});
const fila = (clave: string, valor: unknown, provisional = false) => ({ clave, valor, provisional, actualizadoNombre: "Dirección", actualizadoEl: new Date("2026-11-17T12:00:00Z") });

test("el catálogo trae cada grupo del plan § 4.1 (vistas y permisos tienen su pantalla) y cada grupo tiene parámetros", () => {
  assert.deepEqual(GRUPOS.map((g) => g.id), ["etapas", "precio", "reparto", "equipo", "costos", "plan", "prevision", "iva", "moneda", "retenciones", "cierre", "calendario", "antiguedad", "sociedades", "cancelacion", "palabras"]);
  for (const g of GRUPOS) assert.ok(delGrupo(g.id).length > 0, g.id);
  assert.equal(new Set(CLAVES).size, CLAVES.length, "claves únicas");
  for (const p of CATALOGO) assert.ok(p.seNota && p.usa && p.fuente, `${p.clave}: dónde se nota, quién lo usa y de dónde sale`);
});

test("sin filas rige el valor del rubro, y cada valor del rubro pasa su propia validación", () => {
  const p = resolverParametros([]);
  for (const d of CATALOGO) {
    assert.equal(p[d.clave].origen, "RUBRO", d.clave);
    assert.equal(p[d.clave].provisional, d.provisional, d.clave);
    assert.equal(validarValor(d, d.rubro, rubro).ok, true, d.clave);
  }
  // Los del caso Z (plan § 2.1): 30, 10, 0, 10, 5, 7; reparto 75 / 25; tope 5 % bruto.
  assert.equal(rubro["precio.rentabilidad"].valor, 30);
  assert.deepEqual(Object.fromEntries(Object.entries(rubro["precio.comision"]).map(([k, r]) => [k, r.valor])), { COMERCIAL: 10, PRODUCTOR: 10, PRODUCTOR_CAMPO: 0 });
  assert.equal(rubro["precio.margenError"].valor, 5);
  assert.equal(rubro["precio.iibbGa"].valor, 7);
  assert.deepEqual(rubro["reparto.matriz"], { DEFENSA: { [EMPRESA]: 75, PRODUCTOR: 25 } });
  assert.equal(rubro["precio.redondeo.tope"], 5);
  // Los días del plan que hoy están fijos en gestion-core (176-178).
  assert.deepEqual([rubro["plan.anticipoProveedorDiasAntes"], rubro["plan.saldoProveedorDiasDespues"], rubro["plan.saldoClienteDiasAntes"]], [30, 12, 5]);
  // Las cuatro etapas agrupan los diez estados, en orden.
  assert.deepEqual(rubro["etapas.lista"].flatMap((e) => e.estados), [...ETAPAS]);
});

test("una fila válida rige con su marca de provisional; una inválida o de una clave desconocida no se lee", () => {
  const p = resolverParametros([fila("precio.redondeo.tope", 6, true), fila("cierre.dia", 40), fila("no.existe", 1)]);
  assert.equal(p["precio.redondeo.tope"].valor, 6);
  assert.equal(p["precio.redondeo.tope"].origen, "NEGOCIO");
  assert.equal(p["precio.redondeo.tope"].provisional, true);
  assert.equal(p["cierre.dia"].origen, "RUBRO", "40 no es un día de cierre: rige el rubro");
  assert.equal(Object.keys(p).length, CLAVES.length);
});

test("el servidor rechaza tipo, rango y sumas inválidos", () => {
  const no = (clave: keyof Valores, v: unknown) => assert.equal(validarValor(defDe(clave), v, rubro).ok, false, `${clave} ${JSON.stringify(v)}`);
  no("precio.redondeo.tope", 101);
  no("precio.redondeo.tope", -1);
  no("precio.redondeo.tope", 5.555);
  no("precio.redondeo.tope", "5");
  no("precio.rentabilidad", { valor: 30, min: 40, max: 20 });
  no("precio.rentabilidad", { valor: 50, min: 0, max: 40 });
  no("cierre.dia", 7.5);
  no("cierre.dia", 29);
  no("precio.modo", "OTRO");
  no("reparto.activo", "si");
  no("costos.sectores", ["A", "a"]);
  no("costos.sectores", []);
  no("moneda.habilitadas", []);
  no("antiguedad.tramos", [60, 30]);
  no("reparto.matriz", { DEFENSA: { [EMPRESA]: 75, PRODUCTOR: 24 } });
  no("reparto.matriz", { DEFENSA: { [EMPRESA]: 75, FANTASMA: 25 } });
  no("precio.comision", { NO_ES_FUNCION: { valor: 1, min: 0, max: 100 } });
  no("palabras.textos", { defensa: "", redondeo: "R", rendicion: "R", prevision: "P" });
  no("iva.porComprobante", { A: "CREDITO", B: "COSTO", C: "COSTO" });
  // Etapas: un estado afuera, uno repetido, o fuera de orden.
  const e = rubro["etapas.lista"];
  no("etapas.lista", [e[0], e[1], e[2]]);
  no("etapas.lista", [e[1], e[0], e[2], e[3]]);
  no("etapas.lista", [{ ...e[0], estados: ["PEDIDO", "DISENO"] }, ...e.slice(1)]);
  no("etapas.lista", e.map((x) => ({ ...x, compuerta: "TAL_VEZ" })));
  // La matriz que suma 100 con decimales pasa.
  assert.equal(validarValor(defDe("reparto.matriz"), { DEFENSA: { [EMPRESA]: 66.67, PRODUCTOR: 33.33 } }, rubro).ok, true);
});

test("el formulario: «7,5» con rango, las etapas por casillero y las funciones con una nueva", () => {
  assert.equal(leerNumeroSimple("7,5"), 7.5);
  assert.equal(leerNumeroSimple("1.000,5"), null);
  const r = valorDelFormulario(defDe("precio.iibbGa"), form({ valor: "7,5", min: "5", max: "10" }), rubro);
  assert.deepEqual(validarValor(defDe("precio.iibbGa"), r, rubro), { ok: true, valor: { valor: 7.5, min: 5, max: 10 } });

  // Cinco etapas: PEDIDO | DISENO-PROPUESTA | APROBADO-PRODUCCION | ARMADO-DESARME | CIERRE.
  const casillero: Record<string, string> = { PEDIDO: "0", DISENO: "1", RENDER: "1", PRESUPUESTO: "1", PROPUESTA: "1", APROBADO: "2", PRODUCCION: "2", ARMADO: "3", DESARME: "3", CIERRE: "4" };
  const campos: Record<string, string> = { nombre_0: "Idea", nombre_1: "Venta", nombre_2: "Preparación", nombre_3: "En el predio", nombre_4: "Cierre", compuerta_2: "FRENA" };
  for (const [estado, k] of Object.entries(casillero)) campos[`estado_${estado}`] = k;
  const etapas = validarValor(defDe("etapas.lista"), valorDelFormulario(defDe("etapas.lista"), form(campos), rubro), rubro);
  assert.equal(etapas.ok, true);
  if (etapas.ok) {
    const lista = etapas.valor as Valores["etapas.lista"];
    assert.deepEqual(lista.map((x) => x.nombre), ["Idea", "Venta", "Preparación", "En el predio", "Cierre"]);
    assert.deepEqual(lista.map((x) => x.id), ["IDEA", "VENTA", "PREPARACION", "EN_EL_PREDIO", "CIERRE"]);
    assert.equal(lista[2].compuerta, "FRENA");
  }
  // Un estado sin casillero no arma etapas.
  assert.equal(validarValor(defDe("etapas.lista"), valorDelFormulario(defDe("etapas.lista"), form({ ...campos, estado_CIERRE: "" }), rubro), rubro).ok, false);

  const funciones = valorDelFormulario(defDe("equipo.funciones"), form({ n: "3", id_0: "COMERCIAL", nombre_0: "Ventas", id_1: "PRODUCTOR", nombre_1: "Productor", id_2: "PRODUCTOR_CAMPO", nombre_2: "Campo", quitar_2: "on", nuevo: "Técnica" }), rubro);
  assert.deepEqual(funciones, [{ id: "COMERCIAL", nombre: "Ventas" }, { id: "PRODUCTOR", nombre: "Productor" }, { id: "TECNICA", nombre: "Técnica" }]);
  assert.equal(idDeNombre("Productor de campo"), "PRODUCTOR_DE_CAMPO");
});

test("no se puede sacar una función o un concepto que todavía tiene un %; una función nueva arranca en 0", () => {
  const sinProductor = rubro["equipo.funciones"].filter((f) => f.id !== "PRODUCTOR");
  assert.match(huerfanosAlCambiar("equipo.funciones", sinProductor, rubro) ?? "", /Productor/);
  // Sin comisión ni reparto, el productor de campo sí se puede sacar.
  assert.equal(huerfanosAlCambiar("equipo.funciones", rubro["equipo.funciones"].filter((f) => f.id !== "PRODUCTOR_CAMPO"), rubro), null);
  assert.match(huerfanosAlCambiar("reparto.conceptos", [], rubro) ?? "", /Defensa/);

  const conTecnica = resolverParametros([fila("equipo.funciones", [...rubro["equipo.funciones"], { id: "TECNICA", nombre: "Técnica" }])]);
  assert.deepEqual(conTecnica["precio.comision"].valor.TECNICA, { valor: 0, min: 0, max: 100 });
  assert.equal(conTecnica["precio.comision"].origen, "RUBRO");
});

test("el texto de cada valor para el historial y la lista de provisionales", () => {
  for (const d of CATALOGO) assert.ok(textoDelValor(d, d.rubro).length > 0, d.clave);
  assert.equal(textoDelValor(defDe("precio.iibbGa"), { valor: 7.5, min: 5, max: 10 }), "7,5 % (de 5 a 10)");
  assert.equal(textoDelValor(defDe("cierre.dia"), null), "Valor del rubro");
  // Con los nombres, nunca los ids: «Defensa: Empresa 75 %, Productor 25 %», sin DEFENSA, EMPRESA ni PRODUCTOR_CAMPO.
  assert.equal(textoDelValor(defDe("reparto.matriz"), rubro["reparto.matriz"], rubro), "Defensa: Empresa 75 %, Productor 25 %");
  for (const d of CATALOGO) assert.doesNotMatch(textoDelValor(d, d.rubro, rubro), /\b[A-Z]{2,}_[A-Z_]+\b|\bEMPRESA\b|\bDEFENSA\b/, d.clave);
  // Lo que se lee en pantalla no trae jerga del plan ni nombra al negocio.
  for (const d of CATALOGO) assert.doesNotMatch(`${d.seNota} ${d.fuente}`, /\bC-O\d|\bZ-|caso Z|\.ts\b|\bMIA\b|§|Decisión \d/, d.clave);
});

test("ningún parámetro nombra a un negocio: el catálogo es del rubro (plan § 4.3, atajo a buscar)", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const f of ["catalogo.ts", "validar.ts", "leer.server.ts"]) {
    const texto = await readFile(new URL(`./${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(texto.replace(/MIA T03|MIA-50|Diseño MIA|diseño MIA/g, ""), /\bmia\b|tenantId\s*===|slug\s*===/i, f);
  }
});
