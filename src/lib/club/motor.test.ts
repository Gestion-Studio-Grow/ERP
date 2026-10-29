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
const DUENO = { usuarioId: "u-rober", pin: "1111" };
const RECEP = { usuarioId: "u-lu", pin: "33" };

/** Afirma que la operación salió bien y devuelve el resultado ya angostado a `{ ok: true }`. */
function ok<R extends { ok: boolean }>(r: R, contexto = ""): Extract<R, { ok: true }> {
  assert.ok(r.ok, `${contexto}${contexto ? ": " : ""}${(r as { motivo?: string }).motivo ?? "falló"}`);
  return r as Extract<R, { ok: true }>;
}

function club(): EstadoClub {
  const e = M.crearEstado({
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
  // Ana, Beto, Caro y Dani son clientes de siempre: sin «seña a los nuevos» (esa regla tiene sus tests abajo).
  e.config.politica.senaNuevos = false;
  return e;
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
  "interrumpir", "marcarDevuelto", "cobrarFaltaSinFicha", "configurarMantenimiento", "configurarTecho", "hayDescubiertas", "planLluvia", "crearFijo", "liberarFijo",
  "anotarEspera", "ofertasEspera", "asignarDesdeEspera",
  "cobrado", "totalReserva", "saldo", "registrarPago", "partesCancha", "asignarCargoCancha", "cobrarParte",
  "totalCuenta", "cobradoCuenta", "saldoCuenta", "abrirCuenta", "cargarEnCuenta", "pagarCuenta", "consumoJugador", "ajustarCargo",
  "transferirCargo", "cargoManual", "cerrarCuenta", "cuentasAbiertas", "ventaMostrador",
  "cuentaDeJugador", "asignarCargoCargos", "cuentaDelTurno", "cobrarCuentaYSusCargos", "cobrarJugador", "cobrarTodoElTurno",
  "cerrarCanchaYSeguir", "cerrarCargosDelTurno", "mesasAbiertas",
  "diaDeCaja", "cajaCerrada", "cajaAbierta", "resumenCaja", "cajasSinCerrar", "cajasConMovimientosSinCerrar", "cerrarCaja", "egresoCaja",
  "puedeACuenta", "solicitarCredito", "resolverCredito", "codigoAprobacion", "aprobarPorCodigo", "datosAprobacion", "cobrarDeuda",
  // Clientes y Tablero del dueño (solapas de la sesión del club).
  "editarCliente", "bajaCliente", "bajaNovedades", "solicitarAcceso", "otorgarAcceso", "rechazarAcceso",
  "solicitarCC", "configurarCC", "estadoDeCuenta", "kpis", "mapaDeCalor", "metricasPlatos", "mensajeWhatsApp", "linkWhatsApp",
  // Archivo de días cerrados (la jornada no llena el almacenamiento).
  "diaParaArchivar", "archivarDiasCerrados", "plataPorDia", "huellaAnexo", "paqueteParaArchivar", "verificarPaqueteArchivo",
] as const satisfies readonly Funciones[];
// Ola 1 de paridad: un bloque por frente para que tres agentes sumen tipos en paralelo sin pisarse.
// Cada frente agrega SÓLO en su lista (y en su bloque de motor.d.mts).
const FUNCIONES_OLA1_CUENTA_Y_BUFFET = ["sumarJugador"] as const satisfies readonly Funciones[];
const FUNCIONES_OLA1_AGENDA_Y_TIENDA = [
  "alertas", "catalogoTienda", "crearPedidoTienda", "pedidoDesdeWhatsApp", "pedidosPendientes", "entregarPedido", "cargarPedidoACuenta", "cancelarPedido",
] as const satisfies readonly Funciones[];
const FUNCIONES_OLA1_CAJA_Y_WHATSAPP = ["ajustarFondo"] as const satisfies readonly Funciones[];
// Ola 3 · stock y proveedores (solapas Stock y Proveedores de la sesión del club).
const FUNCIONES_OLA3_STOCK_Y_PROVEEDORES = [
  "proveedor", "altaProducto", "editarProducto", "ajustarStock", "bajaProducto", "altaProveedor", "editarProveedor",
  "registrarRemito", "ccProveedor", "deudaConProveedor", "pagarProveedor", "precioDesdeMarkup", "rentabilidad",
] as const satisfies readonly Funciones[];
// Ola 4 · Configuración (solapa Configuración de la sesión del club).
const FUNCIONES_OLA4_CONFIGURACION = [
  "altaUsuario", "definirPinInicial", "cambiarMiPin", "regenerarPin", "revocarAcceso", "ajustarHorario", "ajustarPolitica",
  "ajustarBloqueo", "respaldoDesdeArchivo", "huellaRespaldo", "pendientesGoLive", "limpiarParaGoLive", "terminarConfiguracion",
] as const satisfies readonly Funciones[];
// Ola 4 · Novedades y redes (solapa Novedades de la sesión del club).
const FUNCIONES_OLA4_NOVEDADES = [
  "destinatarios", "mensajeDifusion", "crearDifusion", "marcarEnviado", "contactosCSV", "agregarContenido", "editarContenido",
  "borrarContenido", "contenidoDelMes",
] as const satisfies readonly Funciones[];
// PIN por rol (dueños 4, recepción 2): lo usan el bloqueo, Configuración y el aprobador.
const FUNCIONES_PIN_POR_ROL = ["largoPin", "pinValidoPara", "pinAceptadoPara", "textoLargoPin", "pinDesactualizado", "verificarFirma", "pinFacil"] as const satisfies readonly Funciones[];
// Tope de intentos de PIN, uno por compu (SEC-5): lo usan el bloqueo, Configuración, la caja y el descuento.
const FUNCIONES_TOPE_PIN = ["intentosPin", "esperaPin", "anotarIntentoPin"] as const satisfies readonly Funciones[];
/** El PIN guardado con hash (21/10/2026). */
const FUNCIONES_PIN_CON_HASH = ["esPinConHash", "hashPin", "pinCoincide", "largoDelPinGuardado", "pasarPinesAHash", "pinDeEjemplo"] as const satisfies readonly Funciones[];
/** Reingeniería Break Point · tanda 1A: la seña del nuevo, el hueco donde no entra la duración, cobrar la seña y abrir. */
const FUNCIONES_REING_BP_1A = ["turnosJugados", "motivoSena", "montoSena", "cuantoEntra", "cobrarSenaYAbrir"] as const satisfies readonly Funciones[];
/** Reingeniería Break Point · tanda 2B: plata pendiente, bandeja en dos niveles, alertas de caja; H2/H4; lo de 2D. */
const FUNCIONES_REING_BP_2B = [
  "prefijoActualIds", "fijarSecuencia", "plataPendiente", "pagosPorVencer", "claveDeAlerta", "posponerAlerta", "cerrarAlAprobar",
  "mensajeDeLaFalta", "materializarFijosHasta", "cerrarYAbrirLaSiguiente", "vencerSenas",
] as const satisfies readonly Funciones[];
/** Reingeniería Break Point · tanda 3C (dueño del motor): fijos con baja/pausa, y lo que consumen 3A, 3B y 3D. */
const FUNCIONES_REING_BP_3C = [
  "fijoJuegaEl", "fijoBajadoEl", "darDeBajaFijo", "autorizarNovedad", "reglaDelDia", "reglaFinde", "esFeriado", "esFechaReal", "validarReglaFinde", "ajustarFinde",
  "validarFeriados", "ajustarFeriados", "ajustarHorarioDelDia", "rubroDeMovimiento", "categoriaDeEgreso", "desglosePorDia",
] as const satisfies readonly Funciones[];
/** Reingeniería Break Point · tanda B4: la caja por turnos (cierre a ciegas, firma D-16, retiro, egreso por categoría). */
const FUNCIONES_REING_BP_B4 = [
  "largoFirmaCaja", "turnoDeCajaAbierto", "turnosDelDia", "contarTurnoCaja", "cerrarTurnoCaja", "cerrarDiaCaja", "corregirMedio", "retiroCajaFuerte", "egresoPorCategoria",
] as const satisfies readonly Funciones[];
type FuncionesListadas =
  | (typeof FUNCIONES)[number]
  | (typeof FUNCIONES_OLA1_CUENTA_Y_BUFFET)[number]
  | (typeof FUNCIONES_OLA1_AGENDA_Y_TIENDA)[number]
  | (typeof FUNCIONES_OLA1_CAJA_Y_WHATSAPP)[number]
  | (typeof FUNCIONES_OLA3_STOCK_Y_PROVEEDORES)[number]
  | (typeof FUNCIONES_OLA4_CONFIGURACION)[number]
  | (typeof FUNCIONES_OLA4_NOVEDADES)[number]
  | (typeof FUNCIONES_PIN_POR_ROL)[number]
  | (typeof FUNCIONES_TOPE_PIN)[number]
  | (typeof FUNCIONES_PIN_CON_HASH)[number]
  | (typeof FUNCIONES_REING_BP_1A)[number]
  | (typeof FUNCIONES_REING_BP_2B)[number]
  | (typeof FUNCIONES_REING_BP_3C)[number]
  | (typeof FUNCIONES_REING_BP_B4)[number];
const CONSTANTES = [
  "VERSION_ESTADO", "MEDIOS", "ESTADOS", "TIPOS", "ROLES", "PERMISOS", "NOMBRE_DIA",
  "CONFIG_DEMO", "CANCHAS_DEMO", "USUARIOS_DEMO", "USUARIOS_REALES", "PRODUCTOS_DEMO", "PROVEEDORES_DEMO", "DIAS_SIN_ARCHIVAR", "LIMITES_POLITICA", "LIMITES_BLOQUEO",
  "TIPOS_NOVEDAD", "AUDIENCIAS", "CANALES", "ESTADOS_CONTENIDO", "LARGO_PIN", "LARGO_PIN_VIEJO", "MOTIVO_PIN_VIEJO",
  "TOPE_INTENTOS_PIN", "ESPERAS_PIN_S", "VUELTAS_PIN", "DIAS_ADELANTE_MAX", "ALERTAS_POSPONIBLES",
  "PAUSA_FIJO_MAX_DIAS", "MOTIVO_PAUSA_FIJO", "FERIADOS_MAX", "RUBROS_CAJA", "CATEGORIAS_EGRESO",
  "DENOMINACIONES", "CATEGORIAS_EGRESO_CAJA", "MEDIOS_CORREGIBLES", "LARGO_PIN_FIRMA_CAJA", "EVENTO_TURNO_CERRADO",
] as const satisfies readonly Exclude<keyof Motor, Funciones>[];

// Comprobación de tipos en los dos sentidos: ninguna función ni constante tipada queda afuera de las listas.
const _sinFuncionesSueltas: [Exclude<Funciones, FuncionesListadas>] extends [never] ? true : Exclude<Funciones, FuncionesListadas> = true;
const _sinConstantesSueltas: [Exclude<Exclude<keyof Motor, Funciones>, (typeof CONSTANTES)[number]>] extends [never] ? true : never = true;
void _sinFuncionesSueltas;
void _sinConstantesSueltas;

type Requeridas<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T];
/** Las claves del tipo, en runtime: el `satisfies` + el chequeo de abajo atan la lista al tipo en los dos sentidos. */
function claves<T>() {
  return <const L extends readonly (keyof T)[]>(lista: L & ([Exclude<keyof T, L[number]>] extends [never] ? unknown : never)) => lista;
}
// `archivo` es opcional: aparece recién cuando se archivan días cerrados (archivarDiasCerrados). `salPin` también:
// aparece cuando un PIN se guarda con hash (21/10/2026).
const CLAVES_ESTADO = claves<Omit<EstadoClub, "archivo" | "salPin" | "alertasPospuestas">>()([
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
  for (const n of [...FUNCIONES, ...FUNCIONES_OLA1_CUENTA_Y_BUFFET, ...FUNCIONES_OLA1_AGENDA_Y_TIENDA, ...FUNCIONES_OLA1_CAJA_Y_WHATSAPP, ...FUNCIONES_OLA3_STOCK_Y_PROVEEDORES, ...FUNCIONES_OLA4_CONFIGURACION, ...FUNCIONES_OLA4_NOVEDADES, ...FUNCIONES_PIN_POR_ROL, ...FUNCIONES_TOPE_PIN, ...FUNCIONES_PIN_CON_HASH, ...FUNCIONES_REING_BP_1A, ...FUNCIONES_REING_BP_2B, ...FUNCIONES_REING_BP_3C, ...FUNCIONES_REING_BP_B4]) assert.equal(typeof motor[n], "function", `${n} no es una función exportada del motor`);
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
  const codigo = M.codigoAprobacion({ pin: "2222", novedadId: d.id, clienteId: d.c, monto: d.m, fecha: d.f });
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

// ───────────── PIN por rol: el viejo de 2 entra, no firma; los fáciles afuera (Gate del 18/10, SEC-5) ─────────────

test("PIN viejo de 2 de un dueño: entra (verificarPin) y cambia el PIN, pero no firma (verificarFirma, egreso, cierre)", () => {
  const e = club();
  M.usuario(e, "u-rober")!.pin = "11"; // el del piloto
  assert.equal(M.pinDesactualizado(e, "u-rober"), true);
  assert.equal(M.verificarPin(e, "u-rober", "11").ok, true, "con el viejo entra");
  const f = M.verificarFirma(e, "u-rober", "11");
  assert.ok(!f.ok && "pinViejo" in f && f.pinViejo === true);
  assert.equal(f.motivo, M.MOTIVO_PIN_VIEJO);
  assert.equal(M.MOTIVO_PIN_VIEJO, "Ese es tu PIN viejo: entrá a la compu con él y elegí uno de 4.");
  assert.equal(M.verificarFirma(e, "u-rober", "12").ok, false, "uno mal tampoco firma");
  assert.ok(!("pinViejo" in M.verificarFirma(e, "u-rober", "12")), "y no se confunde con el viejo");
  const movs = e.caja.movimientos.length;
  const egreso = M.egresoCaja(e, { monto: 1000, concepto: "Hielo", usuarioId: "u-rober", pin: "11" }, ahora(18));
  assert.deepEqual(egreso, { ok: false, motivo: M.MOTIVO_PIN_VIEJO, pinViejo: true });
  const cierre = M.cerrarCaja(e, { contado: 0, usuarioId: "u-rober", pin: "11" }, ahora(23));
  assert.ok(!cierre.ok && cierre.motivo === M.MOTIVO_PIN_VIEJO);
  assert.equal(e.caja.movimientos.length, movs, "no se movió la caja");
  // Con el de 4 (lo elige entrando con el viejo) ya firma; el viejo deja de andar.
  assert.equal(M.cambiarMiPin(e, { usuarioId: "u-rober", pin: "11" }, "5757", ahora(18)).ok, true);
  assert.equal(M.verificarFirma(e, "u-rober", "5757").ok, true);
  assert.equal(M.egresoCaja(e, { monto: 1000, concepto: "Hielo", usuarioId: "u-rober", pin: "5757" }, ahora(18)).ok, true);
  assert.equal(M.verificarPin(e, "u-rober", "11").ok, false);
  // Recepción con su PIN de 2 no está desactualizada: firma lo que su rol permite.
  assert.equal(M.verificarFirma(e, "u-lu", "33").ok, true);
});

test("tope de PIN (uno por compu): 5 mal esperan 30 s; un acierto de recepción no borra nada; uno de dueño sí; 8 h sin fallos lo olvidan", () => {
  assert.equal(M.TOPE_INTENTOS_PIN, 5);
  assert.deepEqual([...M.ESPERAS_PIN_S], [30, 120, 600]);
  const t0 = 1_000_000;
  let t = M.intentosPin(null);
  assert.deepEqual(t, { fallos: 0, esperaHasta: 0, tandas: 0, ultimoFallo: 0 });
  for (let i = 0; i < 4; i++) t = M.anotarIntentoPin(t, { ok: false }, t0);
  const antes = t;
  t = M.anotarIntentoPin(t, { ok: true }, t0);
  assert.deepEqual(t, antes, "el acierto de recepción deja los 4 fallos");
  assert.notEqual(t, antes, "y devuelve otro objeto (no toca el que recibe)");
  t = M.anotarIntentoPin(t, { ok: false }, t0);
  assert.equal(M.esperaPin(t, t0), 30_000);
  assert.deepEqual(M.anotarIntentoPin(t, { ok: true, duenio: true }, t0 + 30_000), M.intentosPin());
  const ocho = 8 * 60 * 60 * 1000;
  assert.equal(M.anotarIntentoPin(t, { ok: false }, t0 + ocho - 1).tandas, 1, "antes de las 8 h la tanda sigue");
  assert.deepEqual(M.anotarIntentoPin(t, { ok: false }, t0 + ocho), { fallos: 1, esperaHasta: 0, tandas: 0, ultimoFallo: t0 + ocho }, "a las 8 h sin fallos arranca de cero");
});

test("PIN fáciles: los de ejemplo de la demo, todos iguales y escaleras de 4, en el armado, el cambio y los generados", () => {
  for (const p of ["1111", "2222", "33", "44"]) assert.match(M.pinFacil("duenio", p), /PIN de ejemplo de la demo/, p);
  for (const p of ["0000", "9999", "5555"]) assert.match(M.pinFacil("duenio", p), /todos los números iguales/, p);
  for (const p of ["00", "77"]) assert.match(M.pinFacil("recepcion", p), /todos los números iguales/, p);
  for (const p of ["0123", "1234", "6789", "9876", "3210", "4321"]) assert.match(M.pinFacil("duenio", p), /escalera/, p);
  for (const p of ["5757", "8484", "3851", "1235", "4747"]) assert.equal(M.pinFacil("duenio", p), "", p);
  assert.equal(M.pinFacil("recepcion", "12"), "", "en 2 no se filtran escaleras (quedarían muy pocas)");
  const real = M.crearClubReal(HOY);
  assert.match(ok0(M.definirPinInicial(real, "u-rober", "1234", ahora(9))), /escalera/);
  assert.match(ok0(M.definirPinInicial(real, "u-rober", "2222", ahora(9))), /PIN de ejemplo/);
  assert.equal(M.usuario(real, "u-rober")!.pin, "", "no se guardó nada");
  assert.equal(M.definirPinInicial(real, "u-rober", "3851", ahora(9)).ok, true);
  const e = club();
  assert.match(ok0(M.cambiarMiPin(e, { usuarioId: "u-rober", pin: "1111" }, "0000", ahora(9))), /todos los números iguales/);
  assert.match(ok0(M.cambiarMiPin(e, { usuarioId: "u-rober", pin: "1111" }, "9876", ahora(9))), /escalera/);
  assert.ok(M.pinCoincide(e, M.usuario(e, "u-rober")!, "1111"));
  for (let i = 0; i < 40; i++) {
    const r = M.regenerarPin(e, "u-lu", { usuarioId: "u-rober", pin: "1111" }, ahora(9));
    assert.ok(r.ok);
    assert.equal(M.pinFacil("recepcion", r.pin), "", `generado ${r.pin}`);
  }
});

/** El motivo de una falla (para afirmar sobre el texto). */
function ok0(r: { ok: boolean; motivo?: string }): string {
  assert.equal(r.ok, false);
  return r.motivo ?? "";
}

// ───────────── reingeniería BP · 1A: seña del nuevo, cuánto entra, cobrar la seña y abrir ─────────────

/** El club con la regla de fábrica (seña a los nuevos prendida). */
function clubDeFabrica(): EstadoClub {
  const e = club();
  e.config.politica.senaNuevos = M.CONFIG_DEMO.politica.senaNuevos;
  return e;
}
const jugo = (e: EstadoClub, clienteId: string, veces: number) => {
  for (let i = 0; i < veces; i++) {
    const r = ok(M.crearReserva(e, { canchaId: "c2", fecha: M.sumarDias(HOY, -1 - i), inicio: 10 * 60, clienteId, conSena: false })).reserva;
    r.estado = "finalizada";
  }
};

test("de fábrica: seña a los nuevos sí, ventana de 14 días", () => {
  assert.equal(M.CONFIG_DEMO.politica.senaNuevos, true);
  assert.equal(M.CONFIG_DEMO.diasAdelante, 14);
  assert.equal(M.crearClubReal(HOY).config.politica.senaNuevos, true, "también en la jornada real");
});

test("BP-001/002: el nuevo con ficha deja seña; con 3 jugados sin faltas, no", () => {
  const e = clubDeFabrica();
  assert.equal(M.turnosJugados(e, "a"), 0);
  assert.equal(M.requiereSena(e, "a", "turno"), true, "nuevo con ficha: pide seña");
  assert.equal(M.motivoSena(e, "a", "turno"), "cliente nuevo");
  const r = ok(M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 20 * 60, clienteId: "a" }, ahora(8))).reserva;
  assert.equal(r.sena.monto, M.montoSena(e, r.precio));
  assert.equal(r.sena.monto, 21000);
  assert.match(r.ref ?? "", /^BP-[A-Z2-9]{4}$/);
  jugo(e, "b", 3);
  assert.equal(M.turnosJugados(e, M.cliente(e, "b")!), 3, "acepta la ficha o el id");
  assert.equal(M.requiereSena(e, "b", "turno"), false, "3 jugados y sin faltas: sin seña");
  assert.equal(M.motivoSena(e, "b", "turno"), null);
  // Los archivados cuentan.
  e.archivo = { clientes: { d: { jugados: 3 } } } as unknown as EstadoClub["archivo"];
  assert.equal(M.turnosJugados(e, "d"), 3);
  assert.equal(M.requiereSena(e, "d", "turno"), false);
});

test("BP-003/004: dos faltas piden seña aunque tenga 10 jugados; clase y fijo nunca", () => {
  const e = clubDeFabrica();
  jugo(e, "c", 10);
  assert.equal(M.cliente(e, "c")!.strikes, 2);
  assert.equal(M.requiereSena(e, "c", "turno"), true);
  assert.equal(M.motivoSena(e, "c", "turno"), "tiene 2 faltas");
  for (const tipo of ["clase", "fijo"] as const) {
    assert.equal(M.requiereSena(e, "a", tipo), false, `${tipo} con un nuevo`);
    assert.equal(M.requiereSena(e, "c", tipo), false, `${tipo} con faltas`);
    assert.equal(M.requiereSena(e, null, tipo), false, `${tipo} sin ficha`);
  }
  // Con la regla apagada, el nuevo vuelve a la seña de antes.
  e.config.politica.senaNuevos = false;
  assert.equal(M.requiereSena(e, "a", "turno"), false);
});

test("hidratarEstado completa lo nuevo de la configuración sin pisar lo que eligió el club", () => {
  const e = club();
  const vieja = M.serializarEstado(e);
  const cfg = vieja.estado.config as unknown as Record<string, unknown> & { politica: Record<string, unknown> };
  delete cfg.diasAdelante;
  delete cfg.politica.senaNuevos;
  const h = ok(M.hidratarEstado(JSON.parse(JSON.stringify(vieja))));
  assert.equal(h.estado.config.diasAdelante, 14);
  assert.equal(h.estado.config.politica.senaNuevos, true);
  const elegida = M.serializarEstado(e);
  elegida.estado.config.diasAdelante = 21;
  elegida.estado.config.politica.senaNuevos = false;
  const h2 = ok(M.hidratarEstado(JSON.parse(JSON.stringify(elegida))));
  assert.equal(h2.estado.config.diasAdelante, 21);
  assert.equal(h2.estado.config.politica.senaNuevos, false);
  const rota = M.serializarEstado(e);
  (rota.estado.config as unknown as Record<string, unknown>).diasAdelante = 9999;
  const h3 = ok(M.hidratarEstado(JSON.parse(JSON.stringify(rota))));
  assert.equal(h3.estado.config.diasAdelante, 14, "fuera de rango vuelve a la de fábrica");
});

test("cuantoEntra: hasta el próximo turno, el bloqueo o el cierre; 0 si ya está ocupado", () => {
  const e = club();
  const beto = ok(M.crearReserva(e, { canchaId: "c2", fecha: HOY, inicio: 21 * 60, clienteId: "b" }, ahora(8))).reserva;
  const a = M.cuantoEntra(e, HOY, "c2", 20 * 60 + 30);
  assert.equal(a.minutos, 30);
  assert.equal(a.hasta?.tipo === "turno" && a.hasta.reserva.id, beto.id);
  assert.equal(M.cuantoEntra(e, HOY, "c2", 21 * 60 + 30).minutos, 0, "dentro del turno de Beto");
  const { cierra } = M.horarioDe(e, HOY);
  const fin = M.cuantoEntra(e, HOY, "c3", cierra - 60);
  assert.deepEqual([fin.minutos, fin.hasta?.tipo], [60, "cierre"]);
  assert.equal(M.cuantoEntra(e, HOY, "c3", cierra).minutos, 0, "cerrado");
});

test("BP-005/006: cobrar la seña y abrir — cobra lo que falta, abre y prende la luz; si no se puede abrir, no cobra", () => {
  const e = clubDeFabrica();
  const r = ok(M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 20 * 60, clienteId: "a" }, ahora(8))).reserva;
  assert.match((M.checkIn(e, r.id, ahora(20)) as { motivo: string }).motivo, /seña/, "«Abrir la cancha» solo no alcanza");
  // Ocupada por otro turno: no se cobra nada.
  const otro = ok(M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 18 * 60 + 30, clienteId: "b", conSena: false }, ahora(8))).reserva;
  ok(M.checkIn(e, otro.id, ahora(18, 30)));
  const antes = cajaIngresos(e);
  const choca = M.cobrarSenaYAbrir(e, r.id, { medio: "transferencia" }, ahora(19, 55));
  assert.equal(choca.ok, false);
  assert.equal(cajaIngresos(e), antes, "no cobró");
  assert.equal(r.sena.pagada, false);
  e.reservas = e.reservas.filter((x) => x.id !== otro.id);
  e.luces.c1 = false;
  const res = ok(M.cobrarSenaYAbrir(e, r.id, { medio: "transferencia" }, ahora(19, 55)));
  assert.equal(res.cobrado, 21000);
  assert.equal(r.estado, "en_cancha");
  assert.equal(r.sena.pagada, true);
  assert.equal(e.luces.c1, true, "la luz prendida");
  const mov = e.caja.movimientos.at(-1)!;
  assert.deepEqual([mov.medio, mov.monto], ["transferencia", 21000]);
});


// ───────────── reingeniería BP · 2B: plata pendiente, dos bandejas, alertas de caja; H2/H4; lo que pide 2D ─────────────

const DIA = (n: number) => M.sumarDias(HOY, n);
const en = (dias: number, hh: number, mm = 0): Ahora => ({ fecha: DIA(dias), min: hh * 60 + mm });
/** Un turno sin ficha, pagado y cancelado con tiempo hace `dias` días: queda para devolver en mano. */
function devolucionDeHace(e: EstadoClub, dias: number, titular = "Sofi"): Reserva {
  const r = ok(M.crearReserva(e, { canchaId: "c3", fecha: DIA(-dias), inicio: 20 * 60, titular, conSena: false }, en(-dias - 2, 9))).reserva;
  ok(M.registrarPago(e, r.id, { medio: "transferencia", monto: 21000 }, en(-dias - 2, 9, 5)));
  ok(M.cancelar(e, r.id, {}, en(-dias - 1, 9)));
  return r;
}

test("H2/H4: prefijoActualIds lee el prefijo puesto; fijarSecuencia lo pone exacto (también para abajo) y no acepta basura", () => {
  M.prefijoIds("pc 01-!");
  assert.equal(M.prefijoActualIds(), "pc01-", "saneado como lo guarda el motor");
  M.prefijoIds("");
  assert.equal(M.prefijoActualIds(), "");
  const e = club();
  M.retomarSecuencia(500);
  M.fijarSecuencia(10);
  assert.equal(M.secuenciaIds(), 10, "baja");
  const a = M.anotarEspera(e, { titular: "X", clienteId: null, fecha: HOY, desde: 600, hasta: 700 }, ahora(9));
  assert.equal(a.id, "e" + (11).toString(36));
  for (const malo of [-1, 2.5, Number.NaN, "x" as unknown as number]) {
    M.fijarSecuencia(malo);
    assert.equal(M.secuenciaIds(), 11, `ignora ${String(malo)}`);
  }
  M.retomarSecuencia(500);
});

test("BP-050: la devolución de hace 5 días sigue en «Plata pendiente» (y en las alertas); devuelta con el medio elegido, se va y sale de la caja", () => {
  const e = club();
  const r = devolucionDeHace(e, 5);
  const lista = M.plataPendiente(e);
  assert.equal(lista.length, 1);
  const x = lista[0];
  assert.deepEqual([x.tipo, x.reservaId, x.monto, x.sentido, x.nombre], ["devolucion", r.id, 21000, "sale", "Sofi"]);
  assert.match(x.texto, /^Devolver \$ 21\.000 a Sofi \(turno del \d\d\/10 20:00\)$/);
  assert.ok(M.alertas(e, ahora(19)).some((a) => a.tipo === "devolucion" && a.reservaId === r.id), "la alerta tampoco vence (la bandeja de siempre)");
  const caja = e.caja.movimientos.length;
  ok(M.marcarDevuelto(e, r.id, "mercadopago", ahora(19)));
  assert.deepEqual(M.plataPendiente(e), [], "desaparece de la lista");
  const mov = e.caja.movimientos.at(-1)!;
  assert.equal(e.caja.movimientos.length, caja + 1);
  assert.deepEqual([mov.tipo, mov.medio, mov.monto], ["egreso", "mercadopago", 21000]);
  assert.equal(M.marcarDevuelto(e, r.id, "efectivo", ahora(19, 1)).ok, false, "dos veces no");
});

test("BP-051 (motor): la falta sin ficha de la semana pasada queda con nombre, monto y fecha; la seña vencida también; cobradas, se van", () => {
  const e = club();
  const r = ok(M.crearReserva(e, { canchaId: "c2", fecha: DIA(-7), inicio: 21 * 60, titular: "Pablo", conSena: false }, en(-8, 10))).reserva;
  const falta = ok(M.marcarNoShow(e, r.id, {}, en(-7, 21, 30)));
  assert.deepEqual(falta.cargos, [{ nombre: "Pablo", monto: 42000, sinFicha: true }]);
  const web = ok(M.crearReserva(e, { canchaId: "c1", fecha: DIA(1), inicio: 20 * 60, clienteId: "a", conSena: true, plazoSenaMin: 60, origen: "web" }, ahora(9))).reserva;
  M.vencerSenas(e, ahora(11));
  assert.equal(web.senaVencida, true);
  const lista = M.plataPendiente(e);
  assert.deepEqual(lista.map((x) => x.tipo), ["falta_sin_ficha", "sena_vencida"], "de lo más viejo a lo más nuevo");
  assert.match(lista[0].texto, /^Pablo debe la falta del \d\d\/10 · \$ 42\.000$/);
  assert.deepEqual([lista[1].monto, lista[1].tel], [21000, "5491100000001"], "con el celular de la ficha");
  ok(M.cobrarFaltaSinFicha(e, r.id, "efectivo", ahora(19)));
  ok(M.registrarPago(e, web.id, { medio: "transferencia", monto: 21000 }, ahora(19, 1)));
  assert.deepEqual(M.plataPendiente(e), []);
});

test("BP-052: fiado pedido y el cliente se va: «esperando OK» en la lista; al aprobar (con el código o en el sistema) la cuenta se cierra sola a cuenta corriente", () => {
  for (const como of ["codigo", "sistema"] as const) {
    const e = club();
    const r = mesa4(e);
    M.consumoJugador(e, r.id, 0, "k-pica", 1, {}, ahora(20, 10));
    const cta = M.cuentaDeJugador(e, r, 0)!;
    const debe = M.saldoCuenta(cta);
    const { novedad: n } = ok(M.solicitarCredito(e, { clienteId: "a", tipo: "fiado", monto: debe, cuentaId: cta.id }, RECEP, ahora(21)));
    let x = M.plataPendiente(e).find((y) => y.tipo === "fiado")!;
    assert.deepEqual([x.estadoFiado, x.cuentaId, x.monto, x.cerrarAlAprobar], ["esperando", cta.id, debe, false]);
    assert.equal(ok(M.cerrarAlAprobar(e, n.id, RECEP, ahora(21, 1))).yaEstaba, false);
    assert.equal(ok(M.cerrarAlAprobar(e, n.id, RECEP, ahora(21, 2))).yaEstaba, true, "idempotente");
    x = M.plataPendiente(e).find((y) => y.tipo === "fiado")!;
    assert.equal(x.cerrarAlAprobar, true);
    const caja = cajaIngresos(e);
    if (como === "codigo") {
      const d = M.datosAprobacion(e, n.id)!;
      ok(M.aprobarPorCodigo(e, n.id, { codigo: M.codigoAprobacion({ pin: "1111", novedadId: d.id, clienteId: d.c, monto: d.m, fecha: d.f }) }, RECEP, ahora(22)));
    } else ok(M.resolverCredito(e, n.id, { aprobar: true }, DUENO, ahora(22)));
    assert.equal(M.cuenta(e, cta.id)!.estado, "cerrada", `${como}: se cerró sola`);
    assert.equal(M.cliente(e, "a")!.deuda, debe, "a la cuenta corriente, exacto");
    assert.equal(cajaIngresos(e), caja, "lo fiado no entra a la caja");
    assert.equal(M.plataPendiente(e).filter((y) => y.tipo === "fiado").length, 0, "y sale de la lista");
  }
});

test("fiado sin «se fue»: aprobado, queda «Pasar a su cuenta corriente»; aprobado por menos de lo que debe, no se cierra solo y lo dice", () => {
  const e = club();
  const r = mesa4(e);
  M.consumoJugador(e, r.id, 0, "k-pica", 2, {}, ahora(20, 10));
  const cta = M.cuentaDeJugador(e, r, 0)!;
  const debe = M.saldoCuenta(cta);
  const { novedad: n } = ok(M.solicitarCredito(e, { clienteId: "a", tipo: "fiado", monto: debe, cuentaId: cta.id }, RECEP, ahora(21)));
  ok(M.cerrarAlAprobar(e, n.id, RECEP, ahora(21, 1)));
  ok(M.resolverCredito(e, n.id, { aprobar: true, monto: debe - 1000 }, DUENO, ahora(22)));
  assert.equal(M.cuenta(e, cta.id)!.estado, "abierta", "no entra: no se fuerza");
  const x = M.plataPendiente(e).find((y) => y.tipo === "fiado")!;
  assert.equal(x.estadoFiado, "aprobado");
  assert.match(x.texto, /no se pudo cerrar sola/);
  // Rechazado con el cliente que se fue: queda para cobrar la cuenta.
  const e2 = club();
  const r2 = mesa4(e2);
  M.consumoJugador(e2, r2.id, 0, "k-pica", 1, {}, ahora(20, 10));
  const c2 = M.cuentaDeJugador(e2, r2, 0)!;
  const { novedad: n2 } = ok(M.solicitarCredito(e2, { clienteId: "a", tipo: "fiado", monto: M.saldoCuenta(c2), cuentaId: c2.id }, RECEP, ahora(21)));
  ok(M.cerrarAlAprobar(e2, n2.id, RECEP, ahora(21, 1)));
  ok(M.resolverCredito(e2, n2.id, { aprobar: false }, DUENO, ahora(22)));
  assert.equal(M.plataPendiente(e2)[0].estadoFiado, "rechazado");
  assert.equal(M.cerrarAlAprobar(e2, n2.id, RECEP, ahora(22)).ok, false, "ya se resolvió");
});

test("BP-053/054 (motor): caja sin cerrar → alerta para los dos; cierre con diferencia y pago que vence → sólo dueño", () => {
  const e = club();
  ok(M.ventaMostrador(e, [{ productoId: "k-pica", cant: 1 }], "efectivo", en(-1, 20)));
  const a = M.alertas(e, ahora(13));
  const caja = a.find((x) => x.tipo === "caja")!;
  assert.equal(caja.nivel, "alta");
  assert.equal(caja.paraDuenio, undefined, "para recepción y dueño");
  assert.equal(caja.texto, `Quedó la caja del ${DIA(-1).slice(8)}/10 sin cerrar.`);
  assert.deepEqual(caja.dias, [DIA(-1)]);
  ok(M.cerrarCaja(e, { contado: 0, usuarioId: "u-lu", pin: "33", dia: DIA(-1) }, ahora(13, 5)));
  const b = M.alertas(e, ahora(13, 6));
  assert.equal(b.some((x) => x.tipo === "caja"), false, "cerrada, se va");
  const dif = b.find((x) => x.tipo === "cierreConDiferencia")!;
  assert.equal(dif.paraDuenio, true);
  assert.match(dif.texto, /^La caja del \d\d\/10 cerró con \$ [\d.]+ de menos \(Lu, 13:05\)\.$/);
  // Remito que vence mañana: alerta del dueño; pagado, se va.
  const conStock = M.PRODUCTOS_DEMO.find((p) => p.stock != null && !p.alquiler)!.id;
  const { remito } = ok(M.registrarRemito(e, { proveedorId: "pv1", numero: "A-1", items: [{ productoId: conStock, cant: 10, costo: 4800 }], vence: DIA(1) }, DUENO, ahora(9)));
  assert.equal(M.registrarRemito(e, { proveedorId: "pv1", numero: "A-2", items: [{ productoId: conStock, cant: 1 }], vence: "mañana" }, DUENO, ahora(9)).ok, false);
  const v = M.alertas(e, ahora(14)).find((x) => x.tipo === "vencePago")!;
  assert.deepEqual([v.paraDuenio, v.nivel, v.remitoId], [true, "media", remito.id]);
  assert.equal(v.texto, "Mañana vence el pago de $ 48.000 a Distribuidora Ezeiza Bebidas (remito A-1).");
  assert.deepEqual(M.pagosPorVencer(e, en(3, 10)).map((x) => [x.enDias, x.monto]), [[-2, 48000]], "vencido");
  ok(M.pagarProveedor(e, { proveedorId: "pv1", medio: "transferencia", monto: 30000 }, DUENO, ahora(15)));
  assert.equal(M.pagosPorVencer(e, ahora(15))[0].monto, 18000, "lo pagado cubre del más viejo");
  ok(M.pagarProveedor(e, { proveedorId: "pv1", medio: "transferencia", monto: 18000 }, DUENO, ahora(15)));
  assert.equal(M.alertas(e, ahora(15)).some((x) => x.tipo === "vencePago"), false);
});

test("«aparte»: lo que chocó entre puestos (en la foto) es alerta del dueño", () => {
  const e = club() as EstadoClub & { sincro?: { paraResolver: unknown[] } };
  e.sincro = { paraResolver: [{ id: "x" }, { id: "y" }] };
  const a = M.alertas(e, ahora(10)).find((x) => x.tipo === "aparte")!;
  assert.deepEqual([a.paraDuenio, a.texto], [true, "Quedaron 2 cosas de los puestos para resolver."]);
});

test("BP-055: una alerta pospuesta no aparece hoy y sí mañana; sólo las posponibles; las del dueño, un dueño; sobrevive al respaldo", () => {
  const e = club();
  ok(M.cerrarCaja(e, { contado: 100, usuarioId: "u-rober", pin: "1111" }, ahora(13)));
  const dif = M.alertas(e, ahora(14)).find((x) => x.tipo === "cierreConDiferencia")!;
  const clave = M.claveDeAlerta(dif);
  assert.equal(clave, `cierreConDiferencia:${dif.dia}`);
  assert.equal(M.posponerAlerta(e, clave, RECEP, ahora(14)).ok, false, "la del dueño no la pospone recepción");
  const p = ok(M.posponerAlerta(e, clave, DUENO, ahora(14)));
  assert.equal(p.hasta, DIA(1));
  assert.equal(M.alertas(e, ahora(23)).some((x) => x.tipo === "cierreConDiferencia"), false, "hoy no");
  assert.equal(ok(M.posponerAlerta(e, clave, DUENO, ahora(15))).yaEstaba, true);
  const foto = ok(M.hidratarEstado(JSON.parse(JSON.stringify(M.serializarEstado(e))))).estado;
  assert.equal(M.alertas(foto, ahora(23)).some((x) => x.tipo === "cierreConDiferencia"), false, "la foto la recuerda");
  assert.equal(M.alertas(e, en(1, 9)).some((x) => x.tipo === "cierreConDiferencia"), true, "mañana, sí");
  // Lo del día no se pospone.
  ok(M.ventaMostrador(e, [{ productoId: "k-pica", cant: 1 }], "efectivo", en(1, 9)));
  const caja = M.alertas(e, en(2, 13)).find((x) => x.tipo === "caja")!;
  assert.match((M.posponerAlerta(e, M.claveDeAlerta(caja), DUENO, en(2, 13)) as { motivo: string }).motivo, /hoy/);
  // Una foto con basura en las pospuestas se limpia sin rechazarse.
  const rara = M.serializarEstado(e);
  (rara.estado as unknown as Record<string, unknown>).alertasPospuestas = [{ tipo: 1 }, "x"];
  assert.equal("alertasPospuestas" in ok(M.hidratarEstado(JSON.parse(JSON.stringify(rara)))).estado, false);
});

test("BP-056 (motor): el WhatsApp de la falta lleva lo que le quedó al titular en su cuenta (al titular, en grupo, sin cargo)", () => {
  const e = club();
  const r = mesa4(e, 18);
  ok(M.marcarNoShow(e, r.id, {}, ahora(18, 30)));
  assert.equal(r.faltaTitular, 42000);
  assert.equal(M.mensajeDeLaFalta(e, r.id), "¡Hola Ana! Hoy no llegaron al turno de las 18:00. Como avisamos, la falta se cobra entera: te quedó $ 42.000 en tu cuenta. Lo podés pasar por transferencia o Mercado Pago. ¡Gracias!");
  const g = mesa4(e, 16, "c2");
  ok(M.marcarNoShow(e, g.id, { cobrarA: "grupo" }, ahora(16, 30)));
  // Ana (titular) + Caro y Dani sin ficha en el turno → a cargo de la titular; Beto, lo suyo.
  const partes = M.dividir(g.precio, 4);
  assert.equal(g.faltaTitular, g.precio - partes[1]);
  assert.ok(M.mensajeDeLaFalta(e, g.id)!.includes(`te quedó ${M.pesos(g.precio - partes[1])} en tu cuenta`));
  const nadie = mesa4(e, 14, "c3");
  ok(M.marcarNoShow(e, nadie.id, { cobrarA: "nadie", auth: DUENO }, ahora(14, 30)));
  assert.equal(M.mensajeDeLaFalta(e, nadie.id), null, "sin cargo, sin mensaje de plata");
  assert.equal(M.mensajeDeLaFalta(e, mesa4(e, 22, "c4").id), null, "no es falta");
});

test("materializarFijosHasta: baja los fijos de toda la ventana (+14), idempotente, y avisa el que choca con su fecha", () => {
  const e = club();
  const dia = M.diaSemana(DIA(3));
  M.crearFijo(e, { clienteId: "b", canchaId: "c2", dia, inicio: 19 * 60 });
  ok(M.crearReserva(e, { canchaId: "c2", fecha: DIA(10), inicio: 19 * 60, clienteId: "a", conSena: false }, ahora(9)));
  const choques = M.materializarFijosHasta(e, HOY);
  assert.deepEqual(choques.map((c) => c.fecha), [DIA(10)]);
  assert.deepEqual(e.reservas.filter((r) => r.fijoId).map((r) => r.fecha).sort(), [DIA(3), DIA(17)].filter((f) => f <= DIA(14)));
  const n = e.reservas.length;
  M.materializarFijosHasta(e, HOY, 14);
  assert.equal(e.reservas.length, n, "idempotente");
});

test("2D · cerrar la cancha y seguir con un medio por jugador: cada parte con el suyo, caja por medio exacta; si a uno le falta el medio, no se cobra nada", () => {
  const e = club();
  const r = mesa4(e);
  ok(M.checkIn(e, r.id, ahora(20)));
  const antes = cajaIngresos(e);
  const sinMedio = M.cerrarCanchaYSeguir(e, r.id, { porJugador: { 0: "mercadopago", 1: "efectivo", 2: "debito" } }, ahora(21, 30));
  assert.equal(sinMedio.ok, false);
  assert.match((sinMedio as { motivo: string }).motivo, /Dani/);
  assert.equal(cajaIngresos(e), antes, "nada cobrado");
  assert.equal(M.cerrarCanchaYSeguir(e, r.id, { porJugador: { 0: "monedero" as never }, medio: "efectivo" }, ahora(21, 30)).ok, false, "sin créditos");
  const res = ok(M.cerrarCanchaYSeguir(e, r.id, { porJugador: { 0: "mercadopago", 1: "efectivo", 2: "debito" }, medio: "transferencia" }, ahora(21, 30)));
  assert.equal(res.cobradoCancha, 42000);
  assert.deepEqual(res.porMedio, { mercadopago: 10500, efectivo: 10500, debito: 10500, transferencia: 10500 });
  assert.equal(r.estado, "finalizada");
  assert.equal(r.mesaSigue, true);
  assert.equal(cajaIngresos(e) - antes, 42000, "ni un peso más");
  assert.deepEqual(r.jugadores.map((j) => j.saldado), [true, true, true, true]);
  // Con un solo medio, como siempre.
  const e2 = club();
  const r2 = mesa4(e2);
  ok(M.checkIn(e2, r2.id, ahora(20)));
  assert.deepEqual(ok(M.cerrarCanchaYSeguir(e2, r2.id, { medio: "efectivo" }, ahora(21, 30))).porMedio, { efectivo: 42000 });
});

test("2D · «cerrar la de X y abrir la siguiente» en un paso: cobra a X por jugador, la cierra y abre la otra (con su seña); si la siguiente no se puede abrir, no toca nada", () => {
  const e = club();
  const x = mesa4(e, 18, "c1");
  ok(M.checkIn(e, x.id, ahora(18)));
  const sig = ok(M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 19 * 60 + 30, clienteId: "c", conSena: true }, ahora(9))).reserva;
  assert.equal(sig.sena.monto, 21000);
  const antes = cajaIngresos(e);
  // Sin medio para la seña: no se cierra ni se cobra.
  const falla = M.cerrarYAbrirLaSiguiente(e, { cerrarId: x.id, abrirId: sig.id, medio: "efectivo" }, ahora(19, 30));
  assert.equal(falla.ok, false);
  assert.match((falla as { motivo: string }).motivo, /seña/);
  assert.deepEqual([x.estado, cajaIngresos(e)], ["en_cancha", antes]);
  // Otra cancha: no.
  const otra = ok(M.crearReserva(e, { canchaId: "c2", fecha: HOY, inicio: 19 * 60 + 30, clienteId: "b", conSena: false }, ahora(9))).reserva;
  assert.equal(M.cerrarYAbrirLaSiguiente(e, { cerrarId: x.id, abrirId: otra.id, medio: "efectivo" }, ahora(19, 30)).ok, false);
  const res = ok(M.cerrarYAbrirLaSiguiente(e, { cerrarId: x.id, abrirId: sig.id, porJugador: { 0: "mercadopago" }, medio: "efectivo", seguir: true, medioSena: "transferencia" }, ahora(19, 30)));
  assert.deepEqual(res.cerrada.porMedio, { mercadopago: 10500, efectivo: 31500 });
  assert.equal(res.abierta.cobrado, 21000);
  assert.deepEqual([x.estado, x.mesaSigue, sig.estado, sig.sena.pagada, e.luces.c1], ["finalizada", true, "en_cancha", true, true]);
  assert.equal(cajaIngresos(e) - antes, 42000 + 21000, "exacto");
  // Repetirlo no cobra de nuevo.
  assert.equal(M.cerrarYAbrirLaSiguiente(e, { cerrarId: x.id, abrirId: sig.id, medio: "efectivo", medioSena: "efectivo" }, ahora(19, 31)).ok, false);
  assert.equal(cajaIngresos(e) - antes, 63000);
  // A cuenta corriente (Dani tiene) y sin seña.
  const e2 = club();
  const d = ok(M.crearReserva(e2, { canchaId: "c4", fecha: HOY, inicio: 18 * 60, clienteId: "d", conSena: false }, ahora(9))).reserva;
  ok(M.checkIn(e2, d.id, ahora(18)));
  const s2 = ok(M.crearReserva(e2, { canchaId: "c4", fecha: HOY, inicio: 19 * 60 + 30, clienteId: "b", conSena: false }, ahora(9))).reserva;
  ok(M.cerrarYAbrirLaSiguiente(e2, { cerrarId: d.id, abrirId: s2.id, aCuenta: true }, ahora(19, 30)));
  assert.deepEqual([d.estado, d.aCuentaCorriente, M.cliente(e2, "d")!.deuda, s2.estado], ["finalizada", 42000, 42000, "en_cancha"]);
});

// ───────────── Tanda 3C (dueño del motor): fijos con baja y pausa; lo que consumen 3A, 3B y 3D ─────────────

/** Un fijo de los martes 20:00 en la C1 a nombre de Beto, con la ventana de +14 bajada desde `hoy`. */
function conFijoDeLosMartes(hoy: string) {
  const e = club();
  const f = M.crearFijo(e, { clienteId: "b", canchaId: "c1", dia: 2, inicio: 20 * 60, duracion: 90 });
  M.materializarFijosHasta(e, hoy);
  return { e, f };
}
const delFijo = (e: EstadoClub, fijoId: string, estado = "reservada") => e.reservas.filter((r) => r.fijoId === fijoId && r.estado === estado).map((r) => r.fecha).sort();

test("BP-101: pausar hasta el 31/01 → no se bajan turnos de enero (los que estaban se liberan) y desde el 1/02 vuelven solos", () => {
  const hoy = "2026-01-05"; // lunes
  const { e, f } = conFijoDeLosMartes(hoy);
  assert.deepEqual(delFijo(e, f.id), ["2026-01-06", "2026-01-13"], "dos martes en la grilla (+14)");
  const d = ok(M.darDeBajaFijo(e, f.id, { desde: hoy, pausaHasta: "2026-01-31" }, { fecha: hoy, min: 10 * 60 }));
  assert.equal(d.modo, "pausa");
  assert.deepEqual(d.turnos.map((t) => t.fecha), ["2026-01-06", "2026-01-13"]);
  assert.deepEqual(delFijo(e, f.id), [], "en enero no queda ninguno");
  assert.ok(e.fijos.some((x) => x.id === f.id), "el fijo sigue en la lista");
  // Pasan los días: la agenda baja la ventana desde el 20/01 y desde el 27/01.
  M.materializarFijosHasta(e, "2026-01-20");
  assert.deepEqual(delFijo(e, f.id), ["2026-02-03"], "el 27/01 no; el 3/02 sí");
  M.materializarFijosHasta(e, "2026-01-27");
  assert.deepEqual(delFijo(e, f.id), ["2026-02-03", "2026-02-10"], "y siguen solos");
  assert.equal(M.fijoJuegaEl(e.fijos[0], "2026-01-27"), false);
  assert.equal(M.fijoJuegaEl(e.fijos[0], "2026-02-03"), true);
});

test("darDeBajaFijo: desde una fecha futura deja `hasta` y sigue jugando antes; desde hoy sale de la lista; la previa sobre copia cuenta turnos y plata", () => {
  const { e, f } = conFijoDeLosMartes(HOY); // martes 20/10 y 27/10
  const [primero, segundo] = e.reservas.filter((r) => r.fijoId === f.id).sort((a, b) => a.fecha.localeCompare(b.fecha));
  M.registrarPago(e, segundo.id, { medio: "efectivo", monto: 21000 }, ahora(10));
  // Previa: sobre una copia, el estado no cambia.
  const copia = structuredClone(e);
  const previa = ok(M.darDeBajaFijo(copia, f.id, { desde: segundo.fecha, auth: DUENO }, ahora(11)));
  assert.deepEqual([previa.turnos.length, previa.devuelto, previa.quitado], [1, 21000, false]);
  assert.equal(M.reserva(e, segundo.id)!.estado, "reservada", "la previa no tocó nada");
  // Confirmada con el dueño: lo pagado vuelve como crédito a Beto, el primero sigue, el fijo termina el día anterior.
  const monedero = M.cliente(e, "b")!.monedero;
  const d = ok(M.darDeBajaFijo(e, f.id, { desde: segundo.fecha, auth: DUENO }, ahora(11)));
  assert.equal(d.porClub, true);
  assert.equal(M.cliente(e, "b")!.monedero, monedero + 21000);
  assert.equal(M.reserva(e, primero.id)!.estado, "reservada");
  assert.equal(e.fijos.find((x) => x.id === f.id)!.hasta, M.sumarDias(segundo.fecha, -1));
  M.materializarFijosHasta(e, HOY, 30);
  assert.deepEqual(delFijo(e, f.id), [primero.fecha], "después del `hasta` no se baja nada más");
  // Desde hoy: sale de la lista; re-aplicado (otro puesto), dice que no y no toca plata.
  ok(M.darDeBajaFijo(e, f.id, { desde: HOY }, ahora(12)));
  assert.ok(!e.fijos.some((x) => x.id === f.id));
  const antes = JSON.stringify(e);
  assert.equal(M.darDeBajaFijo(e, f.id, { desde: HOY }, ahora(12)).ok, false);
  assert.equal(JSON.stringify(e), antes);
  // Validaciones.
  const { e: e2, f: f2 } = conFijoDeLosMartes(HOY);
  assert.equal(M.darDeBajaFijo(e2, f2.id, { desde: DIA(-1) }, ahora(12)).ok, false, "desde un día que pasó, no");
  assert.equal(M.darDeBajaFijo(e2, f2.id, { desde: DIA(1), pausaHasta: HOY }, ahora(12)).ok, false, "pausa al revés, no");
  assert.equal(M.darDeBajaFijo(e2, f2.id, { desde: "2026-02-31" }, ahora(12)).ok, false, "fecha que no existe, no");
});

test("darDeBajaFijo con recepción: la regla de siempre (tarde → seña en suspenso, nunca más que con el dueño); un turno que ya empezó no se toca", () => {
  const martes = "2026-10-20";
  const { e, f } = conFijoDeLosMartes(HOY);
  const r = e.reservas.find((x) => x.fijoId === f.id && x.fecha === martes)!;
  M.registrarPago(e, r.id, { medio: "efectivo", monto: 10000 }, ahora(10));
  const tarde: Ahora = { fecha: martes, min: 19 * 60 };
  const d = ok(M.darDeBajaFijo(structuredClone(e), f.id, { desde: martes, auth: RECEP }, tarde));
  assert.deepEqual([d.porClub, d.enSuspenso, d.retenido, d.devuelto], [false, 1, 10000, 0]);
  const enJuego: Ahora = { fecha: martes, min: 20 * 60 + 10 };
  const d2 = ok(M.darDeBajaFijo(structuredClone(e), f.id, { desde: martes, auth: DUENO }, enJuego));
  assert.ok(!d2.turnos.some((t) => t.fecha === martes), "el de hoy ya empezó: no se cancela");
});

test("BP-104: libero el martes de dentro de 3 semanas: esa fecha no se baja y las demás sí", () => {
  const { e, f } = conFijoDeLosMartes(HOY);
  const en3 = "2026-11-10";
  ok(M.liberarFijo(e, f.id, en3, ahora(10)));
  M.materializarFijosHasta(e, "2026-11-01", 21);
  assert.deepEqual(delFijo(e, f.id), ["2026-10-20", "2026-10-27", "2026-11-03", "2026-11-17"]);
});

test("fijo desde el alta: con `desde`, no se baja antes de su primera fecha", () => {
  const e = club();
  const f = M.crearFijo(e, { clienteId: "a", canchaId: "c2", dia: 4, inicio: 20 * 60, desde: "2026-10-22" });
  M.materializarFijosHasta(e, HOY, 22);
  assert.deepEqual(delFijo(e, f.id), ["2026-10-22", "2026-10-29", "2026-11-05"]);
  assert.equal(M.fijoJuegaEl(f, "2026-10-15"), false);
  // Sin `desde`, la forma de siempre (sin la clave).
  assert.ok(!("desde" in M.crearFijo(e, { clienteId: "a", canchaId: "c3", dia: 4, inicio: 20 * 60 })));
});

test("3A · autorizarNovedad: la aprobación del celular entra sin código; idempotente; el rechazo deja la cuenta abierta; sólo un dueño", () => {
  const e = club();
  const r = mesa4(e);
  M.consumoJugador(e, r.id, 0, "k-pica", 1, {}, ahora(20, 10));
  const cta = M.cuentaDeJugador(e, r, 0)!;
  const debe = M.saldoCuenta(cta);
  const { novedad: n } = ok(M.solicitarCredito(e, { clienteId: "a", tipo: "fiado", monto: debe, cuentaId: cta.id }, RECEP, ahora(21)));
  ok(M.cerrarAlAprobar(e, n.id, RECEP, ahora(21, 1)));
  assert.equal(M.autorizarNovedad(e, n.id, { aprobo: "u-lu", decision: "aprobado", monto: debe }, ahora(21, 5)).ok, false, "recepción no aprueba");
  assert.equal(M.autorizarNovedad(e, n.id, { aprobo: "Rober", decision: "talvez" as "aprobado" }, ahora(21, 5)).ok, false);
  const caja = cajaIngresos(e);
  const a = ok(M.autorizarNovedad(e, n.id, { aprobo: "Rober", decision: "aprobado", monto: debe }, ahora(21, 5)));
  assert.deepEqual([a.yaEstaba, a.aprobo, a.monto], [false, "Rober", debe]);
  assert.equal(M.cuenta(e, cta.id)!.estado, "cerrada", "se fue: se cerró sola a su cuenta corriente");
  assert.equal(M.cliente(e, "a")!.deuda, debe);
  assert.equal(cajaIngresos(e), caja, "lo fiado no entra a la caja");
  assert.equal(e.novedades[0].desdeElCelular, true);
  // El latido de otro puesto la vuelve a aplicar: no hace nada.
  const foto = JSON.stringify(e);
  assert.equal(ok(M.autorizarNovedad(e, n.id, { aprobo: "u-rober", decision: "aprobado", monto: debe }, ahora(21, 6))).yaEstaba, true);
  assert.equal(JSON.stringify(e), foto, "byte a byte");
  assert.equal(M.autorizarNovedad(e, n.id, { aprobo: "Rober", decision: "rechazado" }, ahora(21, 7)).ok, false, "otra decisión sobre un pedido resuelto, no");
  // Rechazo: la cuenta sigue abierta.
  const e2 = club();
  const r2 = mesa4(e2);
  M.consumoJugador(e2, r2.id, 0, "k-pica", 1, {}, ahora(20, 10));
  const c2 = M.cuentaDeJugador(e2, r2, 0)!;
  const { novedad: n2 } = ok(M.solicitarCredito(e2, { clienteId: "a", tipo: "fiado", monto: M.saldoCuenta(c2), cuentaId: c2.id }, RECEP, ahora(21)));
  ok(M.autorizarNovedad(e2, n2.id, { aprobo: "Majo", decision: "rechazado" }, ahora(21, 5)));
  assert.deepEqual([e2.novedades[0].estado, e2.novedades[0].resolvio, M.cuenta(e2, c2.id)!.estado], ["rechazada", "Majo", "abierta"]);
});

test("3D · fin de semana: de fábrica todo pico; «como la semana»; «valle hasta las 14»; una regla por día; feriado siempre pico", () => {
  const e = club();
  const sab = "2026-10-17", dom = "2026-10-18", mar = "2026-10-20";
  const p = (fecha: string, hh: number, dur = 60) => M.precioTurno(e, { fecha, inicio: hh * 60, duracion: dur, canchaId: "c1" });
  assert.equal(p(sab, 10), 28000, "de fábrica: todo pico");
  assert.equal(M.validarReglaFinde("nada").ok, false);
  assert.equal(M.validarReglaFinde({ valleHasta: 14 * 60 + 15 }).ok, false, "cada 30 min");
  assert.equal(M.ajustarFinde(e, "semana", RECEP, ahora(9)).ok, false, "lo cambia un dueño");
  ok(M.ajustarFinde(e, "semana", DUENO, ahora(9)));
  assert.equal(p(sab, 10), 20000);
  assert.equal(M.franjaDe(e, sab, 10 * 60), "valle");
  ok(M.ajustarFinde(e, { valleHasta: 14 * 60 }, DUENO, ahora(9)));
  assert.equal(p(sab, 13, 120), 48000, "13 a 14 valle ($ 20.000), 14 a 15 pico ($ 28.000)");
  ok(M.ajustarFinde(e, { sabado: "semana", domingo: "pico" }, DUENO, ahora(9)));
  assert.deepEqual([p(sab, 10), p(dom, 10), M.reglaDelDia(e, mar)], [20000, 28000, "semana"]);
  // Feriado (3D): «20/11 feriado → pico a las 10».
  assert.equal(p("2026-11-20", 10), 20000, "viernes común: valle a las 10");
  const v = M.validarFeriados(["2026-11-20", "2026-12-08", "2026-11-20", "2026-13-01"]);
  assert.equal(v.ok, false);
  assert.match(v.motivo!, /2026-13-01/, "nombra la que no sirve");
  assert.equal(M.ajustarFeriados(e, ["2026-11-20", "2026-13-01"], DUENO, ahora(9)).ok, false, "con una mala no guarda nada");
  assert.deepEqual(ok(M.ajustarFeriados(e, ["2026-12-08", "2026-11-20", "2026-11-20"], DUENO, ahora(9))).feriados, ["2026-11-20", "2026-12-08"]);
  assert.equal(p("2026-11-20", 10), 28000, "feriado: pico a las 10");
  assert.equal(M.esFeriado(e, "2026-11-20"), true);
  // Lo ya reservado conserva su precio.
  const r = ok(M.crearReserva(e, { canchaId: "c2", fecha: "2026-11-27", inicio: 10 * 60, duracion: 60, clienteId: "a", conSena: false }, ahora(9))).reserva;
  ok(M.ajustarFeriados(e, ["2026-11-27"], DUENO, ahora(9)));
  assert.equal(M.reserva(e, r.id)!.precio, 20000);
});

test("3D · «sólo este día cierra 20:00» no toca los otros viernes; avisa lo que queda afuera; null lo vuelve; hidratar lo conserva sano", () => {
  const e = club();
  const vie = "2026-10-23", otroVie = "2026-10-30";
  const r = ok(M.crearReserva(e, { canchaId: "c1", fecha: vie, inicio: 21 * 60, clienteId: "a", conSena: false }, ahora(9))).reserva;
  assert.equal(M.ajustarHorarioDelDia(e, vie, { abre: 8 * 60, cierra: 20 * 60 }, RECEP, ahora(9)).ok, false);
  assert.equal(M.ajustarHorarioDelDia(e, vie, { abre: 20 * 60, cierra: 8 * 60 }, DUENO, ahora(9)).ok, false);
  const d = ok(M.ajustarHorarioDelDia(e, vie, { abre: 8 * 60, cierra: 20 * 60 }, DUENO, ahora(9)));
  assert.deepEqual(d.afuera.map((x) => x.id), [r.id]);
  assert.deepEqual(M.horarioDe(e, vie), { abre: 8 * 60, cierra: 20 * 60 });
  assert.deepEqual(M.horarioDe(e, otroVie), e.config.horarios[5], "los otros viernes, igual");
  assert.equal(M.validarHueco(e, { canchaId: "c2", fecha: vie, inicio: 20 * 60, duracion: 60 }).ok, false);
  assert.equal(M.validarHueco(e, { canchaId: "c2", fecha: otroVie, inicio: 20 * 60, duracion: 60 }).ok, true);
  const foto = JSON.parse(JSON.stringify(M.serializarEstado(e)));
  foto.estado.config.horarioExcepciones["2026-02-31"] = { abre: 1, cierra: 2 };
  foto.estado.config.feriados = ["2026-11-20", "x"];
  foto.estado.config.finde = { valleHasta: "mediodía" };
  const h = M.hidratarEstado(foto);
  assert.ok(h.ok);
  if (!h.ok) return;
  assert.deepEqual(Object.keys(h.estado.config.horarioExcepciones!), [vie]);
  assert.deepEqual(h.estado.config.feriados, ["2026-11-20"]);
  assert.ok(!("finde" in h.estado.config), "la regla que no se entiende se va (queda todo pico)");
  ok(M.ajustarHorarioDelDia(e, vie, null, DUENO, ahora(9)));
  assert.ok(!("horarioExcepciones" in e.config));
});

test("3B · el archivo deja por día lo que entró por medio × rubro y lo que salió por categoría, y cuadra con los totales", () => {
  const e = club();
  const a8 = ahora(13);
  const r = mesa4(e, 14);
  M.registrarPago(e, r.id, { medio: "mercadopago", monto: 10000 }, a8);
  M.registrarPago(e, r.id, { medio: "efectivo", monto: 5000 }, a8);
  M.consumoJugador(e, r.id, 0, "k-pica", 1, { modo: "cobrar", medio: "efectivo" }, a8);
  ok(M.egresoCaja(e, { monto: 3000, concepto: "Hielo", ...RECEP }, a8));
  const d = M.desglosePorDia(e)[HOY];
  const ingresos = e.caja.movimientos.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + m.monto, 0);
  const suma = Object.values(d.porMedioRubro).flatMap((x) => Object.values(x ?? {})).reduce((s, n) => s + (n ?? 0), 0);
  assert.equal(suma, ingresos, "Σ medio × rubro = ingresos de caja");
  assert.equal(d.porMedioRubro.mercadopago?.canchas, 10000);
  assert.ok((d.porMedioRubro.efectivo?.buffet ?? 0) > 0);
  assert.deepEqual(d.egresosPorCategoria, { gastos: 3000 });
  assert.equal(M.rubroDeMovimiento({ concepto: "Seña Ana" }), "senas");
  assert.equal(M.rubroDeMovimiento({ concepto: "Buffet Tienda T-AB12 · Ana" }), "tienda");
  assert.equal(M.categoriaDeEgreso({ concepto: "Pago a Coca" }), "proveedores");
  assert.equal(M.categoriaDeEgreso({ concepto: "Hielo", categoria: "bar" }), "bar", "la categoría del movimiento (4B) manda");
  // Archivado: el resumen del día (en el estado y en el paquete) lleva el desglose.
  ok(M.cerrarCaja(e, { contado: 0, usuarioId: "u-rober", pin: "1111", dia: M.diaDeCaja(e, HOY, 13 * 60) }, ahora(23)));
  const res = M.archivarDiasCerrados(e, M.diaDeCaja(e, HOY, 13 * 60));
  assert.ok(res.ok && !res.vacio);
  if (!res.ok) return;
  const fila = res.estado.archivo!.dias[0];
  assert.equal(Object.values(fila.porMedioRubro ?? {}).flatMap((x) => Object.values(x ?? {})).reduce((s, n) => s + (n ?? 0), 0), fila.ingresosCaja);
  assert.equal(Object.values(fila.egresosPorCategoria ?? {}).reduce((s, n) => s + n, 0), fila.egresosCaja);
  const paquete = M.paqueteParaArchivar(M.serializarEstado(e) as unknown as M.FotoEstado, res);
  assert.deepEqual(paquete.anexo.resumen[0].porMedioRubro, fila.porMedioRubro);
  // Sobrevive al respaldo; un día de antes (sin desglose) sigue sin desglose.
  const foto = JSON.parse(JSON.stringify(M.serializarEstado(res.estado)));
  const viejo = { ...foto.estado.archivo.dias[0], dia: "2026-09-01" };
  delete viejo.porMedioRubro;
  delete viejo.egresosPorCategoria;
  foto.estado.archivo.dias.unshift(viejo);
  const h = M.hidratarEstado(foto);
  assert.ok(h.ok);
  if (!h.ok) return;
  assert.ok(!("porMedioRubro" in h.estado.archivo!.dias[0]));
  assert.deepEqual(h.estado.archivo!.dias[1].porMedioRubro, fila.porMedioRubro);
});

// ── Tanda B4: caja por turnos (cierre a ciegas, firma D-16, corregir medio, retiro, egreso por categoría, archivo) ──

const CARO = { usuarioId: "u-caro" };
const FIRMA_DUENO = { usuarioId: "u-caro", firmaId: "u-rober", pin: "1111" };
const PICADA = 21000;
/** Billetes que suman `monto` (de a $10.000, el resto en monedas). */
const billetesDe = (monto: number) => ({ "10000": Math.floor(monto / 10000), monedas: monto % 10000 });

test("B4-C1: el turno se cuenta a ciegas (billetes, medios), se sella, y lo esperado sale recién después", () => {
  const e = club();
  e.caja.fondo = 10000;
  ok(M.ventaMostrador(e, [{ productoId: "k-pica", cant: 1 }], "efectivo", ahora(13)));
  ok(M.ventaMostrador(e, [{ productoId: "k-pica", cant: 1 }], "mercadopago", ahora(13, 30)));
  const abierto = M.turnoDeCajaAbierto(e, HOY);
  assert.equal(abierto.numero, 1);
  assert.equal(abierto.movimientos.length, 2);
  assert.deepEqual([...abierto.medios].sort(), ["efectivo", "mercadopago"]);
  assert.equal(abierto.esperado.efectivo, 10000 + PICADA, "fondo + efectivo");
  // Lo que la pantalla vio cuando se contó no coincide (entró otro cobro): se vuelve a contar.
  const cambio = M.contarTurnoCaja(e, { contado: { efectivo: 1 }, usuarioId: CARO.usuarioId, esperados: { movimientos: 1, medios: ["efectivo"] } }, ahora(14));
  assert.equal(cambio.ok, false);
  // Los billetes tienen que coincidir con el efectivo a mano, y una denominación que no existe no va.
  assert.equal(M.contarTurnoCaja(e, { contado: { efectivo: 5 }, billetes: { "10000": 1 }, usuarioId: CARO.usuarioId }, ahora(14)).ok, false);
  assert.equal(M.contarTurnoCaja(e, { contado: {}, billetes: { "3000": 1 }, usuarioId: CARO.usuarioId }, ahora(14)).ok, false);
  const contado = 10000 + PICADA - 500;
  const { turno } = ok(M.contarTurnoCaja(e, { contado: { mercadopago: PICADA }, billetes: billetesDe(contado), usuarioId: CARO.usuarioId, esperados: { movimientos: 2, medios: ["mercadopago", "efectivo"] } }, ahora(14)));
  assert.equal(turno.estado, "contado");
  assert.equal(turno.responsable, "Caro (recepción mañana)");
  assert.deepEqual(turno.desde, { fecha: HOY, min: 720 });
  assert.deepEqual(turno.hasta, { fecha: HOY, min: 14 * 60 });
  assert.equal(turno.contado.efectivo, contado);
  assert.equal(turno.diferencias.efectivo, -500);
  assert.equal(turno.diferencias.mercadopago, 0);
  assert.equal(turno.diferencia, -500);
  assert.ok(e.caja.movimientos.every((m) => m.turno === turno.id), "los movimientos quedan sellados en el turno");
  // Lo que se cobra después es del turno 2, que arranca con lo CONTADO (no se arrastra la diferencia).
  ok(M.ventaMostrador(e, [{ productoId: "k-pica", cant: 1 }], "efectivo", ahora(15)));
  const dos = M.turnoDeCajaAbierto(e, HOY);
  assert.equal(dos.numero, 2);
  assert.equal(dos.movimientos.length, 1);
  assert.equal(dos.inicioEfectivo, contado);
  assert.equal(dos.pendienteDeFirma?.id, turno.id);
  assert.match(String((M.contarTurnoCaja(e, { contado: { efectivo: 0 }, usuarioId: CARO.usuarioId }, ahora(15)) as { motivo?: string }).motivo), /Falta firmar el turno 1/);
});

test("B4-C1/C4: la firma pide PIN de 4 (recepción con 2 sólo opera), motivo si no cuadra, y firmar dos veces no duplica", () => {
  const e = club();
  ok(M.ventaMostrador(e, [{ productoId: "k-pica", cant: 1 }], "efectivo", ahora(13)));
  const { turno } = ok(M.contarTurnoCaja(e, { contado: { efectivo: PICADA - 500 }, usuarioId: CARO.usuarioId }, ahora(14)));
  const corto = M.cerrarTurnoCaja(e, { turnoId: turno.id, motivo: "faltó cambio", usuarioId: "u-caro", pin: "44" }, ahora(14, 1));
  assert.equal(corto.ok, false);
  assert.match((corto as { motivo: string }).motivo, /PIN de 4 dígitos/);
  assert.equal(M.cerrarTurnoCaja(e, { turnoId: turno.id, motivo: "", ...FIRMA_DUENO, pin: "9999" }, ahora(14, 1)).ok, false, "PIN malo");
  const sinMotivo = M.cerrarTurnoCaja(e, { turnoId: turno.id, motivo: "  ", ...FIRMA_DUENO }, ahora(14, 1));
  assert.equal(sinMotivo.ok, false);
  assert.match((sinMotivo as { motivo: string }).motivo, /motivo/);
  const r = ok(M.cerrarTurnoCaja(e, { turnoId: turno.id, motivo: "Se dio mal un vuelto", ...FIRMA_DUENO }, ahora(14, 2)));
  assert.equal(r.turno.estado, "cerrado");
  assert.equal(r.turno.responsable, "Caro (recepción mañana)");
  assert.equal(r.turno.firma, "Rober");
  assert.equal(r.turno.motivo, "Se dio mal un vuelto");
  // C8: el evento queda armado (el canal B1 todavía no existe), con clave de idempotencia.
  assert.equal(r.evento.tipo, "caja.turno.cerrada");
  assert.equal(r.evento.version, 1);
  assert.equal(`${r.evento.tipo}@${r.evento.version}`, M.EVENTO_TURNO_CERRADO);
  assert.equal(r.evento.clave, `caja.turno.cerrada@1:${turno.id}`);
  assert.equal(r.evento.datos.diferencia, -500);
  // Doble envío: la segunda firma no hace nada.
  const otra = M.cerrarTurnoCaja(e, { turnoId: turno.id, motivo: "x", ...FIRMA_DUENO }, ahora(14, 3));
  assert.equal(otra.ok, false);
  assert.equal((otra as { yaCerrado?: boolean }).yaCerrado, true);
  assert.equal(M.turnosDelDia(e, HOY).length, 1);
  // Configurable (D-16): con largo 2, recepción firma.
  const e2 = club();
  e2.config.caja = { largoPinFirma: 2 };
  ok(M.ventaMostrador(e2, [{ productoId: "k-pica", cant: 1 }], "efectivo", ahora(13)));
  const t2 = ok(M.contarTurnoCaja(e2, { contado: { efectivo: PICADA }, usuarioId: "u-caro" }, ahora(14))).turno;
  ok(M.cerrarTurnoCaja(e2, { turnoId: t2.id, usuarioId: "u-caro", pin: "44" }, ahora(14, 1)));
});

test("B4-C2: corregir el medio de un cobro del turno abierto deja rastro; en un turno contado, no", () => {
  const e = club();
  ok(M.ventaMostrador(e, [{ productoId: "k-pica", cant: 1 }], "efectivo", ahora(13)));
  const mov = e.caja.movimientos[0];
  assert.equal(M.corregirMedio(e, mov.id, { medio: "mercadopago", motivo: " ", usuarioId: "u-caro" }, ahora(13, 5)).ok, false, "sin motivo no");
  assert.equal(M.corregirMedio(e, mov.id, { medio: "debito", motivo: "x", usuarioId: "u-caro" }, ahora(13, 5)).ok, false, "débito no es corregible");
  assert.equal(M.corregirMedio(e, mov.id, { medio: "efectivo", motivo: "x", usuarioId: "u-caro" }, ahora(13, 5)).ok, false, "mismo medio");
  ok(M.corregirMedio(e, mov.id, { medio: "mercadopago", motivo: "Tocó el botón equivocado", usuarioId: "u-caro" }, ahora(13, 5)));
  assert.equal(mov.medio, "mercadopago");
  assert.deepEqual(mov.correcciones, [{ de: "efectivo", a: "mercadopago", motivo: "Tocó el botón equivocado", quien: "Caro (recepción mañana)", fecha: HOY, min: 13 * 60 + 5 }]);
  const t = M.turnoDeCajaAbierto(e, HOY);
  assert.equal(t.esperado.efectivo, 0);
  assert.equal(t.esperado.mercadopago, PICADA);
  assert.equal(M.resumenCaja(e, HOY).ingresos, PICADA, "la plata no cambia, sólo el medio");
  ok(M.contarTurnoCaja(e, { contado: { efectivo: 0, mercadopago: PICADA }, usuarioId: "u-caro" }, ahora(14)));
  const cerrado = M.corregirMedio(e, mov.id, { medio: "efectivo", motivo: "volver", usuarioId: "u-caro" }, ahora(14, 5));
  assert.equal(cerrado.ok, false);
  assert.equal((cerrado as { turnoCerrado?: boolean }).turnoCerrado, true);
});

test("B4-C2 (vuelta 4): corregir el medio de un cobro de cargos corrige también el pago de SU cuenta, no el de otra igual", () => {
  const e = club();
  const ana = ok(M.abrirCuenta(e, { titular: "Ana" }, ahora(13))).cuenta;
  const beto = ok(M.abrirCuenta(e, { titular: "Beto" }, ahora(13))).cuenta;
  const caro = ok(M.abrirCuenta(e, { titular: "Caro" }, ahora(13))).cuenta;
  for (const c of [ana, beto, caro]) ok(M.cargarEnCuenta(e, c.id, "k-pica", 1, ahora(13)));
  // Ana y Beto pagan lo mismo, en efectivo, en el mismo minuto: dos movimientos indistinguibles salvo por su cuenta.
  ok(M.pagarCuenta(e, ana.id, { medio: "efectivo" }, ahora(13, 10)));
  ok(M.pagarCuenta(e, beto.id, { medio: "efectivo" }, ahora(13, 10)));
  const [movAna, movBeto] = e.caja.movimientos;
  assert.equal(movAna.cuentaId, ana.id);
  assert.equal(movBeto.cuentaId, beto.id);
  ok(M.corregirMedio(e, movBeto.id, { medio: "mercadopago", motivo: "Pagó con QR", usuarioId: "u-caro" }, ahora(13, 15)));
  assert.equal(movBeto.medio, "mercadopago");
  assert.deepEqual(beto.pagos.map((p) => p.medio), ["mercadopago"], "el pago de Beto acompaña la corrección");
  assert.deepEqual(ana.pagos.map((p) => p.medio), ["efectivo"], "el de Ana (mismo monto y minuto) no se toca");
  // Cobro de una cuenta con las de otro a su cargo: cada movimiento lleva SU cuenta y se corrige ahí.
  const dani = ok(M.abrirCuenta(e, { titular: "Dani" }, ahora(13))).cuenta;
  ok(M.cargarEnCuenta(e, dani.id, "k-pica", 1, ahora(13)));
  ok(M.asignarCargoCargos(e, dani.id, caro.id, ahora(13, 20)));
  const antes = e.caja.movimientos.length;
  ok(M.cobrarCuentaYSusCargos(e, caro.id, { medio: "efectivo" }, ahora(13, 25)));
  const nuevos = e.caja.movimientos.slice(antes);
  assert.deepEqual(nuevos.map((m) => m.cuentaId).sort(), [caro.id, dani.id].sort());
  const deDani = nuevos.find((m) => m.cuentaId === dani.id)!;
  ok(M.corregirMedio(e, deDani.id, { medio: "transferencia", motivo: "Transfirió Caro", usuarioId: "u-caro" }, ahora(13, 30)));
  assert.deepEqual(dani.pagos.map((p) => p.medio), ["transferencia"]);
  assert.deepEqual(caro.pagos.map((p) => p.medio), ["efectivo"]);
  // Un cobro de cargos de antes (sin `cuentaId`) se corrige sólo en la caja, como hasta ahora, sin romper.
  delete (movAna as { cuentaId?: string }).cuentaId;
  ok(M.corregirMedio(e, movAna.id, { medio: "mercadopago", motivo: "Viejo", usuarioId: "u-caro" }, ahora(13, 35)));
  assert.deepEqual(ana.pagos.map((p) => p.medio), ["efectivo"]);
  assert.equal(M.resumenCaja(e, HOY).ingresos, 4 * PICADA, "la plata no cambia, sólo el medio");
});

test("B4-C3/C4: retiro a caja fuerte y egreso por categoría, con comprobante opcional y firma de 4", () => {
  const e = club();
  e.caja.fondo = 5000;
  ok(M.ventaMostrador(e, [{ productoId: "k-pica", cant: 3 }], "efectivo", ahora(13)));
  const hay = 5000 + 3 * PICADA;
  assert.equal(M.retiroCajaFuerte(e, { monto: 50000, usuarioId: "u-caro", pin: "44" }, ahora(14)).ok, false, "recepción con PIN de 2 no firma");
  assert.equal(M.retiroCajaFuerte(e, { monto: hay + 1, ...FIRMA_DUENO }, ahora(14)).ok, false, "más que el cajón, no");
  const { movimiento: ret } = ok(M.retiroCajaFuerte(e, { monto: 50000, comprobante: "sobre 14", ...FIRMA_DUENO }, ahora(14)));
  assert.equal(ret.categoria, "cajaFuerte");
  assert.equal(ret.comprobante, "sobre 14");
  assert.equal(ret.usuario, "Caro (recepción mañana)");
  assert.equal(ret.firma, "Rober");
  assert.equal(M.egresoPorCategoria(e, { monto: 1000, categoria: "otros", ...FIRMA_DUENO }, ahora(14, 5)).ok, false, "«otros» pide concepto");
  assert.equal(M.egresoPorCategoria(e, { monto: 1000, categoria: "viajes", concepto: "x", ...FIRMA_DUENO }, ahora(14, 5)).ok, false, "categoría que no existe");
  const { movimiento: luz } = ok(M.egresoPorCategoria(e, { monto: 8000, categoria: "luz", comprobante: "Edenor 123", ...FIRMA_DUENO }, ahora(14, 5)));
  assert.equal(luz.categoria, "luz");
  assert.equal(luz.concepto, "Luz");
  ok(M.egresoPorCategoria(e, { monto: 2000, categoria: "insumos", concepto: "hielo", ...FIRMA_DUENO }, ahora(14, 6)));
  assert.equal(M.turnoDeCajaAbierto(e, HOY).esperado.efectivo, hay - 50000 - 8000 - 2000);
  const d = M.desglosePorDia(e)[HOY];
  assert.deepEqual(d.egresosPorCategoria, { cajaFuerte: 50000, luz: 8000, insumos: 2000 });
});

test("B4-C1/C6: el cierre del día consolida los turnos y el archivo guarda turnos, medio × rubro y egresos por categoría", () => {
  const e = club();
  e.caja.fondo = 10000;
  // Mañana: Caro, falta $500.
  ok(M.ventaMostrador(e, [{ productoId: "k-pica", cant: 1 }], "efectivo", ahora(13)));
  ok(M.ventaMostrador(e, [{ productoId: "k-pica", cant: 1 }], "transferencia", ahora(13, 10)));
  const t1 = ok(M.contarTurnoCaja(e, { contado: { efectivo: 10000 + PICADA - 500, transferencia: PICADA }, usuarioId: "u-caro" }, ahora(17))).turno;
  ok(M.cerrarTurnoCaja(e, { turnoId: t1.id, motivo: "vuelto", ...FIRMA_DUENO }, ahora(17, 1)));
  // Noche: Lu, sobran $200; un egreso de luz.
  ok(M.ventaMostrador(e, [{ productoId: "k-pica", cant: 2 }], "efectivo", ahora(21)));
  ok(M.egresoPorCategoria(e, { monto: 3000, categoria: "luz", usuarioId: "u-lu", firmaId: "u-majo", pin: "2222" }, ahora(22)));
  // El cierre del día de siempre ya no va en un día por turnos; y con el turno abierto, el del día tampoco.
  assert.equal(M.cerrarCaja(e, { contado: 0, usuarioId: "u-rober", pin: "1111" }, ahora(23)).ok, false);
  assert.match(String((M.cerrarDiaCaja(e, { usuarioId: "u-rober", pin: "1111" }, ahora(23)) as { motivo?: string }).motivo), /sin turno/);
  const esperado2 = 10000 + PICADA - 500 + 2 * PICADA - 3000;
  const t2 = ok(M.contarTurnoCaja(e, { contado: { efectivo: esperado2 + 200 }, usuarioId: "u-lu" }, ahora(23, 30))).turno;
  assert.equal(t2.diferencia, 200);
  assert.equal(M.cerrarDiaCaja(e, { usuarioId: "u-rober", pin: "1111" }, ahora(23, 40)).ok, false, "falta firmar el turno 2");
  ok(M.cerrarTurnoCaja(e, { turnoId: t2.id, motivo: "propina", ...FIRMA_DUENO }, ahora(23, 45)));
  const { cierre } = ok(M.cerrarDiaCaja(e, { usuarioId: "u-rober", pin: "1111" }, ahora(23, 50)));
  assert.equal(cierre.diferencia, -500 + 200, "la del día es la suma de las de los turnos");
  assert.equal(cierre.contado, esperado2 + 200);
  assert.equal(cierre.esperado, M.resumenCaja(e, HOY).efectivoEsperado);
  assert.deepEqual(cierre.turnos?.map((t) => [t.numero, t.diferencia]), [[1, -500], [2, 200]]);
  assert.equal(cierre.contadoPorMedio?.transferencia, PICADA);
  assert.equal(M.cajaCerrada(e, HOY), true);
  // La foto ida y vuelta conserva los turnos.
  const h = M.hidratarEstado(JSON.parse(JSON.stringify(M.serializarEstado(e))));
  assert.ok(h.ok);
  assert.equal(h.ok && h.estado.caja.turnos?.length, 2);
  // Archivo del día: turnos de caja, medio × rubro y egresos por categoría.
  const res = M.archivarDiasCerrados(e, HOY);
  assert.ok(res.ok && !res.vacio);
  const fila = res.estado.archivo!.dias.find((f) => f.dia === HOY)!;
  assert.deepEqual(fila.turnosCaja?.map((t) => [t.numero, t.responsable, t.firma, t.diferencia, t.motivo]), [
    [1, "Caro (recepción mañana)", "Rober", -500, "vuelto"],
    [2, "Lu (recepción tarde)", "Rober", 200, "propina"],
  ]);
  assert.equal(fila.porMedioRubro?.transferencia && Object.values(fila.porMedioRubro.transferencia).reduce((s, x) => s + (x ?? 0), 0), PICADA);
  assert.deepEqual(fila.egresosPorCategoria, { luz: 3000 });
  assert.equal(res.anexo.turnosCaja?.length, 2);
  assert.equal(res.estado.caja.turnos, undefined, "los turnos archivados salen del estado");
  // El archivo normalizado (al hidratar) conserva el resumen de los turnos.
  const h2 = M.hidratarEstado(JSON.parse(JSON.stringify(M.serializarEstado(res.estado))));
  assert.ok(h2.ok);
  assert.equal(h2.ok && h2.estado.archivo!.dias.find((f) => f.dia === HOY)!.turnosCaja?.length, 2);
});
