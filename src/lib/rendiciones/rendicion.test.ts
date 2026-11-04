// Reducer y cuadratura de la rendición (recorte MIA de origin/frente/rendiciones). node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicarAccion, calcularCuadratura } from "./rendicion";
import type { AccionRendicion, ContextoTransicion, Rendicion, RolActor } from "./tipos";

const FECHA = "2026-11-04";

function rendicion(p: Partial<Rendicion> = {}): Rendicion {
  return {
    id: "R1",
    gastoId: "G1",
    rindeId: "com",
    medio: "PROPIO",
    montoCentavos: 1250000,
    estado: "borrador",
    eventos: [],
    ...p,
  };
}

const ctx = (actorId: string, rolActor: RolActor, comentario?: string): ContextoTransicion => ({
  fecha: FECHA,
  actorId,
  rolActor,
  ...(comentario ? { comentario } : {}),
});

function hacer(r: Rendicion, accion: AccionRendicion, c: ContextoTransicion): Rendicion {
  const res = aplicarAccion(r, accion, c);
  assert.ok(res.ok, res.ok ? "" : res.motivo);
  return res.rendicion;
}

test("camino feliz: borrador → enviada → aprobada → reintegrada, con la bitácora que sólo crece", () => {
  const r0 = Object.freeze(rendicion());
  const r1 = hacer(r0, "enviar", ctx("com", "COMERCIAL"));
  const r2 = hacer(r1, "aprobar", ctx("adm", "ADMINISTRACION"));
  const r3 = hacer(r2, "reintegrar", ctx("dir", "DIRECCION"));
  assert.equal(r0.estado, "borrador", "no muta");
  assert.deepEqual([r1.estado, r2.estado, r3.estado], ["enviada", "aprobada", "reintegrada"]);
  assert.deepEqual(r3.eventos.map((e) => [e.accion, e.actorId]), [["enviar", "com"], ["aprobar", "adm"], ["reintegrar", "dir"]]);
});

test("doble aprobar: el segundo se rechaza por estado", () => {
  const enviada = rendicion({ estado: "enviada" });
  const aprobada = hacer(enviada, "aprobar", ctx("dir", "DIRECCION"));
  const otra = aplicarAccion(aprobada, "aprobar", ctx("adm", "ADMINISTRACION"));
  assert.deepEqual(otra, { ok: false, motivo: "No se puede aprobar una rendición aprobada" });
});

test("acciones inválidas para el estado son error", () => {
  const casos: [Rendicion["estado"], AccionRendicion][] = [
    ["borrador", "aprobar"],
    ["borrador", "reintegrar"],
    ["enviada", "enviar"],
    ["enviada", "reintegrar"],
    ["rechazada", "enviar"],
    ["rechazada", "aprobar"],
    ["reintegrada", "reintegrar"],
    ["aprobada", "devolver"],
  ];
  for (const [estado, accion] of casos) {
    const res = aplicarAccion(rendicion({ estado }), accion, ctx("dir", "DIRECCION", "x"));
    assert.equal(res.ok, false, `${accion} desde ${estado}`);
  }
});

test("nadie aprueba, devuelve, rechaza ni se reintegra lo propio; Comercial no aprueba", () => {
  const mia = rendicion({ rindeId: "dir", estado: "enviada" });
  for (const accion of ["aprobar", "devolver", "rechazar"] as const) {
    const res = aplicarAccion(mia, accion, ctx("dir", "DIRECCION", "motivo"));
    assert.deepEqual(res, { ok: false, motivo: "Nadie aprueba lo propio: esta rendición es tuya" });
  }
  const aprobada = rendicion({ rindeId: "adm", estado: "aprobada" });
  assert.equal(aplicarAccion(aprobada, "reintegrar", ctx("adm", "ADMINISTRACION")).ok, false);
  const ajena = rendicion({ estado: "enviada" });
  assert.equal(aplicarAccion(ajena, "aprobar", ctx("prod", "PRODUCCION")).ok, false);
  assert.equal(aplicarAccion(ajena, "aprobar", ctx("com2", "COMERCIAL")).ok, false);
});

test("enviar: sólo quien rinde, con importe entero positivo y anticipo si lo usó", () => {
  assert.equal(aplicarAccion(rendicion(), "enviar", ctx("otro", "DIRECCION")).ok, false);
  assert.equal(aplicarAccion(rendicion({ montoCentavos: 0 }), "enviar", ctx("com", "COMERCIAL")).ok, false);
  assert.equal(aplicarAccion(rendicion({ montoCentavos: 10.5 }), "enviar", ctx("com", "COMERCIAL")).ok, false);
  assert.equal(aplicarAccion(rendicion({ medio: "ANTICIPO" }), "enviar", ctx("com", "COMERCIAL")).ok, false);
  const devuelta = rendicion({ estado: "devuelta" });
  assert.equal(hacer(devuelta, "enviar", ctx("com", "COMERCIAL")).estado, "enviada");
});

test("devolver y rechazar exigen comentario y lo guardan en la bitácora", () => {
  const enviada = rendicion({ estado: "enviada" });
  assert.equal(aplicarAccion(enviada, "devolver", ctx("adm", "ADMINISTRACION")).ok, false);
  assert.equal(aplicarAccion(enviada, "rechazar", ctx("adm", "ADMINISTRACION", "   ")).ok, false);
  const d = hacer(enviada, "devolver", ctx("adm", "ADMINISTRACION", " falta el ticket "));
  assert.equal(d.estado, "devuelta");
  assert.equal(d.eventos[0].comentario, "falta el ticket");
  assert.equal(hacer(enviada, "rechazar", ctx("dir", "DIRECCION", "no es del evento")).estado, "rechazada");
});

test("reintegrar: lo pagado con anticipo no se reintegra; sólo Dirección o Administración", () => {
  const conAnticipo = rendicion({ estado: "aprobada", medio: "ANTICIPO", anticipoId: "A1" });
  assert.equal(aplicarAccion(conAnticipo, "reintegrar", ctx("adm", "ADMINISTRACION")).ok, false);
  assert.equal(aplicarAccion(rendicion({ estado: "aprobada" }), "reintegrar", ctx("prod", "PRODUCCION")).ok, false);
});

test("cuadratura: sobrante a devolver, faltante a reintegrar, rechazadas no cuentan", () => {
  const anticipo = { id: "A1", montoCentavos: 10000000, devueltoCentavos: 0 };
  const g = (monto: number, p: Partial<Rendicion> = {}) =>
    rendicion({ medio: "ANTICIPO", anticipoId: "A1", montoCentavos: monto, estado: "aprobada", ...p });

  const sobra = calcularCuadratura(anticipo, [g(6000000), g(9999999, { estado: "rechazada" }), g(1, { anticipoId: "A2" })], 2);
  assert.equal(sobra.rendido, 6000000);
  assert.equal(sobra.aDevolver, 4000000);
  assert.equal(sobra.aReintegrar, 0);
  assert.equal(sobra.mensaje, "Recibiste $100.000 y rendiste $60.000. Te quedan $40.000 para devolver.");

  const falta = calcularCuadratura(anticipo, [g(12000000), rendicion({ montoCentavos: 50000, estado: "aprobada" })], 2);
  assert.equal(falta.aReintegrar, 2000000 + 50000);
  assert.equal(falta.aDevolver, 0);

  const justo = calcularCuadratura({ ...anticipo, devueltoCentavos: 1000000 }, [g(8999999)], 2);
  assert.equal(justo.cuadra, true);
  assert.equal(justo.aDevolver, 0);

  const sin = calcularCuadratura(null, [rendicion({ montoCentavos: 300000, estado: "aprobada" })], 2);
  assert.equal(sin.mensaje, "No hay anticipo: te reintegramos $3.000 que pagaste de tu bolsillo.");
});

// Regresión de la certificación de la tanda 1 (ADV1..ADV4).
test("cuadratura: lo ya reintegrado (propio o faltante) no se vuelve a sumar en aReintegrar", () => {
  const reintegrada = rendicion({ estado: "reintegrada", montoCentavos: 1000 });
  assert.equal(calcularCuadratura(null, [reintegrada], 0).aReintegrar, 0);
  const anticipo = { id: "A1", montoCentavos: 10000, devueltoCentavos: 0 };
  const gasto = rendicion({ medio: "ANTICIPO", anticipoId: "A1", montoCentavos: 12000, estado: "aprobada" });
  assert.equal(calcularCuadratura(anticipo, [gasto], 0).aReintegrar, 2000);
  const pagado = calcularCuadratura({ ...anticipo, reintegradoCentavos: 2000 }, [gasto], 0);
  assert.equal(pagado.aReintegrar, 0);
  assert.equal(pagado.cuadra, true);
});

test("cuadratura: contra el anticipo cuentan sólo aprobadas y reintegradas", () => {
  const anticipo = { id: "A1", montoCentavos: 5000, devueltoCentavos: 0 };
  for (const estado of ["borrador", "enviada", "devuelta", "rechazada"] as const) {
    const c = calcularCuadratura(anticipo, [rendicion({ medio: "ANTICIPO", anticipoId: "A1", montoCentavos: 5000, estado })], 0);
    assert.equal(c.rendido, 0, estado);
    assert.equal(c.cuadra, false, estado);
    assert.equal(c.pendiente, estado === "rechazada" ? 0 : 5000, estado);
  }
  const propiaSinAprobar = calcularCuadratura(null, [rendicion({ estado: "enviada", montoCentavos: 700 })], 0);
  assert.equal(propiaSinAprobar.aReintegrar, 0);
});

test("motor: no aprueba un importe no entero ni reintegra uno negativo", () => {
  assert.equal(aplicarAccion(rendicion({ estado: "enviada", montoCentavos: 10.5 }), "aprobar", ctx("adm", "ADMINISTRACION")).ok, false);
  assert.equal(aplicarAccion(rendicion({ estado: "aprobada", montoCentavos: -500 }), "reintegrar", ctx("adm", "ADMINISTRACION")).ok, false);
  assert.equal(aplicarAccion(rendicion({ estado: "enviada", montoCentavos: 10.5 }), "rechazar", ctx("adm", "ADMINISTRACION", "mal")).ok, true, "rechazar sigue pudiendo");
});
