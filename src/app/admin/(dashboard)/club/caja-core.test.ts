// La caja de 12 a 12 contra el motor REAL sobre la demo: la propiedad de plata (la caja es igual a lo cobrado, sin
// los créditos; el cajón es fondo + cobrado en efectivo − egresos − devuelto en mano), los egresos con concepto y
// PIN, el cierre con contado, diferencia y PIN, una sola vez, el fondo (sólo un dueño), los movimientos completos
// paginados y el aviso de las cajas que quedaron con movimientos sin cerrar.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub } from "@/lib/club/motor.mjs";
import { operadorDeLaDemo } from "./almacen";
import { MOVIMIENTOS_POR_PAGINA, PIN_VIEJO_CAJA, armarCaja, ejecutarCaja, leerMonto, pinesDeEjemplo, puedeAjustarFondo } from "./caja-core";
import { ejecutar } from "./cuenta-core";
import { ejecutarBuffet } from "./buffet-core";

const HOY = "2026-10-17";
const AHORA: Ahora = { fecha: HOY, min: 19 * 60 + 10 };
const demo = (): { e: EstadoClub; auth: Auth } => {
  const e = M.generarDemo(HOY, AHORA.min);
  return { e, auth: operadorDeLaDemo(e, "RECEPTION")!.auth };
};

/** Todo lo cobrado (cancha y cargos), por fuera de la caja: la suma de los pagos sin créditos. */
function cobradoFueraDeLaCaja(e: EstadoClub): number {
  const r = e.reservas.flatMap((x) => x.pagos).filter((p) => p.medio !== "monedero").reduce((s, p) => s + p.monto, 0);
  const c = e.cuentas.flatMap((x) => x.pagos).filter((p) => p.medio !== "monedero").reduce((s, p) => s + p.monto, 0);
  return r + c;
}
const ingresosDeCaja = (e: EstadoClub) => M.resumenCaja(e).ingresos;

test("caja = cobrado: después de un día mezclado (seña, por jugador, todo, buffet, créditos), lo que entró a la caja es lo cobrado", () => {
  const { e, auth } = demo();
  const delta0 = ingresosDeCaja(e) - cobradoFueraDeLaCaja(e);
  const enJuego = e.reservas.filter((x) => x.fecha === HOY && x.estado === "en_cancha");
  const sinSena = e.reservas.find((x) => x.fecha === HOY && x.estado === "reservada" && x.sena.monto > 0 && !x.sena.pagada)!;
  assert.equal(ejecutar(e, sinSena.id, { tipo: "cobrarSena", medio: "mercadopago" }, AHORA, auth).ok, true);
  assert.equal(ejecutar(e, enJuego[0].id, { tipo: "cobrarJugador", idx: 1, medio: "efectivo" }, AHORA, auth).ok, true);
  assert.equal(ejecutar(e, enJuego[0].id, { tipo: "cobrarTodo", medio: "debito" }, AHORA, auth).ok, true);
  assert.equal(ejecutar(e, enJuego[1].id, { tipo: "cerrarYSeguir", medio: "efectivo" }, AHORA, auth).ok, true);
  assert.equal(ejecutar(e, enJuego[1].id, { tipo: "cerrarCargos", medio: "transferencia" }, AHORA, auth).ok, true);
  const conCreditos = M.cuentasAbiertas(e).find((c) => c.clienteId && M.saldoCuenta(c) > 0 && !c.aCargoDe)!;
  M.cliente(e, conCreditos.clienteId!)!.monedero += 100000;
  assert.equal(ejecutarBuffet(e, { tipo: "cobrar", cuentaId: conCreditos.id, medio: "monedero" }, AHORA, auth).ok, true);
  assert.equal(ingresosDeCaja(e) - cobradoFueraDeLaCaja(e), delta0, "cada peso cobrado entró una vez, y los créditos no entraron");
  // Y la vista de la caja suma lo mismo que el motor.
  const v = armarCaja(e, AHORA);
  assert.equal(v.ingresos, M.resumenCaja(e, v.dia).ingresos);
  assert.equal(v.porMedio.reduce((s, m) => s + m.monto, 0), v.ingresos - v.egresos);
  assert.equal(v.efectivoEsperado, v.fondo + v.porMedio.find((m) => m.medio === M.MEDIOS.efectivo)!.monto);
});

test("egreso con concepto: sale del efectivo esperado; sin concepto o sin monto, no", () => {
  const { e, auth } = demo();
  const antes = armarCaja(e, AHORA);
  assert.equal(ejecutarCaja(e, { tipo: "egreso", monto: "5.000", concepto: "  ", pin: auth.pin! }, AHORA, auth).ok, false);
  assert.equal(ejecutarCaja(e, { tipo: "egreso", monto: "", concepto: "Hielo", pin: auth.pin! }, AHORA, auth).ok, false);
  const d = ejecutarCaja(e, { tipo: "egreso", monto: "$ 5.000", concepto: "Hielo", pin: auth.pin! }, AHORA, auth);
  assert.equal(d.ok, true, d.mensaje);
  const despues = armarCaja(e, AHORA);
  assert.equal(despues.efectivoEsperado, antes.efectivoEsperado - 5000);
  assert.equal(despues.egresos, antes.egresos + 5000);
  assert.equal(despues.movimientos[0].concepto, "Hielo");
  assert.equal(despues.movimientos[0].tipo, "egreso");
});

test("cierre: contado contra esperado con la diferencia; una sola vez; lo cobrado después entra en la caja siguiente", () => {
  const { e, auth } = demo();
  const v = armarCaja(e, AHORA);
  assert.equal(ejecutarCaja(e, { tipo: "cerrar", contado: "", dia: null, pin: auth.pin! }, AHORA, auth).ok, false, "sin contar no se cierra");
  const d = ejecutarCaja(e, { tipo: "cerrar", contado: String(v.efectivoEsperado - 1000), dia: null, pin: auth.pin! }, AHORA, auth);
  assert.equal(d.ok, true, d.mensaje);
  assert.match(d.mensaje, /faltan \$ 1\.000/);
  assert.equal(ejecutarCaja(e, { tipo: "cerrar", contado: "0", dia: null, pin: auth.pin! }, AHORA, auth).ok, false, "una caja se cierra una sola vez");
  const despues = armarCaja(e, AHORA);
  assert.notEqual(despues.dia, v.dia, "lo que se cobre ahora entra en la caja siguiente");
  assert.equal(despues.cierres[0].dia, v.dia);
  assert.equal(despues.cierres[0].diferencia, -1000);
  assert.match(despues.titulo, /de 12:00 del/);
});

test("aviso de cajas con movimientos sin cerrar, y se cierran con su día", () => {
  const { e, auth } = demo();
  const v = armarCaja(e, AHORA);
  const sinCerrar = M.cajasConMovimientosSinCerrar(e).filter((d) => d !== v.dia);
  assert.deepEqual(v.atrasadas.map((a) => a.dia), sinCerrar);
  // La caja de la mañana (antes de las 12) es del día anterior: un cobro a las 11 deja esa caja con movimientos.
  const r = e.reservas.find((x) => x.fecha === HOY && x.estado === "en_cancha" && M.saldo(x) > 0)!;
  assert.equal(M.registrarPago(e, r.id, { medio: "efectivo", monto: 1000 }, { fecha: HOY, min: 11 * 60 }).ok, true);
  const ayer = M.sumarDias(HOY, -1);
  const conManana = armarCaja(e, AHORA);
  assert.ok(conManana.atrasadas.some((a) => a.dia === ayer), "la caja de ayer (de 12 a 12) quedó sin cerrar");
  const d = ejecutarCaja(e, { tipo: "cerrar", contado: "0", dia: ayer, pin: auth.pin! }, AHORA, auth);
  assert.equal(d.ok, true, d.mensaje);
  assert.ok(!armarCaja(e, AHORA).atrasadas.some((a) => a.dia === ayer));
});

test("leerMonto entiende lo que se tipea en el mostrador", () => {
  assert.equal(leerMonto("12.500"), 12500);
  assert.equal(leerMonto("$ 12.500"), 12500);
  assert.equal(leerMonto("12500"), 12500);
  assert.ok(Number.isNaN(leerMonto("")));
  assert.ok(Number.isNaN(leerMonto("doce")));
});

const DUENIO = (e: EstadoClub) => operadorDeLaDemo(e, "OWNER")!.auth;
const movs = (e: EstadoClub) => e.caja.movimientos.length;

test("caja = fondo + cobrado − egresos − devuelto en mano (el efectivo del cajón)", () => {
  const { e, auth } = demo();
  const antes = armarCaja(e, AHORA);
  const efectivo = (v: ReturnType<typeof armarCaja>) => v.porMedio.find((m) => m.medio === M.MEDIOS.efectivo)!.monto;
  // El dueño sube el fondo de caja.
  assert.equal(ejecutarCaja(e, { tipo: "fondo", monto: String(antes.fondo + 10000) }, AHORA, DUENIO(e)).ok, true);
  // Cobros en efectivo y uno digital (que no toca el cajón).
  const enJuego = e.reservas.find((x) => x.fecha === HOY && x.estado === "en_cancha" && M.saldo(x) > 3000)!;
  assert.equal(M.registrarPago(e, enJuego.id, { medio: "efectivo", monto: 3000 }, AHORA).ok, true);
  assert.equal(M.registrarPago(e, enJuego.id, { medio: "mercadopago", monto: 1000 }, AHORA).ok, true);
  // Un turno sin ficha paga $ 6.000 en efectivo, el club lo cancela y se le devuelven en mano.
  const sinFicha = M.crearReserva(e, { canchaId: "c4", fecha: M.sumarDias(HOY, 1), inicio: 10 * 60, titular: "Sin ficha" }, AHORA);
  assert.ok(sinFicha.ok);
  assert.equal(M.registrarPago(e, sinFicha.reserva.id, { medio: "efectivo", monto: 6000 }, AHORA).ok, true);
  const can = M.cancelar(e, sinFicha.reserva.id, { porClub: true }, AHORA);
  assert.ok(can.ok && can.devolverEnMano === 6000, "queda para devolver en mano");
  assert.equal(M.marcarDevuelto(e, sinFicha.reserva.id, "efectivo", AHORA).ok, true);
  // Un egreso con PIN.
  assert.equal(ejecutarCaja(e, { tipo: "egreso", monto: "2.500", concepto: "Hielo", pin: auth.pin! }, AHORA, auth).ok, true);

  const despues = armarCaja(e, AHORA);
  assert.equal(despues.fondo, antes.fondo + 10000);
  assert.equal(despues.efectivoEsperado, antes.efectivoEsperado + 10000 + 3000 + 6000 - 6000 - 2500);
  assert.equal(despues.efectivoEsperado, despues.fondo + efectivo(despues), "el cajón es el fondo más el efectivo neto");
  assert.equal(despues.ingresos, antes.ingresos + 3000 + 1000 + 6000);
  assert.equal(despues.egresos, antes.egresos + 6000 + 2500);
  assert.equal(despues.movimientos.find((m) => m.concepto === "Devolución a Sin ficha")?.tipo, "egreso");
});

test("egreso: sin PIN, con PIN ajeno o equivocado, o con monto inválido, no pasa y no mueve la caja", () => {
  const { e, auth } = demo();
  const n = movs(e);
  const intento = (monto: string, pin: string, a: Auth = auth) => ejecutarCaja(e, { tipo: "egreso", monto, concepto: "Hielo", pin }, AHORA, a);
  assert.match(intento("5000", "").mensaje, /Poné tu PIN/);
  assert.match(intento("5000", "  ").mensaje, /Poné tu PIN/);
  assert.equal(intento("5000", "99").mensaje, "PIN incorrecto.");
  assert.equal(intento("5000", DUENIO(e).pin!).mensaje, "PIN incorrecto.", "el PIN de otro no vale para quien opera");
  assert.match(intento("5000", "33", {}).mensaje, /Elegí quién/, "sin operador no pasa");
  for (const monto of ["", "0", "-500", "doce"]) assert.equal(intento(monto, auth.pin!).ok, false, `monto «${monto}»`);
  assert.equal(movs(e), n, "nada entró ni salió");
  assert.equal(intento("5000", auth.pin!).ok, true);
  const v = armarCaja(e, AHORA);
  assert.equal(v.movimientos[0].quien, operadorDeLaDemo(e, "RECEPTION")!.usuario.nombre, "el egreso queda a nombre de quien opera");
});

test("cierre: no pasa sin el PIN de quien puede cerrar; con el PIN, una vez", () => {
  const { e, auth } = demo();
  const v = armarCaja(e, AHORA);
  const cerrar = (pin: string, a: Auth = auth) => ejecutarCaja(e, { tipo: "cerrar", contado: String(v.efectivoEsperado), dia: null, pin }, AHORA, a);
  assert.match(cerrar("").mensaje, /Poné tu PIN/);
  assert.equal(cerrar("12").mensaje, "PIN incorrecto.");
  assert.match(cerrar(auth.pin!, {}).mensaje, /Elegí quién/);
  // Un usuario dado de baja no cierra aunque sepa su PIN.
  const lu = M.usuario(e, auth.usuarioId!)!;
  lu.activo = false;
  assert.equal(cerrar(auth.pin!).ok, false);
  lu.activo = true;
  assert.equal(e.caja.cierres.length, 0, "ningún intento dejó un cierre");
  const d = cerrar(auth.pin!);
  assert.equal(d.ok, true, d.mensaje);
  assert.match(d.mensaje, /la caja cuadra/);
  assert.equal(e.caja.cierres[0].responsable, lu.nombre);
});

test("cierre de hoy: abierta → cerrada → lo cobrado después queda en la siguiente y se puede cerrar", () => {
  const { e, auth } = demo();
  assert.deepEqual(armarCaja(e, AHORA).cierreDeHoy, { tipo: "abierta" });
  const v = armarCaja(e, AHORA);
  assert.equal(ejecutarCaja(e, { tipo: "cerrar", contado: String(v.efectivoEsperado), dia: null, pin: auth.pin! }, AHORA, auth).ok, true);
  const cerrada = armarCaja(e, AHORA);
  assert.equal(cerrada.cierreDeHoy.tipo, "cerrada");
  assert.equal(cerrada.totalMovimientos, 0, "la caja siguiente arranca vacía");
  const r = e.reservas.find((x) => x.fecha === HOY && x.estado === "en_cancha" && M.saldo(x) > 0)!;
  assert.equal(M.registrarPago(e, r.id, { medio: "efectivo", monto: 1000 }, AHORA).ok, true);
  const siguiente = armarCaja(e, AHORA);
  assert.equal(siguiente.cierreDeHoy.tipo, "siguiente");
  assert.ok(siguiente.cierreDeHoy.tipo === "siguiente" && siguiente.cierreDeHoy.dia === siguiente.dia);
  assert.equal(siguiente.totalMovimientos, 1);
  const d = ejecutarCaja(e, { tipo: "cerrar", contado: String(siguiente.efectivoEsperado), dia: siguiente.dia, pin: auth.pin! }, AHORA, auth);
  assert.equal(d.ok, true, d.mensaje);
});

test("fondo de caja: sólo quien puede configurar (un dueño), 0 o más; sin PIN", () => {
  const { e, auth } = demo();
  assert.equal(puedeAjustarFondo(e, auth.usuarioId), false, "recepción no");
  assert.equal(puedeAjustarFondo(e, DUENIO(e).usuarioId), true);
  assert.equal(puedeAjustarFondo(e, undefined), false);
  const fondo = e.caja.fondo;
  assert.equal(ejecutarCaja(e, { tipo: "fondo", monto: "50000" }, AHORA, auth).ok, false);
  assert.equal(e.caja.fondo, fondo);
  for (const monto of ["", "-1", "mucho"]) assert.equal(ejecutarCaja(e, { tipo: "fondo", monto }, AHORA, DUENIO(e)).ok, false, monto);
  const d = ejecutarCaja(e, { tipo: "fondo", monto: "$ 30.000" }, AHORA, { usuarioId: DUENIO(e).usuarioId });
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(d.mensaje, "Fondo de caja: $ 30.000.");
  assert.equal(ejecutarCaja(e, { tipo: "fondo", monto: "0" }, AHORA, DUENIO(e)).ok, true);
  assert.equal(armarCaja(e, AHORA).fondo, 0);
});

test("los PIN de ejemplo de la demo, rotulados por nombre", () => {
  const { e } = demo();
  assert.equal(pinesDeEjemplo(e), "Rober 1111 · Majo 2222 · Lu 33 · Caro 44");
});

test("movimientos completos: hora, concepto, quién, medio; los de la mañana con su fecha; paginados de a 40", (t) => {
  const { e, auth } = demo();
  for (let i = 0; i < 90; i++) assert.equal(ejecutarCaja(e, { tipo: "egreso", monto: String(100 + i), concepto: `Gasto ${i}`, pin: auth.pin! }, { fecha: HOY, min: 13 * 60 + i }, auth).ok, true);
  const v = armarCaja(e, AHORA);
  assert.equal(v.movimientos.length, MOVIMIENTOS_POR_PAGINA);
  assert.ok(v.totalMovimientos >= 90);
  assert.equal(armarCaja(e, AHORA, 1000).movimientos.length, v.totalMovimientos, "con «Ver más» se ven todos");
  const gasto = armarCaja(e, AHORA, 1000).movimientos.find((m) => m.concepto === "Gasto 0")!;
  assert.deepEqual({ hora: gasto.hora, medio: gasto.medio, monto: gasto.monto, tipo: gasto.tipo }, { hora: "13:00", medio: M.MEDIOS.efectivo, monto: 100, tipo: "egreso" });
  assert.ok(gasto.quien);
  // Lo cobrado a la 1 de la madrugada (pasa de 1440) es de la misma caja, con la fecha del día siguiente.
  const r = e.reservas.find((x) => x.fecha === HOY && x.estado === "en_cancha" && M.saldo(x) > 0)!;
  assert.equal(M.registrarPago(e, r.id, { medio: "efectivo", monto: 500 }, { fecha: HOY, min: 25 * 60 }).ok, true);
  const madrugada = armarCaja(e, { fecha: HOY, min: 25 * 60 + 5 });
  assert.equal(madrugada.dia, HOY);
  assert.match(madrugada.movimientos[0].hora, /^(\d+\/\d+ )?01:00$/);
  t.diagnostic(`la caja del día con ${v.totalMovimientos} movimientos`);
});

test("rendimiento: abrir la caja con un mes de movimientos (y un mes de cajas sin cerrar)", (t) => {
  const { e } = demo();
  // 30 días hacia atrás, 150 movimientos por día: lo que deja un mes sin limpiar.
  for (let d = 1; d <= 30; d++) {
    const fecha = M.sumarDias(HOY, -d);
    for (let i = 0; i < 150; i++) {
      e.caja.movimientos.push({ id: `mx-${d}-${i}`, tipo: i % 10 ? "ingreso" : "egreso", medio: i % 3 ? "efectivo" : "mercadopago", monto: 1000 + i, concepto: `Mov ${i}`, reservaId: null, usuario: null, fecha, min: 13 * 60 + (i % 600), caja: fecha });
    }
  }
  const n = e.caja.movimientos.length;
  const t0 = performance.now();
  const v = armarCaja(e, AHORA);
  const sinCerrar = performance.now() - t0;
  assert.equal(v.atrasadas.length, 30, "las 30 cajas sin cerrar, avisadas");
  // Con el mes cerrado (lo normal): sólo cuenta la caja de hoy.
  for (let d = 1; d <= 30; d++) e.caja.cierres.push({ dia: M.sumarDias(HOY, -d), responsable: "Rober", fecha: M.sumarDias(HOY, -d), min: 23 * 60, esperado: 0, contado: 0, diferencia: 0, ingresos: 0, egresos: 0 });
  const t1 = performance.now();
  const cerrado = armarCaja(e, AHORA);
  const conCierres = performance.now() - t1;
  assert.equal(cerrado.atrasadas.length, 0);
  assert.ok(cerrado.movimientos.length <= MOVIMIENTOS_POR_PAGINA);
  t.diagnostic(`${n} movimientos: armar la caja ${sinCerrar.toFixed(1)} ms con 30 cajas sin cerrar, ${conCierres.toFixed(1)} ms con el mes cerrado (CPU normal)`);
  assert.ok(sinCerrar < 250 && conCierres < 100, "abrir la caja no se traba");
});

test("un dueño con el PIN VIEJO (el de 2 del piloto) no hace egresos ni cierra la caja con él; recepción con el suyo de 2, sí", () => {
  const e = M.generarDemo(HOY, AHORA.min);
  const duenio = e.usuarios.find((u) => u.rol === "duenio" && u.activo !== false)!;
  duenio.pin = "57";
  const auth: Auth = { usuarioId: duenio.id, pin: "57" };
  const antes = armarCaja(e, AHORA);
  assert.deepEqual(ejecutarCaja(e, { tipo: "egreso", monto: "1000", concepto: "Hielo", pin: "57" }, AHORA, auth), { ok: false, mensaje: PIN_VIEJO_CAJA });
  assert.deepEqual(ejecutarCaja(e, { tipo: "cerrar", contado: "0", dia: null, pin: "57" }, AHORA, auth), { ok: false, mensaje: PIN_VIEJO_CAJA });
  assert.equal(armarCaja(e, AHORA).egresos, antes.egresos, "nada salió del cajón");
  const recepcion = operadorDeLaDemo(e, "RECEPTION")!.auth;
  assert.equal(recepcion.pin!.length, 2, "recepción sigue con 2 dígitos");
  const d = ejecutarCaja(e, { tipo: "egreso", monto: "1000", concepto: "Hielo", pin: recepcion.pin! }, AHORA, recepcion);
  assert.equal(d.ok, true, d.mensaje);
});
