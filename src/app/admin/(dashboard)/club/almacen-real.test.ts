// El almacén real (Ola 0): reloj real con latido, cambio de día, una pestaña por equipo (Web Lock), el guardado
// asíncrono enchufable (orden, conflicto, error con reintento, espejo sincrónico al salir, nunca una versión vieja
// encima de una nueva), el registro recortado a 60 si falta lugar, el operador por su canal y las MEDICIONES.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import {
  claveDeLaDemo,
  claveDeLaJornada,
  candadoDeLaJornada,
  crearAlmacen,
  esperaDelReintento,
  operadorDeLaDemo,
  textoDeLaDemo,
  textoDelEstado,
  MINUTO_DEMO,
  REGISTRO_SI_FALTA_LUGAR,
  type AlmacenamientoLocal,
  type CerrojosDelNavegador,
  type GuardadoDelClub,
  type ResultadoDelGuardado,
  type Temporizador,
} from "./almacen";
import { armarAgenda, compartirAgenda } from "./agenda-core";
import { ejecutar as ejecutarCuenta } from "./cuenta-core";

const HOY = "2026-10-17"; // sábado: la demo cierra a la 01:00 (1500)
const vaciar = () => new Promise<void>((r) => setImmediate(r));
const NEGOCIO = "demo-club";

function memoria(): AlmacenamientoLocal & { datos: Map<string, string>; escrituras: number } {
  const datos = new Map<string, string>();
  const m = {
    datos,
    escrituras: 0,
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.escrituras++;
      datos.set(k, String(v));
    },
    removeItem: (k: string) => void datos.delete(k),
  };
  return m;
}

/** Un reloj que se mueve a mano (hora LOCAL de este equipo). */
function relojDe(d: Date) {
  let ms = d.getTime();
  return { ms: () => ms, poner: (x: Date) => void (ms = x.getTime()) };
}
const a = (dia: number, h: number, m: number, s = 0) => new Date(2026, 9, dia, h, m, s);

/** Temporizadores a mano: el latido se dispara con `latir`, las esperas con `correr`. */
function temporizadorFalso(): Temporizador & { latidos: (() => void)[]; esperas: { fn: () => void; ms: number; viva: boolean }[]; correr: () => void } {
  const t = {
    latidos: [] as (() => void)[],
    esperas: [] as { fn: () => void; ms: number; viva: boolean }[],
    despues(fn: () => void, ms: number) {
      const e = { fn, ms, viva: true };
      t.esperas.push(e);
      return () => void (e.viva = false);
    },
    cada(fn: () => void) {
      t.latidos.push(fn);
      return () => void t.latidos.splice(t.latidos.indexOf(fn), 1);
    },
    correr() {
      for (const e of t.esperas.splice(0)) if (e.viva) e.fn();
    },
  };
  return t;
}

/** Web Locks de mentira, compartidos por las «pestañas» de un mismo equipo: `ifAvailable` y `steal` como el navegador. */
function cerrojosFalsos(): CerrojosDelNavegador & { tomados: Map<string, unknown>; pedidos: number } {
  const tomados = new Map<string, { rechazar: (e: Error) => void }>();
  const c = {
    tomados: tomados as Map<string, unknown>,
    pedidos: 0,
    request(nombre: string, op: { ifAvailable?: boolean; steal?: boolean }, alTomar: (lock: unknown) => unknown) {
      c.pedidos++;
      return new Promise<unknown>((resolver, rechazar) => {
        const actual = tomados.get(nombre);
        if (actual && op.ifAvailable) return void Promise.resolve(alTomar(null)).then(resolver, rechazar);
        if (actual && op.steal) {
          tomados.delete(nombre);
          actual.rechazar(Object.assign(new Error("robado"), { name: "AbortError" }));
        }
        const entrada = { rechazar };
        tomados.set(nombre, entrada);
        Promise.resolve(alTomar({ name: nombre })).then(
          (v) => {
            if (tomados.get(nombre) === entrada) tomados.delete(nombre);
            resolver(v);
          },
          rechazar,
        );
      });
    },
  };
  return c;
}

/** Un guardado asíncrono de mentira (la base de BP-3): cada `guardar` queda esperando hasta `completar`. */
interface GuardadoFalso extends GuardadoDelClub {
  guardado: { texto: string; version: number } | null;
  llamadas: { texto: string; esperada: number; resolver: (r: ResultadoDelGuardado) => void; hecha: boolean }[];
  lecturas: number;
  completar(i: number, forzado?: ResultadoDelGuardado): void;
}
function guardadoFalso(): GuardadoFalso {
  const f: GuardadoFalso = {
    guardado: null as { texto: string; version: number } | null,
    llamadas: [] as { texto: string; esperada: number; resolver: (r: ResultadoDelGuardado) => void; hecha: boolean }[],
    lecturas: 0,
    async leer() {
      f.lecturas++;
      return f.guardado;
    },
    guardar(texto: string, esperada: number) {
      return new Promise<ResultadoDelGuardado>((resolver) => f.llamadas.push({ texto, esperada, resolver, hecha: false }));
    },
    /** Resuelve la llamada i con la regla de la versión (o con lo que se le diga). */
    completar(i: number, forzado?: ResultadoDelGuardado) {
      const l = f.llamadas[i];
      l.hecha = true;
      if (forzado) return l.resolver(forzado);
      const actual = f.guardado?.version ?? 0;
      if (actual !== l.esperada) return l.resolver({ ok: false, motivo: "conflicto", version: actual });
      f.guardado = { texto: l.texto, version: l.esperada + 1 };
      l.resolver({ ok: true, version: l.esperada + 1 });
    },
  };
  return f;
}

/** Deja una marca en el registro (lo que se busca después en lo guardado). */
const marcar = (texto: string) => (e: M.EstadoClub) => void e.log.unshift({ fecha: null, min: null, texto });
const tieneMarca = (textoGuardado: string | undefined, marca: string) => !!textoGuardado && textoGuardado.includes(JSON.stringify(marca));

function real(op: { m?: AlmacenamientoLocal | null; reloj?: ReturnType<typeof relojDe>; t?: Temporizador; cerrojos?: CerrojosDelNavegador | null; guardado?: GuardadoDelClub }) {
  return crearAlmacen({
    reloj: "real",
    clave: claveDeLaJornada(NEGOCIO),
    candado: candadoDeLaJornada(NEGOCIO),
    almacenamiento: op.m ?? null,
    guardado: op.guardado,
    cerrojos: op.cerrojos ?? null,
    temporizador: op.t ?? temporizadorFalso(),
    relojMs: (op.reloj ?? relojDe(a(17, 20, 0, 5))).ms,
    demoraGuardadoMs: 0,
    enReposo: null,
  });
}

/** Una jornada real ya guardada en este equipo: la demo del día (tiene turnos fijos los sábados). */
function jornadaGuardada(m: ReturnType<typeof memoria>) {
  const e = M.generarDemo(HOY, MINUTO_DEMO);
  m.datos.set(claveDeLaJornada(NEGOCIO), textoDeLaDemo(textoDelEstado(e), HOY, 1));
}

test("la demo sigue igual: reloj quieto a las 19:10, sin latido ni candado, y opera en el acto", async () => {
  const t = temporizadorFalso();
  const c = cerrojosFalsos();
  const d = crearAlmacen({ hoy: HOY, clave: claveDeLaDemo(NEGOCIO, "u1"), almacenamiento: null, temporizador: t, cerrojos: c });
  assert.equal(d.modo(), "demo");
  assert.deepEqual(d.ahora(), { fecha: HOY, min: MINUTO_DEMO });
  assert.deepEqual(d.estadoDelGuardado(), { jornada: "demo", guardado: "sin-almacenamiento", enEsteEquipo: true });
  const parar = d.arrancar();
  await vaciar();
  assert.equal(t.latidos.length, 0, "la demo no late");
  assert.equal(c.pedidos, 0, "la demo no pide el candado");
  const v = d.version();
  d.latir();
  assert.equal(d.version(), v);
  assert.equal(d.soloLectura(), false);
  parar();
});

test("reloj real: el latido sólo avisa si cambió el minuto; la madrugada sigue en el día que abrió", async () => {
  const reloj = relojDe(a(17, 20, 0, 5));
  const t = temporizadorFalso();
  const r = real({ reloj, t });
  r.arrancar();
  await vaciar();
  assert.equal(r.estadoDelGuardado().jornada, "sin-bloqueo", "sin Web Locks se opera igual");
  assert.deepEqual(r.ahora(), { fecha: HOY, min: 20 * 60 });
  let avisos = 0;
  r.suscribir(() => avisos++);
  const ahora = r.ahora();
  const v = r.version();
  reloj.poner(a(17, 20, 0, 50));
  t.latidos[0]();
  assert.equal(r.version(), v, "mismo minuto: nada");
  assert.equal(r.ahora(), ahora, "el mismo objeto");
  assert.equal(avisos, 0);
  reloj.poner(a(17, 20, 1, 0));
  t.latidos[0]();
  assert.deepEqual(r.ahora(), { fecha: HOY, min: 20 * 60 + 1 });
  assert.equal(r.version(), v + 1);
  assert.equal(avisos, 1);
  assert.equal(r.pendienteDeGuardar(), false, "el minuto no es un cambio del estado: no se guarda");
  // 00:30 del domingo: sigue siendo el sábado (la jornada en blanco trae el horario de Break Point: el sábado cierra a la 01:00).
  assert.equal(M.horarioDe(r.estado(), HOY).cierra, 25 * 60);
  reloj.poner(a(18, 0, 30));
  r.latir();
  assert.deepEqual(r.ahora(), { fecha: HOY, min: 1470 });
});

test("cambio de día: la agenda pasa al nuevo, baja los fijos a 6 días (como el vanilla) y lo avisa", async () => {
  const m = memoria();
  jornadaGuardada(m);
  const reloj = relojDe(a(17, 23, 50));
  const t = temporizadorFalso();
  const r = real({ m, reloj, t });
  r.arrancar();
  await vaciar();
  assert.equal(r.retomada(), true);
  const sabado = "2026-10-24";
  const fijosDelSabado = () => r.estado().reservas.filter((x) => x.fijoId && x.fecha === sabado).length;
  assert.equal(fijosDelSabado(), 0, "el sábado que viene todavía no está en la semana");
  reloj.poner(a(18, 0, 30));
  t.latidos[0]();
  assert.deepEqual(r.ahora(), { fecha: HOY, min: 1470 }, "00:30: sigue el sábado (cierra a la 01:00)");
  reloj.poner(a(18, 1, 0));
  t.latidos[0]();
  assert.deepEqual(r.ahora(), { fecha: "2026-10-18", min: 60 });
  assert.ok(fijosDelSabado() >= 2, "bajaron los fijos del sábado 24");
  assert.match(r.aviso()!.mensaje, /^Cambió el día: la agenda pasó al 18\/10\./);
  assert.equal(r.pendienteDeGuardar(), false, "y se guardó (demora 0)");
  assert.ok(tieneMarca(m.datos.get(claveDeLaJornada(NEGOCIO)), r.estado().reservas.find((x) => x.fijoId && x.fecha === sabado)!.id));
});

test("una pestaña por equipo: la segunda queda en sólo lectura; «Usar acá» la toma y trae lo último guardado", async () => {
  const m = memoria();
  const c = cerrojosFalsos();
  const A = real({ m, cerrojos: c });
  A.arrancar();
  await vaciar();
  assert.equal(A.estadoDelGuardado().jornada, "propia");
  assert.ok(c.tomados.has("gsg-club:demo-club:jornada"), "el candado lleva el negocio");
  const B = real({ m, cerrojos: c });
  B.arrancar();
  await vaciar();
  assert.equal(B.estadoDelGuardado().jornada, "otra-pestania");
  assert.equal(B.soloLectura(), true);
  const d = B.ejecutar(() => ({ ok: true, mensaje: "no debería" }));
  assert.equal(d.ok, false);
  assert.match(d.mensaje, /sólo para mirar.*«Usar acá»/);
  assert.throws(() => B.aplicar(marcar("B")));

  A.aplicar(marcar("lo hizo A"));
  assert.ok(tieneMarca(m.datos.get(claveDeLaJornada(NEGOCIO)), "lo hizo A"));
  const escriturasDeA = m.escrituras;
  B.usarAca();
  await vaciar();
  assert.equal(B.estadoDelGuardado().jornada, "propia");
  assert.equal(A.estadoDelGuardado().jornada, "otra-pestania", "a la otra se la sacaron");
  assert.equal(B.estado().log[0].texto, "lo hizo A", "B abrió lo último que guardó A");
  assert.equal(A.ejecutar(() => ({ ok: true, mensaje: "x" })).ok, false);
  A.guardarYa();
  assert.equal(m.escrituras, escriturasDeA, "la que perdió la jornada no escribe más");
  B.aplicar(marcar("ahora B"));
  assert.ok(tieneMarca(m.datos.get(claveDeLaJornada(NEGOCIO)), "ahora B"));
});

test("sin Web Locks (o si el navegador no deja usarlos) se sigue sin bloqueo; StrictMode no pide otro candado", async () => {
  const sinCerrojos = real({ m: memoria() });
  sinCerrojos.arrancar();
  await vaciar();
  assert.equal(sinCerrojos.estadoDelGuardado().jornada, "sin-bloqueo");
  assert.equal(sinCerrojos.soloLectura(), false);
  const rotos: CerrojosDelNavegador = { request: () => Promise.reject(Object.assign(new Error("inseguro"), { name: "SecurityError" })) };
  const conRotos = real({ m: memoria(), cerrojos: rotos });
  conRotos.arrancar();
  await vaciar();
  assert.equal(conRotos.estadoDelGuardado().jornada, "sin-bloqueo");

  // Montar, desmontar y volver a montar enseguida (StrictMode): un solo pedido y la jornada sigue siendo de ésta.
  const c = cerrojosFalsos();
  const t = temporizadorFalso();
  const r = real({ m: memoria(), cerrojos: c, t });
  const parar = r.arrancar();
  parar();
  const parar2 = r.arrancar();
  await vaciar();
  t.correr();
  assert.equal(c.pedidos, 1);
  assert.equal(r.estadoDelGuardado().jornada, "propia");
  parar2();
  t.correr();
  await vaciar();
  assert.equal(c.tomados.size, 0, "al irse de verdad, el candado se suelta");
});

test("guardado asíncrono: uno a la vez, siempre con lo último, y las versiones esperadas sólo suben", async () => {
  const f = guardadoFalso();
  const d = crearAlmacen({ hoy: HOY, clave: claveDeLaDemo(NEGOCIO, "u1"), almacenamiento: memoria(), guardado: f, demoraGuardadoMs: 0, enReposo: null, temporizador: temporizadorFalso() });
  d.arrancar();
  await vaciar();
  assert.equal(d.estadoDelGuardado().enEsteEquipo, false);
  d.aplicar(marcar("uno"));
  d.aplicar(marcar("dos"));
  d.aplicar(marcar("tres"));
  assert.equal(f.llamadas.length, 1, "mientras uno está en camino no sale otro");
  assert.ok(tieneMarca(f.llamadas[0].texto, "uno"));
  f.completar(0);
  await vaciar();
  assert.equal(f.llamadas.length, 2);
  assert.ok(tieneMarca(f.llamadas[1].texto, "tres"), "el siguiente lleva lo último");
  f.completar(1);
  await vaciar();
  assert.deepEqual(f.llamadas.map((l) => l.esperada), [0, 1]);
  assert.equal(f.guardado!.version, 2);
  assert.ok(tieneMarca(f.guardado!.texto, "tres"));
  assert.equal(d.pendienteDeGuardar(), false);
});

test("nunca se escribe una versión vieja encima de una nueva (100 acciones con respuestas desordenadas)", async () => {
  const f = guardadoFalso();
  const d = crearAlmacen({ hoy: HOY, clave: claveDeLaDemo(NEGOCIO, "u1"), almacenamiento: null, guardado: f, demoraGuardadoMs: 0, enReposo: null, temporizador: temporizadorFalso() });
  d.arrancar();
  await vaciar();
  let semilla = 7;
  const azar = () => (semilla = (semilla * 48271) % 2147483647) / 2147483647;
  const versiones: number[] = [];
  for (let i = 0; i < 100; i++) {
    d.aplicar(marcar(`acción ${i}`));
    if (azar() < 0.5) {
      const abierta = f.llamadas.findIndex((l) => !l.hecha);
      if (abierta >= 0) f.completar(abierta);
      await vaciar();
      if (f.guardado) versiones.push(f.guardado.version);
    }
  }
  for (let vueltas = 0; vueltas < 10; vueltas++) {
    const abierta = f.llamadas.findIndex((l) => !l.hecha);
    if (abierta < 0) break;
    f.completar(abierta);
    await vaciar();
  }
  assert.ok(versiones.every((v, i) => i === 0 || v >= versiones[i - 1]), "la versión guardada nunca baja");
  const esperadas = f.llamadas.map((l) => l.esperada);
  assert.ok(esperadas.every((v, i) => i === 0 || v > esperadas[i - 1]), "cada guardado espera una versión más nueva que el anterior");
  assert.ok(tieneMarca(f.guardado!.texto, "acción 99"), "lo último quedó guardado");
  assert.ok(f.llamadas.length < 100, `se agrupó: ${f.llamadas.length} guardados para 100 acciones`);
});

test("conflicto: otra pantalla guardó una versión más nueva → se avisa y se recarga lo guardado", async () => {
  const f = guardadoFalso();
  const d = crearAlmacen({ hoy: HOY, clave: claveDeLaDemo(NEGOCIO, "u1"), almacenamiento: null, guardado: f, demoraGuardadoMs: 0, enReposo: null, temporizador: temporizadorFalso() });
  d.arrancar();
  await vaciar();
  d.aplicar(marcar("mío"));
  f.completar(0);
  await vaciar();
  // Otra pantalla guarda la versión 2 con lo suyo.
  const otra = M.generarDemo(HOY, MINUTO_DEMO);
  otra.log.unshift({ fecha: null, min: null, texto: "de la otra pantalla" });
  f.guardado = { texto: textoDeLaDemo(textoDelEstado(otra), HOY, 2), version: 2 };
  d.aplicar(marcar("mío 2"));
  f.completar(1);
  await vaciar();
  assert.equal(d.estado().log[0].texto, "de la otra pantalla", "se cargó lo guardado");
  assert.match(d.aviso()!.mensaje, /^Otra pantalla guardó cambios más nuevos/);
  assert.equal(d.aviso()!.ok, false);
  d.aplicar(marcar("sigo"));
  assert.equal(f.llamadas.at(-1)!.esperada, 2, "sigue desde la versión que ganó");
  f.completar(f.llamadas.length - 1);
  await vaciar();
  assert.equal(f.guardado!.version, 3);
});

test("error: se reintenta con espera creciente, sin perder la última acción; la cinta dice «Sin guardar» y vuelve", async () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 9].map(esperaDelReintento), [1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  const f = guardadoFalso();
  const m = memoria();
  const t = temporizadorFalso();
  const clave = claveDeLaDemo(NEGOCIO, "u1");
  const d = crearAlmacen({ hoy: HOY, clave, almacenamiento: m, guardado: f, demoraGuardadoMs: 0, enReposo: null, temporizador: t });
  d.arrancar();
  await vaciar();
  let avisosCinta = 0;
  d.suscribirGuardado(() => avisosCinta++);
  d.aplicar(marcar("uno"));
  f.completar(0, { ok: false, motivo: "error" });
  await vaciar();
  assert.equal(d.estadoDelGuardado().guardado, "reintentando");
  assert.equal(avisosCinta, 1);
  assert.equal(t.esperas.at(-1)!.ms, 1000);
  assert.ok(tieneMarca(m.datos.get(clave), "uno"), "el espejo de este equipo lo tiene");
  assert.deepEqual(JSON.parse(m.datos.get(`${clave}:pendiente`)!), { base: 0, hasta: 0 });
  d.aplicar(marcar("dos"));
  assert.equal(f.llamadas.length, 1, "mientras se espera el reintento, no se apura otro");
  t.correr();
  await vaciar();
  assert.ok(tieneMarca(f.llamadas[1].texto, "dos"), "el reintento lleva lo último");
  f.completar(1, { ok: false, motivo: "error" });
  await vaciar();
  assert.equal(t.esperas.at(-1)!.ms, 2000);
  t.correr();
  await vaciar();
  f.completar(2);
  await vaciar();
  assert.equal(d.estadoDelGuardado().guardado, "guardado");
  assert.equal(avisosCinta, 2);
  assert.ok(tieneMarca(f.guardado!.texto, "dos"));
  assert.equal(m.datos.has(`${clave}:pendiente`), false, "el espejo quedó al día");
});

test("al salir con un guardado en camino: el espejo se escribe ya y, al volver, gana lo más nuevo", async () => {
  const clave = claveDeLaDemo(NEGOCIO, "u1");
  const salir = async () => {
    const m = memoria();
    const f = guardadoFalso();
    const d = crearAlmacen({ hoy: HOY, clave, almacenamiento: m, guardado: f, demoraGuardadoMs: 0, enReposo: null, temporizador: temporizadorFalso() });
    d.arrancar();
    await vaciar();
    d.aplicar(marcar("en camino"));
    d.aplicar(marcar("después"));
    d.guardarYa(); // pagehide: la promesa del guardado puede no llegar
    assert.ok(tieneMarca(m.datos.get(clave), "después"), "el espejo se escribió sincrónico");
    assert.deepEqual(JSON.parse(m.datos.get(`${clave}:pendiente`)!), { base: 0, hasta: 1 });
    return { m, enCamino: f.llamadas[0].texto };
  };
  const volver = (m: AlmacenamientoLocal, alla: { texto: string; version: number } | null) => {
    const f = guardadoFalso();
    f.guardado = alla;
    const d = crearAlmacen({ hoy: HOY, clave, almacenamiento: m, guardado: f, demoraGuardadoMs: 0, enReposo: null, temporizador: temporizadorFalso() });
    d.arrancar();
    return { d, f };
  };

  // (a) Lo que estaba en camino no llegó: gana el espejo y se guarda sobre la 0.
  let s = await salir();
  let v = volver(s.m, null);
  await vaciar();
  assert.equal(v.d.estado().log[0].texto, "después");
  assert.deepEqual([v.f.llamadas[0].esperada, tieneMarca(v.f.llamadas[0].texto, "después")], [0, true]);

  // (b) Llegó (versión 1, sin «después»): el espejo es más nuevo y viene de ahí → gana el espejo, sobre la 1.
  s = await salir();
  v = volver(s.m, { texto: s.enCamino, version: 1 });
  await vaciar();
  assert.equal(v.d.estado().log[0].texto, "después");
  assert.equal(v.f.llamadas[0].esperada, 1);
  assert.equal(v.d.aviso(), null, "sin conflicto que avisar");

  // (c) Otro guardó después (versión 2): gana lo de allá y se avisa que lo de este equipo no llegó.
  s = await salir();
  const otra = M.generarDemo(HOY, MINUTO_DEMO);
  otra.log.unshift({ fecha: null, min: null, texto: "de otro" });
  v = volver(s.m, { texto: textoDeLaDemo(textoDelEstado(otra), HOY, 3), version: 2 });
  await vaciar();
  assert.equal(v.d.estado().log[0].texto, "de otro");
  assert.match(v.d.aviso()!.mensaje, /^Otra pantalla guardó cambios más nuevos/);
});

test("si falta lugar en este equipo se recorta el registro viejo a 60 y se vuelve a probar (como el vanilla)", () => {
  const m = memoria();
  const conTope: AlmacenamientoLocal = {
    ...m,
    setItem: (k, v) => {
      if ((JSON.parse(v) as { estado: M.EstadoClub }).estado.log.length > REGISTRO_SI_FALTA_LUGAR) throw new Error("QuotaExceededError");
      m.setItem(k, v);
    },
  };
  const clave = claveDeLaDemo(NEGOCIO, "u1");
  const d = crearAlmacen({ hoy: HOY, clave, almacenamiento: conTope, demoraGuardadoMs: 0, enReposo: null, temporizador: temporizadorFalso() });
  d.aplicar((e) => {
    for (let i = 0; i < 200; i++) e.log.push({ fecha: HOY, min: 600, texto: `viejo ${i}` });
    e.log.unshift({ fecha: HOY, min: 1150, texto: "lo último" });
  });
  assert.equal(d.estadoDelGuardado().guardado, "guardado");
  assert.equal(d.estado().log.length, REGISTRO_SI_FALTA_LUGAR);
  assert.equal(d.estado().log[0].texto, "lo último", "se recorta lo VIEJO");
  assert.ok(tieneMarca(m.datos.get(clave), "lo último"));
  // Con el registro ya corto, si sigue sin entrar, se reintenta (no se recorta más).
  const lleno: AlmacenamientoLocal = { ...m, setItem: () => { throw new Error("QuotaExceededError"); } };
  const t = temporizadorFalso();
  const e = crearAlmacen({ hoy: HOY, clave: claveDeLaDemo(NEGOCIO, "u2"), almacenamiento: lleno, demoraGuardadoMs: 0, enReposo: null, temporizador: t });
  e.aplicar(marcar("x"));
  assert.equal(e.estadoDelGuardado().guardado, "reintentando");
  assert.equal(t.esperas.at(-1)!.ms, 1000);
});

test("operador: el de ejemplo según el rol en la demo, nadie en la jornada real; cambiarlo no despierta al estado", () => {
  const d = crearAlmacen({ hoy: HOY, clave: claveDeLaDemo(NEGOCIO, "u1"), almacenamiento: null, demoraGuardadoMs: 0 });
  const o = d.operador()!;
  assert.equal(o.usuario.rol, "recepcion");
  assert.equal(d.operador(), o, "el mismo objeto (snapshot estable)");
  assert.deepEqual(d.auth(), o.auth);
  // Después de «Deshacer» (el estado es otro objeto) sigue siendo el mismo operador, el mismo objeto.
  const r = d.estado().reservas.find((x) => x.fecha === HOY && x.estado === "en_cancha" && M.saldo(x) > 0)!;
  d.ejecutar((e, ahora, auth) => ejecutarCuenta(e, r.id, { tipo: "cobrarTodo", medio: "efectivo" }, ahora, auth), { deshacible: true });
  d.deshacer();
  assert.equal(d.operador(), o);

  let delEstado = 0;
  let delOperador = 0;
  d.suscribir(() => delEstado++);
  d.suscribirOperador(() => delOperador++);
  const v = d.version();
  const duenio = operadorDeLaDemo(d.estado(), "OWNER")!;
  d.cambiarOperador(duenio.usuario, duenio.auth);
  assert.deepEqual([delOperador, delEstado, d.version()], [1, 0, v], "sólo se entera quien muestra al operador");
  assert.equal(d.operador()!.usuario.rol, "duenio");
  let recibido: M.Auth | null = null;
  d.ejecutar((_e, _a, auth) => ((recibido = auth), { ok: true, mensaje: "ok" }));
  assert.deepEqual(recibido, duenio.auth, "las acciones usan el operador del almacén");
  d.cambiarOperador(duenio.usuario, { ...duenio.auth });
  assert.equal(delOperador, 1, "el mismo operador no avisa");
  d.cambiarOperador(null);
  assert.deepEqual([d.operador(), d.auth(), delOperador], [null, {}, 2]);
  // Lo que hizo uno no lo deshace el que entra.
  d.cambiarOperador(o.usuario, o.auth);
  d.ejecutar((e, ahora, auth) => ejecutarCuenta(e, r.id, { tipo: "cobrarTodo", medio: "efectivo" }, ahora, auth), { deshacible: true });
  assert.equal(d.puedeDeshacer(), true);
  d.cambiarOperador(duenio.usuario, duenio.auth);
  assert.equal(d.puedeDeshacer(), false);

  const sinNadie = real({});
  assert.equal(sinNadie.operador(), null);
  assert.deepEqual(sinNadie.auth(), {});
  const OWNER = crearAlmacen({ hoy: HOY, clave: claveDeLaDemo(NEGOCIO, "u1"), almacenamiento: null, rol: "OWNER" });
  assert.equal(OWNER.operador()!.usuario.rol, "duenio");
});

test("la jornada real no vuelve a la demo, y lo que no se pudo leer se aparta (no se pisa)", async () => {
  const m = memoria();
  m.datos.set(claveDeLaJornada(NEGOCIO), '{"v":1,"estado":"roto"}');
  const r = real({ m });
  assert.match(r.aviso()!.mensaje, /no se pudo leer: arrancó en blanco/);
  assert.ok([...m.datos.keys()].some((k) => k.startsWith("gsg-club:demo-club:jornada:v1:ilegible:")), "quedó apartado");
  r.arrancar();
  await vaciar();
  const antes = r.estado();
  r.volverALaDemo();
  assert.equal(r.estado(), antes);
  assert.match(r.aviso()!.mensaje, /no se vuelve a la demo/);
  // Sin lugar ni para apartarlo: sólo lectura (no se guarda encima).
  const lleno = memoria();
  lleno.datos.set(claveDeLaJornada(NEGOCIO), "{roto");
  const sinLugar: AlmacenamientoLocal = { ...lleno, setItem: () => { throw new Error("QuotaExceededError"); } };
  const s = real({ m: sinLugar });
  s.arrancar();
  await vaciar();
  assert.equal(s.estadoDelGuardado().jornada, "ilegible");
  assert.equal(s.soloLectura(), true);
  assert.equal(lleno.datos.get(claveDeLaJornada(NEGOCIO)), "{roto", "lo guardado sigue ahí");
});

/**
 * MEDICIONES (PERFORMANCE-TERMINALES.md, «Ola 0 — almacén real»). Van al reporte con `t.diagnostic`:
 *   · el latido sin cambios (lo que corre 3 de cada 4 latidos): tiene que ser ~0;
 *   · el latido que cambia el minuto: la grilla se rearma y se reusa (celdas nuevas por minuto);
 *   · cambiar de operador: no sube la versión (ninguna pantalla del estado vuelve a seleccionar);
 *   · el guardado asíncrono en el toque: no se llama al guardado ni se avisa a la cinta, y el toque cuesta lo mismo.
 */
test("medición: latido, cambio de minuto, cambio de operador y guardado asíncrono en el toque", async (t) => {
  // 1. Latido sin cambios.
  const m = memoria();
  jornadaGuardada(m);
  const reloj = relojDe(a(17, 20, 0, 1));
  const tz = temporizadorFalso();
  const r = real({ m, reloj, t: tz });
  r.arrancar();
  await vaciar();
  const N = 100_000;
  for (let i = 0; i < 1000; i++) r.latir();
  const v0 = r.version();
  let t0 = performance.now();
  for (let i = 0; i < N; i++) r.latir();
  const usLatido = ((performance.now() - t0) / N) * 1000;
  assert.equal(r.version(), v0, "sin cambios, el latido no avisa");

  // 2. Cambio de minuto: lo que paga la agenda (rearmar la grilla y reusar las celdas que no cambiaron).
  let vista = armarAgenda(r.estado(), HOY, r.ahora());
  let celdasNuevas = 0;
  let msMinuto = 0;
  const MIN = 60;
  for (let i = 1; i <= MIN; i++) {
    reloj.poner(a(17, 20, i, 1));
    const ti = performance.now();
    tz.latidos[0]();
    const nueva = compartirAgenda(vista, armarAgenda(r.estado(), HOY, r.ahora()));
    msMinuto += performance.now() - ti;
    celdasNuevas += nueva.turnos.filter((c) => !vista.turnos.includes(c)).length;
    vista = nueva;
  }
  msMinuto /= MIN;

  // 3. Cambiar de operador.
  const d = crearAlmacen({ hoy: HOY, clave: claveDeLaDemo(NEGOCIO, "u1"), almacenamiento: null, demoraGuardadoMs: 0, enReposo: null });
  const due = operadorDeLaDemo(d.estado(), "OWNER")!;
  const rec = operadorDeLaDemo(d.estado(), "RECEPTION")!;
  const v1 = d.version();
  t0 = performance.now();
  for (let i = 0; i < 10_000; i++) d.cambiarOperador(i % 2 ? rec.usuario : due.usuario, i % 2 ? rec.auth : due.auth);
  const usOperador = ((performance.now() - t0) / 10_000) * 1000;
  assert.equal(d.version(), v1, "cambiar de operador no sube la versión: la agenda no vuelve a seleccionar");

  // 4. El toque con el guardado asíncrono enchufado vs. el de este equipo (agrupado de 1,5 s en los dos).
  const medirToque = (guardado?: GuardadoDelClub) => {
    const x = crearAlmacen({ hoy: HOY, clave: claveDeLaDemo(NEGOCIO, "u9"), almacenamiento: memoria(), guardado, enReposo: null });
    let cinta = 0;
    x.suscribirGuardado(() => cinta++);
    const r0 = x.estado().reservas.find((y) => y.fecha === HOY && y.estado === "en_cancha" && y.jugadores.length === 4)!;
    for (let i = 0; i < 5; i++) x.ejecutar((e, ahora) => ejecutarCuenta(e, r0.id, { tipo: "aCargoCancha", idx: 2, de: i % 2 ? "" : "1" }, ahora), { deshacible: true });
    const K = 200;
    const ti = performance.now();
    for (let i = 0; i < K; i++) x.ejecutar((e, ahora) => ejecutarCuenta(e, r0.id, { tipo: "aCargoCancha", idx: 2, de: i % 2 ? "" : "1" }, ahora));
    return { ms: (performance.now() - ti) / K, cinta, x };
  };
  const f = guardadoFalso();
  const conAsincrono = medirToque(f);
  const conLocal = medirToque();
  assert.equal(f.llamadas.length, 0, "en el toque no se llama al guardado (sale agrupado, después)");
  assert.equal(conAsincrono.cinta, 0, "ni se avisa a la cinta");
  conAsincrono.x.guardarYa();
  conLocal.x.guardarYa();

  t.diagnostic(
    `latido sin cambios: ${usLatido.toFixed(2)} µs · cambio de minuto (latido + grilla): ${msMinuto.toFixed(2)} ms, ${celdasNuevas} celdas nuevas en ${MIN} minutos · cambiar de operador: ${usOperador.toFixed(2)} µs, 0 avisos al estado · toque con guardado asíncrono: ${conAsincrono.ms.toFixed(3)} ms vs. local ${conLocal.ms.toFixed(3)} ms`,
  );
  assert.ok(usLatido < 20, `el latido sin cambios tiene que ser ~0: ${usLatido.toFixed(2)} µs`);
  assert.ok(msMinuto < 16, `el cambio de minuto entra en un cuadro: ${msMinuto.toFixed(2)} ms`);
  assert.ok(conAsincrono.ms < conLocal.ms * 2 + 0.5, "el guardado asíncrono no le suma al toque");
});

test("sin base: la base no contesta al abrir y no hay copia en el equipo → sólo lectura reintentando; al volver, abre lo guardado", async () => {
  const f = guardadoFalso();
  const guardadoAlla = M.generarDemo(HOY, MINUTO_DEMO);
  marcar("lo de la base")(guardadoAlla);
  f.guardado = { texto: textoDelEstado(guardadoAlla), version: 7 };
  let caida = true;
  const leer = f.leer.bind(f);
  f.leer = async () => {
    if (caida) {
      f.lecturas++;
      throw new Error("sin conexión");
    }
    return leer();
  };
  const t = temporizadorFalso();
  const s = real({ m: memoria(), guardado: f, t, cerrojos: null });
  s.arrancar();
  await vaciar();
  assert.equal(s.estadoDelGuardado().jornada, "sin-base");
  assert.equal(s.estadoDelGuardado().guardado, "reintentando");
  assert.equal(s.soloLectura(), true, "no se arranca un club vacío encima del guardado");
  assert.throws(() => s.aplicar(marcar("no")), /No hay conexión con la base/);
  assert.equal(f.llamadas.length, 0, "no se guardó nada");
  // Sigue caída: reintenta leer con espera creciente, sin guardar.
  t.correr();
  await vaciar();
  assert.equal(s.estadoDelGuardado().jornada, "sin-base");
  assert.equal(t.esperas.at(-1)!.ms, 2000);
  assert.equal(f.llamadas.length, 0);
  // Vuelve la base: abre lo guardado allá y se puede operar.
  caida = false;
  t.correr();
  await vaciar();
  await vaciar();
  assert.equal(s.estadoDelGuardado().jornada, "sin-bloqueo");
  assert.equal(s.soloLectura(), false);
  assert.ok(s.estado().log.some((l) => l.texto === "lo de la base"), "abrió lo de la base, no uno vacío");
});
