// SEGURIDAD (08/11/2026): el Inicio ofrecía «Abrir la caja» a quien tiene la casilla 8 (`cash:manage`) apagada en la
// matriz: la tecla llevaba a una pantalla que el servidor le niega. Ahora sólo la ve quien puede abrirla.
import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoDeCaja, pasosSegunRol, teclaDeCajaCerrada, type PasoParaArrancar } from "./bandeja-core";

const cerrada = { estado: "ok" as const, valor: "Cerrada" };

test("sin cash:manage, el Inicio no ofrece «Abrir la caja»; con, sí", () => {
  assert.equal(avisoDeCaja(cerrada, "/admin/caja", false, false), null);
  assert.equal(avisoDeCaja(cerrada, "/admin/caja", false, true)?.tecla.texto, "Abrir la caja");
});

test("«Para arrancar»: el paso de abrir la caja sale sólo para quien puede abrirla (lo ya hecho se sigue viendo)", () => {
  const abrir: PasoParaArrancar = { id: "caja", titulo: "Abrir la caja con el fondo del cajón", hecho: false, tecla: { texto: "Abrir la caja", href: "/admin/caja" } };
  const hecha: PasoParaArrancar = { id: "caja", titulo: "Caja abierta", hecho: true };
  assert.deepEqual(pasosSegunRol([abrir], true, false), []);
  assert.deepEqual(pasosSegunRol([abrir], true, true), [abrir]);
  assert.deepEqual(pasosSegunRol([hecha], true, false), [hecha]);
});

test("Inicio de mostrador de siempre: «Abrir caja →» sólo con cash:manage; «Ver el cierre» con el día cerrado", () => {
  assert.equal(teclaDeCajaCerrada(false, false), null);
  assert.deepEqual(teclaDeCajaCerrada(false, true), { texto: "Abrir caja →", href: "/admin/caja" });
  assert.equal(teclaDeCajaCerrada(true, false)?.href, "/admin/caja/cierre");
});
