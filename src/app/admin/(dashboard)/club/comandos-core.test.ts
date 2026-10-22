// Los comandos del club contra el motor REAL sobre la demo del día: re-aplicar sobre la misma base da el mismo estado
// (byte a byte, con la misma referencia de seña y los mismos ids); sobre una base que avanzó desde otro equipo, aplica
// lo compatible y rechaza lo que choca sin pisarlo; idempotencia, lista blanca y qué va sin internet (D4).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub } from "@/lib/club/motor.mjs";
import { operadorDeLaDemo, textoDelEstado } from "./almacen";
import { horariosLibres } from "./alta-core";
import { comandoSinPin, correrComando, describirComando, FALTA_CODIGO, rebasar, REGISTRO, vaSinInternet, type ArgsDe, type Comando, type NombreDeComando } from "./comandos-core";
import { codigoDeLaDemo } from "./credito-core";
import { altaEquivalente } from "./sincro-core";
import { ejecutarConfiguracion, huellaDelElegido, respaldoAntesDeLimpiar, valoresDeReglas } from "./configuracion-core";

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
    // Fiado no va sin internet (D4), tampoco el código del dueño: sale del PIN del dueño que está en el estado (H-T2-1).
    ["fiado", [{ tipo: "pedir", cuentaId: "k" }], false],
    ["fiado", [{ tipo: "aprobarCodigo", novedadId: "n", codigo: "ABC-DEF" }], false],
    ["clientes", [{ tipo: "aprobarCodigo", novedadId: "n", codigo: "ABC-DEF", monto: "100" }], false],
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

// ── N2 de la cert de la Tanda 1: ningún secreto de la lista blanca queda en la cola ni en la foto ─────────────────────
// Revisada la lista entera: `pin` (caja, mesa, proveedores, config), el código del dueño (`codigo` de «aprobarCodigo» en
// fiado y clientes) y los PIN que se arman en Configuración (`repetido`, `actual`, `nuevo`). El `codigo` de stock es el
// del producto (no es secreto): se queda.

test("N2 · comandoSinPin saca el código del dueño (fiado y clientes) y los PIN de Configuración; el código de un producto queda", () => {
  const c = (nombre: string, args: unknown[]) => ({ id: "x", equipo: "e", persona: "u", versionBase: 1, version: M.VERSION_ESTADO, nombre, args, ahora: AHORA, auth: { usuarioId: "u", pin: "1111" }, azar: 1, idsDesde: 0 }) as unknown as Comando;
  const casos: [Comando, string[]][] = [
    [c("fiado", [{ tipo: "aprobarCodigo", novedadId: "n1", codigo: "ABC-DEF" }]), ["ABC-DEF", '"codigo"']],
    [c("clientes", [{ tipo: "aprobarCodigo", novedadId: "n1", codigo: "QWE-RTY", monto: "4000" }]), ["QWE-RTY", '"codigo"']],
    [c("config", [{ tipo: "pinInicial", usuarioId: "u1", pin: "3851", repetido: "3851" }]), ["3851"]],
    [c("config", [{ tipo: "cambiarMiPin", actual: "1111", nuevo: "4826", repetido: "4826" }]), ["1111", "4826"]],
    [c("config", [{ tipo: "alta", nombre: "Nico", rol: "recepcion", pin: "1111" }]), ["1111"]],
    [c("golive", [{ conservarSaldos: true, conservarStock: true, pin: "1111", descargado: null, huellaElegida: "h", rol: "OWNER" }]), ["1111"]],
    [c("comandoQueNoExiste", [{ pin: "1111" }]), ["1111"]],
  ];
  for (const [comando, prohibidos] of casos) {
    const texto = JSON.stringify(comandoSinPin(comando));
    for (const x of prohibidos) assert.ok(!texto.includes(x), `${comando.nombre}: ${texto}`);
  }
  const stock = JSON.stringify(comandoSinPin(c("stock", [{ tipo: "alta", nombre: "Agua", categoria: "Bebidas", precio: "1", costo: "1", minimo: "1", stock: "1", codigo: "779123", codigoExterno: "", plato: false }])));
  assert.match(stock, /"codigo":"779123"/, "el código de barras del producto no es un secreto");
  // Lo que queda sigue diciendo qué se hizo (sin el secreto).
  assert.equal(describirComando(comandoSinPin(casos[0][0])), "19:10 · Aprobar un fiado con el código del dueño");
});

test("N2 · un fiado aprobado sin internet y re-aplicado SIN el código (después de recargar) no se aprueba: lo vuelve a pedir", () => {
  const b = base((e) => {
    const cli = e.clientes.find((x) => !x.cc.habilitada && !e.novedades.some((n) => n.clienteId === x.id))!;
    assert.equal(M.solicitarCredito(e, { clienteId: cli.id, tipo: "fiado", monto: 4000 }, recepcion(e), AHORA).ok, true);
  });
  const local = b.abrir();
  const n0 = local.novedades.find((x) => x.estado === "pendiente" && x.tipo === "fiado")!;
  const { codigo } = codigoDeLaDemo(local, n0.id)!;
  const c = enElMostrador(local, "fiado", [{ tipo: "aprobarCodigo", novedadId: n0.id, codigo }]);
  base();
  const deNuevo = b.abrir();
  const r = rebasar(deNuevo, [comandoSinPin(c)], new Set());
  assert.equal(r.rechazados.length, 1);
  assert.equal(r.rechazados[0].motivo, FALTA_CODIGO);
  assert.equal(deNuevo.novedades.find((x) => x.id === n0.id)!.estado, "pendiente");
  assert.equal(deNuevo.novedades.find((x) => x.id === n0.id)!.intentos ?? 0, 0, "no cuenta como un código mal");
  // Con el código (la misma pestaña, en memoria) sí: igual que la primera vez.
  base();
  const conCodigo = b.abrir();
  assert.equal(rebasar(conCodigo, [c], new Set()).aplicados.length, 1);
  assert.equal(JSON.stringify(conCodigo), JSON.stringify(local));
});

// ── N4 de la cert de la Tanda 1: Configuración despacha comandos con nombre («config», «abrirClub», «golive») ─────────

const conPinesConHash = (e: EstadoClub) => void M.pasarPinesAHash(e);
const DUENIO_DEMO: Auth = { usuarioId: "u-rober", pin: "1111" };
const CASOS_CONFIG: { que: string; args: (e: EstadoClub) => ArgsDe<"config"> }[] = [
  { que: "reglas", args: (e) => { const v = valoresDeReglas(e); return [{ tipo: "reglas", ...v, politica: { ...v.politica, toleranciaMin: "12" }, tarifas: v.tarifas.map((t) => String(Number(t) + 500)) }]; } },
  { que: "horarios", args: (e) => [{ tipo: "horarios", dias: [{ dia: 2, abre: e.config.horarios[2].abre, cierra: e.config.horarios[2].cierra - e.config.paso }] }] },
  { que: "avisos", args: () => [{ tipo: "avisos", celulares: {}, club: "", alias: "breakpoint.padel" }] },
  { que: "sacarAcceso", args: () => [{ tipo: "sacarAcceso", usuarioId: "u-lu", pin: "1111" }] },
  { que: "cambiarMiPin", args: () => [{ tipo: "cambiarMiPin", actual: "1111", nuevo: "4826", repetido: "4826" }] },
];

for (const caso of CASOS_CONFIG) {
  test(`N4 · comando «config» ${caso.que}: re-aplicado sobre la misma base da lo mismo byte a byte, y se cuenta en criollo`, () => {
    const b = base(conPinesConHash);
    const local2 = b.abrir();
    // Configuración la firma un dueño.
    const conDuenio = { id: `cfg-${++n}`, equipo: "pc01", persona: "u-rober", versionBase: 1, version: M.VERSION_ESTADO, nombre: "config", args: caso.args(local2), ahora: AHORA, auth: DUENIO_DEMO, azar: 3000 + n, idsDesde: M.secuenciaIds() } as Comando<"config">;
    const d = correrComando(local2, conDuenio);
    assert.equal(d.ok, true, d.mensaje);
    base(conPinesConHash);
    const deNuevo = b.abrir();
    const r = rebasar(deNuevo, [conDuenio], new Set());
    assert.deepEqual(r.rechazados, [], JSON.stringify(r.rechazados));
    assert.equal(JSON.stringify(deNuevo), JSON.stringify(local2), "el mismo estado, byte a byte");
    assert.doesNotMatch(describirComando(conDuenio, deNuevo), /Operación «/);
  });
}

test("N4 · «config» alta y PIN nuevo: el PIN se muestra UNA vez, así que re-aplicados no se repiten solos (van a «Para resolver»)", () => {
  const b = base(conPinesConHash);
  const local = b.abrir();
  for (const a of [{ tipo: "alta", nombre: "Nico", rol: "recepcion", pin: "1111" }, { tipo: "pinNuevo", usuarioId: "u-lu", pin: "1111" }] as const) {
    const primera = ejecutarConfiguracion(local, a, AHORA, DUENIO_DEMO);
    assert.equal(primera.ok, true, primera.mensaje);
    assert.ok(primera.pinNuevo?.pin, "la primera vez se ve el PIN");
    const c = { id: `cfg-${a.tipo}`, equipo: "pc01", persona: "u-rober", versionBase: 1, version: M.VERSION_ESTADO, nombre: "config", args: [a], ahora: AHORA, auth: DUENIO_DEMO, azar: 3, idsDesde: 0 } as Comando<"config">;
    const otra = b.abrir();
    const antes = JSON.stringify(otra);
    const r = rebasar(otra, [c], new Set());
    assert.equal(r.rechazados.length, 1, a.tipo);
    assert.match(r.rechazados[0].motivo, /PIN nuevo ya se mostró/);
    assert.equal(JSON.stringify(otra), antes, `${a.tipo}: no generó un PIN distinto del que se vio`);
  }
});

test("N4 · «abrirClub»: re-aplicado sobre la misma base abre el club igual; sobre uno ya abierto dice que no", () => {
  const sinAbrir = (e: EstadoClub) => {
    e.config.configurado = false;
  };
  const b = base(sinAbrir);
  const local = b.abrir();
  const c = { id: "ab1", equipo: "pc01", persona: "u-rober", versionBase: 1, version: M.VERSION_ESTADO, nombre: "abrirClub", args: [], ahora: AHORA, auth: DUENIO_DEMO, azar: 4, idsDesde: M.secuenciaIds() } as Comando<"abrirClub">;
  assert.equal(correrComando(local, c).ok, true);
  base(sinAbrir);
  const deNuevo = b.abrir();
  assert.equal(rebasar(deNuevo, [c], new Set()).aplicados.length, 1);
  assert.equal(JSON.stringify(deNuevo), JSON.stringify(local));
  assert.equal(rebasar(deNuevo, [c], new Set()).rechazados[0]?.motivo, "El club ya está abierto.");
  assert.equal(describirComando(c), "19:10 · Abrir el club");
});

test("N4 · «golive» lleva la huella del respaldo (no el archivo): sobre la misma base limpia igual; si la base avanzó, no limpia", () => {
  // Un club real recién configurado (sin nada pendiente para el go-live), con un dueño con PIN.
  M.prefijoIds("");
  const club = M.crearClubReal(HOY);
  const duenioId = club.usuarios.find((u) => u.rol === "duenio")!.id;
  assert.equal(M.definirPinInicial(club, duenioId, "3851", AHORA).ok, true);
  const quien: Auth = { usuarioId: duenioId, pin: "3851" };
  assert.equal(M.altaCliente(club, { nombre: "Ana Ruiz", tel: "11 5555 0000" }, AHORA).ok, true);
  const texto = textoDelEstado(club);
  const abrir = () => (JSON.parse(texto) as { estado: EstadoClub }).estado;
  const local = abrir();
  const bajado = respaldoAntesDeLimpiar(local, duenioId, 1);
  const elegido = huellaDelElegido(bajado.texto);
  assert.ok(elegido.ok);
  assert.equal(huellaDelElegido("{roto").ok, false);
  const pedido = { conservarSaldos: true, conservarStock: true, pin: "3851", descargado: { huella: bajado.huella, nombre: bajado.nombre }, huellaElegida: elegido.huella, rol: "OWNER" };
  const c = { id: "gl1", equipo: "pc01", persona: duenioId, versionBase: 1, version: M.VERSION_ESTADO, nombre: "golive", args: [pedido], ahora: AHORA, auth: quien, azar: 5, idsDesde: M.secuenciaIds() } as Comando<"golive">;
  const d = correrComando(local, c);
  assert.equal(d.ok, true, d.mensaje);
  assert.ok(!JSON.stringify(c).includes(bajado.texto.slice(0, 200)), "el comando no lleva el archivo");
  const igual = abrir();
  assert.equal(rebasar(igual, [c], new Set()).aplicados.length, 1);
  assert.equal(JSON.stringify(igual), JSON.stringify(local), "sobre la misma base: lo mismo");
  // La base avanzó (otro puesto dio de alta un cliente): el respaldo ya no es esa jornada, no se limpia.
  const avanzo = abrir();
  assert.equal(M.altaCliente(avanzo, { nombre: "Beto Sosa", tel: "11 5555 1111" }, AHORA).ok, true);
  const antes = JSON.stringify(avanzo);
  const r = rebasar(avanzo, [c], new Set());
  assert.equal(r.rechazados.length, 1);
  assert.match(r.rechazados[0].motivo, /Cambió algo desde que descargaste el respaldo/);
  assert.equal(JSON.stringify(avanzo), antes, "no se tocó nada");
  // Sin el PIN (después de recargar) tampoco.
  const sinPin = rebasar(abrir(), [comandoSinPin(c)], new Set());
  assert.equal(sinPin.rechazados.length, 1);
});

// ── Tanda 2 · integración: ningún secreto queda en la cola, recorriendo el REGISTRO ENTERO ──────────────────────────
// Una muestra (o varias) por CADA comando de la lista blanca: el tipo obliga a que estén todos (un comando nuevo sin
// muestra no compila). A cada argumento se le mete además un PIN arriba y otro ANIDADO, y quien opera firma con su PIN:
// lo que queda para la cola y la foto (`comandoSinPin`) no puede tener ni la palabra «pin» ni ningún valor secreto.

const PIN = "8642";
const CODIGO_DEL_DUENIO = "ZXC-VBN";
const PIN_QUE_SE_ARMA = "5173";
const MUESTRAS: { [N in NombreDeComando]: unknown[][] } = {
  cuenta: [["r1", { tipo: "cobrarJugador", idx: 0, medio: "monedero", resto: "mercadopago", usa: 4000 }], ["r1", { tipo: "cargo", idx: 0, productoId: "p1", cant: 1, modo: "cuenta", medio: "efectivo" }]],
  ciclo: [["r1", { tipo: "devolver", medio: "efectivo" }], ["r1", { tipo: "mover", canchaId: "c2", inicio: 1200 }]],
  buffet: [[{ tipo: "cobrar", cuentaId: "k1", medio: "efectivo" }]],
  mesa: [[{ tipo: "cargoManual", cuentaId: "k1", concepto: "Cortesía", monto: 1000, descuento: true, pin: PIN }]],
  caja: [[{ tipo: "egreso", monto: "500", concepto: "Hielo", pin: PIN }], [{ tipo: "cerrar", contado: "10000", dia: null, pin: PIN }]],
  alta: [[{ canchaId: "c1", fecha: HOY, inicio: 1200, duracion: 90, tipo: "turno", titular: "Ana", clienteId: null, otros: "" }]],
  esperaDesdeAlta: [[{ titular: "Ana", clienteId: null, fecha: HOY, desde: 1200, hasta: 1320, duracion: 90 }]],
  espera: [[{ tipo: "asignar", esperaId: "e1", canchaId: "c1", inicio: 1200 }]],
  fijo: [[{ tipo: "baja", fijoId: "f1" }]],
  luz: [["c1", true]],
  canchas: [[{ tipo: "lluvia", fecha: HOY, desde: 1200, hasta: 1320 }]],
  venta: [[{ p1: 2 }, "efectivo"]],
  fiado: [[{ tipo: "aprobarCodigo", novedadId: "n1", codigo: CODIGO_DEL_DUENIO }]],
  clientes: [[{ tipo: "aprobarCodigo", novedadId: "n1", codigo: CODIGO_DEL_DUENIO, monto: "4000" }]],
  tienda: [[{ tipo: "entregar", pedidoId: "pd1", medio: "efectivo" }]],
  stock: [[{ tipo: "alta", nombre: "Agua", categoria: "Bebidas", precio: "1", costo: "1", minimo: "1", stock: "1", codigo: "779123", codigoExterno: "", plato: false }]],
  proveedores: [[{ tipo: "pagar", proveedorId: "pv1", medio: "efectivo", monto: "1000", pin: PIN }]],
  novedades: [[{ tipo: "baja", clienteId: "k1", volver: false }]],
  tablero: [[{ tipo: "autorizar", novedadId: "n1", monto: "4000" }]],
  config: [
    [{ tipo: "pinInicial", usuarioId: "u1", pin: PIN_QUE_SE_ARMA, repetido: PIN_QUE_SE_ARMA }],
    [{ tipo: "cambiarMiPin", actual: PIN, nuevo: PIN_QUE_SE_ARMA, repetido: PIN_QUE_SE_ARMA }],
  ],
  abrirClub: [[]],
  golive: [[{ conservarSaldos: true, conservarStock: true, pin: PIN, descargado: null, huellaElegida: "h", rol: "OWNER" }]],
  plata: [[{ tipo: "esperarOK", novedadId: "n1" }]],
  bandeja: [[{ tipo: "posponer", clave: "stock:p1" }]],
  ventaACuenta: [["k1", { p1: 2 }]],
  abrirConDeuda: [["r1", "mercadopago"]],
  cierre: [
    [{ tipo: "cerrarYAbrir", cerrarId: "r1", abrirId: "r2", medio: "efectivo", aCuenta: false, seguir: true, medioSena: "transferencia" }],
    [{ tipo: "mesaSigue", reservaId: "r1", porJugador: { 0: "efectivo", 1: "mercadopago" }, medio: null }],
  ],
  bajaDeFijo: [[{ tipo: "baja", fijoId: "f1", desde: "2026-10-20" }], [{ tipo: "pausa", fijoId: "f1", desde: "2026-10-20", hasta: "2027-01-31" }], [{ tipo: "liberar", fijoId: "f1", fecha: "2026-11-10" }]],
};

/** Mete un PIN arriba y otro anidado en cada objeto de los argumentos (lo que una acción futura podría traer). */
const conPinesMetidos = (args: unknown[]) => args.map((x) => (x && typeof x === "object" && !Array.isArray(x) ? { ...x, pin: PIN, anidado: { pin: PIN, lista: [{ pin: PIN }] } } : x));

test("Tanda 2 · el REGISTRO entero: todo comando declara sus secretos y ninguno deja un PIN o el código del dueño en la cola ni en la foto", () => {
  const nombres = Object.keys(REGISTRO) as NombreDeComando[];
  assert.deepEqual(nombres.slice().sort(), Object.keys(MUESTRAS).sort(), "una muestra por cada comando de la lista blanca");
  for (const nombre of nombres) {
    assert.ok(Array.isArray(REGISTRO[nombre].secretos), `${nombre}: declara sus secretos (aunque sea [])`);
    for (const args of MUESTRAS[nombre]) {
      for (const variante of [args, conPinesMetidos(args)]) {
        const c = { id: "x", equipo: "e", persona: "u", versionBase: 1, version: M.VERSION_ESTADO, nombre, args: variante, ahora: AHORA, auth: { usuarioId: "u", pin: PIN }, azar: 1, idsDesde: 0 } as unknown as Comando;
        const texto = JSON.stringify(comandoSinPin(c));
        assert.doesNotMatch(texto, /"pin"/, `${nombre}: ${texto}`);
        for (const secreto of [PIN, CODIGO_DEL_DUENIO, PIN_QUE_SE_ARMA]) assert.ok(!texto.includes(secreto), `${nombre} deja «${secreto}»: ${texto}`);
        for (const campo of REGISTRO[nombre].secretos) assert.ok(!texto.includes(`"${campo}"`), `${nombre}: el campo secreto «${campo}» no queda`);
        // Lo que no es secreto queda tal cual (el comando se puede volver a aplicar y contar).
        assert.equal(JSON.parse(texto).nombre, nombre);
      }
    }
  }
  // Lo que no es secreto no se toca: el código de barras de un producto, el carrito, los medios de un cierre.
  const sinPin = (nombre: NombreDeComando, args: unknown[]) => JSON.stringify(comandoSinPin({ id: "x", equipo: "e", persona: "u", versionBase: 1, version: M.VERSION_ESTADO, nombre, args, ahora: AHORA, auth: {}, azar: 1, idsDesde: 0 } as unknown as Comando));
  assert.match(sinPin("stock", MUESTRAS.stock[0]), /"codigo":"779123"/);
  assert.match(sinPin("ventaACuenta", MUESTRAS.ventaACuenta[0]), /"p1":2/);
  assert.match(sinPin("cierre", MUESTRAS.cierre[1]), /"porJugador":\{"0":"efectivo","1":"mercadopago"\}/);
});

test("Tanda 2 · sin internet, la cuenta: créditos + el resto por MP NO va (se verifica afuera); créditos + el resto en efectivo sí", () => {
  const casos: [unknown, boolean][] = [
    [["r1", { tipo: "cobrarJugador", idx: 0, medio: "monedero", resto: "mercadopago", usa: 4000 }], false],
    [["r1", { tipo: "cobrarJugador", idx: 0, medio: "monedero", resto: "transferencia", usa: 4000 }], false],
    [["r1", { tipo: "cobrarJugador", idx: 0, medio: "monedero", resto: "debito", usa: 4000 }], false],
    [["r1", { tipo: "cobrarJugador", idx: 0, medio: "monedero", resto: "efectivo", usa: 4000 }], true],
    [["r1", { tipo: "cobrarJugador", idx: 0, medio: "monedero" }], true],
    [["r1", { tipo: "cobrarJugador", idx: 0, medio: "mercadopago" }], false],
  ];
  for (const [args, esperado] of casos) assert.equal(vaSinInternet("cuenta", args), esperado, JSON.stringify(args));
});

// ── Tanda 3C · los fijos: dar de baja, pausar, liberar un día; el alta con «Fijo semanal» ────────────────────────────

/** El primer fijo de la demo con su ventana bajada y un turno suyo pagado (para que haya plata en juego). */
function conFijoPagado(e: EstadoClub) {
  M.materializarFijosHasta(e, HOY, 14);
  const f = e.fijos[0];
  const r = e.reservas.filter((x) => x.fijoId === f.id && x.estado === "reservada" && M.minutosHasta(AHORA, x.fecha, x.inicio) > 0).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
  M.registrarPago(e, r.id, { medio: "efectivo", monto: 21000 }, AHORA);
  return { f, r };
}

for (const caso of [
  { que: "dar de baja desde esta semana (con el dueño: la plata vuelve)", accion: (fijoId: string) => ({ tipo: "baja" as const, fijoId, desde: HOY }) },
  { que: "pausar hasta dentro de un mes", accion: (fijoId: string) => ({ tipo: "pausa" as const, fijoId, desde: HOY, hasta: M.sumarDias(HOY, 30) }) },
  { que: "liberar un día de dentro de 3 semanas", accion: (fijoId: string) => ({ tipo: "liberar" as const, fijoId, fecha: M.sumarDias(HOY, 21) }) },
]) {
  test(`3C · comando «bajaDeFijo» ${caso.que}: re-aplicado sobre la misma base da lo mismo byte a byte, y se cuenta en criollo`, () => {
    const b = base((e) => conFijoPagado(e));
    const local = b.abrir();
    const f = local.fijos[0];
    const c = conAuth(local, "bajaDeFijo", [caso.accion(f.id)], duenio(local));
    base((e) => conFijoPagado(e));
    const deNuevo = b.abrir();
    const r = rebasar(deNuevo, [c], new Set());
    assert.deepEqual(r.rechazados, [], JSON.stringify(r.rechazados));
    assert.equal(JSON.stringify(deNuevo), JSON.stringify(local), "el mismo estado, byte a byte");
    const texto = describirComando(c, b.abrir());
    assert.match(texto, /^19:10 · (Dar de baja|Pausar|Liberar) el fijo de \S/, texto);
    assert.equal(vaSinInternet("bajaDeFijo", [caso.accion(f.id)]), false, "con internet: cancela turnos y mueve plata");
  });
}

test("3C · dos puestos dan de baja el MISMO fijo: el segundo va a «Para resolver» y la plata vuelve UNA sola vez", () => {
  const b = base((e) => conFijoPagado(e));
  const pc = b.abrir();
  const tablet = b.abrir();
  const f = pc.fijos[0];
  const { clienteId } = pc.reservas.find((x) => x.fijoId === f.id && x.pagos.length > 0)!;
  const monedero0 = clienteId ? M.cliente(pc, clienteId)!.monedero : 0;
  const deLaPc = conAuth(pc, "bajaDeFijo", [{ tipo: "baja", fijoId: f.id, desde: HOY }], duenio(pc));
  const deLaTablet = conAuth(tablet, "bajaDeFijo", [{ tipo: "baja", fijoId: f.id, desde: HOY }], duenio(tablet));
  // La PC subió primero: la base es lo de la PC; la tablet re-aplica lo suyo encima.
  const enLaBase = b.abrir();
  assert.deepEqual(rebasar(enLaBase, [deLaPc], new Set()).rechazados, []);
  const r = rebasar(enLaBase, [deLaTablet], new Set());
  assert.equal(r.rechazados.length, 1, "el de la tablet no entra");
  assert.match(r.rechazados[0].motivo, /ya no está/);
  if (clienteId) assert.equal(M.cliente(enLaBase, clienteId)!.monedero, monedero0 + 21000, "los $ 21.000 vuelven una vez");
  assert.equal(enLaBase.caja.movimientos.length, pc.caja.movimientos.length, "la caja no se mueve dos veces");
});

test("3C · el alta con «Fijo semanal» re-aplicada (el comando «alta» que arma el almacén) da el mismo fijo y las mismas semanas, byte a byte", () => {
  const b = base();
  const local = b.abrir();
  const jueves = M.sumarDias(HOY, 5);
  const datos = { canchaId: "c4", fecha: jueves, inicio: 20 * 60, duracion: 90, tipo: "turno" as const, titular: "Juan Pérez", clienteId: null, otros: "", fijo: true };
  const c = enElMostrador(local, "alta", [datos]);
  const f = local.fijos.at(-1)!;
  assert.equal(local.reservas.filter((x) => x.fijoId === f.id).length, 5, "el alta y las 4 semanas siguientes");
  base();
  const deNuevo = b.abrir();
  assert.deepEqual(rebasar(deNuevo, [c], new Set()).rechazados, []);
  assert.equal(JSON.stringify(deNuevo), JSON.stringify(local), "el mismo estado, byte a byte");
});

test("3C · el almacén arma el comando «alta» desde el turno nuevo (`altaEquivalente`): con «Fijo semanal» lleva `fijo: true`", () => {
  const e = base().abrir();
  const antes = { reservas: e.reservas.length, clientes: e.clientes.length };
  const jueves = M.sumarDias(HOY, 5);
  enElMostrador(e, "alta", [{ canchaId: "c4", fecha: jueves, inicio: 20 * 60, duracion: 90, tipo: "turno", titular: "Juan Pérez", clienteId: null, otros: "", fijo: true }]);
  const eq = altaEquivalente(e, antes)!;
  assert.equal(eq.args[0].fijo, true);
  assert.equal(eq.args[0].fecha, jueves, "el primero que se creó es el del alta (no una semana del fijo)");
  const sinFijo = base().abrir();
  const antes2 = { reservas: sinFijo.reservas.length, clientes: sinFijo.clientes.length };
  enElMostrador(sinFijo, "alta", [{ canchaId: "c4", fecha: jueves, inicio: 20 * 60, duracion: 90, tipo: "turno", titular: "Juan Pérez", clienteId: null, otros: "" }]);
  assert.ok(!("fijo" in altaEquivalente(sinFijo, antes2)!.args[0]));
});
