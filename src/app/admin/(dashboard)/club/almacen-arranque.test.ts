// La consola del primer arranque (`arranque`), `restaurar` un respaldo, el `guardado` (ms) en el respaldo del archivo
// para archivar y el aviso de `bytes` por la cuadrícula de 64 KB.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import { armarMesCargado, HOY_TORNEO } from "@/lib/club/fixtures/armar-respaldo";
import {
  CUADRICULA_DE_BYTES,
  claveDeLaDemo,
  claveDeLaJornada,
  crearAlmacen,
  textoDeLaDemo,
  textoDelEstado,
  type AlmacenamientoLocal,
  type Temporizador,
} from "./almacen";

const NEGOCIO = "demo-club";
const CLAVE = claveDeLaJornada(NEGOCIO);
const DUENIO = { usuarioId: "u-duenio-1", pin: "11" };
const vaciar = () => new Promise<void>((r) => setImmediate(r));
const temporizador: Temporizador = { despues: () => () => undefined, cada: () => () => undefined };

function memoria(tope = Infinity) {
  const datos = new Map<string, string>();
  const m: AlmacenamientoLocal & { datos: Map<string, string> } = {
    datos,
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => {
      if (String(v).length > tope) throw new Error("QuotaExceededError");
      datos.set(k, String(v));
    },
    removeItem: (k) => void datos.delete(k),
  };
  return m;
}

async function real(m: AlmacenamientoLocal, rol: "OWNER" | "RECEPTION" = "OWNER") {
  const a = crearAlmacen({
    reloj: "real",
    clave: CLAVE,
    almacenamiento: m,
    cerrojos: null,
    canal: null,
    temporizador,
    relojMs: () => new Date(2026, 9, 17, 19, 0).getTime(),
    demoraGuardadoMs: 0,
    enReposo: null,
    rol,
  });
  a.arrancar();
  await vaciar();
  return a;
}

/** Un mes de club (fixture) ya guardado en este equipo, como jornada real configurada. */
const MES = JSON.stringify(armarMesCargado(HOY_TORNEO, 30));

test("arranque: sin configurar y sin operador, corre con `auth: {}` (definir el primer PIN), avisa y guarda, sin «Deshacer»", async () => {
  const m = memoria();
  const a = await real(m); // en blanco: configurado false, los dueños sin PIN
  assert.equal(a.estado().config.configurado, false);
  const duenio = a.estado().usuarios.find((u) => u.rol === "duenio")!;
  assert.equal(duenio.pin, "", "nadie tiene PIN");
  // ejecutar/aplicar siguen cortados sin operador, también sin configurar.
  assert.equal(a.ejecutar(() => ({ ok: true, mensaje: "no" })).ok, false);
  assert.throws(() => a.aplicar(() => null), /Entrá con tu PIN/);

  let recibio: unknown = "nada";
  const d = a.arranque((e, ahora) => {
    recibio = (e as unknown) === a.estado() && ahora === a.ahora();
    const r = M.definirPinInicial(e, duenio.id, "47", ahora);
    return r.ok ? { ok: true, mensaje: "PIN guardado" } : { ok: false, mensaje: r.motivo };
  });
  assert.deepEqual(d, { ok: true, mensaje: "PIN guardado" });
  assert.equal(recibio, true);
  assert.equal(a.estado().usuarios.find((u) => u.id === duenio.id)!.pin, "47");
  assert.deepEqual(a.aviso(), { id: a.aviso()!.id, ok: true, mensaje: "PIN guardado", deshacer: false });
  assert.equal(a.puedeDeshacer(), false);
  assert.equal(a.pendienteDeGuardar(), false, "se guardó (demora 0)");
  assert.match(m.datos.get(CLAVE)!, /"pin":"47"/);
  // Un error del motor: lo dice y no rompe.
  assert.equal(a.arranque((e, ahora) => { const r = M.definirPinInicial(e, duenio.id, "48", ahora); return { ok: r.ok, mensaje: r.ok ? "" : r.motivo }; }).ok, false);
  assert.equal(a.arranque(() => { throw new Error("x"); }).mensaje, "No se pudo hacer. Probá de nuevo.");

  // Con operador, `arranque` no: se usa `ejecutar`.
  a.cambiarOperador(a.estado().usuarios.find((u) => u.id === duenio.id)!, { usuarioId: duenio.id, pin: "47" });
  assert.equal(a.arranque(() => ({ ok: true, mensaje: "x" })).ok, false);
  assert.equal(a.ejecutar(() => ({ ok: true, mensaje: "ahora sí" })).ok, true);

  // Configurado: nunca corre.
  a.ejecutar((e) => ((e.config.configurado = true), { ok: true, mensaje: "configurado" }));
  a.cambiarOperador(null);
  let corrio = false;
  const r = a.arranque(() => ((corrio = true), { ok: true, mensaje: "" }));
  assert.deepEqual(r, { ok: false, mensaje: "El club ya está configurado: entrá con tu PIN." });
  assert.equal(corrio, false);
});

test("arranque: en la demo no corre", () => {
  const d = crearAlmacen({ hoy: HOY_TORNEO, clave: claveDeLaDemo(NEGOCIO, "u1"), almacenamiento: null });
  let corrio = false;
  assert.equal(d.arranque(() => ((corrio = true), { ok: true, mensaje: "" })).ok, false);
  assert.equal(corrio, false);
});

test("restaurar: sólo un dueño con PIN; copia lo de antes, reemplaza, apaga «Deshacer», guarda en el acto y revisa al operador", async () => {
  const m = memoria();
  m.datos.set(CLAVE, MES);
  const a = await real(m);
  // El respaldo a restaurar: el mismo mes con una marca, y el PIN del dueño 2 cambiado.
  const foto = JSON.parse(MES) as M.FotoEstado;
  foto.estado.log.unshift({ fecha: null, min: null, texto: "del respaldo" });
  foto.estado.usuarios.find((u) => u.id === "u-duenio-2")!.pin = "88";
  const texto = JSON.stringify(foto);

  assert.equal(a.restaurar(texto).ok, false, "sin operador ni auth: nadie");
  assert.deepEqual(a.restaurar(texto, { auth: { usuarioId: "u-recep-1", pin: "33" } }), { ok: false, causa: "permiso", motivo: "Restaurar lo hace un dueño." });
  assert.equal((a.restaurar("{roto", { auth: DUENIO }) as { causa?: string }).causa, "danado");
  assert.equal((a.restaurar({ v: 99 }, { auth: DUENIO }) as { causa?: string }).causa, "danado");

  // Opera el dueño 2 (PIN 22) y hay algo para deshacer.
  const d2 = a.estado().usuarios.find((u) => u.id === "u-duenio-2")!;
  a.cambiarOperador(d2, { usuarioId: d2.id, pin: "22" });
  a.ejecutar((e) => (e.log.unshift({ fecha: null, min: null, texto: "antes" }), { ok: true, mensaje: "x" }), { deshacible: true });
  assert.equal(a.puedeDeshacer(), true);
  const lo = m.datos.get(CLAVE)!;
  let avisosOperador = 0;
  a.suscribirOperador(() => avisosOperador++);
  const r = a.restaurar(texto, { auth: DUENIO });
  assert.equal(r.ok, true, JSON.stringify(r));
  if (!r.ok) return;
  assert.match(r.copia, /^gsg-club:demo-club:jornada:v1:antes-de-restaurar:\d+$/);
  assert.ok(m.datos.get(r.copia)!.includes('"texto":"antes"'), "la copia es lo de antes");
  assert.notEqual(m.datos.get(CLAVE), lo);
  assert.ok(m.datos.get(CLAVE)!.includes('"texto":"del respaldo"'), "lo restaurado quedó guardado en el acto");
  assert.ok(a.estado().log.some((l) => l.texto === "del respaldo"));
  assert.equal(a.puedeDeshacer(), false);
  assert.equal(a.operador(), null, "el dueño 2 cambió de PIN en el respaldo: queda sin operador");
  assert.equal(r.operador, null);
  assert.ok(avisosOperador >= 1);

  // Con el mismo usuario y PIN, sigue operando (con el usuario de lo restaurado).
  const d1 = a.estado().usuarios.find((u) => u.id === DUENIO.usuarioId)!;
  a.cambiarOperador(d1, DUENIO);
  const r2 = a.restaurar(texto);
  assert.equal(r2.ok, true);
  assert.equal(a.operador()!.usuario.id, DUENIO.usuarioId);
  assert.equal(a.operador()!.usuario, a.estado().usuarios.find((u) => u.id === DUENIO.usuarioId), "el usuario de lo restaurado");
});

test("restaurar: si no entra la copia de lo de antes, no restaura y lo dice", async () => {
  const m = memoria();
  m.datos.set(CLAVE, MES);
  // El equipo está lleno: la copia de lo de antes no entra.
  const lleno: AlmacenamientoLocal = { ...m, setItem: (k, v) => { if (k.includes(":antes-de-restaurar:")) throw new Error("QuotaExceededError"); m.setItem(k, v); } };
  const b = crearAlmacen({ reloj: "real", clave: CLAVE, almacenamiento: lleno, cerrojos: null, canal: null, temporizador, relojMs: () => new Date(2026, 9, 17, 19, 0).getTime(), demoraGuardadoMs: 0, enReposo: null, rol: "OWNER" });
  b.arrancar();
  await vaciar();
  const antes = b.estado();
  const r = b.restaurar(textoDeLaDemo(textoDelEstado(M.generarDemo(HOY_TORNEO)), HOY_TORNEO, 1), { auth: DUENIO });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.causa, "sin-lugar");
  assert.equal(b.estado(), antes);
  assert.equal(m.datos.get(CLAVE), MES, "lo guardado sigue igual");
});

test("el respaldo del archivo para archivar lleva `guardado` (ms), como el respaldo descargable", async () => {
  const m = memoria();
  m.datos.set(CLAVE, MES);
  const a = await real(m);
  const p = a.prepararArchivo({ auth: DUENIO });
  assert.ok("confirmar" in p);
  const archivo = JSON.parse(p.textoDelArchivo) as { respaldo: { guardado: number; v: number } };
  assert.equal(archivo.respaldo.v, 1);
  assert.equal(archivo.respaldo.guardado, new Date(2026, 9, 17, 19, 0).getTime());
  // Y sigue verificando (la huella del respaldo incluye `guardado`).
  assert.equal((await p.confirmar({ archivoElegido: p.textoDelArchivo })).ok, true);
});

test("bytes: no avisa en cada guardado; avisa al cruzar la cuadrícula de 64 KB y al archivar o restaurar", async () => {
  const m = memoria();
  m.datos.set(CLAVE, MES);
  const a = await real(m);
  const d1 = a.estado().usuarios.find((u) => u.id === DUENIO.usuarioId)!;
  a.cambiarOperador(d1, DUENIO);
  let avisos = 0;
  a.suscribirGuardado(() => avisos++);
  // Toques chicos: cambian unos bytes y no avisan.
  for (let i = 0; i < 5; i++) a.ejecutar((e) => (e.log.unshift({ fecha: null, min: null, texto: `t${i}` }), { ok: true, mensaje: "" }));
  assert.equal(avisos, 0, "un guardado común no avisa");
  const b0 = a.estadoDelGuardado().bytes;
  // Algo grande (más de 64 KB): cruza la cuadrícula y avisa una vez.
  a.ejecutar((e) => (e.log.unshift({ fecha: null, min: null, texto: "x".repeat(CUADRICULA_DE_BYTES + 10) }), { ok: true, mensaje: "" }));
  assert.ok(a.estadoDelGuardado().bytes - b0 > CUADRICULA_DE_BYTES);
  assert.equal(avisos, 1);
  // Archivar avisa.
  const r = await a.archivarDiasCerrados({ auth: DUENIO, archivoElegido: (() => { const p = a.prepararArchivo({ auth: DUENIO }); return "confirmar" in p ? p.textoDelArchivo : ""; })() });
  assert.equal(r.ok, true);
  assert.ok(avisos >= 2, `archivar avisa (avisos: ${avisos})`);
  // Restaurar avisa.
  const n = avisos;
  assert.equal(a.restaurar(MES, { auth: DUENIO }).ok, true);
  assert.ok(avisos > n, "restaurar avisa");
});
