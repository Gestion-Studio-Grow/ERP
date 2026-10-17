// Tests del motor del club de Break Point (public/previews/breakpoint/club/motor.mjs).
// Cubren la matriz de eventualidades de docs/tenants/breakpoint/REINGENIERIA.md y los pedidos del club del
// 14/10 (cancha y buffet separados, cuenta corriente con autorización, faltas, PIN, proveedores, caja 12 a 12).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as motor from "../../../public/previews/breakpoint/club/motor.mjs";

// El motor es JS plano (el navegador lo carga tal cual, sin build): los tipos que TypeScript infiere del JS
// son demasiado estrechos para un test que arma escenarios a mano, así que acá se usa sin tipar.
/* eslint-disable @typescript-eslint/no-explicit-any -- ver la nota de arriba: todo este archivo opera sobre el motor sin tipos */
const M: any = motor;

const HOY = "2026-10-14"; // miércoles
const ahora = (hh: number, mm = 0) => ({ fecha: HOY, min: hh * 60 + mm });
const DUENO = { usuarioId: "u-rober", pin: "11" };
const RECEP = { usuarioId: "u-lu", pin: "33" };

function club() {
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
const turno = (e: ReturnType<typeof club>, cancha: string, hh: number, datos: object, mm = 0) =>
  M.crearReserva(e, { canchaId: cancha, fecha: HOY, inicio: hh * 60 + mm, ...datos }, ahora(8)).reserva;

// ── Agenda ──

test("precio: valle y pico minuto a minuto, finde todo pico; sin descuentos de socio", () => {
  const e = club();
  assert.equal(M.precioTurno(e, { fecha: HOY, inicio: 16 * 60, duracion: 90, canchaId: "c1" }), 34000);
  assert.equal(M.precioTurno(e, { fecha: "2026-10-17", inicio: 10 * 60, duracion: 90, canchaId: "c1" }), 42000);
});

test("no hay doble reserva y el horario es el de ESE día de la semana", () => {
  const e = club();
  assert.ok(turno(e, "c1", 20, { clienteId: "a" }));
  const choque = M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 21 * 60, clienteId: "b" }, ahora(10));
  assert.match(choque.motivo, /Ana/);
  // Domingo cierra a las 23: un turno de 22:00 a 23:30 no entra; el miércoles sí.
  assert.match(M.crearReserva(e, { canchaId: "c1", fecha: "2026-10-18", inicio: 22 * 60, titular: "X" }, ahora(8)).motivo, /23:00/);
  assert.ok(M.crearReserva(e, { canchaId: "c2", fecha: HOY, inicio: 23 * 60 + 30, titular: "X" }, ahora(8)).ok);
});

test("horario por día: lo cambia un dueño, valida el rango y avisa qué turnos quedan afuera", () => {
  const e = club();
  turno(e, "c1", 8, { clienteId: "a" });
  assert.equal(M.ajustarHorario(e, 3, { abre: 600, cierra: 1500 }, { usuarioId: "u-lu" }, ahora(7)).ok, false);
  assert.match(M.ajustarHorario(e, 3, { abre: 1500, cierra: 600 }, DUENO, ahora(7)).motivo, /después/);
  const res = M.ajustarHorario(e, 3, { abre: 600, cierra: 1500 }, DUENO, ahora(7));
  assert.ok(res.ok);
  assert.equal(res.afuera.length, 1);
  assert.deepEqual(M.horarioDe(e, HOY), { abre: 600, cierra: 1500 });
  assert.match(M.crearReserva(e, { canchaId: "c2", fecha: HOY, inicio: 9 * 60, titular: "X" }, ahora(7)).motivo, /10:00/);
});

test("seña: obligatoria para reincidentes y sin ficha; sin seña no se abre la cancha", () => {
  const e = club();
  const r = turno(e, "c1", 20, { clienteId: "c" });
  assert.equal(r.sena.monto, 21000);
  assert.match(M.checkIn(e, r.id, ahora(20)).motivo, /seña/);
  M.registrarPago(e, r.id, { medio: "transferencia", monto: 21000 }, ahora(11));
  assert.ok(M.checkIn(e, r.id, ahora(20)).ok);
  assert.ok(turno(e, "c2", 20, { titular: "Walk-in" }).sena.monto > 0);
  assert.equal(turno(e, "c3", 20, { clienteId: "a" }).sena.monto, 0);
});

test("abrir cancha: sin límite de anticipación por defecto (configurable), nunca con la cancha ocupada", () => {
  const e = club();
  const a = turno(e, "c1", 20, { clienteId: "a" });
  const b = turno(e, "c1", 21, { clienteId: "d" }, 30);
  assert.ok(M.checkIn(e, a.id, ahora(15)).ok, "sin límite: se abre horas antes");
  assert.match(M.checkIn(e, b.id, ahora(21, 10)).motivo, /sigue ocupada/);
  assert.ok(M.ajustarPolitica(e, "minutosAntesParaEntrar", 30).ok);
  const c = turno(e, "c2", 22, { clienteId: "a" });
  assert.match(M.checkIn(e, c.id, ahora(19)).motivo, /temprano/);
  assert.ok(M.ajustarPolitica(e, "minutosAntesParaEntrar", "").ok);
  assert.equal(e.config.politica.minutosAntesParaEntrar, null);
});

// ── Cancha y buffet: dos cuentas separadas ──

test("cancha y consumos son cuentas separadas: se cierra la cancha y el buffet sigue abierto", () => {
  const e = club();
  const r = turno(e, "c1", 20, { clienteId: "a", jugadores: [{ nombre: "Ana", clienteId: "a" }, "Pepe"] });
  M.checkIn(e, r.id, ahora(20));
  assert.ok(M.consumoJugador(e, r.id, 0, "p2", 2, { modo: "cuenta" }, ahora(20, 30)).ok);
  assert.ok(M.consumoJugador(e, r.id, 1, "p9", 1, { modo: "cuenta" }, ahora(20, 40)).ok);
  assert.equal(M.saldo(r), r.precio, "los consumos no tocan la cuenta de la cancha");
  M.registrarPago(e, r.id, { medio: "efectivo", monto: r.precio }, ahora(21, 30));
  const cierre = M.finalizar(e, r.id, {}, ahora(21, 30));
  assert.ok(cierre.ok);
  assert.equal(cierre.cuentasAbiertas.length, 2);
  const deAna = M.cuentasAbiertas(e).find((c: any) => c.clienteId === "a");
  assert.equal(M.saldoCuenta(deAna), 4000);
});

test("producto a un jugador con las dos opciones: sumar a su cuenta o cobrar en el acto", () => {
  const e = club();
  const r = turno(e, "c1", 20, { clienteId: "a", jugadores: [{ nombre: "Ana", clienteId: "a" }, "Pepe"] });
  M.consumoJugador(e, r.id, 0, "p2", 1, { modo: "cuenta" }, ahora(20));
  const cobrado = M.consumoJugador(e, r.id, 1, "p3", 1, { modo: "cobrar", medio: "mercadopago" }, ahora(20));
  assert.ok(cobrado.ok);
  assert.equal(cobrado.cuenta.estado, "cerrada", "cobrado en el acto no deja una cuenta en cero abierta");
  assert.equal(M.resumenCaja(e, HOY).porMedio.mercadopago, 3500);
  assert.equal(M.consumoJugador(e, r.id, 1, "p3", 1, { modo: "cobrar" }, ahora(20)).ok, false);
});

test("buffet a nivel cliente: una sola cuenta abierta por cliente, aunque consuma en dos turnos", () => {
  const e = club();
  const { cuenta: c1 } = M.abrirCuenta(e, { clienteId: "a" }, ahora(18));
  M.cargarEnCuenta(e, c1.id, "k-mila", 1, ahora(18));
  const r = turno(e, "c1", 20, { clienteId: "a" });
  const res = M.consumoJugador(e, r.id, 0, "p2", 1, { modo: "cuenta" }, ahora(20));
  assert.equal(res.cuenta.id, c1.id);
  assert.equal(M.saldoCuenta(c1), 16500);
  assert.match(M.cerrarCuenta(e, c1.id, {}, ahora(22)).motivo, /cobrala o sumala/);
  M.pagarCuenta(e, c1.id, { medio: "efectivo", monto: 16500 }, ahora(22));
  assert.ok(M.cerrarCuenta(e, c1.id, {}, ahora(22)).ok);
});

test("platos sin stock; productos con stock y lector: código de barras o etiqueta RF", () => {
  const e = club();
  const { cuenta: c } = M.abrirCuenta(e, { titular: "Mesa 3" }, ahora(13));
  for (let i = 0; i < 50; i++) assert.ok(M.cargarEnCuenta(e, c.id, "k-hamb", 1, ahora(13)).ok);
  assert.equal(M.producto(e, "k-hamb").stock, null);
  assert.equal(M.productoPorCodigo(e, "7790000000028").producto.nombre, "Agua 500 ml");
  assert.equal(M.productoPorCodigo(e, "000").ok, false);
  assert.deepEqual(M.buscarProductos(e, "isot").map((p: any) => p.id), ["p3"]);
  assert.deepEqual(M.buscarProductos(e, "7790000000011").map((p: any) => p.id), ["p1"]);
});

test("alquiler de palas: va a la cuenta del jugador y vuelve al stock cuando se cierra la cancha", () => {
  const e = club();
  const r = turno(e, "c1", 20, { clienteId: "a" });
  M.checkIn(e, r.id, ahora(20));
  M.consumoJugador(e, r.id, 0, "p6", 2, { modo: "cuenta" }, ahora(20));
  assert.equal(M.producto(e, "p6").stock, 6);
  M.registrarPago(e, r.id, { medio: "efectivo", monto: r.precio }, ahora(21));
  M.finalizar(e, r.id, {}, ahora(21, 30));
  assert.equal(M.producto(e, "p6").stock, 8);
  assert.equal(M.cuentasAbiertas(e)[0].items[0].devuelto, true, "la cuenta sigue abierta para cobrar el alquiler");
});

// ── Cuenta corriente y créditos ──

test("cerrar cancha: cobrar o sumar a la cuenta corriente (habilitada y dentro del límite)", () => {
  const e = club();
  const sinCC = turno(e, "c1", 20, { clienteId: "a" });
  M.checkIn(e, sinCC.id, ahora(20));
  assert.match(M.finalizar(e, sinCC.id, { aCuenta: true }, ahora(21, 30)).motivo, /no tiene cuenta corriente/);
  const conCC = turno(e, "c2", 20, { clienteId: "d" });
  M.checkIn(e, conCC.id, ahora(20));
  assert.ok(M.finalizar(e, conCC.id, { aCuenta: true }, ahora(21, 30)).ok);
  assert.equal(M.cliente(e, "d").deuda, conCC.precio);
  const otra = turno(e, "c3", 20, { clienteId: "d" });
  M.checkIn(e, otra.id, ahora(20));
  assert.match(M.finalizar(e, otra.id, { aCuenta: true }, ahora(21, 30)).motivo, /límite/);
});

test("cuenta corriente: recepción pide, el dueño autoriza (novedad); estado de cuenta con saldo corrido", () => {
  const e = club();
  assert.equal(M.resolverCC(e, "x", { aprobar: true }, RECEP, ahora(10)).ok, false);
  const { novedad } = M.solicitarCC(e, "a", { limite: 30000 }, RECEP, ahora(10));
  assert.ok(M.alertas(e, ahora(10)).some((x: any) => x.tipo === "autorizacion" && x.paraDuenio));
  assert.equal(M.resolverCC(e, novedad.id, { aprobar: true }, RECEP, ahora(10)).ok, false, "recepción no autoriza");
  assert.ok(M.resolverCC(e, novedad.id, { aprobar: true, limite: 40000 }, DUENO, ahora(11)).ok);
  assert.deepEqual(M.cliente(e, "a").cc, { habilitada: true, limite: 40000 });
  const { cuenta: c } = M.abrirCuenta(e, { clienteId: "a" }, ahora(12));
  M.cargarEnCuenta(e, c.id, "k-mila", 1, ahora(12));
  assert.ok(M.cerrarCuenta(e, c.id, { aCuenta: true }, ahora(13)).ok);
  assert.ok(M.cobrarDeuda(e, "a", { medio: "transferencia", monto: 4500 }, ahora(14)).ok);
  const ec = M.estadoDeCuenta(e, "a");
  assert.deepEqual(ec.movimientos.map((m: any) => m.saldo), [14500, 10000]);
  assert.equal(M.cobrarDeuda(e, "a", { medio: "monedero" }, ahora(14)).ok, false);
});

test("créditos del cliente: se usan como medio y no entran a la caja", () => {
  const e = club();
  const r = turno(e, "c1", 20, { clienteId: "b" });
  assert.ok(M.registrarPago(e, r.id, { medio: "monedero", monto: 10000 }, ahora(20)).ok);
  assert.equal(M.cliente(e, "b").monedero, 0);
  assert.equal(M.resumenCaja(e, HOY).ingresos, 0);
});

test("ABM de clientes: alta sin duplicar teléfono, edición y baja sólo sin deuda ni consumos abiertos", () => {
  const e = club();
  assert.match(M.altaCliente(e, { nombre: "Otra Ana", tel: "54 9 11 0000-0001" }).motivo, /teléfono/);
  const { cliente: n } = M.altaCliente(e, { nombre: "Nuevo", tel: "5491100000099", nivel: "5ta" });
  assert.ok(M.editarCliente(e, n.id, { nivel: "4ta" }).ok);
  M.cliente(e, "d").deuda = 5000;
  assert.match(M.bajaCliente(e, "d").motivo, /debe/);
  assert.ok(M.bajaCliente(e, n.id).ok);
  assert.equal(M.buscarClientes(e, "Nuevo").length, 0);
});

// ── Faltas ──

test("falta: se cobra el turno entero al titular (descontando la seña), aunque no tenga cuenta habilitada", () => {
  const e = club();
  const r = turno(e, "c1", 20, { clienteId: "c" });
  M.registrarPago(e, r.id, { medio: "transferencia", monto: r.sena.monto }, ahora(10));
  assert.match(M.marcarNoShow(e, r.id, {}, ahora(20, 5)).motivo, /tolerancia/);
  const res = M.marcarNoShow(e, r.id, { cobrarA: "titular" }, ahora(20, 20));
  assert.ok(res.ok);
  assert.equal(M.cliente(e, "c").deuda, r.precio - r.sena.monto);
  assert.equal(M.cliente(e, "c").strikes, 3);
});

test("falta repartida en el grupo: cada jugador con ficha paga su parte; la de los sin ficha va al titular", () => {
  const e = club();
  const r = turno(e, "c1", 20, { clienteId: "a", jugadores: [{ nombre: "Ana", clienteId: "a" }, { nombre: "Beto", clienteId: "b" }, { nombre: "Dani", clienteId: "d" }, "Sin ficha"] });
  const res = M.marcarNoShow(e, r.id, { cobrarA: "grupo" }, ahora(20, 20));
  assert.equal(M.cliente(e, "b").deuda, 10500);
  assert.equal(M.cliente(e, "d").deuda, 10500);
  assert.equal(M.cliente(e, "a").deuda, 21000);
  assert.equal(res.cargos.reduce((s: number, c: any) => s + c.monto, 0), r.precio);
});

test("falta sin ficha: queda la deuda en el turno y se cobra después", () => {
  const e = club();
  const r = turno(e, "c1", 20, { titular: "Grupo X" });
  M.registrarPago(e, r.id, { medio: "efectivo", monto: r.sena.monto }, ahora(10));
  M.marcarNoShow(e, r.id, {}, ahora(20, 20));
  assert.equal(r.deudaSinFicha, r.precio - r.sena.monto);
  assert.ok(M.alertas(e, ahora(20, 21)).some((x: any) => x.tipo === "falta_sin_ficha"));
  assert.ok(M.cobrarFaltaSinFicha(e, r.id, "efectivo", ahora(21)).ok);
});

// ── Usuarios y PIN ──

test("acceso dinámico: se pide, el dueño otorga con PIN de 2 dígitos único, y se revoca", () => {
  const e = club();
  const { solicitud } = M.solicitarAcceso(e, "Juli", ahora(9));
  assert.equal(M.otorgarAcceso(e, solicitud.id, { rol: "recepcion" }, RECEP, ahora(9)).ok, false);
  assert.match(M.otorgarAcceso(e, solicitud.id, { rol: "recepcion" }, { usuarioId: "u-rober", pin: "99" }, ahora(9)).motivo, /PIN/);
  const res = M.otorgarAcceso(e, solicitud.id, { rol: "recepcion" }, DUENO, ahora(9));
  assert.ok(res.ok);
  assert.match(res.pin, /^\d{2}$/);
  assert.ok(!["11", "22", "33", "44"].includes(res.pin));
  assert.equal(M.usuarioPorPin(e, res.pin).usuario.nombre, "Juli");
  assert.ok(M.revocarAcceso(e, res.usuario.id, DUENO, ahora(10)).ok);
  assert.equal(M.usuarioPorPin(e, res.pin).ok, false);
  assert.match(M.revocarAcceso(e, "u-rober", DUENO, ahora(10)).motivo, /vos mismo/);
});

test("egresos de caja y cierre piden PIN; el egreso además pide concepto", () => {
  const e = club();
  assert.match(M.egresoCaja(e, { monto: 1000, concepto: "Hielo", usuarioId: "u-lu", pin: "00" }, ahora(13)).motivo, /PIN/);
  assert.match(M.egresoCaja(e, { monto: 1000, concepto: " ", ...RECEP }, ahora(13)).motivo, /concepto/);
  assert.ok(M.egresoCaja(e, { monto: 1000, concepto: "Hielo", ...RECEP }, ahora(13)).ok);
  assert.match(M.cerrarCaja(e, { contado: 0, usuarioId: "u-lu", pin: "12" }, ahora(23)).motivo, /PIN/);
  const { cierre } = M.cerrarCaja(e, { contado: 0, ...RECEP }, ahora(23));
  assert.equal(cierre.esperado, -1000);
  assert.equal(cierre.responsable, "Lu (recepción tarde)");
});

test("caja diaria de 12 a 12: lo de la madrugada es del día anterior; lo de las 12 en adelante, del nuevo", () => {
  const e = club();
  assert.equal(M.diaDeCaja(e, HOY, 11 * 60 + 59), "2026-10-13");
  assert.equal(M.diaDeCaja(e, HOY, 12 * 60), HOY);
  assert.equal(M.diaDeCaja(e, HOY, 24 * 60 + 30), HOY, "un turno de las 00:30 cuenta en la caja del día que abrió");
  const { cuenta: c } = M.abrirCuenta(e, { titular: "X" }, { fecha: HOY, min: 600 });
  M.cargarEnCuenta(e, c.id, "p2", 1, { fecha: HOY, min: 600 });
  M.pagarCuenta(e, c.id, { medio: "efectivo", monto: 2000 }, { fecha: HOY, min: 600 });
  assert.equal(M.resumenCaja(e, "2026-10-13").ingresos, 2000);
  assert.equal(M.resumenCaja(e, HOY).ingresos, 0);
});

// ── Proveedores ──

test("remito: recepción lo carga (suma stock y deuda); pagar y ver la cuenta es sólo de los dueños, con PIN", () => {
  const e = club();
  const rem = M.registrarRemito(e, { proveedorId: "pv1", numero: "0001-1", items: [{ productoId: "p2", cant: 24, costo: 800 }] }, { usuarioId: "u-lu" }, ahora(10));
  assert.ok(rem.ok);
  assert.equal(M.producto(e, "p2").stock, 66);
  assert.equal(M.producto(e, "p2").costo, 800);
  assert.match(M.registrarRemito(e, { proveedorId: "pv1", numero: "0001-1", items: [{ productoId: "p2", cant: 1 }] }, { usuarioId: "u-lu" }, ahora(10)).motivo, /ya está cargado/);
  assert.equal(M.ccProveedor(e, "pv1", { usuarioId: "u-lu" }).ok, false);
  assert.equal(M.pagarProveedor(e, { proveedorId: "pv1", medio: "efectivo", monto: 1000 }, RECEP, ahora(11)).ok, false);
  assert.match(M.pagarProveedor(e, { proveedorId: "pv1", medio: "debito", monto: 1000 }, DUENO, ahora(11)).motivo, /efectivo o por transferencia/);
  assert.match(M.pagarProveedor(e, { proveedorId: "pv1", medio: "efectivo", monto: 99999 }, DUENO, ahora(11)).motivo, /de más/);
  assert.ok(M.pagarProveedor(e, { proveedorId: "pv1", medio: "efectivo", monto: 10000 }, { usuarioId: "u-majo", pin: "22" }, ahora(13)).ok);
  assert.ok(M.pagarProveedor(e, { proveedorId: "pv1", medio: "transferencia", monto: 9200 }, DUENO, ahora(13)).ok);
  const cc = M.ccProveedor(e, "pv1", DUENO);
  assert.equal(cc.saldo, 0);
  assert.equal(M.resumenCaja(e, HOY).porMedio.efectivo, -10000, "el pago en efectivo sale del cajón");
});

// ── Métricas, contenido, eventualidades ──

test("métricas por plato: unidades, facturado, margen y participación", () => {
  const e = club();
  const { cuenta: c } = M.abrirCuenta(e, { titular: "Mesa 1" }, ahora(13));
  M.cargarEnCuenta(e, c.id, "k-mila", 3, ahora(13));
  M.cargarEnCuenta(e, c.id, "k-tost", 2, ahora(14));
  M.cargarEnCuenta(e, c.id, "p2", 2, ahora(14));
  const m = M.metricasPlatos(e, { desde: HOY, hasta: HOY });
  assert.deepEqual(m.filas.map((f: any) => [f.plato, f.unidades]), [["Milanesa napolitana con papas", 3], ["Tostado jamón y queso", 2]]);
  assert.equal(m.filas[0].margen, 3 * (14500 - 6200));
  assert.equal(m.total, 3 * 14500 + 2 * 6500);
});

test("plataforma de contenido: alta, edición y vista del mes; sólo dueños", () => {
  const e = club();
  assert.equal(M.agregarContenido(e, { fecha: HOY, titulo: "X" }, { usuarioId: "u-lu" }).ok, false);
  const { contenido } = M.agregarContenido(e, { fecha: HOY, hora: "20:00", canal: "reel", titulo: "Clase de bandeja" }, DUENO);
  assert.ok(M.editarContenido(e, contenido.id, { estado: "programado" }, DUENO).ok);
  assert.equal(M.contenidoDelMes(e, 2026, 10)[0].estado, "programado");
  assert.ok(M.borrarContenido(e, contenido.id, DUENO).ok);
});

test("mantenimiento con motivo y plan lluvia: mueve a techada o suspende con crédito", () => {
  const e = club();
  assert.match(M.configurarMantenimiento(e, "c3", { activo: true }).motivo, /motivo/);
  assert.ok(M.configurarMantenimiento(e, "c3", { activo: true, motivo: "Cambio de césped" }).ok);
  assert.match(M.crearReserva(e, { canchaId: "c3", fecha: HOY, inicio: 20 * 60, titular: "X" }, ahora(10)).motivo, /césped/);
  const r1 = turno(e, "c4", 20, { clienteId: "a" });
  const r2 = turno(e, "c4", 21, { clienteId: "b" }, 30);
  M.registrarPago(e, r2.id, { medio: "efectivo", monto: 5000 }, ahora(11));
  for (const c of ["c1", "c2"]) turno(e, c, 21, { titular: `Ocupa ${c}` }, 30);
  const { resultado } = M.planLluvia(e, HOY, 19 * 60 + 30, 24 * 60, ahora(19));
  assert.equal(resultado.find((x: any) => x.reservaId === r1.id).accion, "movido");
  assert.equal(r2.estado, "suspendida");
  assert.equal(M.cliente(e, "b").monedero, 15000);
});

test("corte de luz: crédito proporcional, una sola vez, nunca con cero minutos jugados", () => {
  const e = club();
  const r = turno(e, "c1", 20, { clienteId: "a" });
  M.registrarPago(e, r.id, { medio: "efectivo", monto: r.precio }, ahora(20));
  M.checkIn(e, r.id, ahora(19, 50));
  assert.match(M.interrumpir(e, r.id, "corte de luz", ahora(19, 55)).motivo, /no empezaron/);
  const res = M.interrumpir(e, r.id, "corte de luz", ahora(21));
  assert.equal(res.credito, 14000);
  assert.equal(M.cliente(e, "a").monedero, 14000);
  assert.equal(M.interrumpir(e, r.id, "x", ahora(21, 5)).ok, false);
});

test("cancelación tardía: seña en suspenso que se libera si el hueco se vuelve a vender", () => {
  const e = club();
  const r = turno(e, "c1", 22, { clienteId: "c" });
  M.registrarPago(e, r.id, { medio: "transferencia", monto: r.sena.monto }, ahora(8));
  assert.equal(M.cancelar(e, r.id, {}, ahora(20)).enSuspenso, true);
  const relleno = M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 22 * 60, clienteId: "a" }, ahora(20, 30));
  assert.equal(relleno.liberadas.length, 1);
  assert.equal(M.cliente(e, "c").monedero, r.sena.monto);
});

test("demo: cada eventualidad a la vista, nada se pisa, nada viejo queda abierto", () => {
  const e = M.generarDemo(HOY);
  const tipos = new Set(M.alertas(e, ahora(19, 10)).map((a: any) => a.tipo));
  for (const t of ["cerrar", "no_show", "sena", "lluvia", "luz", "espera", "stock", "autorizacion", "acceso"]) assert.ok(tipos.has(t), `falta la alerta ${t}`);
  const activos = e.reservas.filter((r: any) => ["reservada", "en_cancha", "finalizada"].includes(r.estado));
  for (const a of activos)
    for (const b of activos)
      if (a !== b && a.fecha === b.fecha && a.canchaId === b.canchaId)
        assert.ok(a.inicio + a.duracion <= b.inicio || b.inicio + b.duracion <= a.inicio, `${a.titular} pisa a ${b.titular}`);
  assert.equal(e.reservas.filter((r: any) => r.fecha < HOY && ["reservada", "en_cancha"].includes(r.estado)).length, 0);
  assert.ok(M.metricasPlatos(e, {}).filas.length >= 5);
  assert.ok(M.cuentasAbiertas(e).some((c: any) => !c.reservaId), "hay un consumo abierto a nivel cliente");
  assert.equal(M.generarDemo(HOY).reservas.length, e.reservas.length, "misma semilla, misma demo");
});

test("WhatsApp: el link lleva el número limpio y el texto codificado", () => {
  const url = M.linkWhatsApp("+54 9 11 0000-0001", M.mensajeWhatsApp("falta", { nombre: "Ana", hora: "20:00", monto: "$ 21.000" }));
  assert.match(url, /^https:\/\/wa\.me\/5491100000001\?text=/);
  assert.match(decodeURIComponent(url), /se cobra entera/);
});

test("el sitio de breakpointpadel.gsgapp.com.ar está empaquetado con la última versión (portada, turnero y club)", async () => {
  const { armarSitio, CARPETA_SITIO } = await import("./empaquetar.mjs");
  const { readFileSync } = await import("node:fs");
  const path = await import("node:path");
  const raiz = path.resolve(import.meta.dirname, "../../..");
  for (const [nombre, esperado] of Object.entries(armarSitio(raiz))) {
    const servido = readFileSync(path.join(raiz, CARPETA_SITIO, nombre), "utf8");
    assert.equal(servido, esperado, `falta correr: node src/tenants/breakpoint/empaquetar.mjs (${nombre})`);
    assert.match(servido, /^<!doctype html>/i);
    assert.doesNotMatch(servido, /src="\.\/app\.mjs"|href="\.\/turnero\.css"|import\("\.\/conectado\.mjs"\)/, `${nombre}: todo inline`);
    assert.doesNotMatch(servido, /https?:\/\/(localhost|127\.0\.0\.1)/, `${nombre}: no apunta a localhost`);
  }
});

// ───── extensiones para el turnero web (docs/tenants/breakpoint/TURNERO-PLAN.md) ─────

test("turnero: seña online — al nuevo se le pide; al de confianza (3 jugados, sin faltas) no; las reglas del mostrador mandan", () => {
  const e = club();
  assert.equal(M.requiereSenaWeb(e, null), true);
  assert.equal(M.requiereSenaWeb(e, "a"), true); // todavía no jugó
  for (let i = 0; i < 3; i++) e.reservas.push({ id: `h${i}`, clienteId: "a", estado: "finalizada", fecha: "2026-10-01", canchaId: "c1", inicio: 600, duracion: 90, pagos: [], jugadores: [], sena: { monto: 0, pagada: false }, precio: 0 });
  assert.equal(M.requiereSenaWeb(e, "a"), false);
  M.cliente(e, "a").strikes = 2; // reincidente: el mostrador pide seña → online también
  assert.equal(M.requiereSenaWeb(e, "a"), true);
  e.config.politica.senaWeb = "siempre";
  M.cliente(e, "a").strikes = 0;
  assert.equal(M.requiereSenaWeb(e, "a"), true);
});

test("turnero: crearReserva con conSena y plazo deja el vencimiento; vencerSenas manual marca, auto libera", () => {
  const e = club();
  const r = M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 20 * 60, clienteId: "a", origen: "web", conSena: true, plazoSenaMin: 60 }, ahora(15)).reserva;
  assert.ok(r.sena.monto > 0);
  assert.deepEqual(r.venceSena, { fecha: HOY, min: 16 * 60 });
  assert.equal(M.alertas(e, ahora(15, 30)).some((a: any) => a.tipo === "sena" && a.reservaId === r.id), false, "en plazo no es urgente");
  assert.equal(M.vencerSenas(e, ahora(15, 59)).length, 0);
  const [v] = M.vencerSenas(e, ahora(16));
  assert.equal(v.liberada, false);
  assert.equal(r.estado, "reservada");
  assert.equal(M.vencerSenas(e, ahora(16, 5)).length, 0, "se informa una sola vez");
  e.config.politica.liberarSinSena = "auto";
  const r2 = M.crearReserva(e, { canchaId: "c2", fecha: HOY, inicio: 20 * 60, clienteId: "b", origen: "web", conSena: true, plazoSenaMin: 30 }, ahora(15)).reserva;
  const out = M.vencerSenas(e, ahora(15, 31));
  assert.equal(out.find((x: any) => x.reserva === r2).liberada, true);
  assert.equal(r2.estado, "cancelada");
  assert.equal(M.validarHueco(e, { canchaId: "c2", fecha: HOY, inicio: 20 * 60, duracion: 90 }).ok, true);
});

test("turnero: el plazo de la seña nunca pasa el inicio del turno, y conSena:false no pide seña", () => {
  const e = club();
  const r = M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 15 * 60 + 30, clienteId: null, titular: "X", origen: "web", conSena: true, plazoSenaMin: 60 }, ahora(15)).reserva;
  assert.deepEqual(r.venceSena, { fecha: HOY, min: 15 * 60 + 30 });
  const r2 = M.crearReserva(e, { canchaId: "c2", fecha: HOY, inicio: 20 * 60, clienteId: null, titular: "Y", conSena: false }, ahora(15)).reserva;
  assert.equal(r2.sena.monto, 0);
});

test("turnero: prefijoIds separa los ids de cada puesto (el back y el backoffice conectado no chocan)", () => {
  const e = club();
  M.prefijoIds("bx1-");
  const a = M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 20 * 60, titular: "A" }).reserva;
  M.prefijoIds("");
  const b = M.crearReserva(e, { canchaId: "c2", fecha: HOY, inicio: 20 * 60, titular: "B" }).reserva;
  assert.match(a.id, /^bx1-r/);
  assert.match(b.id, /^r/);
});

// ── Pedidos del club del 15/10: cargos maleables, mesa compleja, códigos, rentabilidad, bloqueo ──

test("cancha a cargo de otro jugador: Beto paga su parte y la de Ana; sin cadenas ni a cargo de quien ya pagó", () => {
  const e = club();
  const r = turno(e, "c1", 20, { clienteId: "a", jugadores: [{ nombre: "Ana", clienteId: "a" }, { nombre: "Beto", clienteId: "b" }, "Caro", "Dani"] });
  const cuota = r.precio / 4;
  assert.ok(M.asignarCargoCancha(e, r.id, 0, 1, ahora(19)).ok);
  const partes = M.partesCancha(r);
  assert.deepEqual(partes.map((p: any) => p.aPagar), [0, cuota * 2, cuota, cuota]);
  assert.equal(partes[0].aCargoDe, 1);
  // Beto ya paga por Ana: no puede pasar a cargo de nadie, y nadie puede quedar a cargo de Ana.
  assert.match(M.asignarCargoCancha(e, r.id, 1, 2, ahora(19)).motivo, /ya paga la parte de otro/);
  assert.match(M.asignarCargoCancha(e, r.id, 2, 0, ahora(19)).motivo, /ya está a cargo/);
  const cobro = M.cobrarParte(e, r.id, 1, { medio: "efectivo" }, ahora(21, 30));
  assert.ok(cobro.ok);
  assert.equal(cobro.monto, cuota * 2);
  assert.deepEqual(cobro.cubiertos, ["Ana"]);
  assert.equal(r.jugadores[0].pagadoPor, 1);
  assert.equal(M.saldo(r), cuota * 2);
  // Quien ya pagó (o quedó cubierto) no se reasigna.
  assert.match(M.asignarCargoCancha(e, r.id, 0, 2, ahora(21, 31)).motivo, /ya pagó/);
  assert.match(M.asignarCargoCancha(e, r.id, 2, 1, ahora(21, 31)).motivo, /ya pagó/);
  // El resto se reparte entre los que faltan y se puede volver atrás una asignación.
  assert.ok(M.asignarCargoCancha(e, r.id, 3, 2, ahora(21, 32)).ok);
  assert.deepEqual(M.partesCancha(r).map((p: any) => p.aPagar), [0, 0, cuota * 2, 0]);
  assert.ok(M.asignarCargoCancha(e, r.id, 3, null, ahora(21, 33)).ok);
  assert.deepEqual(M.partesCancha(r).map((p: any) => p.aPagar), [0, 0, cuota, cuota]);
});

test("cancha a cargo de otro con créditos: descuenta los créditos del que paga, no del invitado", () => {
  const e = club();
  const r = turno(e, "c1", 10, { clienteId: "a", jugadores: [{ nombre: "Ana", clienteId: "a" }, { nombre: "Beto", clienteId: "b" }] });
  M.asignarCargoCancha(e, r.id, 0, 1, ahora(9));
  // Beto tiene 10.000 en créditos y paga el turno entero de valle (las dos partes).
  const parte = M.partesCancha(r)[1].aPagar;
  assert.equal(parte, r.precio);
  assert.ok(parte > 10000);
  assert.match(M.cobrarParte(e, r.id, 1, { medio: "monedero" }, ahora(9)).motivo, /créditos|alcanza/i);
  assert.equal(M.cliente(e, "b").monedero, 10000);
  assert.equal(M.cliente(e, "a").monedero ?? 0, 0);
  // Con un turno más barato (8.000 entre los dos) alcanzan los créditos, y salen de los de Beto. (Un pago en el
  // mostrador sin elegir jugador ya no sirve para armar esto: queda acreditado a la titular, Ana.)
  r.precio = 8000;
  const res = M.cobrarParte(e, r.id, 1, { medio: "monedero" }, ahora(9));
  assert.ok(res.ok);
  assert.equal(res.monto, 8000);
  assert.equal(M.cliente(e, "b").monedero, 2000);
  assert.equal(r.jugadores[0].pagadoPor, 1);
});

test("pasar cargos: un descuento no se mueve de cuenta y el destino nunca queda por debajo de lo pagado", () => {
  const e = club();
  const { cuenta: a } = M.abrirCuenta(e, { clienteId: "a" }, ahora(20));
  const { cuenta: b } = M.abrirCuenta(e, { clienteId: "b" }, ahora(20));
  M.cargarEnCuenta(e, a.id, "p2", 2, ahora(20));
  M.cargoManual(e, a.id, { concepto: "Descuento", monto: -1500 }, DUENO, ahora(20));
  M.cargarEnCuenta(e, b.id, "p2", 1, ahora(20));
  M.pagarCuenta(e, b.id, { medio: "efectivo", monto: 2000 }, ahora(20));
  const desc = a.items.findIndex((i: any) => i.precioUnit < 0);
  assert.match(M.transferirCargo(e, a.id, desc, b.id, null, ahora(20, 5)).motivo, /descuento/i);
  assert.equal(M.saldoCuenta(b), 0);
  assert.equal(M.totalCuenta(a), 2500);
});

test("editar producto: un código rechazado no deja el precio cambiado; los códigos no distinguen mayúsculas", () => {
  const e = club();
  const precio = M.producto(e, "p2").precio;
  assert.match(M.editarProducto(e, "p2", { precio: 9999, codigo: "BP-001" }, DUENO).motivo, /otro producto/);
  assert.equal(M.producto(e, "p2").precio, precio);
  assert.match(M.altaProducto(e, { nombre: "Copia", precio: 100, codigo: "bp-001" }, DUENO, ahora(10)).motivo, /otro producto/);
  assert.match(M.altaProducto(e, { nombre: "Otro", precio: 100, codigo: "x9", codigoExterno: "X9" }, DUENO, ahora(10)).motivo, /mismo/);
});

test("cargos maleables: sumar y restar unidades devuelve stock; no deja la cuenta por debajo de lo pagado", () => {
  const e = club();
  const { cuenta: c } = M.abrirCuenta(e, { clienteId: "a" }, ahora(18));
  const agua = M.producto(e, "p2");
  const stock0 = agua.stock;
  M.cargarEnCuenta(e, c.id, "p2", 3, ahora(18));
  assert.equal(agua.stock, stock0 - 3);
  assert.ok(M.ajustarCargo(e, c.id, 0, -1, ahora(18, 5)).ok);
  assert.equal(c.items[0].cant, 2);
  assert.equal(agua.stock, stock0 - 2);
  assert.ok(M.ajustarCargo(e, c.id, 0, +2, ahora(18, 6)).ok);
  assert.equal(c.items[0].cant, 4);
  assert.match(M.ajustarCargo(e, c.id, 0, -5, ahora(18, 7)).motivo, /No se pueden sacar/);
  M.pagarCuenta(e, c.id, { medio: "efectivo", monto: 6000 }, ahora(18, 8));
  assert.match(M.ajustarCargo(e, c.id, 0, -2, ahora(18, 9)).motivo, /ya se pagaron/i);
  assert.ok(M.ajustarCargo(e, c.id, 0, -1, ahora(18, 9)).ok); // 3 × 2000 = 6000: justo lo pagado
  // Llevado a cero, el cargo desaparece.
  const { cuenta: c2 } = M.abrirCuenta(e, { titular: "Mesa 2" }, ahora(19));
  M.cargarEnCuenta(e, c2.id, "k-tost", 1, ahora(19));
  assert.ok(M.ajustarCargo(e, c2.id, 0, -1, ahora(19, 1)).ok);
  assert.equal(c2.items.length, 0);
});

test("mesa compleja: un cargo se pasa entero o en partes a otra cuenta; cargo manual y descuento con PIN del dueño", () => {
  const e = club();
  const { cuenta: mesa } = M.abrirCuenta(e, { titular: "Mesa 5" }, ahora(21));
  const { cuenta: ana } = M.abrirCuenta(e, { clienteId: "a" }, ahora(21));
  const { cuenta: beto } = M.abrirCuenta(e, { clienteId: "b" }, ahora(21));
  M.cargarEnCuenta(e, mesa.id, "k-empa", 6, ahora(21));
  M.cargarEnCuenta(e, mesa.id, "p9", 2, ahora(21));
  assert.ok(M.transferirCargo(e, mesa.id, 0, ana.id, 3, ahora(21, 30)).ok);
  assert.equal(mesa.items[0].cant, 3);
  assert.equal(ana.items[0].cant, 3);
  assert.equal(ana.items[0].transferidoDe, "Mesa 5");
  assert.ok(M.transferirCargo(e, mesa.id, 1, beto.id, null, ahora(21, 31)).ok); // sin cantidad: entero
  assert.equal(mesa.items.length, 1);
  assert.equal(M.totalCuenta(beto), 2 * 3800);
  assert.match(M.transferirCargo(e, mesa.id, 0, mesa.id, 1, ahora(21, 32)).motivo, /otra cuenta/);
  assert.match(M.transferirCargo(e, mesa.id, 0, ana.id, 9, ahora(21, 32)).motivo, /de 1 a 3/);
  // Lo ya pagado en el origen no queda sin respaldo.
  M.pagarCuenta(e, mesa.id, { medio: "efectivo", monto: 4400 }, ahora(21, 33));
  assert.match(M.transferirCargo(e, mesa.id, 0, ana.id, 2, ahora(21, 34)).motivo, /ya se pagaron/);
  assert.ok(M.transferirCargo(e, mesa.id, 0, ana.id, 1, ahora(21, 34)).ok);
  // Cargo manual (la excepción que se cobra a mano) y descuento.
  assert.ok(M.cargoManual(e, ana.id, { concepto: "Torta de cumple", monto: 15000 }, RECEP, ahora(22)).ok);
  assert.equal(ana.items.at(-1).manual, true);
  assert.match(M.cargoManual(e, ana.id, { concepto: "Descuento", monto: -3000 }, RECEP, ahora(22)).motivo, /dueño/);
  assert.match(M.cargoManual(e, ana.id, { concepto: "Descuento", monto: -3000 }, { usuarioId: "u-rober", pin: "99" }, ahora(22)).motivo, /PIN/);
  const antes = M.totalCuenta(ana);
  assert.ok(M.cargoManual(e, ana.id, { concepto: "Descuento cumpleañera", monto: -3000 }, DUENO, ahora(22)).ok);
  assert.equal(M.totalCuenta(ana), antes - 3000);
  assert.match(M.cargoManual(e, ana.id, { concepto: "", monto: 100 }, RECEP, ahora(22)).motivo, /concepto/);
  assert.match(M.ajustarCargo(e, ana.id, ana.items.length - 2, +1, ahora(22)).motivo, /manual/);
  // Un cargo manual no cuenta como venta de producto en la rentabilidad.
  assert.equal(M.rentabilidad(e).filas.find((f: any) => f.productoId === "k-empa").unidades, 6);
});

test("código interno y código de fabricación: se busca y se escanea por cualquiera de los dos, sin repetir", () => {
  const e = club();
  assert.equal(M.productoPorCodigo(e, "bp-002").producto.nombre, "Agua 500 ml");
  assert.equal(M.productoPorCodigo(e, "7790000000028").producto.nombre, "Agua 500 ml");
  assert.deepEqual(M.buscarProductos(e, "bp-001").map((p: any) => p.id), ["p1"]);
  const alta = M.altaProducto(e, { nombre: "Grip pro", categoria: "Accesorios", precio: 5000, costo: 2000, stock: 5, codigo: "BP-100", codigoExterno: "7791234567890" }, DUENO, ahora(10));
  assert.ok(alta.ok);
  assert.equal(M.productoPorCodigo(e, "7791234567890").producto.id, alta.producto.id);
  assert.match(M.altaProducto(e, { nombre: "Otro", precio: 100, codigoExterno: "BP-002" }, DUENO, ahora(10)).motivo, /otro producto/);
  assert.match(M.altaProducto(e, { nombre: "Otro", precio: 100, codigo: "X1", codigoExterno: "X1" }, DUENO, ahora(10)).motivo, /mismo/);
  assert.ok(M.editarProducto(e, "p2", { codigoExterno: "7790000009999" }, DUENO).ok);
  assert.equal(M.productoPorCodigo(e, "7790000009999").producto.id, "p2");
  assert.match(M.editarProducto(e, "p2", { codigoExterno: "7790000000011" }, DUENO).motivo, /otro producto/);
});

test("pricing y revenue: margen, markup y lo vendido; precio sugerido desde el markup", () => {
  const e = club();
  const { cuenta: c } = M.abrirCuenta(e, { titular: "Mesa 1" }, ahora(13));
  M.cargarEnCuenta(e, c.id, "p2", 4, ahora(13));
  M.cargarEnCuenta(e, c.id, "k-mila", 1, ahora(13));
  const r = M.rentabilidad(e, { desde: HOY, hasta: HOY });
  const agua = r.filas.find((f: any) => f.productoId === "p2");
  assert.equal(agua.margen, 1300);
  assert.equal(agua.unidades, 4);
  assert.equal(agua.facturado, 8000);
  assert.equal(agua.ganancia, 8000 - 4 * 700);
  assert.ok(Math.abs(agua.markupPct - 1300 / 700) < 1e-9);
  assert.equal(r.facturado, 8000 + 14500);
  assert.equal(r.ganancia, 8000 - 2800 + 14500 - 6200);
  assert.equal(M.rentabilidad(e, { desde: "2026-10-20" }).facturado, 0);
  assert.equal(M.precioDesdeMarkup(700, 100), 1400);
  assert.equal(M.precioDesdeMarkup(1500, 133), 3500);
  assert.equal(M.precioDesdeMarkup(0, 50), null);
});

test("bloqueo por inactividad: lo configura el dueño, entre 0 y 60 minutos", () => {
  const e = club();
  assert.equal(e.config.bloqueoMin, 5);
  assert.ok(M.ajustarBloqueo(e, 10, DUENO).ok);
  assert.equal(e.config.bloqueoMin, 10);
  assert.match(M.ajustarBloqueo(e, 10, RECEP).motivo, /permiso/);
  assert.match(M.ajustarBloqueo(e, 90, DUENO).motivo, /Entre/);
});

// ── UAT del orquestador (16/10): caja con un solo cierre, seña acreditada al titular, falta sin cargo del dueño ──

test("caja: se cierra una sola vez por día; lo que entra después va a la caja siguiente y no cambia la cerrada", () => {
  const e = club();
  const r = turno(e, "c1", 20, { clienteId: "a" });
  M.registrarPago(e, r.id, { medio: "efectivo", monto: 10000 }, ahora(20));
  const cierre = M.cerrarCaja(e, { contado: 10000 + e.caja.fondo, ...RECEP }, ahora(23));
  assert.ok(cierre.ok);
  assert.match(M.cerrarCaja(e, { contado: 0, ...RECEP }, ahora(23, 30)).motivo, /ya está cerrada/);
  const dia = cierre.cierre.dia;
  const antes = M.resumenCaja(e, dia).ingresos;
  M.registrarPago(e, r.id, { medio: "efectivo", monto: 5000 }, ahora(23, 40)); // después del cierre, el mismo día de caja
  assert.equal(M.resumenCaja(e, dia).ingresos, antes, "la caja cerrada no cambia");
  const siguiente = M.cajaAbierta(e, ahora(23, 40));
  assert.notEqual(siguiente, dia);
  assert.equal(M.resumenCaja(e, siguiente).ingresos, 5000, "la venta entra en la caja siguiente");
});

test("seña: lo que paga el titular (sin elegir jugador) se le acredita; no vuelve a pagar su parte", () => {
  const e = club();
  const r = turno(e, "c1", 20, { clienteId: "a", jugadores: [{ nombre: "Ana", clienteId: "a" }, "Beto", "Caro", "Dani"] });
  M.registrarPago(e, r.id, { medio: "transferencia", monto: r.precio / 2 }, ahora(10)); // la seña la pagó Ana
  const partes = M.partesCancha(r);
  assert.equal(partes[0].aPagar, 0, "Ana ya pagó (la seña)");
  assert.deepEqual(partes.slice(1).map((p: any) => p.aPagar), [r.precio / 6, r.precio / 6, r.precio / 6].map(Math.round));
  assert.equal(partes.reduce((s: number, p: any) => s + p.aPagar, 0), M.saldo(r), "las partes suman lo que falta cobrar");
});

test("falta sin cargo: el motor exige un dueño (no alcanza con ocultar el botón)", () => {
  const e = club();
  const r = turno(e, "c1", 20, { clienteId: "a" });
  const tarde = ahora(20, 30);
  assert.match(M.marcarNoShow(e, r.id, { cobrarA: "nadie" }, tarde).motivo, /dueño/);
  assert.match(M.marcarNoShow(e, r.id, { cobrarA: "nadie", auth: RECEP }, tarde).motivo, /dueño/);
  assert.equal(r.estado, "reservada", "no quedó marcada");
  assert.ok(M.marcarNoShow(e, r.id, { cobrarA: "nadie", auth: DUENO }, tarde).ok);
  assert.equal(r.estado, "no_show");
});

test("cobros, ajustes y pases desde el puesto validan el usuario en el motor", () => {
  const e = club();
  const r = turno(e, "c1", 20, { clienteId: "a" });
  const intruso = { usuarioId: "nadie", pin: "00" };
  assert.match(M.registrarPago(e, r.id, { medio: "efectivo", monto: 1000, auth: intruso }, ahora(20)).motivo, /quién/);
  assert.ok(M.registrarPago(e, r.id, { medio: "efectivo", monto: 1000, auth: RECEP }, ahora(20)).ok);
  const { cuenta: c } = M.abrirCuenta(e, { clienteId: "a" }, ahora(20));
  const { cuenta: d } = M.abrirCuenta(e, { clienteId: "b" }, ahora(20));
  M.cargarEnCuenta(e, c.id, "p2", 2, ahora(20));
  assert.equal(M.ajustarCargo(e, c.id, 0, -1, ahora(20), intruso).ok, false);
  assert.equal(M.transferirCargo(e, c.id, 0, d.id, 1, ahora(20), intruso).ok, false);
  assert.ok(M.ajustarCargo(e, c.id, 0, -1, ahora(20), RECEP).ok);
});

test("reparto por cuota (Gate B1): seña chica, pago «a cuenta» y titular que no juega", () => {
  const cuarto = (r: any) => r.precio / 4;
  // Seña del 20%: la titular debe el resto de su cuota; los demás, la suya entera.
  const e = club();
  const r = turno(e, "c1", 20, { clienteId: "a", jugadores: [{ nombre: "Ana", clienteId: "a" }, "Beto", "Caro", "Dani"] });
  M.registrarPago(e, r.id, { medio: "transferencia", monto: r.precio * 0.2 }, ahora(10));
  assert.deepEqual(M.partesCancha(r).map((p: any) => p.aPagar), [cuarto(r) - r.precio * 0.2, cuarto(r), cuarto(r), cuarto(r)]);
  // Un «a cuenta» de $1.000 en el mostrador: a Ana le baja $1.000, nadie queda exento.
  const e2 = club();
  const r2 = turno(e2, "c1", 20, { clienteId: "a", jugadores: [{ nombre: "Ana", clienteId: "a" }, "Beto", "Caro", "Dani"] });
  M.registrarPago(e2, r2.id, { medio: "efectivo", monto: 1000 }, ahora(10));
  const p2 = M.partesCancha(r2);
  assert.deepEqual(p2.map((p: any) => p.aPagar), [cuarto(r2) - 1000, cuarto(r2), cuarto(r2), cuarto(r2)]);
  assert.ok(p2.every((p: any) => !p.pago));
  // El titular no juega (partido abierto): la seña no se le acredita a nadie y baja a todos por igual.
  const e3 = club();
  const r3 = turno(e3, "c1", 20, { clienteId: "a", titular: "Ana", jugadores: ["Santi", "Gonza", "Facu", "Leo"] });
  M.registrarPago(e3, r3.id, { medio: "transferencia", monto: r3.precio / 2 }, ahora(10));
  assert.ok(r3.jugadores.every((j: any) => !j.pagado), "nadie queda con la seña de otro");
  const p3 = M.partesCancha(r3);
  assert.deepEqual(p3.map((p: any) => p.aPagar), [1, 2, 3, 4].map(() => r3.precio / 8));
  for (const r0 of [r, r2, r3]) assert.equal(M.partesCancha(r0).reduce((s: number, p: any) => s + p.aPagar, 0), M.saldo(r0), "las partes suman exacto el saldo");
});

test("cobrar las partes en orden cierra el turno (Gate B3): seña del 50% y nadie vuelve a deber", () => {
  const e = club();
  e.config.politica.senaPct = 50;
  const r = turno(e, "c1", 20, { clienteId: "a", jugadores: [{ nombre: "Ana", clienteId: "a" }, "Beto", "Caro", "Dani"] });
  M.registrarPago(e, r.id, { medio: "transferencia", monto: r.precio / 2 }, ahora(10));
  const sexto = r.precio / 6;
  assert.deepEqual(M.partesCancha(r).map((p: any) => p.aPagar), [0, sexto, sexto, sexto]);
  for (const i of [1, 2, 3]) {
    assert.ok(M.cobrarParte(e, r.id, i, { medio: "efectivo" }, ahora(21)).ok);
    const p = M.partesCancha(r);
    for (let k = 0; k <= i; k++) assert.equal(p[k].aPagar, 0, `${r.jugadores[k].nombre} ya pagó y no vuelve a deber`);
    assert.equal(p.reduce((s: number, x: any) => s + x.aPagar, 0), M.saldo(r));
  }
  assert.equal(M.saldo(r), 0);
  assert.ok(M.partesCancha(r).every((p: any) => p.pago));
});

test("reparto de la cancha, propiedad: con cualquier seña, pago a cuenta y «a cargo de», cobrar parte por parte cierra", () => {
  let semilla = 12345;
  const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let t = 0; t < 1500; t++) {
    const e = club();
    e.config.politica.senaPct = Math.floor(azar() * 101);
    const n = 1 + Math.floor(azar() * 4);
    const afuera = azar() < 0.2;
    const r = turno(e, "c1", 20, { clienteId: "a", ...(afuera && { titular: "Ana" }), jugadores: [afuera ? "Santi" : { nombre: "Ana", clienteId: "a" }, "Beto", "Caro", "Dani"].slice(0, n) });
    for (let k = 0; k < n; k++) if (azar() < 0.4) M.asignarCargoCancha(e, r.id, Math.floor(azar() * n), Math.floor(azar() * n), ahora(9));
    if (r.sena.monto > 0 && azar() < 0.8) M.registrarPago(e, r.id, { medio: "efectivo", monto: r.sena.monto }, ahora(10));
    if (azar() < 0.4 && M.saldo(r) > 1) M.registrarPago(e, r.id, { medio: "efectivo", monto: Math.max(1, Math.floor(azar() * M.saldo(r))) }, ahora(20));
    const pagaron = new Set<number>();
    for (let paso = 0; paso < n && M.saldo(r) > 0; paso++) {
      const p = M.partesCancha(r);
      assert.equal(p.reduce((s: number, x: any) => s + x.aPagar, 0), M.saldo(r), `caso ${t}: las partes suman el saldo`);
      for (const k of pagaron) assert.equal(p[k].aPagar, 0, `caso ${t}: quien pagó no vuelve a deber`);
      const i = p.findIndex((x: any) => x.aPagar > 0);
      assert.ok(i >= 0, `caso ${t}: con saldo, alguien tiene que pagar`);
      assert.ok(M.cobrarParte(e, r.id, i, { medio: "efectivo" }, ahora(21)).ok);
      pagaron.add(i);
    }
    assert.equal(M.saldo(r), 0, `caso ${t}: a lo sumo un cobro por jugador cierra el turno`);
  }
});

// ── Día de prueba real: la cuenta del turno en un solo lugar, crédito con código, tienda y jornada guardada ──

const mesa4 = (e: any, hh = 20, canchaId = "c1") => turno(e, canchaId, hh, { clienteId: "a", jugadores: [{ nombre: "Ana", clienteId: "a" }, { nombre: "Beto", clienteId: "b" }, "Caro", "Dani"] });
const cajaIngresos = (e: any) => e.caja.movimientos.filter((m: any) => m.tipo === "ingreso").reduce((s: number, m: any) => s + m.monto, 0);

test("cuenta del turno: cancha + cargos de cada jugador en un solo lugar, con totales", () => {
  const e = club();
  const r = mesa4(e);
  M.consumoJugador(e, r.id, 0, "p2", 2, {}, ahora(20, 10)); // Ana 2 aguas 4.000
  M.consumoJugador(e, r.id, 1, "p9", 1, {}, ahora(20, 10)); // Beto 1 cerveza 3.800
  M.consumoJugador(e, r.id, 2, "k-mila", 1, {}, ahora(20, 10)); // Caro milanesa 14.500
  const t = M.cuentaDelTurno(e, r.id);
  assert.equal(t.totales.cancha, 42000);
  assert.equal(t.totales.cargos, 22300);
  assert.equal(t.totales.pendiente, 64300);
  assert.deepEqual(t.jugadores.map((j: any) => j.aPagar), [14500, 14300, 25000, 10500]);
});

test("«a cargo de» también para los cargos: paga todo junto, sin cadenas, y la cuenta que paga otro no se cierra sola", () => {
  const e = club();
  const r = mesa4(e);
  M.consumoJugador(e, r.id, 0, "p2", 2, {}, ahora(20, 10));
  M.consumoJugador(e, r.id, 1, "p9", 1, {}, ahora(20, 10));
  M.consumoJugador(e, r.id, 2, "k-mila", 1, {}, ahora(20, 10));
  const [ca, cb, cc] = [0, 1, 2].map((i) => M.cuentaDeJugador(e, r, i));
  assert.ok(M.asignarCargoCargos(e, cb.id, ca.id, ahora(20, 20)).ok);
  assert.match(M.asignarCargoCargos(e, cc.id, cb.id, ahora(20, 20)).motivo, /ya los paga Ana/);
  assert.match(M.asignarCargoCargos(e, ca.id, cc.id, ahora(20, 20)).motivo, /ya paga los cargos de otro/);
  assert.match(M.cerrarCuenta(e, cb.id, {}, ahora(20, 20)).motivo, /los paga Ana/);
  const t = M.cuentaDelTurno(e, r.id);
  assert.equal(t.jugadores[0].aPagar, 10500 + 4000 + 3800);
  assert.equal(t.jugadores[1].aPagar, 10500, "Beto paga sólo su cancha: sus cargos los paga Ana");
  const antes = cajaIngresos(e);
  const res = M.cobrarJugador(e, r.id, 0, { medio: "efectivo" }, ahora(21, 30));
  assert.ok(res.ok);
  assert.equal(res.total, 18300);
  assert.equal(cajaIngresos(e) - antes, 18300);
  assert.equal(ca.estado, "cerrada");
  assert.equal(cb.estado, "cerrada");
  assert.ok(M.partesCancha(r)[0].pago);
  assert.equal(M.cobrarJugador(e, r.id, 0, { medio: "efectivo" }, ahora(21, 31)).ok, false, "nada se cobra dos veces");
});

test("cerrar la cancha y seguir: se cobra la cancha, se libera para el turno siguiente y la mesa sigue cargando", () => {
  const e = club();
  const r = mesa4(e, 19);
  M.checkIn(e, r.id, ahora(19));
  M.consumoJugador(e, r.id, 2, "k-mila", 1, {}, ahora(19, 30));
  const res = M.cerrarCanchaYSeguir(e, r.id, { medio: "efectivo" }, ahora(20, 30));
  assert.ok(res.ok);
  assert.equal(res.cobradoCancha, 42000);
  assert.equal(r.estado, "finalizada");
  assert.equal(e.luces.c1, false);
  const sig = turno(e, "c1", 20, { clienteId: "d" }, 30);
  assert.ok(M.checkIn(e, sig.id, ahora(20, 30)).ok, "el turno siguiente abre la cancha aunque la mesa siga");
  assert.ok(M.consumoJugador(e, r.id, 2, "p9", 2, {}, ahora(21)).ok, "la mesa sigue cargando con la cancha cerrada");
  const t = M.cuentaDelTurno(e, r.id);
  assert.equal(t.totales.cancha, 0);
  assert.equal(t.totales.cargos, 14500 + 7600);
  assert.ok(t.mesaAbierta);
  assert.equal(M.mesasAbiertas(e).length, 1);
  const cierre = M.cerrarCargosDelTurno(e, r.id, { medio: "mercadopago" }, ahora(22));
  assert.ok(cierre.ok);
  assert.equal(cierre.cobrado, 22100);
  assert.equal(M.mesasAbiertas(e).length, 0);
  assert.equal(M.cuentaDelTurno(e, r.id).totales.pendiente, 0);
});

test("cobrar todo el turno de una: cancha y cargos con un medio; con créditos, jugador por jugador", () => {
  const e = club();
  const r = mesa4(e);
  M.consumoJugador(e, r.id, 0, "p2", 2, {}, ahora(20, 10));
  M.consumoJugador(e, r.id, 3, "k-pica", 1, {}, ahora(20, 10));
  assert.match(M.cobrarTodoElTurno(e, r.id, { medio: "monedero" }, ahora(21)).motivo, /jugador por jugador/);
  const antes = cajaIngresos(e);
  const res = M.cobrarTodoElTurno(e, r.id, { medio: "debito" }, ahora(21));
  assert.ok(res.ok);
  assert.equal(res.total, 42000 + 4000 + 21000);
  assert.equal(cajaIngresos(e) - antes, 67000);
  assert.equal(M.cuentaDelTurno(e, r.id).totales.pendiente, 0);
  assert.equal(M.cobrarTodoElTurno(e, r.id, { medio: "debito" }, ahora(21)).ok, false);
});

test("crédito: fiado puntual con código del dueño por WhatsApp (sin servidor) y con tope de intentos", () => {
  const e = club();
  const r = mesa4(e);
  M.consumoJugador(e, r.id, 0, "k-pica", 1, {}, ahora(20, 10));
  const cta = M.cuentaDeJugador(e, r, 0);
  assert.match(M.cerrarCuenta(e, cta.id, { aCuenta: true }, ahora(21)).motivo, /no tiene cuenta corriente/);
  const { novedad: n } = M.solicitarCredito(e, { clienteId: "a", tipo: "fiado", monto: 21000, cuentaId: cta.id }, RECEP, ahora(21));
  assert.equal(M.solicitarCredito(e, { clienteId: "a", tipo: "fiado", monto: 1 }, RECEP, ahora(21)).ok, false, "un pedido pendiente por cliente");
  const d = M.datosAprobacion(e, n.id);
  // El celular del dueño calcula el código sólo con el link y su PIN.
  const deMajo = M.codigoAprobacion({ pin: "22", novedadId: d.id, clienteId: d.c, monto: d.m, fecha: d.f });
  assert.match(deMajo, /^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
  assert.notEqual(deMajo, M.codigoAprobacion({ pin: "11", novedadId: d.id, clienteId: d.c, monto: d.m, fecha: d.f }));
  assert.notEqual(deMajo, M.codigoAprobacion({ pin: "22", novedadId: d.id, clienteId: d.c, monto: d.m + 1, fecha: d.f }));
  assert.match(M.aprobarPorCodigo(e, n.id, { codigo: "AAA-AAA", monto: 21000 }, RECEP, ahora(21, 5)).motivo, /1 de 5/);
  assert.equal(M.aprobarPorCodigo(e, n.id, { codigo: deMajo, monto: 30000 }, RECEP, ahora(21, 5)).ok, false, "con otro monto el código no sirve");
  const ok = M.aprobarPorCodigo(e, n.id, { codigo: deMajo.toLowerCase(), monto: 21000 }, RECEP, ahora(21, 6));
  assert.ok(ok.ok);
  assert.equal(ok.aprobo, "Majo");
  assert.ok(M.cerrarCuenta(e, cta.id, { aCuenta: true }, ahora(21, 10)).ok);
  assert.equal(M.cliente(e, "a").deuda, 21000);
  // El fiado se usa una sola vez.
  M.consumoJugador(e, r.id, 0, "p2", 1, {}, ahora(21, 20));
  assert.equal(M.cerrarCuenta(e, M.cuentaDeJugador(e, r, 0).id, { aCuenta: true }, ahora(21, 30)).ok, false);
});

test("crédito: cinco códigos mal traban el pedido 30 minutos; el dueño en el sistema lo resuelve igual", () => {
  const e = club();
  const { novedad: n } = M.solicitarCredito(e, { clienteId: "c", tipo: "cc", monto: 30000 }, RECEP, ahora(10));
  for (let i = 0; i < 4; i++) M.aprobarPorCodigo(e, n.id, { codigo: "ZZZ-ZZZ" }, RECEP, ahora(10));
  assert.match(M.aprobarPorCodigo(e, n.id, { codigo: "ZZZ-ZZZ" }, RECEP, ahora(10)).motivo, /30 minutos/);
  const bueno = M.codigoAprobacion({ pin: "11", novedadId: n.id, clienteId: "c", monto: 30000, fecha: n.fecha });
  assert.match(M.aprobarPorCodigo(e, n.id, { codigo: bueno }, RECEP, ahora(10, 10)).motivo, /Demasiados/);
  assert.ok(M.aprobarPorCodigo(e, n.id, { codigo: bueno }, RECEP, ahora(10, 31)).ok);
  assert.deepEqual(M.cliente(e, "c").cc, { habilitada: true, limite: 30000 });
  const { novedad: n2 } = M.solicitarCredito(e, { clienteId: "b", tipo: "fiado", monto: 5000 }, RECEP, ahora(11));
  assert.equal(M.resolverCredito(e, n2.id, { aprobar: true }, RECEP, ahora(11)).ok, false, "recepción no aprueba");
  assert.ok(M.resolverCredito(e, n2.id, { aprobar: true, monto: 4000 }, DUENO, ahora(11)).ok);
  assert.equal(M.cliente(e, "b").fiados[0].monto, 4000);
});

test("tienda: catálogo sin alquiler ni cocina, el pedido no toca stock hasta entregarlo, y se entrega una sola vez", () => {
  const e = club();
  const ids = M.catalogoTienda(e).map((p: any) => p.id);
  assert.ok(ids.includes("p1") && ids.includes("p4"));
  assert.ok(!ids.includes("p6") && !ids.includes("k-mila") && !ids.includes("p8"), "sin alquiler, cocina ni lo que no tiene stock");
  assert.match(M.crearPedidoTienda(e, { items: [{ productoId: "p7", cant: 9 }], nombre: "Pedro" }, ahora(10)).motivo, /quedan 3/);
  assert.match(M.crearPedidoTienda(e, { items: [{ productoId: "p6", cant: 1 }], nombre: "Pedro" }, ahora(10)).motivo, /no está en la tienda/);
  const { pedido, mensaje } = M.crearPedidoTienda(e, { items: [{ productoId: "p1", cant: 1 }, { productoId: "p4", cant: 2 }], nombre: "Pedro", tel: "11 5555" }, ahora(10));
  assert.equal(pedido.total, 21000);
  assert.match(mensaje, new RegExp(pedido.codigo));
  assert.equal(M.producto(e, "p1").stock, 18);
  const antes = cajaIngresos(e);
  assert.ok(M.entregarPedido(e, pedido.id, { medio: "efectivo" }, ahora(18)).ok);
  assert.equal(cajaIngresos(e) - antes, 21000);
  assert.equal(M.producto(e, "p1").stock, 17);
  assert.equal(M.producto(e, "p4").stock, 28);
  assert.equal(M.entregarPedido(e, pedido.id, { medio: "efectivo" }, ahora(18)).ok, false);
  assert.equal(M.cuentasAbiertas(e).length, 0);
  const otro = M.crearPedidoTienda(e, { items: [{ productoId: "p2", cant: 2 }], nombre: "Ana" }, ahora(10)).pedido;
  assert.ok(M.cargarPedidoACuenta(e, otro.id, "a", ahora(19)).ok);
  assert.equal(M.saldoCuenta(M.cuentasAbiertas(e)[0]), 4000);
});

test("jornada real: arranca en blanco, se guarda y se vuelve a abrir igual, sin repetir ids", () => {
  const e = M.crearClubReal(HOY);
  assert.equal(e.config.modo, "real");
  assert.equal(e.config.cobro.alias, "");
  assert.equal(e.reservas.length + e.clientes.length + e.cuentas.length + e.caja.movimientos.length, 0);
  const r = turno(e, "c1", 20, { titular: "Juan", telefono: "1", jugadores: ["Juan", "Pedro"] });
  M.consumoJugador(e, r.id, 0, "p2", 1, {}, ahora(20));
  const foto = JSON.parse(JSON.stringify(M.serializarEstado(e)));
  const h = M.hidratarEstado(foto);
  assert.ok(h.ok);
  assert.deepEqual(h.estado.reservas, e.reservas);
  const nuevo = turno(h.estado, "c2", 20, { titular: "Otro", telefono: "2" });
  assert.ok(![...e.reservas, ...e.cuentas].some((x: any) => x.id === nuevo.id), "ids nuevos después de volver a abrir");
  for (const basura of [null, { v: 99 }, { v: 1, estado: {} }, { v: 1, estado: { config: {}, caja: {} } }]) assert.equal(M.hidratarEstado(basura).ok, false);
});

test("propiedad: un día de torneo al azar cierra en cero, la caja suma lo cobrado y el stock cuadra", () => {
  let semilla = 777;
  const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const productos = ["p2", "p9", "p10", "p3", "k-mila", "k-hamb", "k-empa", "k-pica"];
  for (let t = 0; t < 300; t++) {
    const e = club();
    e.config.politica.senaPct = Math.floor(azar() * 101);
    const stock0 = Object.fromEntries(e.productos.map((p: any) => [p.id, p.stock]));
    const r = mesa4(e, 20, "c" + (1 + Math.floor(azar() * 4)));
    if (azar() < 0.6) M.registrarPago(e, r.id, { medio: "transferencia", monto: r.sena.monto || Math.floor(r.precio / 4) }, ahora(10));
    M.checkIn(e, r.id, ahora(20));
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
    if (camino === 0) M.cobrarTodoElTurno(e, r.id, { medio: "efectivo" }, ahora(21, 30));
    else if (camino === 1) { M.cerrarCanchaYSeguir(e, r.id, { medio: "efectivo" }, ahora(21, 30)); M.cerrarCargosDelTurno(e, r.id, { medio: "debito" }, ahora(23)); }
    else for (let vuelta = 0; vuelta < 6; vuelta++) { const i = M.cuentaDelTurno(e, r.id).jugadores.findIndex((j: any) => j.aPagar > 0); if (i < 0) break; assert.ok(M.cobrarJugador(e, r.id, i, { medio: "mercadopago" }, ahora(21, 30)).ok, `caso ${t}`); }
    const fin = M.cuentaDelTurno(e, r.id);
    assert.equal(fin.totales.pendiente, 0, `caso ${t} (camino ${camino}): queda pendiente`);
    const cobradoCancha = M.cobrado(r);
    const cobradoCargos = e.cuentas.reduce((s: number, x: any) => s + M.cobradoCuenta(x), 0);
    assert.equal(cajaIngresos(e), cobradoCancha + cobradoCargos, `caso ${t}: la caja no suma lo cobrado`);
    assert.equal(cobradoCancha, r.precio, `caso ${t}: la cancha se cobró de más o de menos`);
    for (const [p, n] of Object.entries(cargados)) if (stock0[p] != null) assert.equal(M.producto(e, p).stock, stock0[p] - n, `caso ${t}: stock de ${p}`);
  }
});

test("tenant real: dueños Roberto Ronco y Majo Gimenez sin PIN, cada uno arma el suyo y dan de alta a recepción", () => {
  const e = M.crearClubReal(HOY);
  assert.deepEqual(e.usuarios.map((u: any) => [u.nombre, u.rol, u.pin]), [["Roberto Ronco", "duenio", ""], ["Majo Gimenez", "duenio", ""]]);
  assert.equal(e.proveedores.length, 0);
  assert.equal(M.verificarPin(e, "u-rober", "").ok, false, "sin PIN no se entra con el campo vacío");
  assert.match(M.terminarConfiguracion(e, ahora(9)).motivo, /al menos un dueño/);
  assert.match(M.definirPinInicial(e, "u-rober", "1", ahora(9)).motivo, /2 números/);
  assert.ok(M.definirPinInicial(e, "u-rober", "57", ahora(9)).ok);
  assert.match(M.definirPinInicial(e, "u-majo", "57", ahora(9)).motivo, /otra persona/);
  assert.ok(M.definirPinInicial(e, "u-majo", "84", ahora(9)).ok);
  assert.equal(M.definirPinInicial(e, "u-rober", "12", ahora(9)).ok, false, "el PIN inicial se arma una sola vez");
  assert.ok(M.terminarConfiguracion(e, ahora(9)).ok);
  assert.equal(e.config.configurado, true);
  assert.equal(M.altaUsuario(e, { nombre: "Lu", rol: "recepcion" }, { usuarioId: "u-rober", pin: "00" }, ahora(9)).ok, false);
  const lu = M.altaUsuario(e, { nombre: "Lu", rol: "recepcion" }, { usuarioId: "u-rober", pin: "57" }, ahora(9));
  assert.ok(lu.ok);
  assert.match(lu.pin, /^\d{2}$/);
  assert.ok(M.verificarPin(e, lu.usuario.id, lu.pin).ok);
  assert.equal(M.altaUsuario(e, { nombre: "Caro" }, { usuarioId: lu.usuario.id, pin: lu.pin }, ahora(9)).ok, false, "recepción no da accesos");
  assert.ok(M.cambiarMiPin(e, { usuarioId: lu.usuario.id, pin: lu.pin }, "33", ahora(9)).ok || lu.pin === "33");
  assert.ok(M.revocarAcceso(e, lu.usuario.id, { usuarioId: "u-majo", pin: "84" }, ahora(9)).ok);
  assert.equal(M.verificarPin(e, lu.usuario.id, "33").ok, false);
});

test("novedades por difusión: audiencia, baja y envío uno por uno sin repetir", () => {
  const e = club();
  const r = turno(e, "c1", 10, { clienteId: "a" });
  M.checkIn(e, r.id, ahora(10));
  M.registrarPago(e, r.id, { medio: "efectivo", monto: r.precio }, ahora(11));
  M.finalizar(e, r.id, {}, ahora(11, 30));
  assert.equal(M.destinatarios(e, "todos", ahora(12)).length, 4);
  assert.deepEqual(M.destinatarios(e, "activos", ahora(12)).map((x: any) => x.clienteId), ["a"]);
  assert.deepEqual(M.destinatarios(e, "cuentaCorriente", ahora(12)).map((x: any) => x.clienteId), ["d"]);
  M.bajaNovedades(e, "b", ahora(12));
  assert.equal(M.destinatarios(e, "todos", ahora(12)).length, 3, "a quien pidió la baja no le llega");
  assert.equal(M.crearDifusion(e, { titulo: "Torneo" }, RECEP, ahora(12)).ok, false, "la arma un dueño");
  const { difusion: d } = M.crearDifusion(e, { tipo: "torneo", titulo: "Torneo del sábado", texto: "Inscripción $20.000 por pareja.", audiencia: "todos" }, DUENO, ahora(12));
  assert.equal(d.destinatarios.length, 3);
  assert.match(M.mensajeDifusion(d, "Ana Pérez"), /¡Hola Ana![\s\S]*Torneo del sábado[\s\S]*BAJA/);
  assert.equal(M.marcarEnviado(e, d.id, "a").faltan, 2);
  assert.equal(M.marcarEnviado(e, d.id, "a").faltan, 2, "no se cuenta dos veces");
  assert.match(M.contactosCSV([{ nombre: 'Ana "la zurda"', tel: "5491100000001" }]), /"Ana ""la zurda""","\+5491100000001"/);
});

test("tienda en el día real: el club pega el mensaje de WhatsApp del cliente y queda el pedido (una sola vez)", () => {
  const e = M.crearClubReal(HOY);
  const { mensaje, pedido } = M.crearPedidoTienda(M.crearClubReal(HOY), { items: [{ productoId: "p1", cant: 1 }, { productoId: "p4", cant: 2 }], nombre: "Pedro Gómez", tel: "11 5555-1234" }, ahora(15));
  const res = M.pedidoDesdeWhatsApp(e, mensaje, ahora(15, 5));
  assert.ok(res.ok);
  assert.equal(res.pedido.codigo, pedido.codigo);
  assert.equal(res.pedido.nombre, "Pedro Gómez");
  assert.equal(res.pedido.total, 21000);
  assert.match(M.pedidoDesdeWhatsApp(e, mensaje, ahora(15, 6)).motivo, /ya está cargado/);
  assert.match(M.pedidoDesdeWhatsApp(e, "hola, ¿tienen paletas?", ahora(15, 6)).motivo, /No encontré productos/);
});

test("Gate B2: un jugador en dos turnos seguidos — «cobrar todo» cobra exactamente lo que muestra", () => {
  const e = club();
  // Turno 1: Ana paga los cargos de Beto; se cierra la cancha y la mesa sigue.
  const r1 = mesa4(e, 18);
  M.checkIn(e, r1.id, ahora(18));
  M.consumoJugador(e, r1.id, 0, "p2", 1, {}, ahora(18, 30));
  M.consumoJugador(e, r1.id, 1, "p9", 3, {}, ahora(18, 30));
  M.asignarCargoCargos(e, M.cuentaDeJugador(e, r1, 1).id, M.cuentaDeJugador(e, r1, 0).id, ahora(18, 40));
  M.cerrarCanchaYSeguir(e, r1.id, { medio: "efectivo" }, ahora(19, 30));
  // Turno 2: Ana vuelve a jugar con otros; su cuenta (con lo de Beto a cargo) viene con ella.
  const r2 = turno(e, "c2", 19, { clienteId: "a", jugadores: [{ nombre: "Ana", clienteId: "a" }, "Zoe"] }, 30);
  M.checkIn(e, r2.id, ahora(19, 30));
  M.consumoJugador(e, r2.id, 1, "p2", 1, {}, ahora(20));
  const t = M.cuentaDelTurno(e, r2.id);
  const filas = t.jugadores.reduce((s: number, j: any) => s + j.aPagar, 0);
  assert.equal(filas, t.totales.pendiente, "las filas suman lo que dice «falta cobrar»");
  const antes = cajaIngresos(e);
  const res = M.cobrarTodoElTurno(e, r2.id, { medio: "efectivo" }, ahora(21));
  assert.ok(res.ok);
  assert.equal(res.total, t.totales.pendiente);
  assert.equal(cajaIngresos(e) - antes, t.totales.pendiente, "la caja sube lo que decía el botón");
  // La mesa del turno 1: los cargos de Beto los pagó Ana en el turno 2 → nada pendiente.
  assert.equal(M.cuentaDelTurno(e, r1.id).totales.pendiente, 0);
});

test("Gate B2 (al revés): la cuenta que paga alguien de otra mesa no se cobra acá ni se cuenta en el total", () => {
  const e = club();
  const r1 = mesa4(e, 18);
  M.checkIn(e, r1.id, ahora(18));
  M.consumoJugador(e, r1.id, 2, "k-mila", 1, {}, ahora(18, 30));
  const r2 = turno(e, "c2", 18, { clienteId: "d", jugadores: [{ nombre: "Dani", clienteId: "d" }] });
  M.checkIn(e, r2.id, ahora(18));
  M.consumoJugador(e, r2.id, 0, "p2", 1, {}, ahora(18, 30));
  M.asignarCargoCargos(e, M.cuentaDeJugador(e, r1, 2).id, M.cuentaDeJugador(e, r2, 0).id, ahora(18, 40));
  const t = M.cuentaDelTurno(e, r1.id);
  assert.equal(t.totales.cargos, 0);
  assert.equal(t.deOtraMesa.length, 1);
  assert.equal(M.cuentaDelTurno(e, r2.id).totales.cargos, 2000 + 14500, "la paga Dani en su mesa");
});

test("Gate B3: lo cobrado antes de las 12 es de la caja anterior; se avisa y se puede cerrar después", () => {
  const e = club();
  const S = "2026-10-17";
  M.ventaMostrador(e, [{ productoId: "p2", cant: 5 }], "efectivo", { fecha: S, min: 10 * 60 });
  M.ventaMostrador(e, [{ productoId: "p2", cant: 1 }], "efectivo", { fecha: S, min: 20 * 60 });
  const noche = { fecha: S, min: 23 * 60 };
  assert.deepEqual(M.cajasSinCerrar(e, noche), ["2026-10-16"]);
  assert.equal(M.cerrarCaja(e, { contado: 2000, ...DUENO }, noche).ok, true, "la de hoy (desde las 12)");
  assert.equal(e.caja.cierres[0].esperado, 2000);
  const vieja = M.cerrarCaja(e, { contado: 10000, ...DUENO, dia: "2026-10-16" }, noche);
  assert.ok(vieja.ok);
  assert.equal(vieja.cierre.esperado, 10000);
  assert.deepEqual(M.cajasSinCerrar(e, noche), []);
  assert.equal(M.cerrarCaja(e, { contado: 0, ...DUENO, dia: "2026-10-16" }, noche).ok, false, "no se cierra dos veces");
});

test("Gate menores: sin cobrar a una cancha cerrada; sin PIN vacío; respaldo con ids raros se rechaza", () => {
  const e = club();
  const r = turno(e, "c1", 20, { clienteId: "d" });
  M.checkIn(e, r.id, ahora(20));
  assert.ok(M.finalizar(e, r.id, { aCuenta: true }, ahora(21, 30)).ok);
  assert.match(M.registrarPago(e, r.id, { medio: "efectivo", monto: 1000 }, ahora(21, 31)).motivo, /ya está cerrada/);
  const real = M.crearClubReal(HOY);
  assert.equal(M.usuarioPorPin(real, ""), null);
  const foto = JSON.parse(JSON.stringify(M.serializarEstado(e)));
  foto.estado.reservas[0].id = '"><img src=x onerror=alert(1)>';
  assert.equal(M.hidratarEstado(foto).ok, false);
});

test("Fable B1: pagaron todos su parte, se extiende 30′ y «cobrar todo» cobra el resto entero", () => {
  const e = club();
  const r = mesa4(e);
  M.checkIn(e, r.id, ahora(20));
  assert.ok(M.cobrarTodoElTurno(e, r.id, { medio: "efectivo" }, ahora(20, 5)).ok);
  assert.ok(M.extender(e, r.id, 30, ahora(21)).ok);
  const falta = M.saldo(r);
  assert.ok(falta > 0);
  const antes = cajaIngresos(e);
  const res = M.cobrarTodoElTurno(e, r.id, { medio: "efectivo" }, ahora(21, 5));
  assert.ok(res.ok);
  assert.equal(res.total, falta);
  assert.equal(cajaIngresos(e) - antes, falta);
  assert.equal(M.saldo(r), 0);
});

test("Fable B4: desde el mostrador se carga un turno que ya empezó (mientras no terminó); desde la web no", () => {
  const e = club();
  assert.ok(M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 15 * 60, clienteId: "a" }, ahora(16)).ok, "15:00 a las 16:00 desde el mostrador");
  assert.match(M.crearReserva(e, { canchaId: "c2", fecha: HOY, inicio: 14 * 60, clienteId: "a" }, ahora(16)).motivo, /ya pasó/, "14:00–15:30 ya terminó");
  assert.match(M.crearReserva(e, { canchaId: "c3", fecha: HOY, inicio: 15 * 60, clienteId: "a", origen: "web" }, ahora(16)).motivo, /ya pasó/);
});

test("Fable I2/I3/M4: fondo de caja, conteo de stock, baja de producto y fiado que se usa en partes", () => {
  const e = M.crearClubReal(HOY);
  assert.ok(e.productos.filter((p: any) => !p.plato && !p.alquiler).every((p: any) => p.stock === null && p.codigoExterno === ""), "arranca sin stock ni códigos de ejemplo");
  assert.equal(M.alertas(e, ahora(10)).filter((a: any) => a.tipo === "stock").length, 0, "sin alertas de stock falsas");
  M.definirPinInicial(e, "u-rober", "57", ahora(9));
  const R = { usuarioId: "u-rober", pin: "57" };
  assert.ok(M.ajustarFondo(e, 20000, R, ahora(9)).ok);
  assert.equal(M.resumenCaja(e, M.diaDeCaja(e, HOY, 15 * 60)).efectivoEsperado, 20000);
  assert.ok(M.ajustarStock(e, "p2", 42, R, ahora(9)).ok);
  assert.equal(M.producto(e, "p2").stock, 42);
  assert.ok(M.bajaProducto(e, "p8", R, ahora(9)).ok);
  assert.ok(!M.catalogoTienda(e).some((p: any) => p.id === "p8"));
  const c = M.altaCliente(e, { nombre: "Juan", tel: "1155550001" }, ahora(9)).cliente;
  c.fiados.push({ monto: 25000, aprobo: "Roberto Ronco", usado: false });
  const { cuenta: a } = M.abrirCuenta(e, { clienteId: c.id }, ahora(10));
  M.cargarEnCuenta(e, a.id, "k-pica", 1, ahora(10));
  assert.ok(M.cerrarCuenta(e, a.id, { aCuenta: true }, ahora(11)).ok);
  assert.equal(c.fiados[0].monto, 4000, "del fiado de $25.000 quedan $4.000 para otra cuenta");
  assert.equal(c.fiados[0].usado, false);
});

test("limpieza para el go-live: se borra lo transaccional, se conserva lo maestro y (por defecto) los saldos", () => {
  const e = M.crearClubReal(HOY);
  M.definirPinInicial(e, "u-rober", "57", ahora(9));
  const R = { usuarioId: "u-rober", pin: "57" };
  M.terminarConfiguracion(e, ahora(9));
  M.ajustarFondo(e, 20000, R, ahora(9));
  M.ajustarStock(e, "p2", 40, R, ahora(9));
  const juan = M.altaCliente(e, { nombre: "Juan", tel: "1155550001" }, ahora(9)).cliente;
  const r = turno(e, "c1", 20, { clienteId: juan.id, jugadores: [{ nombre: "Juan", clienteId: juan.id }, "Pedro"] });
  M.checkIn(e, r.id, ahora(20));
  M.consumoJugador(e, r.id, 0, "p2", 2, {}, ahora(20, 10));
  M.cobrarTodoElTurno(e, r.id, { medio: "efectivo" }, ahora(21));
  juan.deuda = 5000; juan.monedero = 3000;
  assert.equal(M.limpiarParaGoLive(e, {}, { usuarioId: "u-rober", pin: "00" }, ahora(23)).ok, false, "con PIN de dueño");
  // Con la cancha en juego y la caja sin cerrar no se limpia: dice qué falta.
  const bloqueada = M.limpiarParaGoLive(e, {}, R, ahora(23));
  assert.equal(bloqueada.ok, false);
  assert.match(bloqueada.motivo, /Canchas en juego[\s\S]*Cajas sin cerrar/);
  M.cerrarCanchaYSeguir(e, r.id, {}, ahora(21, 30));
  assert.ok(M.cerrarCaja(e, { contado: 20000 + 42000 + 4000, ...R }, ahora(23)).ok);
  const res = M.limpiarParaGoLive(e, {}, R, ahora(23));
  assert.ok(res.ok);
  assert.equal(res.borrado.turnos, 1);
  assert.equal(e.reservas.length + e.cuentas.length + e.caja.movimientos.length + e.caja.cierres.length, 0);
  assert.equal(e.caja.fondo, 20000, "el fondo queda");
  assert.equal(M.producto(e, "p2").stock, 38, "el stock contado queda");
  assert.equal(e.usuarios.find((u: any) => u.id === "u-rober").pin, "57", "usuarios y PIN quedan");
  assert.equal(e.clientes.length, 1, "los clientes quedan");
  assert.equal(juan.deuda, 5000);
  assert.equal(juan.monedero, 3000);
  assert.equal(e.config.goLive.por, "Roberto Ronco");
  const foto = JSON.parse(JSON.stringify(M.serializarEstado(e)));
  assert.ok(M.hidratarEstado(foto).ok, "lo limpio se vuelve a abrir");
  const sinSaldos = M.limpiarParaGoLive(e, { conservarSaldos: false, conservarStock: false }, R, ahora(23, 5));
  assert.ok(sinSaldos.ok);
  assert.equal(juan.deuda + juan.monedero, 0);
  assert.equal(M.producto(e, "p2").stock, null);
});

test("go-live (Gate B2): la plata pendiente no se borra — bloquea con motivo, y los turnos por jugar quedan con su seña", () => {
  const e = club();
  // Turno del sábado 17 con seña cobrada (hoy es miércoles 14): tiene que quedar.
  const futuro = M.crearReserva(e, { canchaId: "c1", fecha: "2026-10-17", inicio: 20 * 60, clienteId: "c" }, ahora(10)).reserva;
  M.registrarPago(e, futuro.id, { medio: "transferencia", monto: 21000 }, ahora(10));
  // Mesa abierta con saldo y una pala alquilada.
  const r = turno(e, "c2", 18, { clienteId: "a" });
  M.checkIn(e, r.id, ahora(18));
  M.consumoJugador(e, r.id, 0, "p6", 1, {}, ahora(18, 10));
  M.consumoJugador(e, r.id, 0, "k-pica", 1, {}, ahora(18, 10));
  M.cerrarCanchaYSeguir(e, r.id, { medio: "efectivo" }, ahora(19, 30));
  const p1 = M.pendientesGoLive(e, ahora(22));
  assert.ok(p1.some((x: string) => /Cuentas de cargos abiertas/.test(x)), "la mesa abierta");
  assert.ok(p1.some((x: string) => /Cajas sin cerrar/.test(x)), "la caja");
  assert.equal(M.limpiarParaGoLive(e, {}, DUENO, ahora(22)).ok, false);
  M.cerrarCargosDelTurno(e, r.id, { medio: "efectivo" }, ahora(22));
  const stockPala = M.producto(e, "p6").stock;
  assert.equal(stockPala, 8, "la pala volvió al stock al cerrar la cuenta");
  for (const d of M.cajasConMovimientosSinCerrar(e)) assert.ok(M.cerrarCaja(e, { contado: M.resumenCaja(e, d).efectivoEsperado, ...DUENO, dia: d }, ahora(22)).ok);
  assert.deepEqual(M.pendientesGoLive(e, ahora(22)), []);
  const res = M.limpiarParaGoLive(e, {}, DUENO, ahora(22));
  assert.ok(res.ok, res.motivo);
  assert.deepEqual(e.reservas.map((x: any) => x.id), [futuro.id], "queda sólo el turno por jugar");
  assert.equal(M.cobrado(e.reservas[0]), 21000, "con su seña");
  assert.equal(M.producto(e, "p6").stock, 8);
});
