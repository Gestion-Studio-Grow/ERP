// SEG-020 (cliente): el PIN de un dueño que llega con la marca del servidor (`srv:`) sólo coincide si el servidor lo
// confirmó (verificador inyectado). La demo, sin marca, sigue igual.
//
// — Elaborado por GSG
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as M from "./motor.mjs";

const HOY = "2026-10-17";
const AHORA = { fecha: HOY, min: 19 * 60 };

/** La demo con hash, y los dueños como baja la foto de la jornada real: la marca y su largo. */
function clubReal() {
  const e = M.generarDemo(HOY, 19 * 60);
  const pinDe = Object.fromEntries(e.usuarios.map((u) => [u.id, M.pinDeEjemplo(u)]));
  M.pasarPinesAHash(e);
  for (const u of e.usuarios) if (u.rol === "duenio") u.pin = M.MARCA_PIN_SERVIDOR;
  const d = e.usuarios.find((u) => u.rol === "duenio")!;
  const r = e.usuarios.find((u) => u.rol === "recepcion")!;
  return { e, d, r, pinDe };
}

const quienEs = (e: M.EstadoClub, pin: string) => {
  const r = M.usuarioPorPin(e, pin);
  return r?.ok ? r.usuario.id : null;
};

afterEach(() => M.fijarVerificadorDelServidor(null));

test("sin verificador, la marca no coincide con nada y no se resuelve el dueño localmente", () => {
  const { e, d, r, pinDe } = clubReal();
  assert.ok(M.esPinEnServidor(d.pin));
  for (const p of [pinDe[d.id], M.MARCA_PIN_SERVIDOR, "srv", ""]) assert.equal(M.pinCoincide(e, d, p), false);
  assert.equal(M.verificarFirma(e, d.id, pinDe[d.id]).ok, false);
  assert.equal(M.usuarioPorPin(e, pinDe[d.id])?.ok, false);
  // La recepción sigue local.
  assert.equal(M.verificarPin(e, r.id, pinDe[r.id]).ok, true);
  assert.equal(quienEs(e, pinDe[r.id]), r.id);
});

test("la marca no se pasa a hash y su largo es el guardado", () => {
  const { e, d } = clubReal();
  assert.equal(M.pasarPinesAHash(e), 0);
  assert.equal(d.pin, M.MARCA_PIN_SERVIDOR);
  assert.equal(M.largoDelPinGuardado(d), d.pinLargo);
  assert.equal(M.pinDesactualizado(e, d.id), false);
  assert.equal(M.largoDelPinGuardado({ pin: M.MARCA_PIN_SERVIDOR }), 0);
});

test("con el pase del servidor coincide sólo ese PIN de ese usuario; un verificador que falla no deja pasar", () => {
  const { e, d, pinDe } = clubReal();
  const otro = e.usuarios.find((u) => u.rol === "duenio" && u.id !== d.id)!;
  M.fijarVerificadorDelServidor({ pin: (usuarioId: string, pin: string) => usuarioId === d.id && pin === pinDe[d.id] });
  assert.equal(M.pinCoincide(e, d, pinDe[d.id]), true);
  assert.equal(M.verificarFirma(e, d.id, pinDe[d.id]).ok, true);
  assert.equal(quienEs(e, pinDe[d.id]), d.id);
  assert.equal(M.pinCoincide(e, otro, pinDe[d.id]), false);
  assert.equal(M.pinCoincide(e, d, "9876"), false);
  M.fijarVerificadorDelServidor({
    pin: () => {
      throw new Error("x");
    },
  });
  assert.equal(M.pinCoincide(e, d, pinDe[d.id]), false);
  M.fijarVerificadorDelServidor({ pin: () => 1 as unknown as boolean });
  assert.equal(M.pinCoincide(e, d, pinDe[d.id]), false);
});

test("la marca no da código de aprobación; el del dueño vale sólo si lo confirmó el servidor", () => {
  const { e, r, pinDe } = clubReal();
  const n = e.novedades.find((x) => x.estado === "pendiente")!;
  const datos = { sal: e.salPin, novedadId: n.id, clienteId: n.clienteId, monto: Number(n.monto), fecha: n.fecha };
  assert.equal(M.codigoAprobacion({ pin: M.MARCA_PIN_SERVIDOR, ...datos }), "");
  const auth = { usuarioId: r.id, pin: pinDe[r.id] };
  for (const codigo of [M.codigoAprobacion({ pin: M.hashPin(M.MARCA_PIN_SERVIDOR, e.salPin ?? "x"), ...datos }), "ABC-DEF"])
    assert.equal(M.aprobarPorCodigo(e, n.id, { codigo }, auth, AHORA).ok, false);
  const d = e.usuarios.find((u) => u.rol === "duenio")!;
  M.fijarVerificadorDelServidor({
    codigo: (x: { usuarioId: string; novedadId: string; codigo: string; monto: number }) => x.usuarioId === d.id && x.novedadId === n.id && x.codigo === "QRSTUV" && x.monto === Number(n.monto),
  });
  const ok = M.aprobarPorCodigo(e, n.id, { codigo: "QRS-TUV" }, auth, AHORA);
  assert.ok(ok.ok);
  assert.equal(ok.ok && ok.aprobo, d.nombre);
});

test("la demo (PIN de ejemplo, sin marca) sigue igual", () => {
  const e = M.generarDemo(HOY, 19 * 60);
  const d = e.usuarios.find((u) => u.rol === "duenio")!;
  const pin = M.pinDeEjemplo(d);
  assert.equal(M.esPinEnServidor(d.pin), false);
  assert.equal(M.verificarFirma(e, d.id, pin).ok, true);
  assert.equal(quienEs(e, pin), d.id);
});
