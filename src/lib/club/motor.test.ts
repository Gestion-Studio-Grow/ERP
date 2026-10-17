// Propiedades de plata del motor del club, corridas contra la COPIA controlada (src/lib/club/motor.mjs) y a través
// de los tipos escritos a mano (motor.d.mts): si una firma tipada deja de calzar con el motor, esto no compila.
// Es una selección de src/tenants/breakpoint/motor-club.test.ts (la suite completa sigue allá, contra la fuente
// del piloto, y es de la sesión del club). BP-1 de docs/producto/PLAN-TERMINALES-MOSTRADOR.md §4.3.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "./motor.mjs";
import type { Ahora, Cuenta, Cliente, EstadoClub, Reserva } from "./motor.mjs";

const HOY = "2026-10-14"; // miércoles
const ahora = (hh: number, mm = 0): Ahora => ({ fecha: HOY, min: hh * 60 + mm });
const DUENO = { usuarioId: "u-rober", pin: "11" };
const RECEP = { usuarioId: "u-lu", pin: "33" };

/** Afirma que la operación salió bien y devuelve el resultado ya angostado a `{ ok: true }`. */
function ok<R extends { ok: boolean }>(r: R, contexto = ""): Extract<R, { ok: true }> {
  assert.ok(r.ok, `${contexto}${contexto ? ": " : ""}${(r as { motivo?: string }).motivo ?? "falló"}`);
  return r as Extract<R, { ok: true }>;
}

function club(): EstadoClub {
  return M.crearEstado({
    config: M.CONFIG_DEMO,
    canchas: M.CANCHAS_DEMO,
    clientes: [
      { id: "a", nombre: "Ana", tel: "5491100000001" },
      { id: "b", nombre: "Beto", tel: "5491100000002", monedero: 10000 },
      { id: "c", nombre: "Caro", tel: "5491100000003", strikes: 2 },
      { id: "d", nombre: "Dani", tel: "5491100000004", cc: { habilitada: true, limite: 50000 } },
    ],
    productos: M.PRODUCTOS_DEMO,
    usuarios: M.USUARIOS_DEMO,
    proveedores: M.PROVEEDORES_DEMO,
  });
}

const mesa4 = (e: EstadoClub, hh = 20, canchaId = "c1"): Reserva =>
  ok(
    M.crearReserva(
      e,
      { canchaId, fecha: HOY, inicio: hh * 60, clienteId: "a", jugadores: [{ nombre: "Ana", clienteId: "a" }, { nombre: "Beto", clienteId: "b" }, "Caro", "Dani"] },
      ahora(8),
    ),
    "mesa4",
  ).reserva;

const cajaIngresos = (e: EstadoClub) => e.caja.movimientos.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + m.monto, 0);
const stockDe = (e: EstadoClub, id: string) => M.producto(e, id)?.stock;

// ───────────── contrato de motor.d.mts ─────────────

type Motor = typeof M;
type Funciones = { [K in keyof Motor]: Motor[K] extends (...args: never[]) => unknown ? K : never }[keyof Motor];

/** Todas las funciones que tipa motor.d.mts. Si se tipa una nueva y no se suma acá (o al revés), tsc falla. */
const FUNCIONES = [
  "crearEstado", "crearClubReal", "generarDemo", "serializarEstado", "hidratarEstado", "secuenciaIds", "retomarSecuencia", "prefijoIds",
  "hhmm", "aMinutos", "diaSemana", "sumarDias", "minutosHasta", "pesos", "dividir",
  "cancha", "cliente", "reserva", "producto", "cuenta", "usuario", "buscarClientes", "buscarProductos", "productoPorCodigo", "altaCliente",
  "puede", "verificarPin", "usuarioPorPin",
  "horarioDe", "precioTurno", "franjaDe", "requiereSena", "ocupantes", "validarHueco", "huecosLibres", "crearReserva", "checkIn", "finalizar",
  "marcarNoShow", "cancelar", "mover", "extender", "bloquear", "quitarBloqueo", "materializarFijos",
  "interrumpir", "marcarDevuelto", "cobrarFaltaSinFicha", "configurarMantenimiento", "planLluvia", "crearFijo", "liberarFijo",
  "anotarEspera", "ofertasEspera", "asignarDesdeEspera",
  "cobrado", "totalReserva", "saldo", "registrarPago", "partesCancha", "asignarCargoCancha", "cobrarParte",
  "totalCuenta", "cobradoCuenta", "saldoCuenta", "abrirCuenta", "cargarEnCuenta", "pagarCuenta", "consumoJugador", "ajustarCargo",
  "transferirCargo", "cargoManual", "cerrarCuenta", "cuentasAbiertas", "ventaMostrador",
  "cuentaDeJugador", "asignarCargoCargos", "cuentaDelTurno", "cobrarCuentaYSusCargos", "cobrarJugador", "cobrarTodoElTurno",
  "cerrarCanchaYSeguir", "cerrarCargosDelTurno", "mesasAbiertas",
  "diaDeCaja", "cajaCerrada", "cajaAbierta", "resumenCaja", "cajasSinCerrar", "cajasConMovimientosSinCerrar", "cerrarCaja", "egresoCaja",
  "puedeACuenta", "solicitarCredito", "resolverCredito", "codigoAprobacion", "aprobarPorCodigo", "datosAprobacion", "cobrarDeuda",
] as const satisfies readonly Funciones[];
const CONSTANTES = [
  "VERSION_ESTADO", "MEDIOS", "ESTADOS", "TIPOS", "ROLES", "PERMISOS", "NOMBRE_DIA",
  "CONFIG_DEMO", "CANCHAS_DEMO", "USUARIOS_DEMO", "USUARIOS_REALES", "PRODUCTOS_DEMO", "PROVEEDORES_DEMO",
] as const satisfies readonly Exclude<keyof Motor, Funciones>[];

// Comprobación de tipos en los dos sentidos: ninguna función ni constante tipada queda afuera de las listas.
const _sinFuncionesSueltas: [Exclude<Funciones, (typeof FUNCIONES)[number]>] extends [never] ? true : Exclude<Funciones, (typeof FUNCIONES)[number]> = true;
const _sinConstantesSueltas: [Exclude<Exclude<keyof Motor, Funciones>, (typeof CONSTANTES)[number]>] extends [never] ? true : never = true;
void _sinFuncionesSueltas;
void _sinConstantesSueltas;

type Requeridas<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T];
/** Las claves del tipo, en runtime: el `satisfies` + el chequeo de abajo atan la lista al tipo en los dos sentidos. */
function claves<T>() {
  return <const L extends readonly (keyof T)[]>(lista: L & ([Exclude<keyof T, L[number]>] extends [never] ? unknown : never)) => lista;
}
const CLAVES_ESTADO = claves<EstadoClub>()([
  "config", "canchas", "clientes", "productos", "usuarios", "reservas", "cuentas", "caja", "novedades", "bloqueos", "luces", "clima",
  "proveedores", "solicitudesAcceso", "difusiones", "pedidos", "fijos", "espera", "remitos", "pagosProveedor", "contenido", "log",
]);
const REQ_RESERVA: readonly Requeridas<Reserva>[] = [
  "id", "canchaId", "fecha", "inicio", "duracion", "tipo", "clienteId", "titular", "origen", "notas", "fijoId", "jugadores",
  "precio", "sena", "pagos", "estado", "checkIn", "creada", "senaEnSuspenso",
];
const REQ_CUENTA: readonly Requeridas<Cuenta>[] = ["id", "clienteId", "titular", "reservaId", "jugadorIdx", "items", "pagos", "estado", "abierta"];
const REQ_CLIENTE: readonly Requeridas<Cliente>[] = ["id", "nombre", "tel", "nivel", "strikes", "monedero", "deuda", "activo", "cc", "movCC", "fiados"];

test("contrato de motor.d.mts: cada export tipado existe en la copia con su clase (función o constante)", () => {
  const motor = M as unknown as Record<string, unknown>;
  for (const n of FUNCIONES) assert.equal(typeof motor[n], "function", `${n} no es una función exportada del motor`);
  for (const n of CONSTANTES) {
    assert.ok(n in motor, `${n} no está exportada`);
    assert.notEqual(typeof motor[n], "function", `${n} es una función: va en FUNCIONES`);
  }
  assert.equal(M.VERSION_ESTADO, 1);
  assert.deepEqual(Object.keys(M.MEDIOS).sort(), ["debito", "efectivo", "mercadopago", "monedero", "transferencia"]);
  assert.deepEqual(Object.keys(M.ESTADOS).sort(), ["cancelada", "en_cancha", "finalizada", "no_show", "reservada", "suspendida"]);
});

test("contrato de motor.d.mts: el estado, el turno, la cuenta y la ficha tienen la forma tipada", () => {
  for (const e of [M.generarDemo(HOY), M.crearClubReal(HOY), club()]) {
    assert.deepEqual(Object.keys(e).sort(), [...CLAVES_ESTADO].sort(), "claves del estado");
  }
  const e = M.generarDemo(HOY);
  const conClaves = (x: object, req: readonly string[], que: string) => {
    for (const k of req) assert.ok(k in x, `${que}: falta «${k}»`);
  };
  for (const r of e.reservas) conClaves(r, REQ_RESERVA, `reserva ${r.id}`);
  for (const c of e.cuentas) conClaves(c, REQ_CUENTA, `cuenta ${c.id}`);
  for (const c of e.clientes) conClaves(c, REQ_CLIENTE, `cliente ${c.id}`);
  const t = ok(M.cuentaDelTurno(e, e.reservas.find((r) => r.estado === "en_cancha")!.id));
  assert.deepEqual(Object.keys(t.totales).sort(), ["cancha", "cargos", "pendiente", "totalCargos"]);
  assert.deepEqual(Object.keys(M.resumenCaja(e, M.cajaAbierta(e, ahora(19)))).sort(), ["dia", "efectivoEsperado", "egresos", "ingresos", "lista", "movimientos", "neto", "porMedio"]);
});

// ───────────── propiedades de plata ─────────────

test("propiedad: un turno al azar cierra en cero, la caja suma lo cobrado, la cancha se cobra exacta y el stock cuadra", () => {
  let semilla = 4242;
  const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const productos = ["p2", "p9", "p10", "p3", "k-mila", "k-hamb", "k-empa", "k-pica"];
  for (let t = 0; t < 200; t++) {
    const e = club();
    e.config.politica.senaPct = Math.floor(azar() * 101);
    const stock0 = Object.fromEntries(e.productos.map((p) => [p.id, p.stock]));
    const r = mesa4(e, 20, "c" + (1 + Math.floor(azar() * 4)));
    if (azar() < 0.6) M.registrarPago(e, r.id, { medio: "transferencia", monto: r.sena.monto || Math.floor(r.precio / 4) }, ahora(10));
    if (r.sena.monto > 0 && !r.sena.pagada) M.registrarPago(e, r.id, { medio: "efectivo", monto: r.sena.monto - M.cobrado(r) }, ahora(19, 50));
    ok(M.checkIn(e, r.id, ahora(20)), `caso ${t}: abrir la cancha`);
    const cargados: Record<string, number> = {};
    for (let k = 0; k < 2 + Math.floor(azar() * 12); k++) {
      const p = productos[Math.floor(azar() * productos.length)];
      const n = 1 + Math.floor(azar() * 3);
      if (M.consumoJugador(e, r.id, Math.floor(azar() * 4), p, n, {}, ahora(20, 30)).ok) cargados[p] = (cargados[p] ?? 0) + n;
    }
    if (azar() < 0.5) M.asignarCargoCancha(e, r.id, 3, Math.floor(azar() * 3), ahora(20, 40));
    const c = [0, 1, 2, 3].map((i) => M.cuentaDeJugador(e, r, i));
    if (azar() < 0.5 && c[2] && c[1]) M.asignarCargoCargos(e, c[2].id, c[1].id, ahora(20, 40));
    const camino = Math.floor(azar() * 3);
    if (camino === 0) ok(M.cobrarTodoElTurno(e, r.id, { medio: "efectivo" }, ahora(21, 30)), `caso ${t}`);
    else if (camino === 1) {
      ok(M.cerrarCanchaYSeguir(e, r.id, { medio: "efectivo" }, ahora(21, 30)), `caso ${t}`);
      if (M.cuentaDelTurno(e, r.id).ok && M.mesasAbiertas(e).length) ok(M.cerrarCargosDelTurno(e, r.id, { medio: "debito" }, ahora(23)), `caso ${t}`);
    } else {
      for (let vuelta = 0; vuelta < 6; vuelta++) {
        const i = ok(M.cuentaDelTurno(e, r.id)).jugadores.findIndex((j) => j.aPagar > 0);
        if (i < 0) break;
        ok(M.cobrarJugador(e, r.id, i, { medio: "mercadopago" }, ahora(21, 30)), `caso ${t}`);
      }
    }
    const fin = ok(M.cuentaDelTurno(e, r.id));
    assert.equal(fin.totales.pendiente, 0, `caso ${t} (camino ${camino}): queda pendiente`);
    const cobradoCancha = M.cobrado(r);
    const cobradoCargos = e.cuentas.reduce((s, x) => s + M.cobradoCuenta(x), 0);
    assert.equal(cajaIngresos(e), cobradoCancha + cobradoCargos, `caso ${t}: la caja no suma lo cobrado`);
    assert.equal(cobradoCancha, r.precio, `caso ${t}: la cancha se cobró de más o de menos`);
    // La caja de 12 a 12 reparte los movimientos por día sin perder ni duplicar ninguno (la seña de las 10:00 es
    // de la caja del día anterior).
    const dias = [...new Set(e.caja.movimientos.map((m) => m.caja ?? ""))];
    assert.equal(dias.reduce((s, d) => s + M.resumenCaja(e, d).ingresos, 0), cajaIngresos(e), `caso ${t}: las cajas por día no suman lo cobrado`);
    assert.equal(M.resumenCaja(e).ingresos, cajaIngresos(e), `caso ${t}: el resumen total no suma lo cobrado`);
    for (const [p, n] of Object.entries(cargados)) {
      const s0 = stock0[p];
      if (s0 == null) continue;
      assert.equal(stockDe(e, p), s0 - n, `caso ${t}: stock de ${p}`);
    }
  }
});

test("nada se cobra dos veces: jugador, turno, cuenta, venta de mostrador y cierre de caja", () => {
  const e = club();
  const r = mesa4(e);
  M.consumoJugador(e, r.id, 0, "p2", 2, {}, ahora(20, 10));
  M.consumoJugador(e, r.id, 1, "p9", 1, {}, ahora(20, 10));
  const j0 = ok(M.cobrarJugador(e, r.id, 0, { medio: "efectivo" }, ahora(21)));
  assert.equal(j0.total, 10500 + 4000);
  assert.equal(M.cobrarJugador(e, r.id, 0, { medio: "efectivo" }, ahora(21, 1)).ok, false, "el mismo jugador no paga dos veces");
  const antes = cajaIngresos(e);
  const todo = ok(M.cobrarTodoElTurno(e, r.id, { medio: "debito" }, ahora(21, 5)));
  assert.equal(cajaIngresos(e) - antes, todo.total, "la caja sube exactamente lo cobrado");
  assert.equal(M.cobrarTodoElTurno(e, r.id, { medio: "debito" }, ahora(21, 6)).ok, false, "el turno no se cobra dos veces");
  assert.equal(M.registrarPago(e, r.id, { medio: "efectivo", monto: 1 }, ahora(21, 7)).ok, false, "no se cobra de más a la cancha");
  assert.equal(ok(M.cuentaDelTurno(e, r.id)).totales.pendiente, 0);

  const venta = ok(M.ventaMostrador(e, [{ productoId: "p2", cant: 3 }], "efectivo", ahora(21, 10)));
  assert.equal(venta.total, 6000);
  assert.equal(M.cuentasAbiertas(e).length, 0, "la venta de mostrador no deja cuentas abiertas");

  const cierre = ok(M.cerrarCaja(e, { contado: 0, ...DUENO }, ahora(23)));
  assert.equal(cierre.cierre.esperado, M.resumenCaja(e, cierre.cierre.dia).efectivoEsperado);
  assert.equal(cierre.cierre.diferencia, -cierre.cierre.esperado);
  assert.equal(M.cerrarCaja(e, { contado: 0, ...DUENO }, ahora(23, 30)).ok, false, "la caja se cierra una sola vez");
  assert.ok(M.cajaCerrada(e, cierre.cierre.dia));
});

test("cerrar la cancha y seguir: la cancha se cobra y se libera, la mesa sigue y al cerrarla el turno queda en cero", () => {
  const e = club();
  const r = mesa4(e, 19);
  ok(M.checkIn(e, r.id, ahora(19)));
  M.consumoJugador(e, r.id, 2, "k-mila", 1, {}, ahora(19, 30));
  const antes = cajaIngresos(e);
  const res = ok(M.cerrarCanchaYSeguir(e, r.id, { medio: "efectivo" }, ahora(20, 30)));
  assert.equal(res.cobradoCancha, 42000);
  assert.equal(r.estado, "finalizada");
  assert.ok(ok(M.consumoJugador(e, r.id, 2, "p9", 2, {}, ahora(21))).cuenta, "la mesa sigue cargando con la cancha cerrada");
  const t = ok(M.cuentaDelTurno(e, r.id));
  assert.equal(t.totales.cancha, 0);
  assert.equal(t.totales.cargos, 14500 + 7600);
  assert.ok(t.mesaAbierta);
  const cierre = ok(M.cerrarCargosDelTurno(e, r.id, { medio: "mercadopago" }, ahora(22)));
  assert.equal(cierre.cobrado, 22100);
  assert.equal(cajaIngresos(e) - antes, 42000 + 22100);
  assert.equal(M.mesasAbiertas(e).length, 0);
  assert.equal(ok(M.cuentaDelTurno(e, r.id)).totales.pendiente, 0);
});

test("créditos del cliente: se usan como medio, descuentan del que paga y no entran a la caja", () => {
  const e = club();
  const r = mesa4(e);
  M.cliente(e, "b")!.monedero = 20000;
  const antes = cajaIngresos(e);
  const res = ok(M.cobrarJugador(e, r.id, 1, { medio: "monedero" }, ahora(21)));
  assert.equal(res.total, 10500);
  assert.equal(M.cobrado(r), 10500, "la cancha registra el pago");
  assert.equal(cajaIngresos(e), antes, "lo pagado con créditos no es plata de la caja");
  assert.equal(M.cliente(e, "b")?.monedero, 9500);
  assert.equal(M.cobrarJugador(e, r.id, 0, { medio: "monedero" }, ahora(21)).ok, false, "a Ana no le alcanzan los créditos");
  assert.equal(M.cobrarTodoElTurno(e, r.id, { medio: "monedero" }, ahora(21)).ok, false, "todo el turno con créditos, no");
});

test("crédito con código del dueño: el código ata pedido y monto, y el fiado se usa una sola vez", () => {
  const e = club();
  const r = mesa4(e);
  M.consumoJugador(e, r.id, 0, "k-pica", 1, {}, ahora(20, 10));
  const cta = M.cuentaDeJugador(e, r, 0)!;
  assert.equal(M.cerrarCuenta(e, cta.id, { aCuenta: true }, ahora(21)).ok, false, "sin cuenta corriente no va a cuenta");
  const { novedad: n } = ok(M.solicitarCredito(e, { clienteId: "a", tipo: "fiado", monto: 21000, cuentaId: cta.id }, RECEP, ahora(21)));
  const d = M.datosAprobacion(e, n.id)!;
  const codigo = M.codigoAprobacion({ pin: "22", novedadId: d.id, clienteId: d.c, monto: d.m, fecha: d.f });
  assert.match(codigo, /^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
  assert.equal(M.aprobarPorCodigo(e, n.id, { codigo, monto: 30000 }, RECEP, ahora(21, 5)).ok, false, "con otro monto el código no sirve");
  assert.equal(ok(M.aprobarPorCodigo(e, n.id, { codigo, monto: 21000 }, RECEP, ahora(21, 6))).aprobo, "Majo");
  const antes = cajaIngresos(e);
  ok(M.cerrarCuenta(e, cta.id, { aCuenta: true }, ahora(21, 10)));
  assert.equal(cajaIngresos(e), antes, "lo fiado no entra a la caja");
  assert.equal(M.cliente(e, "a")?.deuda, 21000);
  M.consumoJugador(e, r.id, 0, "p2", 1, {}, ahora(21, 20));
  assert.equal(M.cerrarCuenta(e, M.cuentaDeJugador(e, r, 0)!.id, { aCuenta: true }, ahora(21, 30)).ok, false, "el fiado se usa una vez");
});

// ───────────── respaldo (sobre v1, FORMATO-RESPALDO.md) ─────────────

test("hidratarEstado(serializarEstado(e)) hace round-trip por JSON y no repite ids", () => {
  for (const e of [M.generarDemo(HOY), M.crearClubReal(HOY)]) {
    if (e.config.modo === "real") {
      const r = ok(M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 20 * 60, titular: "Juan", jugadores: ["Juan", "Pedro"] }, ahora(8))).reserva;
      M.consumoJugador(e, r.id, 0, "p2", 1, {}, ahora(20));
    }
    const foto = JSON.parse(JSON.stringify(M.serializarEstado(e)));
    assert.equal(foto.v, M.VERSION_ESTADO);
    const h = ok(M.hidratarEstado(foto));
    assert.deepEqual(h.estado, JSON.parse(JSON.stringify(e)));
    assert.deepEqual(JSON.parse(JSON.stringify(M.serializarEstado(h.estado))).estado, foto.estado, "una segunda vuelta no cambia nada");
    const fecha = M.sumarDias(HOY, 3);
    const [inicio] = M.huecosLibres(h.estado, fecha, "c2", 90);
    const nueva = ok(M.crearReserva(h.estado, { canchaId: "c2", fecha, inicio, titular: "Otro" }, ahora(8))).reserva;
    assert.ok(![...e.reservas, ...e.cuentas].some((x) => x.id === nueva.id), "ids nuevos después de volver a abrir");
  }
});

test("hidratarEstado rechaza un sobre de otra versión, incompleto o con ids raros (sin tirar)", () => {
  const foto = JSON.parse(JSON.stringify(M.serializarEstado(club())));
  const otraVersion = M.hidratarEstado({ ...foto, v: 2 });
  assert.equal(otraVersion.ok, false);
  assert.match((otraVersion as { motivo: string }).motivo, /otra versión/);
  assert.equal(M.hidratarEstado({ ...foto, v: "1" }).ok, false, "la versión es un número, no un texto");
  for (const basura of [null, undefined, "x", 1, [], { v: 1 }, { v: 1, estado: {} }, { v: 1, estado: { config: {}, caja: {} } }]) {
    assert.equal(M.hidratarEstado(basura).ok, false, JSON.stringify(basura) ?? "undefined");
  }
  const sinCaja = structuredClone(foto);
  delete sinCaja.estado.caja.movimientos;
  assert.equal(M.hidratarEstado(sinCaja).ok, false);
  const idRaro = structuredClone(foto);
  idRaro.estado.canchas[0].id = '"><img src=x onerror=alert(1)>';
  assert.equal(M.hidratarEstado(idRaro).ok, false);
});
