// Los comandos del club contra el motor REAL sobre la demo del día: re-aplicar sobre la misma base da el mismo estado
// (byte a byte, con la misma referencia de seña y los mismos ids); sobre una base que avanzó desde otro equipo, aplica
// lo compatible y rechaza lo que choca sin pisarlo; idempotencia, lista blanca y qué va sin internet (D4).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub } from "@/lib/club/motor.mjs";
import { operadorDeLaDemo, textoDelEstado } from "./almacen";
import { horariosLibres } from "./alta-core";
import { comandoSinPin, correrComando, describirComando, rebasar, vaSinInternet, type ArgsDe, type Comando, type NombreDeComando } from "./comandos-core";

const HOY = "2026-10-17";
const AHORA: Ahora = { fecha: HOY, min: 19 * 60 + 10 };

/** La base como la trae la red: el texto del estado recién armado. Volver a armarla es «recargar la página». */
function base(ajustar?: (e: EstadoClub) => void): { texto: string; abrir: () => EstadoClub } {
  M.prefijoIds("");
  const e = M.generarDemo(HOY, AHORA.min);
  ajustar?.(e);
  const texto = textoDelEstado(e);
  return { texto, abrir: () => (JSON.parse(texto) as { estado: EstadoClub }).estado };
}

const recepcion = (e: EstadoClub): Auth => operadorDeLaDemo(e, "RECEPTION")!.auth;

let n = 0;
/** Lo que haría el almacén en el mostrador: arma el comando con lo de ESE momento y lo corre. */
function enElMostrador<N extends NombreDeComando>(e: EstadoClub, nombre: N, args: ArgsDe<N>, ahora = AHORA): Comando<N> {
  const c: Comando<N> = { id: `cmd-${++n}`, equipo: "mostrador-1", persona: "u-lu", versionBase: 7, version: M.VERSION_ESTADO, nombre, args, ahora, auth: recepcion(e), azar: 1000 + n, idsDesde: M.secuenciaIds() };
  const d = correrComando(e, c);
  assert.equal(d.ok, true, `${nombre}: ${d.mensaje}`);
  return c;
}

/** El turno en juego de la demo que debe la cancha (Martín Ríos, Cancha 1). */
function turnoQueDebe(e: EstadoClub): string {
  const r = e.reservas.find((x) => x.fecha === HOY && x.estado === "en_cancha" && M.saldo(x) > 0);
  assert.ok(r, "la demo trae un turno en cancha que debe");
  return r.id;
}

/** Un sábado sin internet: un turno presencial sin ficha (con seña y código al azar) y cobrar todo el turno en juego. */
function sabadoSinInternet(e: EstadoClub) {
  const inicio = horariosLibres(e, HOY, "c4", 60, AHORA)[0].min;
  const alta = enElMostrador(e, "alta", [{ canchaId: "c4", fecha: HOY, inicio, duracion: 60, tipo: "turno", titular: "Grupo de Bruno", clienteId: null, otros: "" }]);
  const cobro = enElMostrador(e, "cuenta", [turnoQueDebe(e), { tipo: "cobrarTodo", medio: "efectivo" }]);
  return { alta, cobro, inicio };
}

test("re-aplicar sobre la MISMA base da el mismo estado byte a byte (la misma referencia de seña, los mismos ids)", () => {
  const b = base();
  const local = b.abrir();
  const { alta, cobro } = sabadoSinInternet(local);
  const conSena = local.reservas.at(-1)!;
  assert.ok(conSena.ref, "sin ficha, la alta pide seña con un código al azar");

  base(); // recargar la página: el contador de ids vuelve a lo de la base
  const deNuevo = b.abrir();
  const r = rebasar(deNuevo, [alta, cobro], new Set());
  assert.deepEqual(r.rechazados, []);
  assert.equal(r.aplicados.length, 2);
  assert.equal(r.idsDistintos, false);
  assert.equal(JSON.stringify(deNuevo), JSON.stringify(local));
});

test("la base avanzó desde otro equipo: lo que choca va a «Para resolver» sin pisar lo del otro; lo compatible se aplica", () => {
  const b = base();
  const local = b.abrir();
  const { alta, cobro, inicio } = sabadoSinInternet(local);
  // Lo encadenado a la alta: cobrar la seña del turno nuevo (el id lo creó la alta).
  const sena = enElMostrador(local, "cuenta", [local.reservas.at(-1)!.id, { tipo: "cobrarSena", medio: "efectivo" }]);

  // Mientras tanto, en el otro equipo (con internet), alguien dio ESE hueco por teléfono.
  base();
  const enLaBase = b.abrir();
  M.prefijoIds("b-");
  const delOtro = enElMostrador(enLaBase, "alta", [{ canchaId: "c4", fecha: HOY, inicio, duracion: 60, tipo: "turno", titular: "Paula Gómez", clienteId: null, otros: "" }]);
  const turnoDelOtro = enLaBase.reservas.at(-1)!;
  assert.ok(delOtro);
  M.prefijoIds("");

  const r = rebasar(enLaBase, [alta, cobro, sena], new Set());
  assert.deepEqual(r.aplicados.map((c) => c.id), [cobro.id], "el cobro en efectivo del turno en juego no choca con nada");
  assert.deepEqual(r.rechazados.map((x) => x.comando.id), [alta.id, sena.id]);
  for (const x of r.rechazados) assert.ok(x.motivo.trim().length > 0, "cada rechazo dice por qué");
  // Lo del otro equipo sigue intacto.
  assert.deepEqual(M.reserva(enLaBase, turnoDelOtro.id), turnoDelOtro);
  assert.equal(M.saldo(M.reserva(enLaBase, turnoQueDebeId(local, cobro))!), 0, "el turno en juego quedó cobrado");
});

const turnoQueDebeId = (_e: EstadoClub, c: Comando) => (c.args as ArgsDe<"cuenta">)[0];

test("idempotencia: lo que la base ya aplicó (subió antes del corte) no se aplica dos veces", () => {
  const b = base();
  const local = b.abrir();
  const { alta, cobro } = sabadoSinInternet(local);
  base();
  const enLaBase = b.abrir();
  rebasar(enLaBase, [alta], new Set());
  const antes = JSON.stringify(enLaBase);
  const r = rebasar(enLaBase, [alta, cobro], new Set([alta.id]));
  assert.deepEqual(r.salteados.map((c) => c.id), [alta.id]);
  assert.deepEqual(r.aplicados.map((c) => c.id), [cobro.id]);
  assert.notEqual(JSON.stringify(enLaBase), antes);
  assert.equal(enLaBase.reservas.filter((x) => x.titular === "Grupo de Bruno").length, 1, "un solo turno de Bruno");
});

test("lista blanca: un nombre que no está (o uno del prototipo) no corre, ni con otra versión del motor", () => {
  const e = base().abrir();
  const antes = JSON.stringify(e);
  const falso = (nombre: string, extra: Partial<Comando> = {}) =>
    ({ id: "x", equipo: "e", persona: "p", versionBase: 1, version: M.VERSION_ESTADO, nombre, args: [], ahora: AHORA, auth: {}, azar: 1, idsDesde: 0, ...extra }) as unknown as Comando;
  for (const nombre of ["borrarTodo", "toString", "__proto__", "constructor"]) {
    const d = correrComando(e, falso(nombre));
    assert.equal(d.ok, false, nombre);
    assert.match(d.mensaje, /no se reconoce/);
  }
  const vieja = correrComando(e, falso("caja", { version: 99 as never, args: [{ tipo: "fondo", monto: "1000" }] as never }));
  assert.equal(vieja.ok, false);
  assert.match(vieja.mensaje, /otra versión/);
  assert.equal(JSON.stringify(e), antes, "nada cambió");
});

test("misma pestaña sin recargar (o «Volver a aplicar» una hora después): aunque el contador ya pasó, salen los MISMOS ids y nunca se repite uno", () => {
  const b = base();
  const local = b.abrir();
  const { alta } = sabadoSinInternet(local);
  const turno = local.reservas.at(-1)!;
  const contador = M.secuenciaIds();
  const otra = b.abrir();
  const r = rebasar(otra, [alta], new Set()); // sin `base()`: el contador sigue donde quedó
  assert.equal(r.aplicados.length, 1);
  assert.equal(r.idsDistintos, false);
  assert.equal(otra.reservas.at(-1)!.id, turno.id, "el mismo id de turno");
  assert.equal(otra.reservas.at(-1)!.ref, turno.ref, "el mismo código de seña");
  assert.equal(M.secuenciaIds(), contador, "el contador queda en lo más alto: lo próximo no repite un id");
});

test("con el prefijo del puesto: re-aplicado en OTRO puesto (otro prefijo en el proceso) da los ids del puesto donde se hizo", () => {
  const b = base();
  const local = b.abrir();
  const inicio = horariosLibres(local, HOY, "c4", 60, AHORA)[0].min;
  const datos = { canchaId: "c4", fecha: HOY, inicio, duracion: 60, tipo: "turno" as const, titular: "Grupo de Bruno", clienteId: null, otros: "" };
  const c: Comando<"alta"> = { id: "x1", equipo: "tab1", persona: "u-lu", versionBase: 1, version: M.VERSION_ESTADO, nombre: "alta", args: [datos], ahora: AHORA, auth: recepcion(local), azar: 77, idsDesde: M.secuenciaIds(), prefijo: "tab1-" };
  assert.equal(correrComando(local, c).ok, true);
  const id = local.reservas.at(-1)!.id;
  assert.match(id, /^tab1-/);
  M.prefijoIds("pc01-");
  const otra = b.abrir();
  assert.equal(correrComando(otra, c).ok, true);
  assert.equal(otra.reservas.at(-1)!.id, id, "el mismo id, con el prefijo de la tablet");
  M.prefijoIds("");
});

test("(e) describirComando: qué se hizo en criollo, con la hora, quién y en qué puesto — nunca un PIN", () => {
  const e = base().abrir();
  const r = e.reservas.find((x) => x.fecha === HOY && x.canchaId === "c2" && x.estado !== "cancelada")!;
  const c: Comando<"cuenta"> = {
    id: "x",
    equipo: "tab1",
    puesto: "tablet",
    persona: "u-lu",
    versionBase: 1,
    version: M.VERSION_ESTADO,
    nombre: "cuenta",
    args: [r.id, { tipo: "cobrarCancha", monto: 9000, medio: "efectivo" }],
    ahora: { fecha: HOY, min: 19 * 60 + 42 },
    auth: { usuarioId: "u-lu", pin: "33" },
    azar: 1,
    idsDesde: 0,
  };
  assert.equal(describirComando(c, e), `19:42 · Cobro $ 9.000 efectivo a ${r.titular} (turno ${M.hhmm(r.inicio)} C2) · Lu (tablet)`);
  // Sin el estado (otro puesto que no tiene ese turno), lo que dice el comando, sin romperse.
  assert.equal(describirComando(c), "19:42 · Cobro $ 9.000 efectivo a quien jugaba · tablet");
  const alta: Comando<"alta"> = { ...c, nombre: "alta", args: [{ canchaId: "c2", fecha: HOY, inicio: 21 * 60, duracion: 90, tipo: "turno", titular: "Juan", clienteId: null, otros: "" }] } as Comando<"alta">;
  assert.equal(describirComando(alta, e), "19:42 · Turno a Juan en C2 a las 21:00 (90 min) · Lu (tablet)");
  const sinPin = comandoSinPin({ ...c, nombre: "caja", args: [{ tipo: "egreso", monto: 500, concepto: "hielo", pin: "1111" }] } as unknown as Comando);
  assert.doesNotMatch(JSON.stringify(sinPin), /"pin"/, "ni el del operador ni el tipeado");
  assert.equal(describirComando(sinPin, e), "19:42 · Egreso de caja $ 500 «hielo» · Lu (tablet)");
});

test("qué va sin internet (D4, versión del Challenger): sólo lo que hace entrar plata en efectivo o créditos; egreso, devolución, MP, transferencia, débito, cierre y reordenar la agenda no", () => {
  const casos: [string, unknown, boolean][] = [
    ["cuenta", ["r1", { tipo: "cobrarTodo", medio: "efectivo" }], true],
    ["cuenta", ["r1", { tipo: "cobrarJugador", idx: 0, medio: "monedero" }], true],
    ["cuenta", ["r1", { tipo: "cobrarTodo", medio: "mercadopago" }], false],
    ["cuenta", ["r1", { tipo: "cobrarCancha", monto: 1, medio: "transferencia" }], false],
    ["cuenta", ["r1", { tipo: "cobrarTodo", medio: "debito" }], false],
    ["cuenta", ["r1", { tipo: "abrirCancha" }], true],
    ["cuenta", ["r1", { tipo: "cargo", idx: 0, productoId: "p", cant: 1, modo: "cuenta", medio: "mercadopago" }], true],
    ["cuenta", ["r1", { tipo: "cargo", idx: 0, productoId: "p", cant: 1, modo: "cobrar", medio: "mercadopago" }], false],
    ["ciclo", ["r1", { tipo: "falta", cobrarA: "titular" }], true],
    ["ciclo", ["r1", { tipo: "mover", canchaId: "c2", inicio: 600 }], false],
    ["ciclo", ["r1", { tipo: "cancelar", porClub: false, motivo: "" }], false],
    ["buffet", [{ tipo: "cobrar", cuentaId: "k", medio: "efectivo" }], true],
    ["buffet", [{ tipo: "cobrar", cuentaId: "k", medio: "mercadopago" }], false],
    ["buffet", [{ tipo: "cargar", cuentaId: "k", productoId: "p", cant: 1 }], true],
    ["mesa", [{ tipo: "cargoManual", cuentaId: "k", concepto: "x", monto: 1, descuento: true, pin: "1234" }], false],
    ["caja", [{ tipo: "egreso", monto: "500", concepto: "hielo", pin: "33" }], false],
    ["ciclo", ["r1", { tipo: "devolver", medio: "efectivo" }], false],
    ["ciclo", ["r1", { tipo: "cobrarFalta", medio: "efectivo" }], true],
    ["caja", [{ tipo: "cerrar", contado: "0", dia: null, pin: "1234" }], false],
    ["caja", [{ tipo: "fondo", monto: "500" }], false],
    ["alta", [{}], true],
    ["borrarTodo", [], false],
    ["cuenta", "no es una lista", false],
  ];
  for (const [nombre, args, esperado] of casos) assert.equal(vaSinInternet(nombre, args), esperado, `${nombre} ${JSON.stringify(args)}`);
});

test("rinde: re-aplicar 500 comandos sobre la demo tarda poco (cota holgada para CI; la de mostrador va en el navegador)", (t) => {
  // Un sábado de torneo: stock de sobra para que los 500 cargos entren.
  let productoId = "";
  const conStock = (e: EstadoClub) => {
    const p = e.productos.find((x) => x.activo !== false && typeof x.stock === "number")!;
    p.stock = 10_000;
    productoId = p.id;
  };
  const b = base(conStock);
  const local = b.abrir();
  const turno = turnoQueDebe(local);
  const pendientes: Comando[] = [];
  for (let i = 0; i < 500; i++) {
    const c = enElMostrador(local, "cuenta", [turno, { tipo: "cargo", idx: 0, productoId, cant: 1, modo: "cuenta", medio: "efectivo" }]);
    pendientes.push(c);
  }
  base(conStock);
  const deNuevo = b.abrir();
  const t0 = performance.now();
  const r = rebasar(deNuevo, pendientes, new Set());
  const ms = performance.now() - t0;
  assert.equal(r.aplicados.length, 500);
  assert.equal(JSON.stringify(deNuevo), JSON.stringify(local));
  t.diagnostic(`500 comandos re-aplicados en ${ms.toFixed(0)} ms`);
  assert.ok(ms < 1500, `${ms.toFixed(0)} ms`);
});

// ── F3 del certificador: cada pantalla despacha un comando con nombre ────────────────────────────────────────────────
// Por cada comando que ahora sale de una pantalla: corrido en el mostrador y re-aplicado sobre la MISMA base da el mismo
// estado byte a byte (mismos ids, mismo azar), y se cuenta en criollo (no «Operación …»).

const duenio = (e: EstadoClub): Auth => operadorDeLaDemo(e, "OWNER")!.auth;

function conAuth<N extends NombreDeComando>(e: EstadoClub, nombre: N, args: ArgsDe<N>, auth: Auth): Comando<N> {
  const c: Comando<N> = { id: `cmd-${++n}`, equipo: "mostrador-1", persona: auth.usuarioId ?? "", versionBase: 7, version: M.VERSION_ESTADO, nombre, args, ahora: AHORA, auth, azar: 2000 + n, idsDesde: M.secuenciaIds() };
  const d = correrComando(e, c);
  assert.equal(d.ok, true, `${nombre}: ${d.mensaje}`);
  return c;
}

type Caso = { nombre: NombreDeComando; args: (e: EstadoClub) => unknown; duenio?: boolean };
const productoConStock = (e: EstadoClub) => e.productos.find((p) => p.activo !== false && !p.alquiler && (typeof p.stock !== "number" || p.stock > 5))!.id;
const huecoLibre = (e: EstadoClub) => horariosLibres(e, HOY, "c3", 60, AHORA)[0].min;
const CASOS: Caso[] = [
  { nombre: "luz", args: (e) => [e.canchas[0].id, !e.luces[e.canchas[0].id]] },
  { nombre: "ciclo", args: (e) => [e.reservas.find((x) => x.fecha === HOY && x.estado === "reservada" && x.inicio > AHORA.min)!.id, { tipo: "cancelar", porClub: false, motivo: "Avisó que no viene" }] },
  { nombre: "cuenta", args: (e) => [turnoQueDebe(e), { tipo: "cargo", idx: 0, productoId: productoConStock(e), cant: 1, modo: "cuenta", medio: "efectivo" }] },
  { nombre: "buffet", args: () => [{ tipo: "abrir", titular: "Mesa del fondo", clienteId: null }] },
  { nombre: "caja", args: () => [{ tipo: "fondo", monto: "15000" }], duenio: true },
  { nombre: "venta", args: (e) => [{ [productoConStock(e)]: 2 }, "efectivo"] },
  { nombre: "espera", args: () => [{ tipo: "anotar", titular: "Lola Paz", clienteId: null, fecha: HOY, desde: 20 * 60, hasta: 23 * 60, duracion: 60, soloCubierta: false }] },
  { nombre: "esperaDesdeAlta", args: () => [{ titular: "Lola Paz", clienteId: null, tel: "", espera: { fecha: HOY, desde: 20 * 60, hasta: 23 * 60, duracion: 60 } }] },
  { nombre: "fijo", args: (e) => [{ tipo: "nuevo", datos: { titular: "Los del martes", clienteId: null, canchaId: "c3", dia: M.diaSemana(M.sumarDias(HOY, 1)), inicio: horariosLibres(e, M.sumarDias(HOY, 1), "c3", 60, AHORA)[0].min, duracion: 60 } }] },
  { nombre: "canchas", args: () => [{ tipo: "bloquear", canchaId: "c3", fecha: M.sumarDias(HOY, 2), desde: 8 * 60, hasta: 9 * 60, motivo: "Arreglo de la red" }], duenio: true },
  { nombre: "clientes", args: () => [{ tipo: "alta", nombre: "Lola Paz", tel: "11 5555 1234", nivel: "" }] },
  { nombre: "stock", args: () => [{ tipo: "alta", nombre: "Agua saborizada", categoria: "Bebidas", precio: "1500", costo: "700", minimo: "2", stock: "10", codigo: "", codigoExterno: "", plato: false }], duenio: true },
  { nombre: "proveedores", args: () => [{ tipo: "alta", nombre: "Distribuidora Sur", rubro: "Bebidas", cuit: "", tel: "" }], duenio: true },
];

for (const caso of CASOS) {
  test(`comando «${caso.nombre}» (lo despacha la pantalla): re-aplicado sobre la misma base da lo mismo, y se cuenta en criollo`, () => {
    const b = base();
    const local = b.abrir();
    const c = conAuth(local, caso.nombre, caso.args(local) as ArgsDe<typeof caso.nombre>, caso.duenio ? duenio(local) : recepcion(local));
    base();
    const deNuevo = b.abrir();
    const r = rebasar(deNuevo, [c], new Set());
    assert.deepEqual(r.rechazados, [], JSON.stringify(r.rechazados));
    assert.equal(JSON.stringify(deNuevo), JSON.stringify(local), "el mismo estado, byte a byte");
    const texto = describirComando(c, deNuevo);
    assert.doesNotMatch(texto, /Operación «/, texto);
  });
}

test("comando «espera» asignar: si el hueco ya lo dio otro puesto, el motor dice que no (va a «Para resolver»), no se pisa", () => {
  const b = base((e) => M.anotarEspera(e, { titular: "Lola Paz", clienteId: null, tel: "", fecha: HOY, desde: 20 * 60, hasta: 23 * 60, duracion: 60 }, AHORA));
  const local = b.abrir();
  const inicio = huecoLibre(local);
  const esperaId = local.espera.at(-1)!.id;
  const c = enElMostrador(local, "espera", [{ tipo: "asignar", esperaId, canchaId: "c3", inicio }]);
  base();
  const enLaBase = b.abrir();
  M.prefijoIds("b-");
  enElMostrador(enLaBase, "alta", [{ canchaId: "c3", fecha: HOY, inicio, duracion: 60, tipo: "turno", titular: "Paula Gómez", clienteId: null, otros: "" }]);
  M.prefijoIds("");
  const r = rebasar(enLaBase, [c], new Set());
  assert.equal(r.rechazados.length, 1);
  assert.equal(enLaBase.reservas.filter((x) => x.canchaId === "c3" && x.inicio === inicio && x.fecha === HOY && x.estado === "reservada").length, 1);
});

test("caja con PIN tipeado: el comando que va a la foto no lleva el PIN (al re-aplicarse en otro puesto, lo vuelve a pedir)", () => {
  const c = { id: "x", equipo: "e", persona: "u", versionBase: 1, version: M.VERSION_ESTADO, nombre: "caja", args: [{ tipo: "egreso", monto: "500", concepto: "Hielo", pin: "1111" }], ahora: AHORA, auth: { usuarioId: "u", pin: "1111" }, azar: 1, idsDesde: 0 } as Comando<"caja">;
  assert.ok(!JSON.stringify(comandoSinPin(c)).includes("1111"));
});
