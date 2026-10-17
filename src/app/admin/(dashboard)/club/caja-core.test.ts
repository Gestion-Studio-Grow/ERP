// La caja de 12 a 12 contra el motor REAL sobre la demo: la propiedad de plata (la caja es igual a lo cobrado, sin
// los créditos), los egresos con concepto, el cierre con contado y diferencia, una sola vez, y el aviso de las cajas
// que quedaron con movimientos sin cerrar.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub } from "@/lib/club/motor.mjs";
import { operadorDeLaDemo } from "./almacen";
import { armarCaja, ejecutarCaja, leerMonto } from "./caja-core";
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
  assert.equal(ejecutarCaja(e, { tipo: "egreso", monto: "5.000", concepto: "  " }, AHORA, auth).ok, false);
  assert.equal(ejecutarCaja(e, { tipo: "egreso", monto: "", concepto: "Hielo" }, AHORA, auth).ok, false);
  const d = ejecutarCaja(e, { tipo: "egreso", monto: "$ 5.000", concepto: "Hielo" }, AHORA, auth);
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
  assert.equal(ejecutarCaja(e, { tipo: "cerrar", contado: "", dia: null }, AHORA, auth).ok, false, "sin contar no se cierra");
  const d = ejecutarCaja(e, { tipo: "cerrar", contado: String(v.efectivoEsperado - 1000), dia: null }, AHORA, auth);
  assert.equal(d.ok, true, d.mensaje);
  assert.match(d.mensaje, /faltan \$ 1\.000/);
  assert.equal(ejecutarCaja(e, { tipo: "cerrar", contado: "0", dia: null }, AHORA, auth).ok, false, "una caja se cierra una sola vez");
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
  const d = ejecutarCaja(e, { tipo: "cerrar", contado: "0", dia: ayer }, AHORA, auth);
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
