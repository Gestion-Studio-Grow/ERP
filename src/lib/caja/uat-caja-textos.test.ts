// UAT de caja del 31/10: lo que la pantalla dice y ofrece. Sin cambiar ninguna regla de plata ni de cierre.
import assert from "node:assert/strict";
import test from "node:test";
import { avisoDeCaja, teclaDelCierreSegunRol } from "@/app/admin/(dashboard)/inicio/bandeja-core";
import { CERRAR_DIA_SIN_PERMISO, NO_SE_ABRE_CON_EL_DIA_CERRADO, puedeCerrarElDia } from "./cierre-diario";
import { movimientoDelLedger, motivoParaNoBorrar, rotuloDeOrigen, type FilaLedger } from "./libro-caja";

const cerrada = { estado: "ok", valor: "Cerrada", detalle: "el efectivo va al libro, sin turno" } as Parameters<typeof avisoDeCaja>[0];

test("con hoy cerrado, el Inicio no manda a abrir la caja: lleva al cierre", () => {
  const aviso = avisoDeCaja(cerrada, "/admin/caja", true);
  assert.equal(aviso?.tecla.href, "/admin/caja/cierre");
  assert.equal(aviso?.tecla.texto, "Ver el cierre");
  assert.doesNotMatch(aviso?.detalle ?? "", /Abrila/);
  assert.equal(avisoDeCaja(cerrada, "/admin/caja")?.tecla.texto, "Abrir la caja", "con el día abierto, como siempre");
});

test("el rechazo de abrir dice qué pasó y adónde ir, sin el texto de cargar movimientos", () => {
  assert.match(NO_SE_ABRE_CON_EL_DIA_CERRADO, /no se abre la caja/);
  assert.match(NO_SE_ABRE_CON_EL_DIA_CERRADO, /Cierre del día/);
});

test("la regla de quién cierra no cambió; el texto ya no nombra un rol que no existe", () => {
  assert.equal(puedeCerrarElDia("OWNER"), true);
  assert.equal(puedeCerrarElDia("ENCARGADO"), true);
  assert.equal(puedeCerrarElDia("RECEPTION"), false);
  assert.doesNotMatch(CERRAR_DIA_SIN_PERMISO, /encargado/i);
});

test("quien no cierra el día no recibe la tecla «Cerrar el día»", () => {
  const p = { objetivo: "cerrar", app: "cierre-del-dia", titulo: "La caja quedó sin cerrar", tecla: { texto: "Cerrar el día", href: "/admin/caja/cierre" } };
  const pendientes = [p] as unknown as Parameters<typeof teclaDelCierreSegunRol>[0];
  assert.equal(teclaDelCierreSegunRol(pendientes, false)[0].tecla.texto, "Ver el cierre");
  assert.equal(teclaDelCierreSegunRol(pendientes, false)[0].tecla.href, "/admin/caja/cierre");
  assert.equal(teclaDelCierreSegunRol(pendientes, true)[0].tecla.texto, "Cerrar el día");
});

const fila = (f: Partial<FilaLedger>): FilaLedger => ({
  id: "m1",
  occurredAt: new Date("2026-10-31T12:00:00.000Z"),
  type: "EGRESO",
  method: "EFECTIVO",
  amount: 100,
  reason: "x",
  orderId: null,
  createdBy: "user:1",
  ...f,
});

test("una fila tipeada dice «cargado a mano» y se puede borrar", () => {
  const m = movimientoDelLedger(fila({}));
  assert.equal(rotuloDeOrigen(m), "cargado a mano");
  assert.equal(m.borrable, true);
});

test("una apertura la escribió el sistema: lo dice y no ofrece borrarla", () => {
  const m = movimientoDelLedger(fila({ type: "APERTURA" }));
  assert.equal(rotuloDeOrigen(m), "apertura de turno");
  assert.equal(m.borrable, false);
});

test("una venta del mostrador sigue diciéndolo como siempre", () => {
  const m = movimientoDelLedger(fila({ type: "VENTA", orderId: "o1" }));
  assert.equal(rotuloDeOrigen(m), "venta del mostrador");
  assert.equal(m.borrable, false);
});

test("lo que la pantalla ofrece borrar es lo mismo que la acción deja borrar", () => {
  for (const f of [fila({}), fila({ type: "INGRESO" }), fila({ type: "RETIRO" }), fila({ type: "EGRESO", orderId: "o1" }), fila({ type: "VENTA" })]) {
    assert.equal(movimientoDelLedger(f).borrable, motivoParaNoBorrar(f) === null);
  }
});
