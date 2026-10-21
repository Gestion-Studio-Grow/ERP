// La jornada real enchufada a la base como la arma ClubDemo: el almacén REAL + `crearGuardadoEnLaBase` SIN espejo propio
// (el espejo es el del almacén) + una base falsa que se porta como las acciones (gzip, versión optimista) y un reloj a
// mano. Lo que se mira, por el plan gratis de Neon: que la base se toque sólo al abrir y al subir cambios (a lo sumo una
// subida cada 30 s mientras hay movimiento), que sin movimiento no se la despierte (el latido de 15 s no sube nada), y que en el equipo
// quede UNA copia del club (no dos de ~3 MB en el mismo localStorage).
import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { descomprimir, guardadoDelTexto } from "@/lib/club/foto";
import { claveDeLaJornada, crearAlmacen, LATIDO_MS, type AlmacenamientoLocal, type Temporizador } from "./almacen";
import type { RespuestaGuardarFoto, RespuestaLeerFoto } from "./estado-actions";
import { ESPERA_GUARDADO_MS, ESPERA_MAXIMA_GUARDADO_MS, crearGuardadoEnLaBase, type PuertaDeLaBase } from "./guardado-en-la-base";

const NEGOCIO = "club-prueba";
const T0 = new Date(2026, 9, 17, 19, 0).getTime();

function baseFalsa() {
  let foto: { texto: string; version: number } | null = null;
  const llamadas = { leer: 0, guardar: 0 };
  const puerta: PuertaDeLaBase = {
    async leer(): Promise<RespuestaLeerFoto> {
      llamadas.leer++;
      return { ok: true, foto: foto && { gzip: gzipSync(foto.texto).toString("base64"), version: foto.version, guardado: guardadoDelTexto(foto.texto), actualizada: new Date(T0).toISOString() } };
    },
    async guardar(datos: FormData): Promise<RespuestaGuardarFoto> {
      llamadas.guardar++;
      const version = Number(datos.get("version"));
      const actual = foto?.version ?? 0;
      if (version !== actual) return { ok: false, motivo: "conflicto", version: actual, error: "Otra terminal guardó." };
      foto = { texto: await descomprimir(datos.get("foto") as Blob), version: actual + 1 };
      return { ok: true, version: actual + 1 };
    },
  };
  return { puerta, llamadas, foto: () => foto };
}

function memoria(): AlmacenamientoLocal & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return { datos, getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, String(v)), removeItem: (k) => void datos.delete(k) };
}

/** Un reloj para los dos (el almacén y el adaptador): temporizadores y latido a mano. */
function relojManual() {
  let ahora = T0;
  /** Lo que todavía está en camino (la subida comprime en otro hilo): `avanzar` lo espera después de cada evento. */
  let ocupado = () => false;
  let n = 0;
  const una = new Map<number, { fn: () => void; a: number }>();
  const cada = new Map<number, { fn: () => void; ms: number; a: number }>();
  const temporizador: Temporizador = {
    despues(fn, ms) {
      const id = ++n;
      una.set(id, { fn, a: ahora + ms });
      return () => void una.delete(id);
    },
    cada(fn, ms) {
      const id = ++n;
      cada.set(id, { fn, ms, a: ahora + ms });
      return () => void cada.delete(id);
    },
  };
  const reposo = async () => {
    for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
  };
  return {
    temporizador,
    reloj: () => ahora,
    programar: (fn: () => void, ms: number) => temporizador.despues(fn, ms),
    cancelar: (cancelar: unknown) => (cancelar as () => void)(),
    reposo,
    /** Avanza el reloj de a un evento, corriendo lo que vence y dejando terminar el gzip y la base. */
    async avanzar(ms: number) {
      const fin = ahora + ms;
      for (;;) {
        const proximo = [...[...una].map(([id, x]) => ({ id, a: x.a, cada: false })), ...[...cada].map(([id, x]) => ({ id, a: x.a, cada: true }))]
          .filter((x) => x.a <= fin)
          .sort((x, y) => x.a - y.a)[0];
        if (!proximo) break;
        ahora = Math.max(ahora, proximo.a);
        if (proximo.cada) {
          const c = cada.get(proximo.id)!;
          c.a += c.ms;
          c.fn();
        } else {
          const u = una.get(proximo.id)!;
          una.delete(proximo.id);
          u.fn();
        }
        await reposo();
        // El gzip corre en otro hilo: se espera de verdad a que la subida termine (con la máquina cargada tarda).
        const tope = Date.now() + 10_000;
        do {
          await new Promise((r) => setTimeout(r, 5));
          await reposo();
        } while (ocupado() && Date.now() < tope);
      }
      ahora = fin;
    },
    esperarA(fn: () => boolean) {
      ocupado = fn;
    },
  };
}

async function abrir(base = baseFalsa()) {
  const m = memoria();
  const r = relojManual();
  const enLaBase = crearGuardadoEnLaBase({ negocio: NEGOCIO, base: base.puerta, espejo: null, reloj: r.reloj, programar: r.programar, cancelar: r.cancelar });
  const a = crearAlmacen({
    reloj: "real",
    clave: claveDeLaJornada(NEGOCIO),
    almacenamiento: m,
    guardado: enLaBase,
    cerrojos: null,
    canal: null,
    temporizador: r.temporizador,
    relojMs: r.reloj,
    demoraGuardadoMs: 0,
    enReposo: null,
    rol: "OWNER",
  });
  r.esperarA(() => enLaBase.estado().subiendo);
  a.arrancar();
  await r.avanzar(0);
  await new Promise((s) => setTimeout(s, 20));
  await r.reposo();
  return { a, base, m, r, enLaBase };
}

const operarComoDuenio = (a: Awaited<ReturnType<typeof abrir>>["a"]) => {
  const u = a.estado().usuarios.find((x) => x.rol === "duenio")!;
  a.cambiarOperador(u, { usuarioId: u.id });
};
const tocar = (a: Awaited<ReturnType<typeof abrir>>["a"], fondo: number) =>
  a.ejecutar((e) => {
    e.caja.fondo = fondo;
    return { ok: true, mensaje: "" };
  });

test("abrir lee la base UNA vez; con movimiento sube a lo sumo una vez cada 30 s (nunca antes); en el equipo queda una sola copia", async () => {
  const { a, base, m, r } = await abrir();
  assert.equal(base.llamadas.leer, 1);
  await r.avanzar(ESPERA_GUARDADO_MS + 1000);
  const tras = base.llamadas.guardar;
  operarComoDuenio(a);
  tocar(a, 111);
  await r.avanzar(ESPERA_GUARDADO_MS - 1000);
  assert.equal(base.llamadas.guardar, tras, "antes de los 30 s no sube");
  // El almacén manda un guardado a la vez y espera la respuesta: lo que se toca mientras tanto sale en la subida
  // siguiente. Por eso la espera cuenta desde el PRIMER cambio sin subir, no desde el último (medido acá).
  tocar(a, 222);
  await r.avanzar(2000);
  assert.equal(base.llamadas.guardar, tras + 1, "a los 30 s del primer cambio, una subida");
  await r.avanzar(ESPERA_GUARDADO_MS + 1000);
  assert.equal(base.llamadas.guardar, tras + 2, "lo tocado en el medio, 30 s después");
  assert.equal((JSON.parse(base.foto()!.texto) as { estado: { caja: { fondo: number } } }).estado.caja.fondo, 222);
  // El adaptador no tiene espejo propio: en el equipo nunca hay dos copias del club.
  assert.deepEqual([...m.datos.keys()].filter((k) => k.includes(":real:v1")), []);
  assert.ok([...m.datos.values()].filter((v) => v.length > 1000).length <= 1);
});

test("salir con algo sin subir: el almacén deja SU copia en el equipo (una sola) y la subida sale en el acto", async () => {
  const { a, base, m, r, enLaBase } = await abrir();
  await r.avanzar(ESPERA_GUARDADO_MS + 1000);
  operarComoDuenio(a);
  const oyentes = new Map<string, () => void>();
  enLaBase.engancharSalida({ addEventListener: (t, fn) => void oyentes.set(t, fn), removeEventListener: (t) => void oyentes.delete(t), oculta: () => true });
  const tras = base.llamadas.guardar;
  tocar(a, 99);
  // Lo que hace el navegador al salir: primero el almacén (sincrónico, su copia), después el adaptador (la subida).
  a.guardarYa();
  oyentes.get("pagehide")!();
  await new Promise((s) => setTimeout(s, 30));
  await r.reposo();
  assert.equal(base.llamadas.guardar, tras + 1, "subió sin esperar los 30 s");
  const copias = [...m.datos.entries()].filter(([, v]) => v.length > 1000);
  assert.equal(copias.length, 1, "una sola copia del club en el equipo");
  assert.equal(copias[0][0], claveDeLaJornada(NEGOCIO));
});

test("con cambios sin pausa sube igual a los 2 minutos (tope)", async () => {
  const { a, base, r } = await abrir();
  await r.avanzar(ESPERA_GUARDADO_MS + 1000);
  operarComoDuenio(a);
  const tras = base.llamadas.guardar;
  for (let s = 0; s < ESPERA_MAXIMA_GUARDADO_MS / 10_000 + 1; s++) {
    tocar(a, s + 1);
    await r.avanzar(10_000);
  }
  assert.ok(base.llamadas.guardar > tras, "la racha de cobros igual se guarda");
});

/** Hasta que no quede nada subiendo ni pendiente (el gzip corre en otro hilo: con la máquina cargada tarda). */
async function quieto(enLaBase: Awaited<ReturnType<typeof abrir>>["enLaBase"], r: Awaited<ReturnType<typeof abrir>>["r"]) {
  const fin = Date.now() + 10_000;
  while (Date.now() < fin) {
    const e = enLaBase.estado();
    if (!e.subiendo && !e.pendiente) return;
    await new Promise((s) => setTimeout(s, 10));
    await r.reposo();
  }
  assert.fail("la subida no terminó");
}

test("sin movimiento, la base duerme: 1 hora de latidos (15 s) no lee ni guarda nada", async () => {
  const { a, base, r, enLaBase } = await abrir();
  await r.avanzar(ESPERA_GUARDADO_MS + 1000);
  operarComoDuenio(a);
  tocar(a, 5);
  await r.avanzar(ESPERA_GUARDADO_MS + 1000);
  await quieto(enLaBase, r);
  const antes = { ...base.llamadas };
  await r.avanzar(60 * 60 * 1000);
  assert.ok(LATIDO_MS <= 15_000);
  assert.deepEqual(base.llamadas, antes, "el latido mueve la hora de la pantalla, no la base");
});

test("al ocultar la pestaña lo pendiente sube en el acto, sin esperar los 30 s", async () => {
  const { a, base, r, enLaBase } = await abrir();
  await r.avanzar(ESPERA_GUARDADO_MS + 1000);
  operarComoDuenio(a);
  const oyentes = new Map<string, () => void>();
  let oculta = false;
  enLaBase.engancharSalida({ addEventListener: (t, fn) => void oyentes.set(t, fn), removeEventListener: (t) => void oyentes.delete(t), oculta: () => oculta });
  const tras = base.llamadas.guardar;
  tocar(a, 77);
  await r.reposo();
  oculta = true;
  oyentes.get("visibilitychange")!();
  await new Promise((s) => setTimeout(s, 30));
  await r.reposo();
  assert.equal(base.llamadas.guardar, tras + 1);
});

test("dos puestos sobre la misma base: después de chocar, el puesto sigue guardando (no pierde cambios en silencio) y lo que no llegó queda aparte (regresión 21/10)", async () => {
  const A = await abrir();
  const B = await abrir(A.base);
  await A.r.avanzar(ESPERA_GUARDADO_MS + 1000);
  await B.r.avanzar(ESPERA_GUARDADO_MS + 1000);
  operarComoDuenio(A.a);
  operarComoDuenio(B.a);
  const fondo = () => (JSON.parse(A.base.foto()!.texto) as { estado: { caja: { fondo: number } } }).estado.caja.fondo;
  // A guarda primero.
  tocar(A.a, 111);
  await A.r.avanzar(ESPERA_GUARDADO_MS + 1000);
  await quieto(A.enLaBase, A.r);
  assert.equal(fondo(), 111);
  // B, armado sobre la versión vieja, choca: se recarga lo de A y lo suyo queda aparte.
  tocar(B.a, 222);
  await B.r.avanzar(ESPERA_GUARDADO_MS + 1000);
  await quieto(B.enLaBase, B.r);
  await B.r.avanzar(1000);
  assert.equal(fondo(), 111, "lo de A no se pisa");
  assert.equal(B.a.estado().caja.fondo, 111, "B ve lo último guardado");
  assert.equal(B.enLaBase.estado().conflicto, false, "el choque se cierra al recargar");
  assert.ok(B.a.apartes().some((x) => /"fondo":222/.test(x.texto)), "lo de B que no llegó quedó aparte");
  // Y B sigue trabajando: 333 y 444 LLEGAN a la base (antes quedaban clavados hasta F5).
  tocar(B.a, 333);
  await B.r.avanzar(ESPERA_GUARDADO_MS + 1000);
  await quieto(B.enLaBase, B.r);
  assert.equal(fondo(), 333);
  tocar(B.a, 444);
  await B.r.avanzar(ESPERA_GUARDADO_MS + 1000);
  await quieto(B.enLaBase, B.r);
  assert.equal(fondo(), 444);
  assert.equal(B.a.estado().caja.fondo, 444);
});
