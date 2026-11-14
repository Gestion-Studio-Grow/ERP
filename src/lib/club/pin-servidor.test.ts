// SEG-020 (servidor): el PIN de un dueño del club se verifica sólo en el servidor (src/lib/club/pin-servidor.ts).
// La foto que baja no trae credenciales de dueño; al guardar se reponen desde la vigente; el pase y el código de
// aprobación se firman con una clave del servidor.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "./motor.mjs";
import {
  LETRAS_DEL_CODIGO,
  MARCA_PIN_SERVIDOR,
  VIDA_PASE_MS,
  codigoDeAprobacionServidor,
  esPinFuerte,
  firmarPase,
  hashFuerte,
  huellaDePin,
  normalizarCodigo,
  ocultarPinesDeDuenio,
  pinDelDuenioCoincide,
  reponerPinesDeDuenio,
  verificarPase,
} from "./pin-servidor";

const HOY = "2026-10-17";
const AHORA = { fecha: HOY, min: 10 * 60 };
const PIN_ROBER = "4826";
const PIN_MAJO = "5937";

type U = { id: string; rol: string; pin: string; pinLargo?: number };
const sobre = (e: M.EstadoClub) => JSON.stringify({ v: M.VERSION_ESTADO, estado: e, secuencia: 0 });
const usuariosDe = (texto: string) => (JSON.parse(texto) as { estado: { usuarios: U[] } }).estado.usuarios;
const salDe = (texto: string) => (JSON.parse(texto) as { estado: { salPin?: string } }).estado.salPin;

/** Club real con dos dueños con PIN y una persona de recepción. */
function club() {
  const e = M.crearClubReal(HOY);
  assert.ok(M.definirPinInicial(e, "u-rober", PIN_ROBER, AHORA).ok);
  assert.ok(M.definirPinInicial(e, "u-majo", PIN_MAJO, AHORA).ok);
  const alta = M.altaUsuario(e, { nombre: "Lu", rol: "recepcion" }, { usuarioId: "u-rober", pin: PIN_ROBER }, AHORA);
  assert.ok(alta.ok);
  return { e, recepcion: alta.usuario as U, pinRecepcion: alta.pin as string };
}

const CLAVE = Buffer.alloc(32, 7);
const OTRA_CLAVE = Buffer.alloc(32, 9);

test("la foto que baja no trae credenciales de dueño; la recepción queda como estaba", () => {
  const { e, recepcion } = club();
  const vigente = sobre(e);
  const hashes = e.usuarios.filter((u) => u.rol === "duenio").map((u) => u.pin);
  const oculta = ocultarPinesDeDuenio(vigente);
  assert.ok(oculta);
  for (const h of hashes) assert.ok(!oculta.includes(h));
  const us = usuariosDe(oculta);
  for (const u of us.filter((x) => x.rol === "duenio")) {
    assert.equal(u.pin, MARCA_PIN_SERVIDOR);
    assert.equal(u.pinLargo, 4);
  }
  assert.equal(us.find((u) => u.id === recepcion.id)!.pin, recepcion.pin);
  assert.equal(salDe(oculta), e.salPin);
});

test("ocultar: PIN de dueño en claro (de antes) y cualquier h2 también se ocultan; ilegible da null", () => {
  const { e, recepcion } = club();
  const rober = e.usuarios.find((u) => u.id === "u-rober")!;
  rober.pin = "12";
  delete (rober as { pinLargo?: number }).pinLargo;
  const r = e.usuarios.find((u) => u.id === recepcion.id)!;
  r.pin = hashFuerte("33");
  const oculta = ocultarPinesDeDuenio(sobre(e))!;
  const us = usuariosDe(oculta);
  assert.deepEqual([us.find((u) => u.id === "u-rober")!.pin, us.find((u) => u.id === "u-rober")!.pinLargo], [MARCA_PIN_SERVIDOR, 2]);
  assert.equal(us.find((u) => u.id === recepcion.id)!.pin, MARCA_PIN_SERVIDOR);
  assert.ok(!oculta.includes("h2:"));
  assert.equal(ocultarPinesDeDuenio("{no es json"), null);
  // Un dueño sin PIN sigue sin PIN (la consola de arranque lo necesita para pedirle que arme el suyo).
  const nuevo = M.crearClubReal(HOY);
  assert.ok(usuariosDe(ocultarPinesDeDuenio(sobre(nuevo))!).every((u) => u.pin === ""));
});

test("guardar desde recepción con la marca conserva los PIN de dueño sin marcar corrección", () => {
  const { e } = club();
  const vigente = sobre(e);
  const r = reponerPinesDeDuenio(vigente, ocultarPinesDeDuenio(vigente)!, { esOwner: false });
  assert.equal(r.corregido, false);
  assert.deepEqual(usuariosDe(r.texto), usuariosDe(vigente));
});

test("recepción no cambia el PIN de un dueño aunque mande un h1 nuevo", () => {
  const { e } = club();
  const vigente = sobre(e);
  const nuevo = JSON.parse(ocultarPinesDeDuenio(vigente)!);
  nuevo.estado.usuarios.find((u: U) => u.id === "u-rober").pin = M.hashPin("7391", e.salPin!);
  const r = reponerPinesDeDuenio(vigente, JSON.stringify(nuevo), { esOwner: false });
  assert.equal(r.corregido, true);
  assert.equal(usuariosDe(r.texto).find((u) => u.id === "u-rober")!.pin, e.usuarios.find((u) => u.id === "u-rober")!.pin);
});

test("guardar desde un dueño del ERP: la marca repone; un h1 nuevo válido se acepta; lo demás no", () => {
  const { e } = club();
  const vigente = sobre(e);
  const base = () => JSON.parse(ocultarPinesDeDuenio(vigente)!);
  const vigenteDe = (id: string) => e.usuarios.find((u) => u.id === id)!.pin;

  const igual = reponerPinesDeDuenio(vigente, JSON.stringify(base()), { esOwner: true });
  assert.equal(igual.corregido, false);
  assert.deepEqual(usuariosDe(igual.texto), usuariosDe(vigente));

  const cambio = base();
  const h1 = M.hashPin("7391", e.salPin!);
  Object.assign(cambio.estado.usuarios.find((u: U) => u.id === "u-rober"), { pin: h1, pinLargo: 4 });
  const r1 = reponerPinesDeDuenio(vigente, JSON.stringify(cambio), { esOwner: true });
  assert.equal(usuariosDe(r1.texto).find((u) => u.id === "u-rober")!.pin, h1);

  // Un respaldo viejo con el PIN del dueño en claro (de antes del 21/10) también lo trae un dueño del ERP.
  const claro = base();
  Object.assign(claro.estado.usuarios.find((u: U) => u.id === "u-majo"), { pin: "73" });
  delete claro.estado.usuarios.find((u: U) => u.id === "u-majo").pinLargo;
  assert.equal(usuariosDe(reponerPinesDeDuenio(vigente, JSON.stringify(claro), { esOwner: true }).texto).find((u) => u.id === "u-majo")!.pin, "73");

  for (const malo of [M.hashPin(MARCA_PIN_SERVIDOR, e.salPin!), "h1:zz", "739", "abcd", hashFuerte("7391")]) {
    const x = base();
    Object.assign(x.estado.usuarios.find((u: U) => u.id === "u-majo"), { pin: malo, pinLargo: 4 });
    const r = reponerPinesDeDuenio(vigente, JSON.stringify(x), { esOwner: true });
    assert.equal(r.corregido, true);
    assert.equal(usuariosDe(r.texto).find((u) => u.id === "u-majo")!.pin, vigenteDe("u-majo"));
  }
});

test("un dueño que pasa a otro rol queda sin PIN: lo guardado no se repone ni baja, y volver a dueño no lo recupera", () => {
  const { e } = club();
  const vigente = sobre(e);
  const guardado = e.usuarios.find((u) => u.id === "u-majo")!.pin;
  const h2 = hashFuerte(PIN_MAJO);
  const fuertes = new Map([["u-majo", { de: huellaDePin(guardado), h2 }]]);
  for (const esOwner of [true, false]) {
    for (const llega of [MARCA_PIN_SERVIDOR, guardado, M.hashPin("7391", e.salPin!), ""]) {
      const x = JSON.parse(ocultarPinesDeDuenio(vigente)!);
      Object.assign(x.estado.usuarios.find((u: U) => u.id === "u-majo"), { rol: "recepcion", pin: llega, pinLargo: 4 });
      const r = reponerPinesDeDuenio(vigente, JSON.stringify(x), { esOwner, fuertes });
      const majo = usuariosDe(r.texto).find((u) => u.id === "u-majo")!;
      if (esOwner) {
        // Un dueño del ERP sí cambia el rol: el PIN queda anulado (tiene que definir uno nuevo).
        assert.equal(majo.rol, "recepcion");
        assert.equal(majo.pin, "");
        assert.equal(majo.pinLargo, undefined);
      } else {
        // Desde otro puesto el rol no cambia (G8): sigue siendo dueño y su PIN sigue sin bajar.
        assert.equal(majo.rol, "duenio");
      }
      if (esOwner) assert.ok(!r.texto.includes(h2), "el h2 pendiente no se aplica a quien ya no es dueño");
      const leida = ocultarPinesDeDuenio(r.texto)!;
      assert.ok(!leida.includes(guardado), "lo guardado del ex dueño no baja");
      assert.ok(!leida.includes("h2:"));
      const enLaFoto = usuariosDe(leida).find((u) => u.id === "u-majo")!;
      assert.ok(!String(enLaFoto.pin).startsWith("h1:") && !String(enLaFoto.pin).startsWith("h2:"));

      if (!esOwner) continue;
      // Volver a ser dueño con la marca no trae el PIN de antes.
      const despues = r.texto;
      const y = JSON.parse(ocultarPinesDeDuenio(despues)!);
      Object.assign(y.estado.usuarios.find((u: U) => u.id === "u-majo"), { rol: "duenio", pin: MARCA_PIN_SERVIDOR });
      const otra = reponerPinesDeDuenio(despues, JSON.stringify(y), { esOwner: true, fuertes });
      const vuelta = usuariosDe(otra.texto).find((u) => u.id === "u-majo")!;
      assert.equal(vuelta.rol, "duenio");
      assert.equal(vuelta.pin, "");
      assert.ok(!otra.texto.includes(guardado) && !otra.texto.includes(h2));
      assert.equal(pinDelDuenioCoincide(vuelta.pin, PIN_MAJO, e.salPin), false);
    }
  }
});

test("ocultar: cualquier h2 se oculta, sea cual sea el rol (también sin rol)", () => {
  const { e, recepcion } = club();
  const r = e.usuarios.find((u) => u.id === recepcion.id)! as unknown as Record<string, unknown>;
  r.pin = hashFuerte("33");
  delete r.rol;
  const oculta = ocultarPinesDeDuenio(sobre(e))!;
  assert.ok(!oculta.includes("h2:"));
});

test("re-hash: el h2 pendiente reemplaza al h1 vigente al guardar (cualquier sesión) y sigue verificando", () => {
  const { e } = club();
  const vigente = sobre(e);
  const h1 = e.usuarios.find((u) => u.id === "u-rober")!.pin;
  const h2 = hashFuerte(PIN_ROBER);
  assert.ok(esPinFuerte(h2));
  const fuertes = new Map([["u-rober", { de: huellaDePin(h1), h2 }]]);
  for (const esOwner of [false, true]) {
    const r = reponerPinesDeDuenio(vigente, ocultarPinesDeDuenio(vigente)!, { esOwner, fuertes });
    const rober = usuariosDe(r.texto).find((u) => u.id === "u-rober")!;
    assert.equal(rober.pin, h2);
    assert.equal(rober.pinLargo, 4);
    assert.ok(pinDelDuenioCoincide(rober.pin, PIN_ROBER, e.salPin));
    assert.equal(r.corregido, false);
  }
  // Si el vigente ya no es ese h1 (el dueño cambió su PIN), el h2 viejo no se aplica.
  const viejo = new Map([["u-rober", { de: huellaDePin("h1:otro"), h2 }]]);
  const r = reponerPinesDeDuenio(vigente, ocultarPinesDeDuenio(vigente)!, { esOwner: false, fuertes: viejo });
  assert.equal(usuariosDe(r.texto).find((u) => u.id === "u-rober")!.pin, h1);
});

test("pinDelDuenioCoincide acepta h1, h2 y en claro; rechaza el resto", () => {
  const { e } = club();
  const h1 = e.usuarios.find((u) => u.id === "u-rober")!.pin;
  assert.ok(pinDelDuenioCoincide(h1, PIN_ROBER, e.salPin));
  assert.ok(!pinDelDuenioCoincide(h1, PIN_MAJO, e.salPin));
  const h2 = hashFuerte(PIN_ROBER);
  assert.ok(pinDelDuenioCoincide(h2, ` ${PIN_ROBER} `, e.salPin));
  assert.ok(!pinDelDuenioCoincide(h2, PIN_MAJO, e.salPin));
  assert.notEqual(hashFuerte(PIN_ROBER), h2); // sal propia
  assert.ok(pinDelDuenioCoincide("12", "12", undefined));
  assert.ok(!pinDelDuenioCoincide("", "", e.salPin));
  assert.ok(!pinDelDuenioCoincide(MARCA_PIN_SERVIDOR, MARCA_PIN_SERVIDOR, e.salPin));
  assert.ok(!pinDelDuenioCoincide("h2:roto", PIN_ROBER, e.salPin));
});

test("pase: firma y verifica; vence; no vale con otro negocio, otro uso, otra clave ni tocado", () => {
  const ahora = 1_000_000;
  const pase = firmarPase({ tenantId: "A", usuarioId: "u-rober", uso: "firma", exp: ahora + VIDA_PASE_MS }, CLAVE);
  const v = verificarPase(pase, CLAVE, ahora + 1000, { tenantId: "A", uso: "firma" });
  assert.deepEqual(v, { ok: true, tenantId: "A", usuarioId: "u-rober", uso: "firma", exp: ahora + VIDA_PASE_MS });
  assert.equal(verificarPase(pase, CLAVE, ahora + VIDA_PASE_MS + 1, { tenantId: "A", uso: "firma" }).ok, false);
  assert.equal(verificarPase(pase, CLAVE, ahora, { tenantId: "B", uso: "firma" }).ok, false);
  assert.equal(verificarPase(pase, CLAVE, ahora, { tenantId: "A", uso: "aprobacion" }).ok, false);
  assert.equal(verificarPase(pase, OTRA_CLAVE, ahora, { tenantId: "A", uso: "firma" }).ok, false);
  const [v1, datos, mac] = pase.split(".");
  const otros = Buffer.from(JSON.stringify({ t: "B", u: "u-rober", s: "firma", e: ahora + VIDA_PASE_MS })).toString("base64url");
  assert.equal(verificarPase(`${v1}.${otros}.${mac}`, CLAVE, ahora, { tenantId: "B", uso: "firma" }).ok, false);
  assert.equal(verificarPase(`${v1}.${datos}.x${mac}`, CLAVE, ahora, { tenantId: "A", uso: "firma" }).ok, false);
  assert.equal(verificarPase("basura", CLAVE, ahora, { tenantId: "A", uso: "firma" }).ok, false);
});

test("código de aprobación del servidor: 6 letras del alfabeto del motor; no coincide con el armado con el hash", () => {
  const { e } = club();
  const datos = { tenantId: "A", usuarioId: "u-rober", novedadId: "n1", clienteId: "cl1", monto: 5000, fecha: HOY };
  const c = codigoDeAprobacionServidor(datos, CLAVE);
  assert.match(c, new RegExp(`^[${LETRAS_DEL_CODIGO}]{3}-[${LETRAS_DEL_CODIGO}]{3}$`));
  // Mismo alfabeto que el motor: sus códigos sólo usan estas letras.
  for (let i = 0; i < 50; i++) assert.match(M.codigoAprobacion({ pin: String(1000 + i), novedadId: `n${i}`, clienteId: "c", monto: i }), new RegExp(`^[${LETRAS_DEL_CODIGO}]{3}-[${LETRAS_DEL_CODIGO}]{3}$`));
  assert.equal(normalizarCodigo(" abc-def "), "ABCDEF");
  assert.equal(c, codigoDeAprobacionServidor({ ...datos }, CLAVE));
  assert.notEqual(c, codigoDeAprobacionServidor({ ...datos, monto: 5001 }, CLAVE));
  assert.notEqual(c, codigoDeAprobacionServidor({ ...datos, tenantId: "B" }, CLAVE));
  assert.notEqual(c, codigoDeAprobacionServidor({ ...datos, usuarioId: "u-majo" }, CLAVE));
  assert.notEqual(c, codigoDeAprobacionServidor(datos, OTRA_CLAVE));
  const h1 = e.usuarios.find((u) => u.id === "u-rober")!.pin;
  const delMotor = M.codigoAprobacion({ pin: h1, sal: e.salPin, novedadId: "n1", clienteId: "cl1", monto: 5000, fecha: HOY });
  assert.notEqual(normalizarCodigo(c), normalizarCodigo(delMotor));
});
