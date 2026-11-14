// SEG-020 (cliente): la firma de un dueño con el PIN en el servidor pasa por `firmarComoDuenio` antes de correr.
//
// — Elaborado por GSG
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import { fijarPuertaDeLaFirma, type PuertaDeLaFirma } from "./puerta-del-pin";
import {
  SIN_CONEXION_PARA_FIRMAR,
  VIDA_DEL_PASE_EN_EL_EQUIPO_MS,
  conFirmaDelDuenio,
  confirmarCodigoDelDuenio,
  fijarRelojDeLaFirma,
  olvidarFirmasDelDuenio,
  pideAlServidor,
  pinDeLaAccion,
} from "./firma-del-duenio";

const HOY = "2026-10-17";
const AHORA = { fecha: HOY, min: 19 * 60 };

function clubReal() {
  const e = M.generarDemo(HOY, 19 * 60);
  const pinDe = Object.fromEntries(e.usuarios.map((u) => [u.id, M.pinDeEjemplo(u)]));
  M.pasarPinesAHash(e);
  for (const u of e.usuarios) if (u.rol === "duenio") u.pin = M.MARCA_PIN_SERVIDOR;
  const d = e.usuarios.find((u) => u.rol === "duenio")!;
  const r = e.usuarios.find((u) => u.rol === "recepcion")!;
  const avisos: string[] = [];
  const almacen = { estado: () => e, informar: (x: { mensaje: string }) => void avisos.push(x.mensaje) };
  return { e, d, r, pinDe, almacen, avisos };
}

/** Una puerta que confirma el PIN de `d` y anota cada llamada. */
function puertaQueConfirma(d: M.Usuario, pin: string, extra: Partial<PuertaDeLaFirma> = {}) {
  const llamadas: { usuarioId?: string; pin: string }[] = [];
  const p: PuertaDeLaFirma = {
    firmar: async (x) => {
      llamadas.push(x);
      return x.pin === pin && (!x.usuarioId || x.usuarioId === d.id)
        ? { ok: true, usuarioId: d.id, nombre: d.nombre, pase: "p", vence: 0 }
        : { ok: false, error: "PIN incorrecto." };
    },
    codigoParaAprobar: async () => ({ ok: false, error: "no" }),
    aprobarConCodigo: async () => ({ ok: false, error: "no" }),
    ...extra,
  };
  fijarPuertaDeLaFirma(p);
  return llamadas;
}

const esperar = () => new Promise((listo) => setTimeout(listo, 0));
let ahoraMs = 1_000_000;

afterEach(() => {
  fijarPuertaDeLaFirma(null);
  olvidarFirmasDelDuenio();
  fijarRelojDeLaFirma(null);
  Object.defineProperty(globalThis, "navigator", { value: undefined, configurable: true, writable: true });
});

test("la demo y la recepción no van al servidor: corre en el momento", () => {
  const demo = M.generarDemo(HOY, 19 * 60);
  const dd = demo.usuarios.find((u) => u.rol === "duenio")!;
  assert.equal(pideAlServidor(demo, { usuarioId: dd.id, pin: M.pinDeEjemplo(dd) }), false);
  assert.equal(pideAlServidor(demo, { pin: M.pinDeEjemplo(dd) }), false);
  const { e, d, r, pinDe, almacen } = clubReal();
  assert.equal(pideAlServidor(e, { usuarioId: r.id, pin: pinDe[r.id] }), false);
  assert.equal(pideAlServidor(e, { pin: pinDe[r.id] }), false);
  assert.equal(pideAlServidor(e, { usuarioId: d.id, pin: pinDe[d.id] }), true);
  assert.equal(pideAlServidor(e, { pin: pinDe[d.id] }), true);
  let corrio = 0;
  assert.equal(conFirmaDelDuenio(almacen, [{ usuarioId: r.id, pin: pinDe[r.id] }], () => ++corrio), 1);
});

test("sin puerta, sin red o con la llamada caída: avisa y no corre", async () => {
  const { d, pinDe, almacen, avisos } = clubReal();
  let corrio = false;
  assert.equal(conFirmaDelDuenio(almacen, [{ usuarioId: d.id, pin: pinDe[d.id] }], () => (corrio = true)), undefined);
  await esperar();
  const llamadas = puertaQueConfirma(d, pinDe[d.id]);
  Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true, writable: true });
  conFirmaDelDuenio(almacen, [{ usuarioId: d.id, pin: pinDe[d.id] }], () => (corrio = true));
  await esperar();
  assert.equal(llamadas.length, 0);
  Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true, writable: true });
  fijarPuertaDeLaFirma({ ...puertaFalsa(), firmar: async () => Promise.reject(new Error("red")) });
  const cortes: string[] = [];
  conFirmaDelDuenio(almacen, [{ pin: pinDe[d.id] }], () => (corrio = true), undefined, (m) => cortes.push(m));
  await esperar();
  assert.equal(corrio, false);
  assert.deepEqual(avisos, [SIN_CONEXION_PARA_FIRMAR, SIN_CONEXION_PARA_FIRMAR]);
  assert.deepEqual(cortes, [SIN_CONEXION_PARA_FIRMAR]);
});

function puertaFalsa(): PuertaDeLaFirma {
  return {
    firmar: async () => ({ ok: false, error: "no" }),
    codigoParaAprobar: async () => ({ ok: false, error: "no" }),
    aprobarConCodigo: async () => ({ ok: false, error: "no" }),
  };
}

test("con el pase del servidor el motor firma; vencido, una re-aplicación se rechaza", async () => {
  const { e, d, pinDe, almacen } = clubReal();
  fijarRelojDeLaFirma(() => ahoraMs);
  const llamadas = puertaQueConfirma(d, pinDe[d.id]);
  let firmo: boolean | undefined;
  conFirmaDelDuenio(almacen, pinDeLaAccion({ pin: pinDe[d.id], firmaId: d.id }), () => M.verificarFirma(e, d.id, pinDe[d.id]).ok, (ok) => (firmo = ok));
  await esperar();
  assert.equal(firmo, true);
  assert.deepEqual(llamadas, [{ usuarioId: d.id, pin: pinDe[d.id] }]);
  // Otro PIN no queda confirmado; el pase vencido tampoco.
  assert.equal(M.verificarFirma(e, d.id, "9876").ok, false);
  ahoraMs += VIDA_DEL_PASE_EN_EL_EQUIPO_MS;
  assert.equal(M.verificarFirma(e, d.id, pinDe[d.id]).ok, false);
});

test("si el servidor pide esperar manda él (no corre); un PIN que no es corre y lo rechaza el motor", async () => {
  const { e, d, pinDe, almacen, avisos } = clubReal();
  fijarPuertaDeLaFirma({ ...puertaFalsa(), firmar: async () => ({ ok: false, error: "Probá en 30 segundos.", esperaS: 30 }) });
  let corrio = false;
  conFirmaDelDuenio(almacen, [{ usuarioId: d.id, pin: pinDe[d.id] }], () => (corrio = true));
  await esperar();
  assert.equal(corrio, false);
  assert.deepEqual(avisos, ["Probá en 30 segundos."]);
  puertaQueConfirma(d, pinDe[d.id]);
  let local: boolean | undefined;
  conFirmaDelDuenio(almacen, [{ usuarioId: d.id, pin: "9876" }], () => M.verificarFirma(e, d.id, "9876").ok, (ok) => (local = ok));
  await esperar();
  assert.equal(local, false);
});

test("el código del dueño lo valida el servidor; sin red avisa", async () => {
  const { e, d, r, pinDe } = clubReal();
  const n = e.novedades.find((x) => x.estado === "pendiente")!;
  assert.equal((await confirmarCodigoDelDuenio(e, { novedadId: n.id, codigo: "QRS-TUV" }))?.ok, false);
  const pedidos: unknown[] = [];
  fijarPuertaDeLaFirma({
    ...puertaFalsa(),
    aprobarConCodigo: async (x) => {
      pedidos.push(x);
      return { ok: true, usuarioId: d.id, nombre: d.nombre, monto: x.monto, pase: "p", vence: 0 };
    },
  });
  const f = await confirmarCodigoDelDuenio(e, { novedadId: n.id, codigo: "qrs-tuv" });
  assert.ok(f?.ok);
  assert.deepEqual(pedidos, [{ novedadId: n.id, codigo: "QRSTUV", monto: Number(n.monto) }]);
  const ok = M.aprobarPorCodigo(e, n.id, { codigo: "QRS-TUV" }, { usuarioId: r.id, pin: pinDe[r.id] }, AHORA);
  assert.ok(ok.ok);
  assert.equal(confirmarCodigoDelDuenio(M.generarDemo(HOY, 19 * 60), { novedadId: n.id, codigo: "QRS-TUV" }), null);
});
