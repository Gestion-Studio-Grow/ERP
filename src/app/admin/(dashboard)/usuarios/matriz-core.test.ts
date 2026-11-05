import { test } from "node:test";
import assert from "node:assert/strict";
import { armarMatriz, BLOQUEOS, COLUMNAS, textoPorRol, valorParaGrabar, type UsuarioDeLaMatriz } from "./matriz-core";

const caro: UsuarioDeLaMatriz = { id: "u-caro", name: "Caro", role: "OWNER", professionalId: null, overrides: [], fichaActiva: null };
const socio: UsuarioDeLaMatriz = { id: "u-socio", name: "Socio", role: "OWNER", professionalId: null, overrides: [], fichaActiva: null };
const rocio: UsuarioDeLaMatriz = { id: "u-rocio", name: "Rocío", role: "RECEPTION", professionalId: null, overrides: [], fichaActiva: null };
const lu: UsuarioDeLaMatriz = { id: "u-lu", name: "Lu", role: "PROFESSIONAL", professionalId: "p-lu", overrides: [], fichaActiva: true };
const sinFicha: UsuarioDeLaMatriz = { id: "u-sf", name: "Nueva", role: "PROFESSIONAL", professionalId: null, overrides: [], fichaActiva: null };

const celda = (m: ReturnType<typeof armarMatriz>, userId: string, clave: string) => {
  const i = m.columnas.findIndex((c) => c.clave === clave);
  const fila = m.grupos.flatMap((g) => g.filas).find((f) => f.usuario.id === userId)!;
  return fila.celdas[i];
};

test("ocho columnas en servicios; en un mostrador sólo las que no son de agenda", () => {
  assert.equal(armarMatriz([caro], caro.id, false).columnas.length, 8);
  assert.deepEqual(armarMatriz([caro], caro.id, true).columnas.map((c) => c.clave), ["contacto", "stock", "caja"]);
  assert.deepEqual(COLUMNAS.map((c) => c.n), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("las filas van agrupadas por rol, socio → recepción → profesional, y sin grupos vacíos", () => {
  const m = armarMatriz([lu, rocio, caro], caro.id, false);
  assert.deepEqual(m.grupos.map((g) => g.nombre), ["Dueño/a", "Recepción", "Profesional"]);
  assert.deepEqual(armarMatriz([rocio], caro.id, false).grupos.map((g) => g.rol), ["RECEPTION"]);
});

test("sin excepciones, cada celda vale lo del rol (tabla del plan §3)", () => {
  const m = armarMatriz([caro, rocio, lu], caro.id, false);
  const vals = (id: string) => ["agendar", "editar-turnos", "cobrar-turnos", "contacto", "stock", "caja"].map((k) => celda(m, id, k).valor);
  assert.deepEqual(vals(rocio.id), [true, true, true, true, true, true]);
  assert.deepEqual(vals(lu.id), [false, false, true, false, false, false]);
  for (const id of [rocio.id, lu.id]) {
    assert.ok(m.grupos.flatMap((g) => g.filas).find((f) => f.usuario.id === id)!.celdas.every((c) => !c.excepcion));
  }
});

test("una excepción cambia el valor y queda marcada, con lo que daría el rol", () => {
  const luConContacto = { ...lu, overrides: [{ capability: "clients:contact", allowed: true }] };
  const rocioSinCaja = { ...rocio, overrides: [{ capability: "cash:manage", allowed: false }] };
  const m = armarMatriz([caro, luConContacto, rocioSinCaja], caro.id, false);
  assert.deepEqual(celda(m, lu.id, "contacto"), { clave: "contacto", valor: true, porRol: false, excepcion: true, bloqueo: null });
  assert.deepEqual(celda(m, rocio.id, "caja"), { clave: "caja", valor: false, porRol: true, excepcion: true, bloqueo: null });
  assert.equal(textoPorRol(celda(m, rocio.id, "caja")), "Por rol: sí");
});

test("stock es una casilla que vale sí sólo si rigen las tres capacidades", () => {
  const m = armarMatriz([{ ...rocio, overrides: [{ capability: "stock:adjust", allowed: false }] }], caro.id, false);
  assert.equal(celda(m, rocio.id, "stock").valor, false);
  assert.equal(celda(m, rocio.id, "stock").excepcion, true);
});

test("la propia fila y la de otro socio no se tocan", () => {
  const m = armarMatriz([caro, socio, rocio], caro.id, false);
  assert.ok(m.grupos[0].filas.find((f) => f.usuario.id === caro.id)!.celdas.every((c) => c.bloqueo === BLOQUEOS.propia || c.bloqueo === BLOQUEOS.proximamente));
  assert.ok(m.grupos[0].filas.find((f) => f.usuario.id === socio.id)!.celdas.every((c) => c.bloqueo !== null));
  assert.equal(celda(m, socio.id, "contacto").bloqueo, BLOQUEOS.socio);
  assert.equal(celda(m, rocio.id, "contacto").bloqueo, null);
  // Un recepcionista que llegara a ver la pantalla tampoco se edita a sí mismo.
  assert.equal(celda(armarMatriz([rocio], rocio.id, false), rocio.id, "caja").bloqueo, BLOQUEOS.propia);
});

test("casilla 1: sólo con ficha vinculada, y vale lo que dice la ficha (no el rol)", () => {
  const m = armarMatriz([caro, lu, { ...sinFicha }, rocio], caro.id, false);
  assert.deepEqual(celda(m, lu.id, "reserva-online"), { clave: "reserva-online", valor: true, porRol: null, excepcion: false, bloqueo: null });
  assert.equal(celda(m, sinFicha.id, "reserva-online").bloqueo, BLOQUEOS.sinFicha);
  assert.equal(celda(m, rocio.id, "reserva-online").bloqueo, BLOQUEOS.sinFicha);
  const apagada = armarMatriz([{ ...lu, fichaActiva: false }], caro.id, false);
  assert.equal(celda(apagada, lu.id, "reserva-online").valor, false);
  assert.equal(textoPorRol(celda(apagada, lu.id, "reserva-online")), null);
});

test("casilla 7: siempre deshabilitada, «próximamente», y en no", () => {
  const m = armarMatriz([caro, rocio, lu], caro.id, false);
  for (const id of [rocio.id, lu.id]) {
    assert.equal(celda(m, id, "senias-mp").bloqueo, BLOQUEOS.proximamente);
    assert.equal(celda(m, id, "senias-mp").valor, false);
  }
});

test("un profesional sin ficha no puede prender agendar/editar, pero sí apagar una excepción vieja", () => {
  const m = armarMatriz([sinFicha], caro.id, false);
  assert.equal(celda(m, sinFicha.id, "agendar").bloqueo, BLOQUEOS.sinFichaParaAgendar);
  assert.equal(celda(m, sinFicha.id, "editar-turnos").bloqueo, BLOQUEOS.sinFichaParaAgendar);
  assert.equal(celda(m, sinFicha.id, "contacto").bloqueo, null);
  const prendida = armarMatriz([{ ...sinFicha, overrides: [{ capability: "agenda:create", allowed: true }] }], caro.id, false);
  assert.equal(celda(prendida, sinFicha.id, "agendar").bloqueo, null);
});

test("volver a lo del rol borra la excepción; lo distinto graba sí o no", () => {
  assert.equal(valorParaGrabar({ porRol: true }, true), "default");
  assert.equal(valorParaGrabar({ porRol: true }, false), "no");
  assert.equal(valorParaGrabar({ porRol: false }, true), "si");
  assert.equal(valorParaGrabar({ porRol: false }, false), "default");
});

test("un override de una capacidad fuera de las casillas no cambia nada", () => {
  const m = armarMatriz([{ ...lu, overrides: [{ capability: "users:manage", allowed: true }] }], caro.id, false);
  assert.ok(m.grupos[0].filas[0].celdas.every((c) => !c.excepcion));
});
