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
