// El adaptador «guardado en la base» del almacén del club (BP-3), SIN base ni navegador: una base falsa que se porta
// como las acciones (gzip de ida y vuelta, versión optimista), un localStorage falso y un reloj manual.
//   · cadencia: 30 s después del último cambio, tope de 2 min con cambios sin pausa, en el acto al ocultar/salir;
//   · varias llamadas en la misma ventana = UNA subida, y todas reciben su resultado;
//   · espejo en `gsg-club:<slug>:real:v1` al instante, marcado «subido» cuando la base contesta;
//   · conflicto (otra terminal guardó): no se pisa nada y no se sigue subiendo;
//   · la base no responde: se reintenta; al abrir, se reconcilia por `guardado` (ms);
//   · un almacén falso que respeta el contrato `{ leer(), guardar(texto, version) }` trabaja de punta a punta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import * as M from "@/lib/club/motor.mjs";
import { descomprimir, guardadoDelTexto } from "@/lib/club/foto";
import { clavesDelEspejo, crearGuardadoEnLaBase, type GuardadoDelClub, type ObjetivoDeSalida, type PuertaDeLaBase } from "./guardado-en-la-base";
import type { RespuestaGuardarFoto, RespuestaLeerFoto, RespuestaLeerVersion } from "./estado-actions";

const SLUG = "club-prueba";
const CLAVES = clavesDelEspejo(SLUG);
const T0 = Date.UTC(2026, 9, 17, 20);

/** El texto del almacén (`textoDelEstado`): el sobre v1 sin `guardado`. */
function textoDelClub(marca: number): string {
  const e = M.crearClubReal("2026-10-17");
  e.caja.fondo = marca; // para distinguir una foto de otra
  return JSON.stringify({ v: 1, estado: e, secuencia: M.secuenciaIds() });
}
const fondoDe = (texto: string) => (JSON.parse(texto) as { estado: { caja: { fondo: number } } }).estado.caja.fondo;

/** La base: lo que hacen `leerFotoDelClub` y `guardarFotoDelClub`, en memoria. */
function baseFalsa() {
  let foto: { texto: string; version: number } | null = null;
  const subidas: { version: number; fondo: number }[] = [];
  let caida = false;
  let falla = false;
  let preguntas = 0;
  const puerta: PuertaDeLaBase = {
    async leerVersion(): Promise<RespuestaLeerVersion> {
      preguntas++;
      if (caida) throw new Error("sin red");
      return { ok: true, version: foto?.version ?? 0 };
    },
    async leer(): Promise<RespuestaLeerFoto> {
      if (caida) throw new Error("sin red");
      return { ok: true, foto: foto && { gzip: gzipSync(foto.texto).toString("base64"), version: foto.version, guardado: guardadoDelTexto(foto.texto), actualizada: new Date(T0).toISOString() } };
    },
    async guardar(datos: FormData): Promise<RespuestaGuardarFoto> {
      if (caida) throw new Error("sin red");
      if (falla) return { ok: false, motivo: "error", error: "La base no anduvo." };
      const version = Number(datos.get("version"));
      const texto = await descomprimir(datos.get("foto") as Blob);
      const actual = foto?.version ?? 0;
      if (version !== actual) return { ok: false, motivo: "conflicto", version: actual, error: "Otra terminal guardó." };
      foto = { texto, version: actual + 1 };
      subidas.push({ version: actual + 1, fondo: fondoDe(texto) });
      return { ok: true, version: actual + 1 };
    },
  };
  return {
    puerta,
    subidas,
    foto: () => foto,
    /** Otra terminal guarda directo. */
    otraTerminal(texto: string, ms: number) {
      foto = { texto: `${texto.slice(0, -1)},"guardado":${ms}}`, version: (foto?.version ?? 0) + 1 };
    },
    preguntas: () => preguntas,
    caer: (si: boolean) => void (caida = si),
    fallar: (si: boolean) => void (falla = si),
  };
}

function espejoFalso() {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

/** Reloj y temporizadores a mano. */
function relojManual() {
  let ahora = T0;
  let n = 0;
  const pendientes = new Map<number, { fn: () => void; a: number }>();
  return {
    reloj: () => ahora,
    programar: (fn: () => void, ms: number) => {
      const id = ++n;
      pendientes.set(id, { fn, a: ahora + ms });
      return id;
    },
    cancelar: (id: unknown) => void pendientes.delete(id as number),
    /** Avanza el reloj, corre lo que venció y deja terminar lo asincrónico (gzip, la base). */
    async avanzar(ms: number) {
      const hasta = ahora + ms;
      for (;;) {
        const [id, p] = [...pendientes].filter(([, x]) => x.a <= hasta).sort((x, y) => x[1].a - y[1].a)[0] ?? [];
        if (!p) break;
        ahora = Math.max(ahora, p.a);
        pendientes.delete(id!);
        p.fn();
        await reposo();
      }
      ahora = hasta;
      await reposo();
    },
    programados: () => pendientes.size,
  };
}

/** Las subidas en curso de este test (para esperar a que terminen: el gzip es asincrónico de verdad). */
const ocupados = new Set<() => boolean>();
async function reposo() {
  for (let i = 0; i < 30 || ([...ocupados].some((f) => f()) && i < 5000); i++) await new Promise((r) => setImmediate(r));
}

/** Espera a que se cumpla `listo` (la subida comprime en otro hilo: con la máquina cargada, 30 vueltas no alcanzan). */
async function hasta(listo: () => boolean, ms = 5000) {
  const fin = Date.now() + ms;
  while (!listo() && Date.now() < fin) await new Promise((r) => setTimeout(r, 5));
}

function armar(opciones: { base?: ReturnType<typeof baseFalsa>; espejo?: ReturnType<typeof espejoFalso> } = {}) {
  const base = opciones.base ?? baseFalsa();
  const espejo = opciones.espejo ?? espejoFalso();
  const r = relojManual();
  const g = crearGuardadoEnLaBase({ negocio: SLUG, base: base.puerta, espejo, reloj: r.reloj, programar: r.programar, cancelar: r.cancelar });
  ocupados.add(() => g.estado().subiendo);
  return { base, espejo, r, g };
}

const meta = (espejo: ReturnType<typeof espejoFalso>) => JSON.parse(espejo.m.get(CLAVES.meta) ?? "null") as { version: number; guardado: number; subido: boolean } | null;

test("las claves del espejo van por negocio y en modo real; sin negocio no hay clave «de todos»", () => {
  assert.deepEqual(CLAVES, { foto: "gsg-club:club-prueba:real:v1", meta: "gsg-club:club-prueba:real:v1:meta", descartada: "gsg-club:club-prueba:real:v1:descartada" });
  assert.throws(() => clavesDelEspejo("  "));
});

test("cadencia: el espejo se escribe en el acto; la base, 30 s después del ÚLTIMO cambio, en UNA subida para todos", async () => {
  const { base, espejo, r, g } = armar();
  assert.equal(await g.leer(), null, "club nuevo: no hay nada guardado");
  const resultados: unknown[] = [];
  for (const fondo of [100, 200, 300]) {
    void g.guardar(textoDelClub(fondo), 0).then((x) => resultados.push(x));
    // El espejo ya tiene lo último, con su `guardado`, y todavía no subió.
    assert.equal(fondoDe(espejo.m.get(CLAVES.foto)!), fondo);
    assert.equal(guardadoDelTexto(espejo.m.get(CLAVES.foto)!), r.reloj());
    assert.equal(meta(espejo)?.subido, false);
    await r.avanzar(20_000);
  }
  assert.equal(base.subidas.length, 0, "cada cambio corre la espera: todavía no subió");
  await r.avanzar(10_000);
  assert.deepEqual(base.subidas, [{ version: 1, fondo: 300 }], "una sola subida, con lo último");
  assert.deepEqual(resultados, [{ ok: true, version: 1 }, { ok: true, version: 1 }, { ok: true, version: 1 }]);
  assert.deepEqual(meta(espejo), { version: 1, guardado: T0 + 40_000, subido: true });
  assert.equal(g.estado().pendiente, false);
  assert.equal(g.estado().ultimaSubida, T0 + 70_000);
});

test("cadencia: con cambios sin pausa, igual sube a los 2 minutos del primero", async () => {
  const { base, r, g } = armar();
  await g.leer();
  for (let i = 0; i < 12; i++) {
    void g.guardar(textoDelClub(i), 0);
    await r.avanzar(15_000);
  }
  // 12 cambios cada 15 s (nunca 30 s de pausa): la primera subida sale a los 120 s del primero.
  assert.equal(base.subidas.length, 1);
  assert.equal(base.subidas[0].fondo, 7, "lo último que había a los 120 s (el cambio 8 cae justo después)");
});

test("lo que cambia durante una subida sale en la siguiente, con la versión nueva (el almacén puede mandar la vieja)", async () => {
  const { base, r, g, espejo } = armar();
  await g.leer();
  const p1 = g.guardar(textoDelClub(1), 0);
  await r.avanzar(30_000);
  // La subida terminó; el almacén todavía no se enteró de la versión 1 y manda 0.
  assert.deepEqual(await p1, { ok: true, version: 1 });
  const p2 = g.guardar(textoDelClub(2), 0);
  await r.avanzar(30_000);
  assert.deepEqual(await p2, { ok: true, version: 2 });
  assert.deepEqual(base.subidas.map((s) => s.version), [1, 2]);
  assert.equal(meta(espejo)?.version, 2);
});

test("al ocultar la pestaña o salir, sube en el acto", async () => {
  const { base, g } = armar();
  await g.leer();
  const oyentes = new Map<string, () => void>();
  let oculta = false;
  const objetivo: ObjetivoDeSalida = { addEventListener: (t, fn) => oyentes.set(t, fn), removeEventListener: (t) => oyentes.delete(t), oculta: () => oculta };
  const soltar = g.engancharSalida(objetivo);
  void g.guardar(textoDelClub(7), 0);
  oyentes.get("visibilitychange")!(); // visible: no hace nada
  await reposo();
  assert.equal(base.subidas.length, 0);
  oculta = true;
  oyentes.get("visibilitychange")!();
  await hasta(() => base.subidas.length >= 1);
  assert.deepEqual(base.subidas, [{ version: 1, fondo: 7 }]);
  void g.guardar(textoDelClub(8), 1);
  oyentes.get("pagehide")!();
  await hasta(() => base.subidas.length >= 2);
  assert.equal(base.subidas.length, 2);
  soltar();
  assert.equal(oyentes.size, 0);
  // Sin navegador (Node), engancharSalida no hace nada y no rompe.
  assert.equal(typeof g.engancharSalida(null), "function");
});

test("conflicto: otra terminal guardó; no se pisa, se avisa con la versión de la base y no se sigue subiendo", async () => {
  const { base, r, g, espejo } = armar();
  await g.leer();
  base.otraTerminal(textoDelClub(999), T0);
  const p = g.guardar(textoDelClub(1), 0);
  await r.avanzar(30_000);
  assert.deepEqual(await p, { ok: false, motivo: "conflicto", version: 1 });
  assert.equal(fondoDe(base.foto()!.texto), 999, "lo de la otra terminal quedó");
  assert.equal(g.estado().conflicto, true);
  assert.deepEqual(await g.guardar(textoDelClub(2), 1), { ok: false, motivo: "conflicto", version: 0 });
  await r.avanzar(60_000);
  assert.equal(base.subidas.length, 0);
  assert.equal(fondoDe(espejo.m.get(CLAVES.foto)!), 1, "lo de este equipo sigue en el espejo");
});

test("la base no responde: el trabajo queda en el espejo y se reintenta solo hasta que sube", async () => {
  const { base, r, g, espejo } = armar();
  await g.leer();
  base.caer(true);
  const p = g.guardar(textoDelClub(5), 0);
  await r.avanzar(30_000);
  assert.deepEqual(await p, { ok: false, motivo: "error" });
  assert.equal(g.estado().error, "No hubo respuesta de la base.");
  assert.equal(meta(espejo)?.subido, false);
  base.caer(false);
  await r.avanzar(30_000);
  assert.deepEqual(base.subidas, [{ version: 1, fondo: 5 }]);
  assert.equal(meta(espejo)?.subido, true);
  assert.equal(g.estado().error, null);
});

test("al abrir: la base no responde → se sigue con el espejo; sin espejo, leer FALLA (no arranca un club vacío)", async () => {
  const espejo = espejoFalso();
  const base = baseFalsa();
  const a = armar({ base, espejo });
  await a.g.leer();
  void a.g.guardar(textoDelClub(41), 0);
  // Se cortó todo antes de subir. Al volver a abrir, la base no responde:
  base.caer(true);
  const b = armar({ base, espejo });
  const leido = await b.g.leer();
  assert.equal(fondoDe(leido!.texto), 41);
  assert.equal(leido!.version, 0);
  assert.equal(b.g.estado().origen, "espejo");
  // Vuelve la red y se guarda algo: sube lo nuevo encima de la versión que tenía.
  base.caer(false);
  void b.g.guardar(textoDelClub(42), leido!.version);
  await b.r.avanzar(30_000);
  assert.deepEqual(base.subidas, [{ version: 1, fondo: 42 }]);

  base.caer(true);
  await assert.rejects(armar({ base }).g.leer(), /No se pudo abrir el club/);
});

test("al abrir: el espejo con trabajo sin subir y más nuevo que la base gana y sube enseguida", async () => {
  const espejo = espejoFalso();
  const base = baseFalsa();
  const a = armar({ base, espejo });
  await a.g.leer();
  void a.g.guardar(textoDelClub(1), 0);
  await a.r.avanzar(30_000); // versión 1 en la base
  void a.g.guardar(textoDelClub(2), 1); // y se cerró la pestaña antes de los 30 s
  const b = armar({ base, espejo });
  const leido = await b.g.leer();
  assert.equal(fondoDe(leido!.texto), 2);
  assert.equal(leido!.version, 1);
  await b.r.avanzar(0);
  assert.deepEqual(base.subidas.map((s) => [s.version, s.fondo]), [[1, 1], [2, 2]]);
  assert.equal(meta(espejo)?.subido, true);
});

test("al abrir: si la base avanzó desde otra terminal, gana la base y lo de este equipo se aparta (no se borra)", async () => {
  const espejo = espejoFalso();
  const base = baseFalsa();
  const a = armar({ base, espejo });
  await a.g.leer();
  void a.g.guardar(textoDelClub(1), 0);
  await a.r.avanzar(30_000);
  void a.g.guardar(textoDelClub(2), 1); // sin subir
  base.otraTerminal(textoDelClub(77), T0 - 1); // otra terminal guardó la versión 2 (con un reloj atrasado)
  const b = armar({ base, espejo });
  const leido = await b.g.leer();
  assert.equal(fondoDe(leido!.texto), 77);
  assert.equal(leido!.version, 2);
  assert.equal(b.g.estado().apartado, true);
  assert.equal(fondoDe(espejo.m.get(CLAVES.descartada)!), 2);
  assert.equal(fondoDe(espejo.m.get(CLAVES.foto)!), 77, "el espejo pasa a ser lo de la base");
  assert.deepEqual(meta(espejo), { version: 2, guardado: T0 - 1, subido: true });
});

test("un almacén falso con el contrato { leer(), guardar(texto, version) } trabaja de punta a punta", async () => {
  const { base, r, g } = armar();
  /** Lo mínimo que hará `crearAlmacen({ reloj: "real", guardado })`: leer al abrir y guardar el texto con su versión. */
  async function almacenFalso(guardado: GuardadoDelClub) {
    const abierto = await guardado.leer();
    let texto = abierto?.texto ?? textoDelClub(0);
    let version = abierto?.version ?? 0;
    return {
      texto: () => texto,
      async cambiar(fondo: number) {
        texto = textoDelClub(fondo);
        const res = await guardado.guardar(texto, version);
        if (res.ok) version = res.version;
        return res;
      },
      version: () => version,
    };
  }
  const al = await almacenFalso(g);
  const p = al.cambiar(10);
  await r.avanzar(30_000);
  assert.deepEqual(await p, { ok: true, version: 1 });
  const q = al.cambiar(20);
  await r.avanzar(30_000);
  assert.deepEqual(await q, { ok: true, version: 2 });
  // Se vuelve a abrir en otro equipo (espejo vacío): lee lo de la base.
  const otro = armar({ base });
  const al2 = await almacenFalso(otro.g);
  assert.equal(fondoDe(al2.texto()), 20);
  assert.equal(al2.version(), 2);
  assert.equal(otro.g.estado().origen, "base");
});

test("dos puestos: `leerVersion` pregunta sólo la versión (sin la foto) y sin internet devuelve null, sin tirar", async () => {
  const { base, g } = armar();
  assert.equal(await g.leerVersion!(), 0, "nunca se guardó");
  base.otraTerminal(textoDelClub(5), T0);
  assert.equal(await g.leerVersion!(), 1);
  base.caer(true);
  assert.equal(await g.leerVersion!(), null);
  assert.equal(base.preguntas(), 3);
  // Sin la puerta del latido, el adaptador no ofrece latir (el almacén no pregunta).
  const sinLatido = crearGuardadoEnLaBase({ negocio: SLUG, base: { leer: base.puerta.leer, guardar: base.puerta.guardar }, espejo: null });
  assert.equal(sinLatido.leerVersion, undefined);
});

test("dos puestos: `subirYa` sube en el acto lo que promete (sin esperar los 30 s) y el guardado recibe el ok de la base", async () => {
  const { base, g } = armar();
  await g.leer();
  const p = g.guardar(textoDelClub(21), 0);
  assert.equal(base.subidas.length, 0, "todavía no subió: espera los 30 s");
  await g.subirYa();
  assert.deepEqual(await p, { ok: true, version: 1 });
  assert.deepEqual(base.subidas, [{ version: 1, fondo: 21 }]);
});

test("dos puestos: si el latido vuelve a leer y la base avanzó, lo que esperaba subir (armado sobre la versión vieja) NO sube: pisaría lo del otro", async () => {
  const { base, g } = armar();
  await g.leer();
  const p = g.guardar(textoDelClub(31), 0);
  base.otraTerminal(textoDelClub(5), T0);
  await g.leer();
  assert.deepEqual(await p, { ok: false, motivo: "conflicto", version: 1 }, "quien lo esperaba se entera como de un choque (el almacén re-aplica lo suyo)");
  await g.subirYa();
  assert.deepEqual(base.subidas, [], "nada viejo subió encima");
  // Lo que el almacén manda después (re-aplicado sobre la versión 1) sube normal.
  const q = g.guardar(textoDelClub(32), 1);
  await g.subirYa();
  assert.deepEqual(await q, { ok: true, version: 2 });
});
