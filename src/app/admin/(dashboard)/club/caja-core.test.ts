// La caja de 12 a 12 contra el motor REAL sobre la demo: la propiedad de plata (la caja es igual a lo cobrado, sin
// los créditos; el cajón es fondo + cobrado en efectivo − egresos − devuelto en mano), los egresos con concepto y
// PIN, el cierre con contado, diferencia y PIN, una sola vez, el fondo (sólo un dueño), los movimientos completos
// paginados y el aviso de las cajas que quedaron con movimientos sin cerrar.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub } from "@/lib/club/motor.mjs";
import { operadorDeLaDemo } from "./almacen";
import { MOVIMIENTOS_POR_PAGINA, PIN_VIEJO_CAJA, type AccionCaja, armarCaja, armarTurno, ejecutarCaja, firmantes, leerMonto, movimientosALaVista, pinesDeEjemplo, puedeAjustarFondo, puedeFirmarCierres } from "./caja-core";
import { ejecutar } from "./cuenta-core";
import { ejecutarBuffet } from "./buffet-core";

const HOY = "2026-10-17";
const AHORA: Ahora = { fecha: HOY, min: 19 * 60 + 10 };
const demo = (): { e: EstadoClub; auth: Auth } => {
  const e = M.generarDemo(HOY, AHORA.min);
  // La demo trae las cajas de los días pasados cerradas (Tanda 2B); estas pruebas parten de la semana sin cerrar.
  e.caja.cierres = [];
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
  const { e } = demo();
  const auth = DUENIO(e); // el egreso viejo y el cierre los firma un PIN de 4 (D-16)
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
  const { e } = demo();
  const auth = DUENIO(e); // el egreso viejo y el cierre los firma un PIN de 4 (D-16)
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
  const { e } = demo();
  const auth = DUENIO(e); // el egreso viejo y el cierre los firma un PIN de 4 (D-16)
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
  const { e } = demo();
  const auth = DUENIO(e); // el egreso viejo y el cierre los firma un PIN de 4 (D-16)
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
  const { e } = demo();
  const auth = DUENIO(e); // el egreso viejo y el cierre los firma un PIN de 4 (D-16)
  const n = movs(e);
  const intento = (monto: string, pin: string, a: Auth = auth) => ejecutarCaja(e, { tipo: "egreso", monto, concepto: "Hielo", pin }, AHORA, a);
  assert.match(intento("5000", "").mensaje, /Poné tu PIN/);
  assert.match(intento("5000", "  ").mensaje, /Poné tu PIN/);
  assert.equal(intento("5000", "99").mensaje, "PIN incorrecto.");
  assert.equal(intento("5000", operadorDeLaDemo(e, "RECEPTION")!.auth.pin!).mensaje, "PIN incorrecto.", "el PIN de otro no vale para quien opera");
  assert.match(intento("5000", "33", {}).mensaje, /Elegí quién/, "sin operador no pasa");
  for (const monto of ["", "0", "-500", "doce"]) assert.equal(intento(monto, auth.pin!).ok, false, `monto «${monto}»`);
  assert.equal(movs(e), n, "nada entró ni salió");
  assert.equal(intento("5000", auth.pin!).ok, true);
  const v = armarCaja(e, AHORA);
  assert.equal(v.movimientos[0].quien, operadorDeLaDemo(e, "OWNER")!.usuario.nombre, "el egreso queda a nombre de quien opera");
});

test("cierre: no pasa sin el PIN de quien puede cerrar; con el PIN, una vez", () => {
  const { e } = demo();
  const auth = DUENIO(e); // el egreso viejo y el cierre los firma un PIN de 4 (D-16)
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
  const { e } = demo();
  const auth = DUENIO(e); // el egreso viejo y el cierre los firma un PIN de 4 (D-16)
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
  const { e } = demo();
  const auth = DUENIO(e); // el egreso viejo y el cierre los firma un PIN de 4 (D-16)
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

test("un dueño con el PIN VIEJO (el de 2 del piloto) no hace egresos ni cierra la caja con él; recepción con el suyo de 2 tampoco (firma de 4, D-16)", () => {
  const e = M.generarDemo(HOY, AHORA.min);
  const duenio = e.usuarios.find((u) => u.rol === "duenio" && u.activo !== false)!;
  duenio.pin = "57";
  const auth: Auth = { usuarioId: duenio.id, pin: "57" };
  const antes = armarCaja(e, AHORA);
  assert.deepEqual(ejecutarCaja(e, { tipo: "egreso", monto: "1000", concepto: "Hielo", pin: "57" }, AHORA, auth), { ok: false, mensaje: PIN_VIEJO_CAJA, pin: "malo" });
  assert.deepEqual(ejecutarCaja(e, { tipo: "cerrar", contado: "0", dia: null, pin: "57" }, AHORA, auth), { ok: false, mensaje: PIN_VIEJO_CAJA, pin: "malo" });
  assert.equal(armarCaja(e, AHORA).egresos, antes.egresos, "nada salió del cajón");
  const recepcion = operadorDeLaDemo(e, "RECEPTION")!.auth;
  assert.equal(recepcion.pin!.length, 2, "recepción sigue con 2 dígitos");
  const d = ejecutarCaja(e, { tipo: "egreso", monto: "1000", concepto: "Hielo", pin: recepcion.pin! }, AHORA, recepcion);
  assert.equal(d.ok, false, d.mensaje);
  assert.match(d.mensaje, /PIN de 4 dígitos/);
  assert.equal(armarCaja(e, AHORA).egresos, antes.egresos, "nada salió del cajón");
});

// ── Tanda B4: el turno de caja a ciegas, la firma de 4, corregir medio, retiro y egreso por categoría ──────────────

test("B4 · el turno a ciegas: la vista del turno abierto no trae ningún importe esperado; contado, se ve y se firma con PIN de 4", () => {
  const { e, auth } = demo();
  const v = armarTurno(e, AHORA);
  assert.ok(v.movimientos > 0);
  assert.equal(v.paraFirmar, null);
  // Nada de lo esperado: ni efectivo ni medios (el texto de la vista no trae el efectivo esperado).
  assert.ok(!v.firma.includes(String(armarCaja(e, AHORA).efectivoEsperado)), "lo esperado no está en la vista del turno");
  const sinContar = ejecutarCaja(e, { tipo: "contarTurno", dia: null, contado: {}, billetes: {}, movimientos: v.movimientos, medios: v.medios, numero: v.numero, huella: v.huella }, AHORA, auth);
  assert.equal(sinContar.ok, false, "sin efectivo contado no");
  const t = M.turnoDeCajaAbierto(e, v.dia);
  const contado: Record<string, string> = Object.fromEntries(["mercadopago", "transferencia", "debito"].map((k) => [k, String(t.esperado[k as "debito"])]));
  const d = ejecutarCaja(e, { tipo: "contarTurno", dia: null, contado, billetes: { monedas: String(t.esperado.efectivo - 500) }, movimientos: v.movimientos, medios: v.medios, numero: v.numero, huella: v.huella }, AHORA, auth);
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(d.pin, null, "contar no lleva PIN");
  assert.match(d.mensaje, /Faltan \$ 500/);
  const f = armarTurno(e, AHORA).paraFirmar!;
  assert.equal(f.diferencia, -500);
  assert.equal(f.pideMotivo, true);
  assert.equal(f.lineas.find((l) => l.clave === "efectivo")!.esperado, t.esperado.efectivo, "ahora sí se ve lo esperado");
  // Recepción con su PIN de 2: el PIN es suyo («bueno» para el tope) pero no firma.
  const corto = ejecutarCaja(e, { tipo: "cerrarTurno", turnoId: f.turnoId, motivo: "vuelto", firmaId: null, pin: auth.pin!, medios: f.medios }, AHORA, auth);
  assert.equal(corto.ok, false);
  assert.equal(corto.pin, "bueno");
  assert.match(corto.mensaje, /PIN de 4/);
  // Un dueño firma: con un PIN equivocado cuenta como malo; con otros medios que los del turno, no.
  const rober = e.usuarios.find((u) => u.rol === "duenio")!;
  assert.equal(ejecutarCaja(e, { tipo: "cerrarTurno", turnoId: f.turnoId, motivo: "vuelto", firmaId: rober.id, pin: "0000", medios: f.medios }, AHORA, auth).pin, "malo");
  assert.equal(ejecutarCaja(e, { tipo: "cerrarTurno", turnoId: f.turnoId, motivo: "vuelto", firmaId: rober.id, pin: M.pinDeEjemplo(rober), medios: ["efectivo"] }, AHORA, auth).ok, false);
  const ok = ejecutarCaja(e, { tipo: "cerrarTurno", turnoId: f.turnoId, motivo: "vuelto", firmaId: rober.id, pin: M.pinDeEjemplo(rober), medios: f.medios }, AHORA, auth);
  assert.equal(ok.ok, true, ok.mensaje);
  assert.equal(ok.evento?.tipo, "caja.turno.cerrada");
  const despues = armarTurno(e, AHORA);
  assert.equal(despues.paraFirmar, null);
  assert.equal(despues.numero, 2);
  assert.equal(despues.puedeCerrarDia, true);
  assert.match(despues.turnos[0].texto, /firmó/);
  const dia = ejecutarCaja(e, { tipo: "cerrarDia", dia: null, firmaId: rober.id, pin: M.pinDeEjemplo(rober) }, AHORA, auth);
  assert.equal(dia.ok, true, dia.mensaje);
  assert.match(dia.mensaje, /con 1 turnos: faltan \$ 500/);
});

test("B4 · corregir medio desde la caja: sólo los cobros del turno abierto, con motivo; el rastro se ve en el movimiento", () => {
  const { e, auth } = demo();
  const v = armarCaja(e, AHORA, 500);
  const m = v.movimientos.find((x) => x.corregible && x.medioClave === "efectivo")!;
  assert.ok(m, "hay un cobro en efectivo corregible");
  assert.equal(v.movimientos.some((x) => x.tipo === "egreso" && x.corregible), false, "un egreso no se corrige");
  assert.equal(ejecutarCaja(e, { tipo: "corregirMedio", movimientoId: m.id, medio: "mercadopago", motivo: "" }, AHORA, auth).ok, false);
  const d = ejecutarCaja(e, { tipo: "corregirMedio", movimientoId: m.id, medio: "mercadopago", motivo: "se equivocó de botón" }, AHORA, auth);
  assert.equal(d.ok, true, d.mensaje);
  const visto = armarCaja(e, AHORA, 500).movimientos.find((x) => x.id === m.id)!;
  assert.equal(visto.medioClave, "mercadopago");
  assert.equal(visto.rastro.length, 1);
  assert.match(visto.rastro[0], /^Efectivo → Mercado Pago \(QR\) · .+ · se equivocó de botón$/);
});

test("B4 · retiro a caja fuerte y egreso por categoría desde la caja: firma de 4 y sale del cajón", () => {
  const { e, auth } = demo();
  const rober = e.usuarios.find((u) => u.rol === "duenio")!;
  const firma = { firmaId: rober.id, pin: M.pinDeEjemplo(rober) };
  const antes = armarCaja(e, AHORA).efectivoEsperado;
  assert.equal(ejecutarCaja(e, { tipo: "retiro", monto: "5.000", comprobante: "", firmaId: null, pin: "" }, AHORA, auth).ok, false, "sin PIN no");
  const r = ejecutarCaja(e, { tipo: "retiro", monto: "5.000", comprobante: "sobre 3", ...firma }, AHORA, auth);
  assert.equal(r.ok, true, r.mensaje);
  const g = ejecutarCaja(e, { tipo: "egresoCategoria", monto: "2.000", categoria: "insumos", concepto: "hielo", comprobante: "", ...firma }, AHORA, auth);
  assert.equal(g.ok, true, g.mensaje);
  assert.equal(armarCaja(e, AHORA).efectivoEsperado, antes - 7000);
  assert.equal(firmantes(e)[0].duenio, true, "primero los dueños");
});

// ── Certificación B4 (F1, F2, F3): el día por turnos atrasado, la firma del egreso viejo y del cierre, el conteo re-aplicado ──

const duenioDe = (e: EstadoClub) => e.usuarios.find((u) => u.rol === "duenio" && u.activo !== false)!;
const venderEfectivo = (e: EstadoClub, ahora: Ahora) => {
  const p = e.productos.find((x) => x.precio > 0 && x.stock == null)!;
  assert.ok(M.ventaMostrador(e, [{ productoId: p.id, cant: 1 }], "efectivo", ahora).ok);
};
/** Cuenta (con lo justo) y firma el turno abierto del día que muestra la pantalla (`dia`: el de una caja atrasada). */
function contarYFirmarTurno(e: EstadoClub, auth: Auth, ahora: Ahora, dia: string | null = null) {
  const v = armarTurno(e, ahora, dia);
  const t = M.turnoDeCajaAbierto(e, v.dia);
  const contado = Object.fromEntries(["mercadopago", "transferencia", "debito"].map((k) => [k, String(t.esperado[k as "debito"])]));
  const c = ejecutarCaja(e, { tipo: "contarTurno", dia, contado, billetes: { monedas: String(t.esperado.efectivo) }, movimientos: v.movimientos, medios: v.medios, numero: v.numero, huella: v.huella }, ahora, auth);
  assert.equal(c.ok, true, c.mensaje);
  const f = armarTurno(e, ahora, dia).paraFirmar!;
  const d = duenioDe(e);
  const s = ejecutarCaja(e, { tipo: "cerrarTurno", turnoId: f.turnoId, motivo: "", firmaId: d.id, pin: M.pinDeEjemplo(d), medios: f.medios }, ahora, auth);
  assert.equal(s.ok, true, s.mensaje);
}

test("F1 · un día por turnos que pasó el corte de las 12 se cierra desde «cajas atrasadas»: se cuenta su turno abierto y se consolida ese día", () => {
  const { e, auth } = demo();
  contarYFirmarTurno(e, auth, AHORA);
  venderEfectivo(e, { fecha: HOY, min: 23 * 60 }); // turno 2 abierto del 17
  const despues: Ahora = { fecha: M.sumarDias(HOY, 1), min: 13 * 60 };
  const atrasada = armarCaja(e, despues).atrasadas.find((a) => a.dia === HOY)!;
  assert.equal(atrasada.porTurnos, true, "la pantalla sabe que el 17 se cierra por turnos");
  const v = armarTurno(e, despues, HOY);
  assert.equal(v.dia, HOY, "el cierre por turnos mira el día elegido, no el 18");
  assert.equal(v.numero, 2);
  assert.equal(v.movimientos, 1);
  contarYFirmarTurno(e, auth, despues, HOY);
  assert.equal(armarTurno(e, despues, HOY).puedeCerrarDia, true);
  const d = duenioDe(e);
  const c = ejecutarCaja(e, { tipo: "cerrarDia", dia: HOY, firmaId: d.id, pin: M.pinDeEjemplo(d) }, despues, auth);
  assert.equal(c.ok, true, c.mensaje);
  assert.ok(M.cajaCerrada(e, HOY));
  assert.ok(!armarCaja(e, despues).atrasadas.some((a) => a.dia === HOY));
  assert.equal(armarTurno(e, despues, HOY).dia, M.cajaAbierta(e, despues), "un día ya cerrado no se vuelve a mirar");
});

test("F2 · recepción con su PIN de 2 no anota egresos por la vía vieja ni cierra una caja atrasada (D-16); con firma de 4, sí", () => {
  const { e, auth } = demo();
  assert.equal(String(auth.pin).length, 2);
  const n = movs(e);
  const eg = ejecutarCaja(e, { tipo: "egreso", monto: "1000", concepto: "Hielo", pin: auth.pin! }, AHORA, auth);
  assert.equal(eg.ok, false, eg.mensaje);
  assert.match(eg.mensaje, /PIN de 4 dígitos/);
  assert.equal(eg.pin, "bueno", "el PIN era el suyo: no cuenta como intento malo");
  assert.equal(movs(e), n, "nada salió del cajón");
  const despues: Ahora = { fecha: M.sumarDias(HOY, 1), min: 13 * 60 };
  const atrasada = armarCaja(e, despues).atrasadas[0];
  const c = ejecutarCaja(e, { tipo: "cerrar", contado: String(atrasada.efectivoEsperado), dia: atrasada.dia, pin: auth.pin! }, despues, auth);
  assert.equal(c.ok, false, c.mensaje);
  assert.equal(e.caja.cierres.length, 0);
  const d = duenioDe(e);
  const firmada = ejecutarCaja(e, { tipo: "cerrar", contado: String(atrasada.efectivoEsperado), dia: atrasada.dia, pin: M.pinDeEjemplo(d), firmaId: d.id }, despues, auth);
  assert.equal(firmada.ok, true, firmada.mensaje);
  assert.equal(e.caja.cierres[0].responsable, d.nombre, "cierra a nombre de quien firma");
});

test("F2 · un firmaId inexistente o de baja no esquiva el largo de firma: ni egreso viejo ni cierre viejo con PIN de 2", () => {
  const { e, auth } = demo();
  const n = movs(e);
  const baja = e.usuarios.find((u) => u.id !== auth.usuarioId)!;
  baja.activo = false;
  for (const firmaId of ["nadie", baja.id]) {
    const eg = ejecutarCaja(e, { tipo: "egreso", monto: "5000", concepto: "Hielo", pin: auth.pin!, firmaId } as never, AHORA, auth);
    assert.equal(eg.ok, false, eg.mensaje);
    assert.equal(eg.pin, "bueno", "se evalúa el PIN de quien opera");
    assert.equal(movs(e), n, "nada salió del cajón");
  }
  const despues: Ahora = { fecha: M.sumarDias(HOY, 1), min: 13 * 60 };
  const atrasada = armarCaja(e, despues).atrasadas[0];
  for (const firmaId of ["nadie", baja.id]) {
    const c = ejecutarCaja(e, { tipo: "cerrar", contado: String(atrasada.efectivoEsperado), dia: atrasada.dia, pin: auth.pin!, firmaId }, despues, auth);
    assert.equal(c.ok, false, c.mensaje);
  }
  assert.equal(e.caja.cierres.length, 0);
});

test("F3 · el conteo re-aplicado sin internet no cae en OTRO turno aunque coincidan la cantidad de movimientos y los medios", () => {
  const { e, auth } = demo();
  e.caja.movimientos = [];
  venderEfectivo(e, { fecha: HOY, min: 13 * 60 });
  venderEfectivo(e, { fecha: HOY, min: 13 * 60 + 5 });
  const visto = armarTurno(e, AHORA); // lo que vio el puesto A sin internet
  contarYFirmarTurno(e, auth, { fecha: HOY, min: 14 * 60 }); // el puesto B cuenta y firma el turno 1
  venderEfectivo(e, { fecha: HOY, min: 15 * 60 });
  venderEfectivo(e, { fecha: HOY, min: 15 * 60 + 5 });
  const accion = { tipo: "contarTurno" as const, dia: null, contado: {}, billetes: { monedas: "999999" }, movimientos: visto.movimientos, medios: visto.medios, numero: visto.numero, huella: visto.huella };
  const a = ejecutarCaja(e, accion, { fecha: HOY, min: 16 * 60 }, auth);
  assert.equal(a.ok, false, a.mensaje);
  assert.match(a.mensaje, /volvé a contar/);
  assert.equal(M.turnosDelDia(e, HOY).length, 1, "no se selló el turno 2 con lo contado del 1");
  // Mismo número, otros movimientos (misma cantidad y medios): tampoco.
  const otro = armarTurno(e, AHORA);
  assert.equal(ejecutarCaja(e, { ...accion, numero: otro.numero }, { fecha: HOY, min: 16 * 60 }, auth).ok, false);
  // Con lo que de verdad tiene el turno abierto, sí.
  assert.equal(ejecutarCaja(e, { ...accion, numero: otro.numero, huella: otro.huella }, { fecha: HOY, min: 16 * 60 }, auth).ok, true);
});

test("F3 (vuelta 4) · un conteo SIN número ni huella no cae con la regla vieja (cantidad + medios) en otro turno: se vuelve a contar", () => {
  const { e, auth } = demo();
  e.caja.movimientos = [];
  venderEfectivo(e, { fecha: HOY, min: 13 * 60 });
  venderEfectivo(e, { fecha: HOY, min: 13 * 60 + 5 });
  const visto = armarTurno(e, AHORA);
  contarYFirmarTurno(e, auth, { fecha: HOY, min: 14 * 60 });
  venderEfectivo(e, { fecha: HOY, min: 15 * 60 });
  venderEfectivo(e, { fecha: HOY, min: 15 * 60 + 5 });
  const ahora = { fecha: HOY, min: 16 * 60 };
  // Misma cantidad (2) y mismos medios (efectivo) que el turno 2: con la regla vieja se aplicaba al turno equivocado.
  const base = { tipo: "contarTurno" as const, dia: null, contado: {}, billetes: { monedas: "999999" }, movimientos: visto.movimientos, medios: visto.medios };
  const ataques = [
    base,
    { ...base, numero: visto.numero },
    { ...base, huella: visto.huella },
    { ...base, numero: "2", huella: visto.huella },
    { ...base, numero: 2, huella: "" },
    { ...base, numero: Number.NaN, huella: visto.huella },
  ];
  for (const a of ataques) {
    const r = ejecutarCaja(e, a as unknown as AccionCaja, ahora, auth);
    assert.equal(r.ok, false, `${JSON.stringify(a)} → ${r.mensaje}`);
    assert.match(r.mensaje, /volvé a contar/);
  }
  assert.equal(M.turnosDelDia(e, HOY).length, 1, "ningún conteo selló el turno 2");
  assert.ok(e.caja.movimientos.filter((m) => !m.turno).length === 2, "los dos cobros del turno 2 siguen sin turno");
  // El conteo de la pantalla (con número y huella del turno abierto) sigue andando: F3 no se reabre y nada se trabó.
  const actual = armarTurno(e, ahora);
  assert.equal(ejecutarCaja(e, { ...base, numero: actual.numero, huella: actual.huella }, ahora, auth).ok, true);
});

test("B4-C1 · arqueo a ciegas: a quien no firma cierres la lista del turno abierto le va sin importes; contado el turno, vuelven", () => {
  const { e, auth } = demo();
  const recepcion = operadorDeLaDemo(e, "RECEPTION")!.usuario.id;
  const duenio = operadorDeLaDemo(e, "OWNER")!.usuario.id;
  assert.equal(puedeFirmarCierres(e, recepcion), false, "recepción (PIN de 2) opera pero no firma");
  assert.equal(puedeFirmarCierres(e, duenio), true);
  assert.equal(puedeFirmarCierres(e, undefined), false);
  const v = armarCaja(e, AHORA);
  assert.ok(v.movimientos.length > 0 && v.movimientos.every((m) => m.delTurnoAbierto));
  const ciega = movimientosALaVista(v.movimientos, puedeFirmarCierres(e, recepcion));
  assert.ok(ciega.every((m) => m.monto === null), "ningún importe a la vista: no se puede sumar el esperado");
  assert.ok(ciega.every((m, i) => m.concepto === v.movimientos[i].concepto && m.medio === v.movimientos[i].medio && m.hora === v.movimientos[i].hora), "concepto, medio y hora sí");
  assert.deepEqual(movimientosALaVista(v.movimientos, true).map((m) => m.monto), v.movimientos.map((m) => m.monto), "quien firma ve todo");
  // Con el largo de firma en 2 (configurable, D-16), recepción firma y ve los importes.
  e.config.caja = { ...(e.config.caja ?? {}), largoPinFirma: 2 };
  assert.equal(puedeFirmarCierres(e, recepcion), true);
  delete (e.config.caja as { largoPinFirma?: number }).largoPinFirma;
  // Contado el turno, sus movimientos ya no son del turno abierto: el esperado se vio al contar.
  const t = armarTurno(e, AHORA);
  const esperado = M.turnoDeCajaAbierto(e, t.dia).esperado;
  const contado: Record<string, string> = Object.fromEntries(["mercadopago", "transferencia", "debito"].map((k) => [k, String(esperado[k as "debito"])]));
  assert.equal(ejecutarCaja(e, { tipo: "contarTurno", dia: null, contado, billetes: { monedas: String(esperado.efectivo) }, movimientos: t.movimientos, medios: t.medios, numero: t.numero, huella: t.huella }, AHORA, auth).ok, true);
  const despues = armarCaja(e, AHORA);
  assert.ok(movimientosALaVista(despues.movimientos, false).every((m) => m.monto !== null), "los del turno contado van con importe");
});
