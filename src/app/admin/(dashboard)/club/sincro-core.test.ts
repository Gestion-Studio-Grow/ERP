// DOS PUESTOS A LA VEZ (Tanda 1B): dos almacenes REALES (la PC de Caro y la tablet de Lu) sobre una base en memoria
// con versión optimista, como estado-repo. Los casos del diseño (bp-DISENO.md, fila 1B):
//   (a) los dos dan C2 21:00 → el segundo en llegar queda en «Para resolver» con el nombre del otro, y TODO lo demás
//       suyo se aplica (BP-021, BP-022);
//   (b) uno cobra y el otro da un turno en el mismo minuto → quedan las dos cosas (BP-023);
//   (c) el otro puesto ve el turno en ≤ 1 latido, sin traer la foto si no cambió nada, y sin pestaña visible no pregunta
//       (BP-020, BP-029);
//   (d) un comando ya aplicado en la base no se aplica dos veces (BP-025);
//   (e) `describirComando` en criollo: comandos-core.test.ts;
//   (f) `leerVersionDelClub` no trae la foto: estado-repo.test.ts (cuenta bytes) y guardado-en-la-base.test.ts;
//   (g) el WhatsApp del alta no se ofrece hasta el ok de la base (BP-024).
// Más: «Volver a aplicar» con el hueco libre da los mismos ids y el mismo código BP (BP-026), sin internet nada se pierde
// (BP-028), el tope de 500 de la idempotencia y qué sube ya.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { EstadoClub } from "@/lib/club/motor.mjs";
import { claveDeLaJornada, crearAlmacen, MINUTO_DEMO, textoDeLaDemo, textoDelEstado, type AlmacenamientoLocal, type Confirmacion, type ResultadoDelGuardado, type Temporizador } from "./almacen";
import { reservar, type DatosAlta } from "./alta-core";
import { ejecutar as ejecutarCuenta } from "./cuenta-core";
import { codigoDeLaDemo } from "./credito-core";
import { anotarAplicado, leerSincro, prometeAlgo, sacarParaResolver, TOPE_APLICADOS, volverAAnotar, type ItemParaResolver, type Pendiente } from "./sincro-core";

const HOY = "2026-10-17";
const NEGOCIO = "club-dos-puestos";
const A_LAS_21 = 21 * 60;

const vaciar = async () => {
  for (let i = 0; i < 30; i++) await new Promise<void>((r) => setImmediate(r));
};

function memoria(): AlmacenamientoLocal {
  const datos = new Map<string, string>();
  return { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, String(v)), removeItem: (k) => void datos.delete(k) };
}

function temporizadorFalso(): Temporizador & { latidos: (() => void)[]; correr: () => void } {
  const esperas: { fn: () => void; viva: boolean }[] = [];
  const t = {
    latidos: [] as (() => void)[],
    despues(fn: () => void) {
      const e = { fn, viva: true };
      esperas.push(e);
      return () => void (e.viva = false);
    },
    cada(fn: () => void) {
      t.latidos.push(fn);
      return () => void t.latidos.splice(t.latidos.indexOf(fn), 1);
    },
    correr() {
      for (const e of esperas.splice(0)) if (e.viva) e.fn();
    },
  };
  return t;
}

/** La base del club: la jornada de la demo con los PIN ya con hash y los fijos de la semana bajados (como queda guardada). */
function baseCompartida() {
  const e = M.generarDemo(HOY, MINUTO_DEMO);
  M.pasarPinesAHash(e);
  for (let d = 1; d < 7; d++) M.materializarFijos(e, M.sumarDias(HOY, d));
  return { foto: { texto: textoDeLaDemo(textoDelEstado(e), HOY, 1), version: 1 } as { texto: string; version: number } | null, lecturas: 0, preguntas: 0 };
}
type Base = ReturnType<typeof baseCompartida>;
const enLaBase = (b: Base) => (JSON.parse(b.foto!.texto) as { estado: EstadoClub }).estado;

/**
 * El guardado de un puesto contra la base (lo que hace guardado-en-la-base.ts, sin gzip ni los 30 s): sube en el acto,
 * salvo `retener` (sin internet: queda esperando hasta `soltar`), `caer` (la base no contesta: error) o `cortarLaProxima`
 * (guarda en la base y la respuesta se pierde: el corte justo después de subir).
 */
function guardadoDe(b: Base) {
  const esperando: { texto: string; esperada: number; resolver: (r: ResultadoDelGuardado) => void }[] = [];
  let retener = false;
  let caida = false;
  let cortar = false;
  const resolver = (x: (typeof esperando)[number]) => {
    if (caida) return x.resolver({ ok: false, motivo: "error" });
    const actual = b.foto?.version ?? 0;
    if (actual !== x.esperada) return x.resolver({ ok: false, motivo: "conflicto", version: actual });
    b.foto = { texto: x.texto, version: actual + 1 };
    if (cortar) {
      cortar = false;
      return x.resolver({ ok: false, motivo: "error" });
    }
    x.resolver({ ok: true, version: actual + 1 });
  };
  const g = {
    subidasYa: 0,
    async leer() {
      if (caida) throw new Error("sin red");
      b.lecturas++;
      return b.foto && { ...b.foto };
    },
    guardar(texto: string, esperada: number) {
      return new Promise<ResultadoDelGuardado>((r) => {
        const x = { texto, esperada, resolver: r };
        if (retener) esperando.push(x);
        else queueMicrotask(() => resolver(x));
      });
    },
    async leerVersion() {
      if (caida) return null;
      b.preguntas++;
      return b.foto?.version ?? 0;
    },
    async subirYa() {
      g.subidasYa++;
    },
    retener: () => void (retener = true),
    soltar() {
      retener = false;
      for (const x of esperando.splice(0)) resolver(x);
    },
    caer: (si: boolean) => void (caida = si),
    cortarLaProxima: () => void (cortar = true),
  };
  return g;
}

/** Un puesto: el almacén de la jornada real contra la base, con quien opera (su usuario del club y su PIN). */
function puesto(b: Base, equipo: string, nombre: string, quien: { id: string; pin: string }, almacenamiento: AlmacenamientoLocal = memoria()) {
  const g = guardadoDe(b);
  const t = temporizadorFalso();
  let visible = true;
  const a = crearAlmacen({
    reloj: "real",
    clave: claveDeLaJornada(NEGOCIO),
    almacenamiento,
    guardado: g,
    cerrojos: null,
    canal: null,
    temporizador: t,
    // Sábado 17/10 a las 20:00 en este equipo: el turno de las 21:00 todavía no pasó.
    relojMs: () => new Date(2026, 9, 17, 20, 0).getTime(),
    demoraGuardadoMs: 0,
    enReposo: null,
    rol: "OWNER",
    equipo,
    puesto: nombre,
    visible: () => visible,
  });
  return {
    a,
    g,
    t,
    ocultar: (si: boolean) => void (visible = !si),
    latir: async () => {
      t.latidos[0]();
      await vaciar();
    },
    async abrir() {
      a.arrancar();
      await vaciar();
      const u = a.estado().usuarios.find((x) => x.id === quien.id)!;
      a.cambiarOperador(u, { usuarioId: u.id, pin: quien.pin });
      return this;
    },
  };
}
type Puesto = ReturnType<typeof puesto>;

const CARO = { id: "u-caro", pin: "44" };
const LU = { id: "u-lu", pin: "33" };

/** La PC de Caro y la tablet de Lu, abiertas sobre la misma base. */
async function dosPuestos() {
  const b = baseCompartida();
  const pc = await puesto(b, "pc01", "PC", CARO).abrir();
  const tablet = await puesto(b, "tab1", "tablet", LU).abrir();
  return { b, pc, tablet };
}

/** Lo que hace «Dar un turno» (AltaDeTurno) a través del almacén envuelto de ClubDemo: la función + el comando «alta». */
function darTurno(p: Puesto, datos: Pick<DatosAlta, "canchaId" | "inicio" | "titular">) {
  let encolado: { id: string; reservas: string[] } | null = null;
  const d = p.a.ejecutar((est, ahora) => reservar(est, { fecha: HOY, duracion: 60, tipo: "turno", clienteId: null, otros: "", ...datos }, ahora), {
    deshacible: true,
    comoAlta: true,
    alEncolar: (x) => (encolado = x),
  });
  assert.equal(d.ok, true, d.mensaje);
  const e = encolado as { id: string; reservas: string[] } | null;
  assert.ok(e && e.reservas.length === 1, "el alta entró a la cola con su turno");
  return e;
}

/** Un hueco libre de una hora desde las 20:30 (que no se pise con los que ya se usan en el test). */
function hueco(e: EstadoClub, ...ya: { canchaId: string; inicio: number }[]) {
  for (const c of e.canchas)
    for (let m = 20 * 60 + 30; m + 60 <= M.horarioDe(e, HOY).cierra; m += 30) {
      if (ya.some((x) => x.canchaId === c.id && Math.abs(x.inicio - m) < 60)) continue;
      if (M.validarHueco(e, { canchaId: c.id, fecha: HOY, inicio: m, duracion: 60 }).ok) return { canchaId: c.id, inicio: m };
    }
  throw new Error("la demo no tiene un hueco libre a la noche");
}

/** El turno en juego de la demo que debe la cancha. */
const turnoQueDebe = (e: EstadoClub) => e.reservas.find((x) => x.fecha === HOY && x.estado === "en_cancha" && M.saldo(x) > 0)!.id;
const turnosEn = (e: EstadoClub, canchaId: string, inicio: number) => e.reservas.filter((r) => r.fecha === HOY && r.canchaId === canchaId && r.inicio === inicio && r.estado === "reservada");

/** Todo lo que fue diciendo `confirmacion(id)` mientras pasaba (para ver que el WhatsApp nunca se ofreció). */
function historia(p: Puesto, id: () => string | null) {
  const visto: Confirmacion[] = [];
  p.a.suscribirSincro(() => {
    const x = id();
    if (x) visto.push(p.a.confirmacion(x));
  });
  return visto;
}

test("(a) BP-021/022: los dos dan C2 21:00 — el segundo en llegar va a «Para resolver» con el nombre del otro; sus cargos y su cobro entran igual", async () => {
  const { b, pc, tablet } = await dosPuestos();
  assert.ok(M.validarHueco(pc.a.estado(), { canchaId: "c2", fecha: HOY, inicio: A_LAS_21, duracion: 60 }).ok, "C2 21:00 está libre");
  // La tablet se queda un rato sin subir (wifi lento): lo suyo espera en la cola.
  tablet.g.retener();
  const turno = turnoQueDebe(tablet.a.estado());
  const producto = tablet.a.estado().productos.find((p) => p.activo !== false && (typeof p.stock !== "number" || p.stock > 5))!;
  const cargo = { tipo: "cargo" as const, idx: 0, productoId: producto.id, cant: 1, modo: "cuenta" as const, medio: "efectivo" as const };
  assert.equal(tablet.a.comando("cuenta", [turno, cargo]).ok, true);
  assert.equal(tablet.a.comando("cuenta", [turno, cargo]).ok, true);
  assert.equal(tablet.a.comando("cuenta", [turno, { tipo: "cobrarTodo", medio: "efectivo" }]).ok, true);
  let idDeLu: string | null = null;
  const visto = historia(tablet, () => idDeLu);
  const deLu = darTurno(tablet, { canchaId: "c2", inicio: A_LAS_21, titular: "Pedro Paz" });
  idDeLu = deLu.id;
  assert.equal(tablet.a.confirmacion(deLu.id), "esperando", "Reservando…: todavía no se ofrece el WhatsApp");

  // Caro, en la PC, da el mismo hueco y llega primero a la base.
  const deCaro = darTurno(pc, { canchaId: "c2", inicio: A_LAS_21, titular: "Juan Pérez" });
  await vaciar();
  assert.equal(pc.a.confirmacion(deCaro.id), "confirmado");

  // Vuelve el wifi de la tablet: choca, baja lo de Caro y re-aplica lo suyo encima.
  tablet.g.soltar();
  await vaciar();
  const base = enLaBase(b);
  assert.deepEqual(
    turnosEn(base, "c2", A_LAS_21).map((r) => r.titular),
    ["Juan Pérez"],
    "el hueco quedó para el primero: un hueco nunca se promete dos veces",
  );
  assert.equal(M.saldo(M.reserva(base, turno)!), 0, "el cobro de la tablet llegó a la base");
  assert.equal(JSON.stringify(M.reserva(base, turno)), JSON.stringify(M.reserva(tablet.a.estado(), turno)), "los 2 cargos y el cobro, tal cual los cargó Lu");
  // Lo que no entró, legible y con quién dio el hueco.
  const [item] = leerSincro(base).paraResolver;
  assert.equal(item.motivo, "Ese hueco lo acaba de dar Caro (PC) a Juan Pérez");
  assert.equal(item.texto, "20:00 · Turno a Pedro Paz en C2 a las 21:00 (60 min) · Lu (tablet)");
  assert.equal(item.equipo, "tab1");
  assert.ok(item.comando && !JSON.stringify(item).includes('"pin"'), "el comando viaja sin PIN");
  assert.ok(item.hueco, "con el hueco, para ofrecer alternativas de un toque");
  assert.equal(tablet.a.confirmacion(deLu.id), "para-resolver");
  assert.ok(!visto.includes("confirmado"), "el WhatsApp del turno de Pedro no se ofreció nunca");
  assert.match(tablet.a.aviso()!.mensaje, /^Ese hueco lo acaba de dar Caro \(PC\) a Juan Pérez: quedó en «Para resolver»/);
  assert.equal(tablet.a.sincro().enCola, 0, "la cola quedó vacía: todo confirmado o para resolver");
  assert.equal(tablet.a.apartes().length, 0, "nada quedó «aparte» entero: se re-aplicó por ítem");
});

test("(b) BP-023: la PC cobra y la tablet da un turno en el mismo minuto — quedan las dos cosas en la foto vigente", async () => {
  const { b, pc, tablet } = await dosPuestos();
  const turno = turnoQueDebe(pc.a.estado());
  assert.equal(pc.a.comando("cuenta", [turno, { tipo: "cobrarTodo", medio: "efectivo" }]).ok, true);
  const deLu = darTurno(tablet, { ...hueco(tablet.a.estado()), titular: "Ana Ruiz" });
  await vaciar();
  const base = enLaBase(b);
  assert.equal(M.saldo(M.reserva(base, turno)!), 0, "el cobro de la PC");
  assert.ok(M.reserva(base, deLu.reservas[0]), "el turno de la tablet");
  assert.equal(leerSincro(base).paraResolver.length, 0, "no chocó nada");
  assert.equal(tablet.a.confirmacion(deLu.id), "confirmado");
  assert.equal(tablet.a.aviso()!.ok, true, "sin «Otra pantalla guardó…»: se juntó lo de los dos");
});

test("(c) BP-020/029: la tablet ve el turno de la PC en un latido (y la cinta dice quién); sin cambios no baja la foto; oculta no pregunta", async () => {
  const { b, pc, tablet } = await dosPuestos();
  const deCaro = darTurno(pc, { canchaId: "c2", inicio: A_LAS_21, titular: "Juan Pérez" });
  await vaciar();
  const lecturas = b.lecturas;
  await tablet.latir();
  assert.ok(M.reserva(tablet.a.estado(), deCaro.reservas[0]), "en ≤ 15 s la tablet lo muestra en su grilla");
  assert.equal(b.lecturas, lecturas + 1, "bajó la foto una vez, porque avanzó");
  assert.equal(tablet.a.sincro().novedad?.texto, "Caro (PC) dio un turno a las 21:00 en C2");
  // Sin cambios: sólo la versión (unos bytes), nunca la foto.
  const preguntas = b.preguntas;
  await tablet.latir();
  await tablet.latir();
  assert.equal(b.preguntas, preguntas + 2);
  assert.equal(b.lecturas, lecturas + 1, "sin cambios no se baja la foto");
  // Sin la pestaña a la vista: 5 minutos de latidos (20) y ninguna consulta (cuida Neon).
  tablet.ocultar(true);
  for (let i = 0; i < 20; i++) await tablet.latir();
  assert.equal(b.preguntas, preguntas + 2, "oculta no pregunta nada");
});

test("(d) BP-025: el corte justo después de subir — al volver a mandarlo no se aplica dos veces (un turno, un cobro)", async () => {
  const { b, tablet } = await dosPuestos();
  const turno = turnoQueDebe(tablet.a.estado());
  tablet.g.cortarLaProxima();
  assert.equal(tablet.a.comando("cuenta", [turno, { tipo: "cobrarTodo", medio: "efectivo" }]).ok, true);
  const despuesDelCobro = JSON.stringify(M.reserva(tablet.a.estado(), turno));
  const movimientos = tablet.a.estado().caja.movimientos.length;
  await vaciar();
  assert.equal(b.foto!.version, 2, "llegó a la base…");
  assert.equal(tablet.a.estadoDelGuardado().guardado, "reintentando", "…pero la respuesta no volvió");
  // El reintento choca con su propia versión: baja la base, ve el id en `aplicados` y lo saltea.
  tablet.t.correr();
  await vaciar();
  assert.equal(JSON.stringify(M.reserva(tablet.a.estado(), turno)), despuesDelCobro, "un solo cobro");
  assert.equal(tablet.a.estado().caja.movimientos.length, movimientos, "la caja no lo cuenta dos veces");
  assert.equal(enLaBase(b).caja.movimientos.length, movimientos);
  assert.equal(tablet.a.sincro().enCola, 0);
  // Un turno: el mismo corte con un alta.
  tablet.g.cortarLaProxima();
  const h = hueco(tablet.a.estado());
  const alta = darTurno(tablet, { ...h, titular: "Ana Ruiz" });
  await vaciar();
  tablet.t.correr();
  await vaciar();
  assert.equal(turnosEn(enLaBase(b), h.canchaId, h.inicio).length, 1, "un solo turno");
  assert.equal(tablet.a.confirmacion(alta.id), "confirmado");
});

test("(g) BP-024: el WhatsApp del alta espera el ok de la base — «Reservando…» mientras sube; lo que promete sube ya", async () => {
  const { tablet } = await dosPuestos();
  tablet.g.retener();
  const subidas = tablet.g.subidasYa;
  const alta = darTurno(tablet, { ...hueco(tablet.a.estado()), titular: "Ana Ruiz" });
  assert.equal(tablet.a.confirmacion(alta.id), "esperando");
  assert.ok(tablet.g.subidasYa > subidas, "dar un turno no espera los 30 s: pide subir ya");
  await vaciar();
  assert.equal(tablet.a.confirmacion(alta.id), "esperando", "sin el ok, sigue «Reservando…»");
  tablet.g.soltar();
  await vaciar();
  assert.equal(tablet.a.confirmacion(alta.id), "confirmado", "con el ok de la base, recién ahí el WhatsApp");
  // Un cargo de buffet no promete nada: se agrupa con el resto (no apura la subida).
  assert.equal(prometeAlgo("cuenta", ["r1", { tipo: "cargo", idx: 0, productoId: "p", cant: 1, modo: "cuenta", medio: "efectivo" }]), false);
  assert.equal(prometeAlgo("cuenta", ["r1", { tipo: "cobrarTodo", medio: "efectivo" }]), true);
  assert.equal(prometeAlgo("ciclo", ["r1", { tipo: "mover", canchaId: "c1", inicio: 1200 }]), true);
  assert.equal(prometeAlgo("alta", [{}]), true);
});

test("BP-026: «Volver a aplicar» con el hueco ya libre — el turno entra con los mismos ids y el mismo código BP; lo demás no cambia", async () => {
  const { b, pc, tablet } = await dosPuestos();
  tablet.g.retener();
  const deLu = darTurno(tablet, { canchaId: "c2", inicio: A_LAS_21, titular: "Pedro Paz" });
  const local = M.reserva(tablet.a.estado(), deLu.reservas[0])!;
  assert.ok(local.ref, "sin ficha pide seña: tiene su código BP");
  const deCaro = darTurno(pc, { canchaId: "c2", inicio: A_LAS_21, titular: "Juan Pérez" });
  await vaciar();
  tablet.g.soltar();
  await vaciar();
  assert.equal(leerSincro(tablet.a.estado()).paraResolver.length, 1);
  // Juan avisa que no viene: Caro cancela y el hueco se libera.
  assert.equal(pc.a.comando("ciclo", [deCaro.reservas[0], { tipo: "cancelar", porClub: false, motivo: "Avisó que no viene" }]).ok, true);
  await vaciar();
  await tablet.latir();
  const antes = tablet.a.estado();
  const movimientos = antes.caja.movimientos.length;
  const otros = antes.reservas.length;
  const d = tablet.a.volverAAplicar(deLu.id);
  assert.equal(d.ok, true, d.mensaje);
  const vuelto = M.reserva(tablet.a.estado(), deLu.reservas[0])!;
  assert.ok(vuelto, "el mismo id de turno");
  assert.equal(vuelto.ref, local.ref, "el mismo código BP de la seña");
  assert.equal(vuelto.titular, "Pedro Paz");
  assert.equal(tablet.a.estado().reservas.length, otros + 1, "sólo se sumó ese turno");
  assert.equal(tablet.a.estado().caja.movimientos.length, movimientos, "la caja no cambió");
  assert.equal(leerSincro(tablet.a.estado()).paraResolver.length, 0, "salió de «Para resolver»");
  await vaciar();
  assert.ok(M.reserva(enLaBase(b), deLu.reservas[0]), "y llegó a la base");
  // Descartar: otro choque, y se saca sin aplicar.
  tablet.g.retener();
  const h = hueco(pc.a.estado(), { canchaId: "c2", inicio: A_LAS_21 });
  darTurno(tablet, { ...h, titular: "Otro" });
  darTurno(pc, { ...h, titular: "Gana" });
  await vaciar();
  tablet.g.soltar();
  await vaciar();
  const [otro] = leerSincro(tablet.a.estado()).paraResolver;
  assert.ok(otro);
  assert.equal(tablet.a.descartarParaResolver(otro.id).ok, true);
  assert.equal(leerSincro(tablet.a.estado()).paraResolver.length, 0);
});

test("F1 · lo que fue a «Para resolver» no se pierde si la base avanza entre el rebase y la subida (dos puestos, wifi inestable)", async () => {
  const { b, pc, tablet } = await dosPuestos();
  tablet.g.retener();
  const deLu = darTurno(tablet, { canchaId: "c2", inicio: A_LAS_21, titular: "Pedro Paz" });
  darTurno(pc, { canchaId: "c2", inicio: A_LAS_21, titular: "Juan Pérez" });
  await vaciar();
  // Vuelve el wifi: la subida retenida choca, la tablet re-aplica y manda la foto nueva… que vuelve a quedar retenida.
  tablet.g.soltar();
  tablet.g.retener();
  await vaciar();
  assert.equal(tablet.a.confirmacion(deLu.id), "para-resolver");
  // Mientras tanto la PC guarda otra cosa: la subida de la tablet va a chocar de nuevo y la foto se reemplaza.
  darTurno(pc, { ...hueco(pc.a.estado(), { canchaId: "c2", inicio: A_LAS_21 }), titular: "Ana" });
  await vaciar();
  tablet.g.soltar();
  await vaciar();
  for (let i = 0; i < 4; i++) {
    tablet.t.correr();
    await vaciar();
  }
  const base = enLaBase(b);
  const enBase = leerSincro(base).paraResolver;
  assert.deepEqual(enBase.map((x) => x.id), [deLu.id], "el turno de Pedro Paz está «para resolver» en la base, una sola vez");
  assert.equal(enBase[0].motivo, "Ese hueco lo acaba de dar Caro (PC) a Juan Pérez");
  assert.ok(enBase[0].comando, "y se puede volver a aplicar desde cualquier puesto");
  assert.deepEqual(leerSincro(tablet.a.estado()).paraResolver.map((x) => x.id), [deLu.id], "la tablet lo ve igual");
  assert.equal(turnosEn(base, "c2", A_LAS_21).length, 1, "el hueco sigue siendo de uno solo");
  assert.equal(tablet.a.sincro().enCola, 0);
  assert.equal(tablet.a.apartes().length, 0);
  // La PC lo ve en un latido y lo descarta: la tablet no lo resucita al volver a bajar la foto.
  await pc.latir();
  assert.equal(pc.a.descartarParaResolver(deLu.id).ok, true);
  await vaciar();
  await tablet.latir();
  assert.equal(leerSincro(enLaBase(b)).paraResolver.length, 0, "descartado en la base");
  assert.equal(leerSincro(tablet.a.estado()).paraResolver.length, 0, "y la tablet no lo vuelve a anotar");
});

test("F1 · corte justo después de subir el «para resolver»: al reintentar no se duplica ni se resucita", async () => {
  const { b, pc, tablet } = await dosPuestos();
  tablet.g.retener();
  const deLu = darTurno(tablet, { canchaId: "c2", inicio: A_LAS_21, titular: "Pedro Paz" });
  darTurno(pc, { canchaId: "c2", inicio: A_LAS_21, titular: "Juan Pérez" });
  await vaciar();
  // La foto con el ítem llega a la base pero la respuesta se pierde; mientras tanto la PC guarda otra cosa.
  tablet.g.cortarLaProxima();
  tablet.g.soltar();
  await vaciar();
  assert.equal(leerSincro(enLaBase(b)).paraResolver.length, 1, "llegó a la base");
  darTurno(pc, { ...hueco(pc.a.estado(), { canchaId: "c2", inicio: A_LAS_21 }), titular: "Ana" });
  await vaciar();
  for (let i = 0; i < 4; i++) {
    tablet.t.correr();
    await vaciar();
  }
  assert.deepEqual(leerSincro(enLaBase(b)).paraResolver.map((x) => x.id), [deLu.id], "uno solo");
  assert.equal(tablet.a.estadoDelGuardado().guardado, "guardado");
});

test("BP-028: sin internet un rato — todo lo cargado queda en la cola, la cinta lo dice, y al volver llega a la base", async () => {
  const { b, pc, tablet } = await dosPuestos();
  tablet.g.caer(true);
  const turno = turnoQueDebe(tablet.a.estado());
  assert.equal(tablet.a.comando("cuenta", [turno, { tipo: "cobrarTodo", medio: "efectivo" }]).ok, true);
  const h1 = hueco(tablet.a.estado());
  const h2 = hueco(tablet.a.estado(), h1);
  const alta = darTurno(tablet, { ...h1, titular: "Ana Ruiz" });
  await vaciar();
  assert.ok(tablet.a.sincro().sinInternetDesde !== null, "la cinta: «Sin internet desde las …»");
  assert.equal(tablet.a.sincro().enCola, 2);
  // Mientras tanto la PC sigue trabajando con internet.
  darTurno(pc, { ...h2, titular: "Juan Pérez" });
  await vaciar();
  tablet.g.caer(false);
  tablet.t.correr();
  await vaciar();
  const base = enLaBase(b);
  assert.equal(M.saldo(M.reserva(base, turno)!), 0);
  assert.ok(M.reserva(base, alta.reservas[0]));
  assert.equal(turnosEn(base, h2.canchaId, h2.inicio).length, 1, "lo de la PC sigue");
  assert.equal(tablet.a.sincro().sinInternetDesde, null);
  assert.equal(tablet.a.sincro().enCola, 0);
});

test("BP-028 · la cola sobrevive a recargar la pestaña: lo cargado sin internet llega a la base al volver, por ítem y sin «aparte» entero", async () => {
  const { b, pc } = await dosPuestos();
  const disco = memoria();
  const tablet = await puesto(b, "tab1", "tablet", LU, disco).abrir();
  tablet.g.caer(true);
  const turno = turnoQueDebe(tablet.a.estado());
  assert.equal(tablet.a.comando("cuenta", [turno, { tipo: "cobrarTodo", medio: "efectivo" }]).ok, true);
  const alta = darTurno(tablet, { canchaId: "c2", inicio: A_LAS_21, titular: "Pedro Paz" });
  await vaciar();
  assert.equal(tablet.a.sincro().enCola, 2);
  const guardada = disco.getItem(`${claveDeLaJornada(NEGOCIO)}:cola:tab1`) ?? "";
  assert.ok(guardada.includes(alta.id), "la cola quedó en el equipo");
  assert.ok(!guardada.includes('"pin"'), "sin PIN");
  // Mientras tanto la PC da el mismo hueco y la base avanza.
  darTurno(pc, { canchaId: "c2", inicio: A_LAS_21, titular: "Juan Pérez" });
  await vaciar();
  // «F5» en la tablet, ya con internet: otro almacén sobre el mismo equipo.
  const otraVez = await puesto(b, "tab1", "tablet", LU, disco).abrir();
  await vaciar();
  const base = enLaBase(b);
  assert.equal(M.saldo(M.reserva(base, turno)!), 0, "el cobro de antes de recargar llegó");
  assert.deepEqual(turnosEn(base, "c2", A_LAS_21).map((r) => r.titular), ["Juan Pérez"], "el hueco quedó para el primero");
  assert.deepEqual(leerSincro(base).paraResolver.map((x) => x.id), [alta.id], "el turno de Pedro, «para resolver» y re-aplicable");
  assert.ok(leerSincro(base).paraResolver[0].comando);
  assert.equal(otraVez.a.apartes().length, 0, "nada aparte entero");
  assert.equal(otraVez.a.sincro().enCola, 0);
  assert.equal(disco.getItem(`${claveDeLaJornada(NEGOCIO)}:cola:tab1`), null, "la cola del equipo quedó vacía");
});

test("BP-028 · recargar con una acción que no es comando (función de pantalla): la red de siempre, lo de acá aparte entero", async () => {
  const { b, pc } = await dosPuestos();
  const disco = memoria();
  const tablet = await puesto(b, "tab1", "tablet", LU, disco).abrir();
  tablet.g.caer(true);
  const turno = turnoQueDebe(tablet.a.estado());
  assert.equal(tablet.a.ejecutar((e, ahora, auth) => ejecutarCuenta(e, turno, { tipo: "cobrarTodo", medio: "efectivo" }, ahora, auth)).ok, true);
  await vaciar();
  darTurno(pc, { ...hueco(pc.a.estado()), titular: "Ana" });
  await vaciar();
  const otraVez = await puesto(b, "tab1", "tablet", LU, disco).abrir();
  await vaciar();
  assert.equal(otraVez.a.apartes().length, 1, "sin nombre no se puede re-aplicar: queda aparte entero, no se pierde");
});

test("BP-005/006 · «Cobrar la seña y abrir» en dos puestos a la vez (o doble toque): la seña entra UNA vez y la cancha abre una vez", async () => {
  const b = baseCompartida();
  // Un turno de las 21:00 con la seña pendiente, en una cancha que ya se liberó (los de las 19:00 se fueron).
  const e = enLaBase(b);
  const c = e.canchas.find((x) => M.validarHueco(e, { canchaId: x.id, fecha: HOY, inicio: A_LAS_21, duracion: 60 }).ok)!;
  e.reservas = e.reservas.filter((x) => !(x.fecha === HOY && x.canchaId === c.id && x.estado === "en_cancha"));
  const res = M.crearReserva(e, { canchaId: c.id, fecha: HOY, inicio: A_LAS_21, duracion: 60, titular: "Pedro Paz", clienteId: null, conSena: true }, { fecha: HOY, min: 19 * 60 });
  assert.ok(res.ok);
  const turno = (res as { reserva: M.Reserva }).reserva;
  b.foto = { texto: textoDeLaDemo(JSON.stringify({ v: M.VERSION_ESTADO, estado: e, secuencia: M.secuenciaIds() }), HOY, 1), version: 1 };
  const pc = await puesto(b, "pc01", "PC", CARO).abrir();
  const tablet = await puesto(b, "tab1", "tablet", LU).abrir();
  const ing0 = M.resumenCaja(enLaBase(b)).ingresos;
  tablet.g.retener();
  assert.equal(tablet.a.comando("cuenta", [turno.id, { tipo: "cobrarSenaYAbrir", medio: "transferencia" }]).ok, true);
  assert.equal(tablet.a.comando("cuenta", [turno.id, { tipo: "cobrarSenaYAbrir", medio: "transferencia" }]).ok, false, "doble toque: la segunda no cobra");
  assert.equal(pc.a.comando("cuenta", [turno.id, { tipo: "cobrarSenaYAbrir", medio: "efectivo" }]).ok, true);
  await vaciar();
  tablet.g.soltar();
  await vaciar();
  const base = enLaBase(b);
  assert.equal(M.resumenCaja(base).ingresos - ing0, turno.sena.monto, "la seña una sola vez (la del primero en llegar)");
  assert.equal(M.reserva(base, turno.id)!.estado, "en_cancha");
  assert.equal(base.luces[c.id], true);
  const [item] = leerSincro(base).paraResolver;
  assert.ok(item, "lo de la tablet quedó «para resolver», sin cobrar");
  assert.match(item.texto, /seña .* y abrir la cancha de Pedro Paz/);
});

test("H1 · un clic que falla sin tocar nada no cambia la foto, no entra a la cola ni gasta un guardado (Neon Free)", async () => {
  const { b, tablet } = await dosPuestos();
  const turno = turnoQueDebe(tablet.a.estado());
  assert.equal(tablet.a.comando("cuenta", [turno, { tipo: "cobrarTodo", medio: "efectivo" }]).ok, true);
  await vaciar();
  const version = b.foto!.version;
  const aplicados = leerSincro(tablet.a.estado()).aplicados.length;
  // Lo mismo otra vez: ya no debe nada, el motor dice que no y no cambió nada.
  const d = tablet.a.comando("cuenta", [turno, { tipo: "cobrarTodo", medio: "efectivo" }]);
  assert.equal(d.ok, false);
  assert.equal(tablet.a.aviso()!.mensaje, d.mensaje, "el aviso dice por qué");
  assert.equal(tablet.a.sincro().enCola, 0, "no entró a la cola");
  assert.equal(leerSincro(tablet.a.estado()).aplicados.length, aplicados, "la foto no cambió");
  assert.equal(tablet.a.pendienteDeGuardar(), false, "nada para guardar");
  await vaciar();
  assert.equal(b.foto!.version, version, "ningún guardado");
});

test("«Deshacer» saca la acción de la cola: no se re-aplica ni se espera su confirmación", async () => {
  const { tablet } = await dosPuestos();
  tablet.g.retener();
  const alta = darTurno(tablet, { ...hueco(tablet.a.estado()), titular: "Ana Ruiz" });
  assert.equal(tablet.a.sincro().enCola, 1);
  tablet.a.deshacer();
  assert.equal(tablet.a.sincro().enCola, 0);
  assert.equal(tablet.a.confirmacion(alta.id), "desconocido");
  assert.equal(M.reserva(tablet.a.estado(), alta.reservas[0]), undefined);
});

test("idempotencia: la foto guarda los ids de los últimos 500 comandos aplicados, no más", () => {
  const e = M.generarDemo(HOY, MINUTO_DEMO);
  const p = (i: number): Pendiente => ({ id: `c${i}`, ahora: { fecha: HOY, min: 0 }, auth: {}, azar: 0, idsDesde: 0, equipo: "e", puesto: "PC", persona: "", texto: "", promete: false, cambios: 0, cuando: 0 });
  for (let i = 0; i < TOPE_APLICADOS + 20; i++) anotarAplicado(e, p(i), [], i, { reciente: false });
  const { aplicados } = leerSincro(e);
  assert.equal(aplicados.length, TOPE_APLICADOS);
  assert.equal(aplicados[0], "c20", "se caen los más viejos");
  assert.equal(aplicados.at(-1), `c${TOPE_APLICADOS + 19}`);
});

test("fuera de la jornada real con base (la demo) no hay cola ni latido de versión: todo sigue como siempre", () => {
  const a = crearAlmacen({ hoy: HOY, clave: "gsg-club:demo:u1:v1", almacenamiento: null, enReposo: null });
  assert.equal(a.confirmaLaBase(), false);
  assert.deepEqual(a.puesto(), { equipo: "", nombre: "" });
  const turno = turnoQueDebe(a.estado());
  assert.equal(a.comando("cuenta", [turno, { tipo: "cobrarTodo", medio: "efectivo" }]).ok, true);
  assert.equal(a.sincro().enCola, 0);
  assert.equal((a.estado() as EstadoClub & { sincro?: unknown }).sincro, undefined, "la foto de la demo no lleva `sincro`");
});

// ── cierre de la cert de la Tanda 1 (vuelta 2): N1 · N2 · N3 ─────────────────────────────────────────────────────────

/** Un equipo (localStorage) que deja listar sus claves, para mirar qué quedó guardado. */
function disco(): AlmacenamientoLocal & { claves: () => string[]; todo: () => string } {
  const datos = new Map<string, string>();
  return {
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => void datos.set(k, String(v)),
    removeItem: (k) => void datos.delete(k),
    claves: () => [...datos.keys()],
    todo: () => [...datos.values()].join("\n"),
  };
}
const colaDe = (equipo: string) => `${claveDeLaJornada(NEGOCIO)}:cola:${equipo}`;

test("N1 · otro id de equipo en el mismo navegador NO pisa la cola del anterior: si la base avanzó, lo suyo queda «para resolver» con su autor (una vez) y se re-aplica de un toque", async () => {
  const b = baseCompartida();
  const d = disco();
  const tablet = await puesto(b, "tab1", "tablet", LU, d).abrir();
  tablet.g.caer(true);
  const turno = turnoQueDebe(tablet.a.estado());
  assert.ok(tablet.a.comando("cuenta", [turno, { tipo: "cobrarTodo", medio: "efectivo" }]).ok);
  const alta = darTurno(tablet, { canchaId: "c2", inicio: A_LAS_21, titular: "Pedro Paz" });
  await vaciar();
  const deTab1 = JSON.parse(d.getItem(colaDe("tab1"))!) as { equipo: string; pendientes: { id: string }[] };
  assert.equal(deTab1.pendientes.length, 2, "la cola de tab1 está en SU clave");
  // La base avanza desde la PC; en la tablet se borró `<clave>:equipo` (y nada más): el navegador es otro equipo.
  const pc = await puesto(b, "pc01", "PC", CARO).abrir();
  darTurno(pc, { ...hueco(pc.a.estado(), { canchaId: "c2", inicio: A_LAS_21 }), titular: "Juan Pérez" });
  await vaciar();
  const nuevo = await puesto(b, "zz99", "tablet", LU, d).abrir();
  await vaciar();
  for (let i = 0; i < 3; i++) {
    nuevo.t.correr();
    await vaciar();
  }
  const base = enLaBase(b);
  const items = leerSincro(base).paraResolver;
  assert.deepEqual(items.map((x) => x.id).sort(), deTab1.pendientes.map((x) => x.id).sort(), "lo de tab1, «para resolver» (no se perdió ni se corrió solo)");
  for (const x of items) {
    assert.match(x.texto, /Lu \(tablet\)$/, "con su autor y su puesto");
    assert.equal(x.equipo, "tab1");
    assert.ok(x.comando && !JSON.stringify(x).includes('"pin"'));
  }
  assert.ok(M.saldo(M.reserva(base, turno)!) > 0, "el cobro no se hizo solo");
  assert.equal(d.getItem(colaDe("tab1")), null, "la cola de tab1 se soltó con lo suyo ya a salvo en la base");
  assert.equal(d.getItem(colaDe("zz99")), null);
  assert.equal(nuevo.a.apartes().length, 1, "lo de la foto vieja del equipo, además, quedó aparte (la red de siempre)");
  // «Volver a aplicar» el cobro desde el equipo nuevo: una vez.
  const cobro = items.find((x) => x.comando?.nombre === "cuenta")!;
  assert.ok(nuevo.a.volverAAplicar(cobro.id).ok);
  await vaciar();
  assert.equal(M.saldo(M.reserva(enLaBase(b), turno)!), 0);
  assert.equal(nuevo.a.volverAAplicar(cobro.id).ok, false, "otra vez no");
  assert.ok(leerSincro(enLaBase(b)).paraResolver.some((x) => x.id === alta.id), "el turno de Pedro sigue para resolver");
});

test("N1 · otro id de equipo y la base NO avanzó: lo de la cola anterior sube con la foto del equipo (una vez, sin «para resolver»)", async () => {
  const b = baseCompartida();
  const d = disco();
  const tablet = await puesto(b, "tab1", "tablet", LU, d).abrir();
  tablet.g.caer(true);
  const turno = turnoQueDebe(tablet.a.estado());
  assert.ok(tablet.a.comando("cuenta", [turno, { tipo: "cobrarTodo", medio: "efectivo" }]).ok);
  await vaciar();
  const caja0 = M.resumenCaja(enLaBase(b));
  const nuevo = await puesto(b, "zz99", "tablet", LU, d).abrir();
  await vaciar();
  for (let i = 0; i < 3; i++) {
    nuevo.t.correr();
    await vaciar();
  }
  const base = enLaBase(b);
  assert.equal(M.saldo(M.reserva(base, turno)!), 0, "el cobro llegó con la foto del equipo");
  const cobrado = M.resumenCaja(tablet.a.estado()).ingresos - caja0.ingresos;
  assert.ok(cobrado > 0);
  assert.equal(M.resumenCaja(base).ingresos - caja0.ingresos, cobrado, "una sola vez");
  assert.equal(M.resumenCaja(base).movimientos, M.resumenCaja(tablet.a.estado()).movimientos);
  assert.deepEqual(leerSincro(base).paraResolver, []);
  assert.equal(d.getItem(colaDe("tab1")), null);
  assert.ok(!d.claves().some((k) => k.includes(":cola")), "no quedó ninguna cola ni índice");
});

test("N1 · la cola de la Tanda 1 (`<clave>:cola`, sin el equipo): la del mismo equipo se retoma y pasa a la clave nueva; la de otro equipo va a «para resolver»", async () => {
  const vieja = `${claveDeLaJornada(NEGOCIO)}:cola`;
  for (const mismo of [true, false]) {
    const b = baseCompartida();
    const d = disco();
    const tablet = await puesto(b, "tab1", "tablet", LU, d).abrir();
    tablet.g.caer(true);
    const turno = turnoQueDebe(tablet.a.estado());
    assert.ok(tablet.a.comando("cuenta", [turno, { tipo: "cobrarTodo", medio: "efectivo" }]).ok);
    await vaciar();
    // Como la dejaba la Tanda 1.
    d.setItem(vieja, d.getItem(colaDe("tab1"))!);
    d.removeItem(colaDe("tab1"));
    d.removeItem(`${claveDeLaJornada(NEGOCIO)}:colas`);
    const pc = await puesto(b, "pc01", "PC", CARO).abrir();
    darTurno(pc, { ...hueco(pc.a.estado()), titular: "Juan Pérez" });
    await vaciar();
    const otraVez = await puesto(b, mismo ? "tab1" : "zz99", "tablet", LU, d).abrir();
    await vaciar();
    for (let i = 0; i < 3; i++) {
      otraVez.t.correr();
      await vaciar();
    }
    const base = enLaBase(b);
    if (mismo) {
      assert.equal(M.saldo(M.reserva(base, turno)!), 0, "la del mismo equipo se re-aplica sola, como siempre");
      assert.deepEqual(leerSincro(base).paraResolver, []);
    } else {
      assert.ok(M.saldo(M.reserva(base, turno)!) > 0);
      assert.equal(leerSincro(base).paraResolver.length, 1, "la de otro equipo, «para resolver»");
    }
    assert.equal(d.getItem(vieja), null, "la clave vieja se soltó");
  }
});

/** Un fiado pedido con internet desde una cuenta del buffet: el pedido y el código que le daría el dueño. */
function fiadoPedido(p: Puesto) {
  const e0 = p.a.estado();
  const cli = e0.clientes.find((c) => !c.cc.habilitada && !e0.novedades.some((n) => n.clienteId === c.id))!;
  assert.ok(p.a.comando("buffet", [{ tipo: "abrir", titular: cli.nombre, clienteId: cli.id }]).ok);
  const cuentaId = p.a.estado().cuentas.at(-1)!.id;
  const productoId = p.a.estado().productos.find((x) => x.activo !== false && !x.alquiler && (typeof x.stock !== "number" || x.stock > 5))!.id;
  assert.ok(p.a.comando("buffet", [{ tipo: "cargar", cuentaId, productoId, cant: 2 }]).ok);
  const pedido = p.a.comando("fiado", [{ tipo: "pedir", cuentaId }]);
  assert.ok(pedido.ok, pedido.mensaje);
  const novedadId = p.a.estado().novedades.find((n) => n.clienteId === cli.id && n.estado === "pendiente")!.id;
  return { novedadId, codigo: codigoDeLaDemo(p.a.estado(), novedadId)!.codigo };
}

test("N2 · el código del dueño: la tablet lo tipea sin internet, la PC aprobó antes; el rechazo va a «para resolver» SIN el código (ni en la foto ni en el equipo) y se aprueba una sola vez", async () => {
  const b = baseCompartida();
  const d = disco();
  const tablet = await puesto(b, "tab1", "tablet", LU, d).abrir();
  const pc = await puesto(b, "pc01", "PC", CARO).abrir();
  const { novedadId, codigo } = fiadoPedido(tablet);
  await vaciar();
  await pc.latir();
  tablet.g.caer(true);
  const enLaTablet = tablet.a.comando("fiado", [{ tipo: "aprobarCodigo", novedadId, codigo }]);
  assert.ok(enLaTablet.ok, enLaTablet.mensaje);
  await vaciar();
  assert.ok(d.todo().includes("aprobarCodigo") && !d.todo().includes(codigo), "en la cola del equipo, sin el código");
  // La PC tipea el mismo código con internet: se aprueba en la base.
  assert.ok(pc.a.comando("fiado", [{ tipo: "aprobarCodigo", novedadId, codigo }]).ok);
  await vaciar();
  const credito0 = JSON.stringify(enLaBase(b).novedades.find((n) => n.id === novedadId));
  tablet.g.caer(false);
  for (let i = 0; i < 3; i++) {
    tablet.t.correr();
    await vaciar();
  }
  const base = enLaBase(b);
  const item = leerSincro(base).paraResolver.find((x) => x.comando?.nombre === "fiado");
  assert.ok(item, "lo de la tablet quedó «para resolver»");
  assert.match(item.motivo, /ya se resolvió/);
  assert.equal(JSON.stringify(base.novedades.find((n) => n.id === novedadId)), credito0, "aprobado una sola vez");
  assert.ok(!b.foto!.texto.includes(codigo), "el código no está en la foto");
  assert.ok(!d.todo().includes(codigo), "ni en el equipo");
});

test("N3 · «aplicados» rota con cada comando: un ítem que otro puesto ya resolvió a mano NO resucita aunque pasen más de 500 comandos", () => {
  const e = M.generarDemo(HOY, MINUTO_DEMO);
  const item = (id: string): ItemParaResolver => ({ id, texto: "19:42 · Turno a Pedro en C2 · Lu (tablet)", motivo: "Ese hueco ya está", cuando: 0, equipo: "tab1", puesto: "tablet", persona: "Lu", comando: null });
  const p = (i: number): Pendiente => ({ id: `pc01.${i}`, ahora: { fecha: HOY, min: 0 }, auth: {}, azar: 0, idsDesde: 0, equipo: "pc01", puesto: "PC", persona: "", texto: "", promete: false, cambios: 0, cuando: 0 });
  // Llegan a la base; la PC descarta uno y vuelve a aplicar el otro.
  assert.equal(volverAAnotar(e, [item("tab1.a"), item("tab1.b")]).anotados, 2);
  assert.ok(sacarParaResolver(e, "tab1.a"));
  assert.ok(sacarParaResolver(e, "tab1.b"));
  for (let i = 0; i < TOPE_APLICADOS + 100; i++) anotarAplicado(e, p(i), [], i, { reciente: false });
  assert.ok(!leerSincro(e).aplicados.includes("tab1.a"), "ya se cayeron de «aplicados»");
  // La tablet, que todavía los tenía sin confirmar, los vuelve a anotar sobre esta foto: no resucitan.
  const r = volverAAnotar(e, [item("tab1.a"), item("tab1.b"), item("tab1.c")]);
  assert.deepEqual(r.yaEnLaBase, ["tab1.a", "tab1.b"]);
  assert.equal(r.anotados, 1, "sólo el que nadie resolvió");
  assert.deepEqual(leerSincro(e).paraResolver.map((x) => x.id), ["tab1.c"]);
  assert.deepEqual(leerSincro(e).resueltos, ["tab1.a", "tab1.b"]);
});
