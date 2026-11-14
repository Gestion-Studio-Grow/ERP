// GSG-SEG-019: «Cambiar mi PIN» en el servidor (src/lib/club/cambiar-pin.ts). Sólo con el PIN actual del usuario, el
// de un dueño sólo desde un dueño del ERP, y el nuevo con las reglas del motor. Nunca devuelve el PIN.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "./motor.mjs";
import { cambiarPinEnLaFoto } from "./cambiar-pin";

const HOY = "2026-10-17";
const AHORA = { fecha: HOY, min: 19 * 60 };
const sobre = (e: M.EstadoClub) => JSON.stringify({ v: M.VERSION_ESTADO, estado: e, secuencia: M.secuenciaIds(), guardado: 1 });
const estadoDe = (texto: string) => (JSON.parse(texto) as { estado: M.EstadoClub }).estado;

/** La demo (con o sin hash), dos usuarios de recepción y un dueño, con sus PIN de ejemplo. */
function club(conHash: boolean) {
  const e = M.generarDemo(HOY, 19 * 60);
  const [a, b] = e.usuarios.filter((u) => u.rol === "recepcion");
  const d = e.usuarios.find((u) => u.rol === "duenio")!;
  const pin = { a: M.pinDeEjemplo(a), b: M.pinDeEjemplo(b), d: M.pinDeEjemplo(d) };
  if (conHash) M.pasarPinesAHash(e);
  return { e, a, b, d, pin };
}

/** Un PIN de 2 que no es de nadie ni fácil para el motor. */
function pinLibreDe2(e: M.EstadoClub): string {
  for (let i = 10; i < 100; i++) {
    const p = String(i);
    if (!M.usuarioPorPin(e, p)?.ok && !M.pinFacil("recepcion", p)) return p;
  }
  throw new Error("no hay PIN libre");
}

for (const conHash of [false, true]) {
  const como = conHash ? "con hash" : "en claro";

  test(`SEG-019 (${como}): cada uno cambia SU PIN sabiendo el actual; queda con hash y el resto igual`, () => {
    const { e, a, pin } = club(conHash);
    const nuevo = pinLibreDe2(e);
    const r = cambiarPinEnLaFoto(sobre(e), { usuarioId: a.id, pinActual: pin.a, pinNuevo: nuevo, esDuenioDelErp: false, ahora: AHORA });
    assert.ok(r.ok, r.ok ? "" : r.motivo);
    const quedo = estadoDe(r.texto);
    const u = quedo.usuarios.find((x) => x.id === a.id)!;
    assert.ok(M.esPinConHash(u.pin), "el PIN nuevo queda con hash, nunca en claro");
    assert.ok(M.pinCoincide(quedo, u, nuevo));
    assert.ok(!M.pinCoincide(quedo, u, pin.a), "el viejo ya no entra");
    const entra = M.usuarioPorPin(quedo, nuevo);
    assert.equal(entra?.ok ? entra.usuario.id : null, a.id);
    for (const otro of e.usuarios.filter((x) => x.id !== a.id))
      assert.deepEqual(quedo.usuarios.find((x) => x.id === otro.id), otro, "los demás usuarios quedan como estaban");
    assert.ok(!r.texto.includes(`"${nuevo}"`), "el PIN nuevo no viaja en claro en la foto");
  });

  test(`SEG-019 (${como}): con un PIN actual que no es el suyo (p. ej. el de otra persona), no cambia nada`, () => {
    const { e, a, b, pin } = club(conHash);
    const nuevo = pinLibreDe2(e);
    for (const pinActual of [pin.a, "", "  "]) {
      const r = cambiarPinEnLaFoto(sobre(e), { usuarioId: b.id, pinActual, pinNuevo: nuevo, esDuenioDelErp: false });
      assert.equal(r.ok, false);
      assert.equal(!r.ok && r.codigo, "pin-actual");
    }
    // Ni siendo dueño del ERP: el PIN actual se pide igual.
    const r = cambiarPinEnLaFoto(sobre(e), { usuarioId: a.id, pinActual: pin.b, pinNuevo: nuevo, esDuenioDelErp: true });
    assert.equal(!r.ok && r.codigo, "pin-actual");
  });

  test(`SEG-019 (${como}): el PIN de un dueño del club no se cambia desde recepción (ni sabiendo el actual); desde un dueño del ERP, sí`, () => {
    const { e, d, pin } = club(conHash);
    const r = cambiarPinEnLaFoto(sobre(e), { usuarioId: d.id, pinActual: pin.d, pinNuevo: "8642", esDuenioDelErp: false });
    assert.equal(!r.ok && r.codigo, "duenio");
    const ok = cambiarPinEnLaFoto(sobre(e), { usuarioId: d.id, pinActual: pin.d, pinNuevo: "8642", esDuenioDelErp: true });
    assert.ok(ok.ok, ok.ok ? "" : ok.motivo);
    const quedo = estadoDe(ok.texto);
    assert.ok(M.pinCoincide(quedo, quedo.usuarios.find((x) => x.id === d.id)!, "8642"));
  });

  test(`SEG-019 (${como}): el PIN nuevo inválido (largo, igual al actual, fácil) o en uso por otra persona, no pasa`, () => {
    const { e, a, pin } = club(conHash);
    const pedir = (pinNuevo: string) => cambiarPinEnLaFoto(sobre(e), { usuarioId: a.id, pinActual: pin.a, pinNuevo, esDuenioDelErp: false });
    for (const malo of ["123456", "1", "", "ab", pin.a]) {
      const r = pedir(malo);
      assert.equal(r.ok, false, `«${malo.length} caracteres» no debería pasar`);
      assert.equal(!r.ok && r.codigo, "pin-nuevo");
    }
    // Otra persona con un PIN que el motor acepta (los de ejemplo de la demo ya los rechaza por fáciles).
    const enUso = e.usuarios.find((u) => u.rol === "recepcion" && u.id !== a.id)!;
    const suyo = pinLibreDe2(e);
    assert.ok(M.cambiarMiPin(e, { usuarioId: enUso.id, pin: M.pinDeEjemplo(enUso) }, suyo).ok);
    const r = pedir(suyo);
    assert.equal(!r.ok && r.codigo, "pin-nuevo");
    assert.match(!r.ok ? r.motivo : "", /otra persona/);
  });

  test(`SEG-019 (${como}): usuario inexistente o sin acceso, no`, () => {
    const { e, a, pin } = club(conHash);
    const nuevo = pinLibreDe2(e);
    assert.equal((cambiarPinEnLaFoto(sobre(e), { usuarioId: "u-no-existe", pinActual: pin.a, pinNuevo: nuevo, esDuenioDelErp: true }) as { codigo?: string }).codigo, "usuario");
    const sinAcceso = structuredClone(e);
    sinAcceso.usuarios.find((u) => u.id === a.id)!.activo = false;
    assert.equal((cambiarPinEnLaFoto(sobre(sinAcceso), { usuarioId: a.id, pinActual: pin.a, pinNuevo: nuevo, esDuenioDelErp: false }) as { codigo?: string }).codigo, "usuario");
  });
}

test("SEG-019: una foto ilegible no se toca", () => {
  for (const t of ["{roto", JSON.stringify({ v: 1 })]) {
    const r = cambiarPinEnLaFoto(t, { usuarioId: "u-lu", pinActual: "00", pinNuevo: "11", esDuenioDelErp: false });
    assert.equal(!r.ok && r.codigo, "ilegible");
  }
});

test("SEG-019: el PIN que cambia por esta vía, después pasa por `conservarLoDelicado` como el vigente (no lo pisa el guardado siguiente)", async () => {
  const { conservarLoDelicado } = await import("./delicado");
  const { e, a, pin } = club(true);
  const nuevo = pinLibreDe2(e);
  const r = cambiarPinEnLaFoto(sobre(e), { usuarioId: a.id, pinActual: pin.a, pinNuevo: nuevo, esDuenioDelErp: false });
  assert.ok(r.ok);
  // El puesto, al bajar la base, aplica el mismo cambio (misma sal → mismo hash): el guardado siguiente no corrige nada.
  const local = structuredClone(e);
  assert.ok(M.cambiarMiPin(local, { usuarioId: a.id, pin: pin.a }, nuevo).ok);
  const quedo = conservarLoDelicado(r.texto, sobre(local));
  assert.deepEqual(estadoDe(quedo.texto).usuarios, estadoDe(r.texto).usuarios);
});
