import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CATALOGO_FLAGS,
  FLAGS_FACTURACION,
  decidirFlag,
  encendidosDe,
  flagActivo,
  leerConfigFlags,
  resumirFlags,
  type FlagFacturacion,
} from "./facturacion";

const ON = { ARCA_INVOICING_ENABLED: "true" };

test("default: sin variable, todo flag está APAGADO para cualquier negocio", () => {
  for (const f of FLAGS_FACTURACION) {
    assert.equal(flagActivo(f, "chestetica", {}), false, f);
    assert.equal(flagActivo(f, "chestetica", { ARCA_INVOICING_ENABLED: "true", ARCA_MODO: "real" }), false, f);
  }
});

test("prender por negocio: sólo el negocio nombrado lo tiene", () => {
  const env = { ...ON, FACTURACION_FLAGS: "facturacion.automatica=chestetica,magra" };
  assert.equal(flagActivo("facturacion.automatica", "chestetica", env), true);
  assert.equal(flagActivo("facturacion.automatica", "magra", env), true);
  assert.equal(flagActivo("facturacion.automatica", "breakpoint", env), false);
});

test("doble llave: con la facturación global apagada, un negocio prendido NO factura", () => {
  const env = { FACTURACION_FLAGS: "facturacion.automatica=chestetica" };
  assert.deepEqual(decidirFlag("facturacion.automatica", new Set(["facturacion.automatica"]), env), {
    activo: false,
    motivo: "facturacion-global-apagada",
  });
  // "1" o "on" no cuentan: el criterio es exactamente el de isInvoicingEnabled() (sólo "true").
  assert.equal(flagActivo("facturacion.automatica", "chestetica", { ...env, ARCA_INVOICING_ENABLED: "1" }), false);
});

test("arca.produccion exige además ARCA_MODO=real", () => {
  const encendidos = new Set<FlagFacturacion>(["arca.produccion"]);
  assert.equal(decidirFlag("arca.produccion", encendidos, { ...ON, ARCA_MODO: "homologacion" }).activo, false);
  assert.deepEqual(decidirFlag("arca.produccion", encendidos, { ...ON }), {
    activo: false,
    motivo: "arca-no-esta-en-real",
  });
  assert.equal(decidirFlag("arca.produccion", encendidos, { ...ON, ARCA_MODO: "real" }).activo, true);
});

test("lote mensual necesita la facturación automática del mismo negocio", () => {
  const solo = new Set<FlagFacturacion>(["facturacion.lote-mensual"]);
  assert.deepEqual(decidirFlag("facturacion.lote-mensual", solo, ON), {
    activo: false,
    motivo: "falta-requisito",
    detalle: "facturacion.automatica",
  });
  const ambos = new Set<FlagFacturacion>(["facturacion.lote-mensual", "facturacion.automatica"]);
  assert.equal(decidirFlag("facturacion.lote-mensual", ambos, ON).activo, true);
});

test("facturita.pwa no depende de ARCA", () => {
  assert.equal(flagActivo("facturita.pwa", "facturita", { FACTURACION_FLAGS: "facturita.pwa=facturita" }), true);
});

test("sin comodín: '*' no prende a nadie y se informa", () => {
  const env = { ...ON, FACTURACION_FLAGS: "facturacion.automatica=*;facturita.pwa=fact*" };
  const cfg = leerConfigFlags(env);
  assert.equal(cfg.porNegocio.size, 0);
  assert.deepEqual(
    cfg.errores.map((e) => e.motivo),
    ["comodin-prohibido", "comodin-prohibido"],
  );
  assert.equal(flagActivo("facturacion.automatica", "chestetica", env), false);
});

test("lo que no se entiende queda apagado y se cuenta, sin romper lo demás", () => {
  const env = {
    FACTURACION_FLAGS: " facturita.pwa = Facturita ,  ; inventado=ch ; arca.produccion= ; sinigual ; facturita.pwa=Mal Slug\n",
  };
  const cfg = leerConfigFlags(env);
  assert.deepEqual([...encendidosDe(cfg, "facturita")], ["facturita.pwa"]);
  assert.deepEqual(
    cfg.errores.map((e) => e.motivo).sort(),
    ["flag-desconocido", "formato", "sin-negocios", "slug-invalido"],
  );
});

test("el slug se compara sin mayúsculas ni espacios", () => {
  const env = { FACTURACION_FLAGS: "facturita.pwa=facturita" };
  assert.equal(flagActivo("facturita.pwa", " Facturita ", env), true);
});

test("resumen para health: cuenta negocios por flag y errores, sin nombrar a nadie", () => {
  const env = {
    FACTURACION_FLAGS: "facturacion.automatica=a,b;facturita.pwa=b;arca.produccion=*",
  };
  const r = resumirFlags(env);
  assert.deepEqual(r.negociosPorFlag, {
    "facturacion.automatica": 2,
    "facturacion.lote-mensual": 0,
    "facturita.pwa": 1,
    "arca.produccion": 0,
  });
  assert.equal(r.erroresDeConfig, 1);
  assert.ok(!JSON.stringify(r).includes('"a"'));
});

test("el catálogo es consistente: cada requisito existe y no hay ciclos", () => {
  for (const f of FLAGS_FACTURACION) {
    const def = CATALOGO_FLAGS[f];
    assert.equal(def.id, f);
    for (const r of def.requiere) assert.ok(FLAGS_FACTURACION.includes(r), `${f} requiere ${r}`);
    // Con todo encendido y las llaves globales arriba, todo flag resuelve (no hay ciclo que lo trabe).
    const todos = new Set<FlagFacturacion>(FLAGS_FACTURACION);
    assert.equal(decidirFlag(f, todos, { ...ON, ARCA_MODO: "real" }).activo, true, f);
  }
});
