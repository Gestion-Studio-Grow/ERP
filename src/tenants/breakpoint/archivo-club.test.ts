// Tests del archivo de días cerrados del club (archivarDiasCerrados en public/previews/breakpoint/club/motor.mjs).
// El estado de la jornada real crece ~2,9 MB por mes de club lleno y el navegador guarda ~5 MB: lo cerrado se pasa a
// un anexo descargable y en el estado queda un resumen. Lo que se prueba acá es que eso no pierda ni duplique un peso
// y que todo lo que se sigue usando (días sin archivar, saldos, pendientes) se vea igual que antes.
//
// — Elaborado por GSG
import { test } from "node:test";
import assert from "node:assert/strict";
import * as motor from "../../../public/previews/breakpoint/club/motor.mjs";
import { armarMesCargado, HOY_TORNEO } from "./mes-cargado.fixture";

// El motor es JS plano: los tipos que TypeScript infiere son demasiado estrechos para armar escenarios a mano.
/* eslint-disable @typescript-eslint/no-explicit-any -- ver la nota de arriba: este archivo opera sobre el motor sin tipos */
const M: any = motor;

const en = (fecha: string, hh: number, mm = 0) => ({ fecha, min: hh * 60 + mm });
const DUENO = { usuarioId: "u-rober", pin: "1111" };
const RECEP = { usuarioId: "u-lu", pin: "33" };
const AHORA_MES = en(HOY_TORNEO, 19); // sábado 17/10/2026, 19:00
const bytes = (x: unknown) => JSON.stringify(x).length;

function exigir<T extends { ok: boolean }>(r: T, que: string): T {
  if (!r.ok) throw new Error(`${que}: ${(r as any).motivo}`);
  return r;
}

/** Suma, día por día, la plata del estado podado y la del anexo. */
function sumaPorDia(...partes: Record<string, Record<string, number>>[]) {
  const out: Record<string, Record<string, number>> = {};
  for (const p of partes)
    for (const [dia, f] of Object.entries(p)) {
      const x = (out[dia] ??= { canchas: 0, cuentas: 0, monedero: 0, ingresos: 0, egresos: 0 });
      for (const k of Object.keys(x)) x[k] += f[k] ?? 0;
    }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

/** La plata del anexo, como la calcula el motor (mismas listas que el estado). */
const plataAnexo = (anexo: any) => M.plataPorDia(anexo);

/** Todo lo que lee una pantalla de los últimos días: tiene que dar igual antes y después de archivar. */
function vistas(e: any, ahora: { fecha: string; min: number }) {
  const hoy = ahora.fecha;
  const semana = Array.from({ length: 7 }, (_, i) => M.sumarDias(hoy, i - 6));
  return {
    alertas: M.alertas(e, ahora),
    kpis: M.kpis(e, hoy, ahora),
    calor: M.mapaDeCalor(e, semana),
    platos: M.metricasPlatos(e, { desde: M.sumarDias(hoy, -6), hasta: hoy }),
    rentabilidad: M.rentabilidad(e, { desde: M.sumarDias(hoy, -6), hasta: hoy }),
    cajasSinCerrar: M.cajasSinCerrar(e, ahora),
    cajasConMovimientosSinCerrar: M.cajasConMovimientosSinCerrar(e),
    pendientesGoLive: M.pendientesGoLive(e, ahora),
    cajaHoy: M.resumenCaja(e, M.cajaAbierta(e, ahora)),
    audiencias: Object.keys(M.AUDIENCIAS).map((a) => M.destinatarios(e, a, ahora)),
    senaWeb: e.clientes.map((c: any) => M.requiereSenaWeb(e, c.id)),
    mesas: M.mesasAbiertas(e).map((m: any) => [m.reserva.id, m.cuentas.map((c: any) => c.id), m.saldo]),
    deudas: e.clientes.map((c: any) => [c.id, c.deuda, c.monedero, c.strikes]),
    proveedores: e.proveedores.map((p: any) => M.deudaConProveedor(e, p.id)),
    // Lo de la semana que se ve en la agenda: todos los turnos desde hace 7 días.
    agenda: e.reservas.filter((r: any) => r.fecha >= M.sumarDias(hoy, -7)).map((r: any) => r.id),
  };
}

/** Un mes de club lleno (fixture) + algo por venir y algo vivo hoy. */
function mesConVida() {
  const foto = armarMesCargado(HOY_TORNEO, 30);
  const e: any = foto.estado;
  // El fixture se armó con la copia del motor (otro contador de ids): éste sigue desde ahí para no repetir ids.
  M.retomarSecuencia(foto.secuencia);
  // Turnos por venir (mañana y la semana que viene) y uno de hoy ya en cancha con la mesa abierta.
  const manana = exigir(M.crearReserva(e, { canchaId: "c1", fecha: M.sumarDias(HOY_TORNEO, 1), inicio: 18 * 60, clienteId: "k5" }, AHORA_MES), "turno de mañana").reserva;
  exigir(M.crearReserva(e, { canchaId: "c2", fecha: M.sumarDias(HOY_TORNEO, 7), inicio: 20 * 60, clienteId: "k6" }, AHORA_MES), "turno de la semana que viene");
  const hoy = exigir(M.crearReserva(e, { canchaId: "c3", fecha: HOY_TORNEO, inicio: 18 * 60 + 30, clienteId: "k7" }, en(HOY_TORNEO, 18)), "turno de hoy").reserva;
  if (hoy.sena.monto > 0) exigir(M.registrarPago(e, hoy.id, { medio: "efectivo", monto: hoy.sena.monto }, en(HOY_TORNEO, 18, 20)), "seña de hoy");
  exigir(M.checkIn(e, hoy.id, en(HOY_TORNEO, 18, 25)), "abrir la cancha de hoy");
  exigir(M.consumoJugador(e, hoy.id, 0, "p2", 2, {}, en(HOY_TORNEO, 18, 50)), "cargo de hoy");
  return { foto, e, manana };
}

// ── El mes cargado ──

test("mes cargado: archivar no pierde ni duplica un peso (estado = podado + anexo, día por día, al centavo)", () => {
  const { e } = mesConVida();
  const original = structuredClone(e);
  const hasta = M.diaParaArchivar(e, AHORA_MES);
  assert.equal(hasta, M.sumarDias(HOY_TORNEO, -M.DIAS_SIN_ARCHIVAR));
  const res = M.archivarDiasCerrados(e, hasta, { ahora: AHORA_MES, por: "Rober" });
  assert.equal(res.ok, true);
  assert.equal(res.vacio, false);
  assert.deepEqual(e, original, "la entrada no se toca (la función es pura)");

  assert.deepEqual(sumaPorDia(M.plataPorDia(res.estado), plataAnexo(res.anexo)), sumaPorDia(M.plataPorDia(original)));
  // Y en total: caja = Σ pagos sin monedero.
  const total = (p: Record<string, Record<string, number>>) => Object.values(p).reduce((s, f) => s + f.canchas + f.cuentas, 0);
  assert.equal(total(M.plataPorDia(res.estado)) + total(plataAnexo(res.anexo)), total(M.plataPorDia(original)));

  // Nada se pierde: cada turno, cuenta y movimiento está en uno de los dos lados (y en uno solo).
  for (const [lista, estado, anexo] of [
    ["reservas", original.reservas, [...res.estado.reservas, ...res.anexo.reservas]],
    ["cuentas", original.cuentas, [...res.estado.cuentas, ...res.anexo.cuentas]],
    ["movimientos", original.caja.movimientos, [...res.estado.caja.movimientos, ...res.anexo.movimientos]],
  ] as const) {
    assert.equal(anexo.length, estado.length, lista);
    assert.deepEqual(new Set(anexo.map((x: any) => x.id)), new Set(estado.map((x: any) => x.id)), lista);
  }

  // El anexo: autocontenido y sólo de días ≤ hasta con la caja cerrada.
  assert.equal(res.anexo.v, 1);
  assert.equal(res.anexo.tipo, "anexo-jornada");
  assert.equal(res.anexo.hasta, hasta);
  assert.ok(res.anexo.desde <= hasta);
  assert.ok(res.anexo.reservas.length > 300, `archivó ${res.anexo.reservas.length} turnos`);
  for (const r of res.anexo.reservas) assert.ok(r.fecha <= hasta && ["finalizada", "cancelada", "no_show", "suspendida"].includes(r.estado));
  for (const m of res.anexo.movimientos) assert.ok(m.caja <= hasta && M.cajaCerrada(original, m.caja));
  for (const c of res.anexo.cuentas) assert.equal(c.estado, "cerrada");
  assert.ok(res.anexo.clientes.every((c: any) => c.id && c.nombre && !("tel" in c)));
  // Los cierres de caja se quedan en el estado (y van copiados al anexo).
  assert.deepEqual(res.estado.caja.cierres, original.caja.cierres);
  assert.ok(res.anexo.cierres.length > 0 && res.anexo.cierres.every((c: any) => c.dia <= hasta));

  // El resumen que queda en el estado coincide con lo que se fue.
  const dias = res.estado.archivo.dias;
  assert.equal(res.estado.archivo.hasta, hasta);
  assert.equal(dias.reduce((s: number, f: any) => s + f.turnos, 0), res.anexo.reservas.filter((r: any) => r.estado === "finalizada").length);
  assert.equal(dias.reduce((s: number, f: any) => s + f.ingresosCaja - f.egresosCaja, 0), res.anexo.movimientos.reduce((s: number, m: any) => s + (m.tipo === "ingreso" ? m.monto : -m.monto), 0));
  assert.equal(res.estado.archivo.anexos.length, 1);
});

test("mes cargado: los días sin archivar, los turnos por venir y lo vivo se ven igual", () => {
  const { e, manana } = mesConVida();
  const antes = vistas(e, AHORA_MES);
  const res = M.archivarDiasCerrados(e, M.diaParaArchivar(e, AHORA_MES), { ahora: AHORA_MES });
  assert.deepEqual(vistas(res.estado, AHORA_MES), antes);
  // Los turnos por venir quedan idénticos.
  const futuros = (x: any) => x.reservas.filter((r: any) => r.fecha >= HOY_TORNEO);
  assert.deepEqual(futuros(res.estado), futuros(e));
  assert.deepEqual(M.reserva(res.estado, manana.id), M.reserva(e, manana.id));
  // Lo maestro no se toca.
  for (const k of ["productos", "usuarios", "canchas", "proveedores", "fijos", "config", "contenido", "remitos", "pagosProveedor"]) assert.deepEqual(res.estado[k], e[k], k);
  assert.deepEqual(res.estado.caja.fondo, e.caja.fondo);
});

test("mes cargado: idempotente — archivar otra vez lo mismo no cambia nada; en dos pasos da lo mismo que en uno", () => {
  const { e } = mesConVida();
  const h1 = M.sumarDias(HOY_TORNEO, -25);
  const h2 = M.diaParaArchivar(e, AHORA_MES);
  const una = M.archivarDiasCerrados(e, h2, { ahora: AHORA_MES });
  const otra = M.archivarDiasCerrados(una.estado, h2, { ahora: AHORA_MES });
  assert.equal(otra.ok, true);
  assert.equal(otra.vacio, true);
  assert.deepEqual(otra.estado, una.estado);
  assert.equal(otra.anexo.reservas.length + otra.anexo.movimientos.length + otra.anexo.cuentas.length, 0);

  const paso1 = M.archivarDiasCerrados(e, h1, { ahora: AHORA_MES });
  const paso2 = M.archivarDiasCerrados(paso1.estado, h2, { ahora: AHORA_MES });
  const ids = (x: any[]) => x.map((y) => y.id).sort();
  assert.deepEqual(ids(paso2.estado.reservas), ids(una.estado.reservas));
  assert.deepEqual(ids(paso2.estado.caja.movimientos), ids(una.estado.caja.movimientos));
  assert.deepEqual(ids([...paso1.anexo.reservas, ...paso2.anexo.reservas]), ids(una.anexo.reservas));
  assert.deepEqual(paso2.estado.archivo.dias, una.estado.archivo.dias);
  assert.deepEqual(paso2.estado.archivo.clientes, una.estado.archivo.clientes);
  assert.equal(paso2.estado.archivo.anexos.length, 2);
  assert.deepEqual(sumaPorDia(M.plataPorDia(paso2.estado), plataAnexo(paso1.anexo), plataAnexo(paso2.anexo)), sumaPorDia(M.plataPorDia(e)));
});

test("mes cargado: medida del tamaño antes y después (bytes del sobre v1)", () => {
  const { foto, e } = mesConVida();
  const sobre = (estado: unknown) => ({ ...foto, estado });
  const antes = bytes(sobre(e));
  const conDefecto = M.archivarDiasCerrados(e, M.diaParaArchivar(e, AHORA_MES), { ahora: AHORA_MES });
  const alMaximo = M.archivarDiasCerrados(e, M.diaParaArchivar(e, AHORA_MES, 7), { ahora: AHORA_MES });
  const d21 = bytes(sobre(conDefecto.estado));
  const d7 = bytes(sobre(alMaximo.estado));
  console.log(`# tamaño del sobre v1, un mes lleno: ${antes} → ${d21} (archivando lo de más de 21 días; anexo ${bytes(conDefecto.anexo)}) → ${d7} (más de 7 días; anexo ${bytes(alMaximo.anexo)})`);
  assert.ok(d21 < antes * 0.75, "con 21 días se va al menos un cuarto del mes");
  assert.ok(d7 < antes * 0.35, "con 7 días queda menos de un tercio");
  // El resumen que queda en el estado es chico: menos de 300 bytes por día archivado.
  assert.ok(bytes(alMaximo.estado.archivo) < alMaximo.estado.archivo.dias.length * 300 + bytes(alMaximo.estado.archivo.clientes) + 2000);
});

test("no archiva la última semana ni un día que no es fecha", () => {
  const { e } = mesConVida();
  assert.equal(M.archivarDiasCerrados(e, M.sumarDias(HOY_TORNEO, -3), { ahora: AHORA_MES }).ok, false);
  assert.equal(M.archivarDiasCerrados(e, "ayer", { ahora: AHORA_MES }).ok, false);
  assert.equal(M.archivarDiasCerrados(e, M.sumarDias(HOY_TORNEO, -7), { ahora: AHORA_MES }).ok, true);
  assert.equal(M.diaParaArchivar(e, AHORA_MES, 2), M.sumarDias(HOY_TORNEO, -7), "nunca propone menos de una semana");
});

// ── Escenario a mano: lo que NO se archiva ──

const D1 = "2026-09-01"; // martes
const D2 = "2026-09-02";
const D3 = "2026-09-03";
const D10 = "2026-09-10";
const HOY = "2026-10-01";
const AHORA = en(HOY, 19);

function club() {
  return M.crearEstado({
    // Clientes de siempre: sin «seña a los nuevos» (esa regla tiene sus tests en motor.test.ts y alta-core.test.ts).
    config: { ...M.CONFIG_DEMO, politica: { ...M.CONFIG_DEMO.politica, senaNuevos: false } },
    canchas: M.CANCHAS_DEMO,
    clientes: [
      { id: "a", nombre: "Ana", tel: "5491100000001" },
      { id: "b", nombre: "Beto", tel: "5491100000002", monedero: 30000 },
      { id: "c", nombre: "Caro", tel: "5491100000003" },
      { id: "d", nombre: "Dani", tel: "5491100000004", cc: { habilitada: true, limite: 200000 } },
    ],
    productos: M.PRODUCTOS_DEMO,
    usuarios: M.USUARIOS_DEMO,
    proveedores: M.PROVEEDORES_DEMO,
  });
}

const turno = (e: any, fecha: string, cancha: string, hh: number, datos: object, reservado = en(fecha, 9)) =>
  exigir(M.crearReserva(e, { canchaId: cancha, fecha, inicio: hh * 60, ...datos }, reservado), `turno ${fecha} ${hh}`).reserva;

function cerrarCajaDe(e: any, dia: string, cuando: { fecha: string; min: number }) {
  exigir(M.cerrarCaja(e, { contado: M.resumenCaja(e, dia).efectivoEsperado, ...DUENO, dia }, cuando), `cerrar la caja del ${dia}`);
}

/** Un club con un poco de todo el 1/9 (caja cerrada), cosas sin cerrar el 2/9 y el 3/9, y un cargo a cuenta el 10/9. */
function escenario() {
  const e = club();
  // 1/9: turno jugado y cobrado con su mesa, cobro con créditos, a cuenta corriente de Dani, venta de mostrador.
  const jugado = turno(e, D1, "c1", 18, { clienteId: "a", jugadores: [{ nombre: "Ana", clienteId: "a" }, { nombre: "Beto", clienteId: "b" }] });
  exigir(M.checkIn(e, jugado.id, en(D1, 17, 55)), "abrir");
  exigir(M.consumoJugador(e, jugado.id, 0, "p2", 2, {}, en(D1, 18, 30)), "cargo");
  exigir(M.cobrarJugador(e, jugado.id, 1, { medio: "monedero" }, en(D1, 19, 25)), "Beto paga con créditos");
  exigir(M.cobrarTodoElTurno(e, jugado.id, { medio: "efectivo" }, en(D1, 19, 30)), "cobrar todo");
  if (jugado.estado === "en_cancha") exigir(M.finalizar(e, jugado.id, {}, en(D1, 19, 31)), "cerrar");

  const aCuenta = turno(e, D1, "c2", 18, { clienteId: "d" });
  exigir(M.checkIn(e, aCuenta.id, en(D1, 18)), "abrir Dani");
  exigir(M.finalizar(e, aCuenta.id, { aCuenta: true }, en(D1, 19, 30)), "Dani a cuenta corriente");
  exigir(M.cobrarDeuda(e, "d", { medio: "transferencia", monto: 10000 }, en(D1, 20)), "Dani paga una parte");

  // Fiado aprobado y usado por Caro.
  const cta = exigir(M.abrirCuenta(e, { clienteId: "c" }, en(D1, 20)), "cuenta de Caro").cuenta;
  exigir(M.cargarEnCuenta(e, cta.id, "p9", 2, en(D1, 20)), "cervezas");
  const nov = exigir(M.solicitarCredito(e, { clienteId: "c", tipo: "fiado", monto: 7600, cuentaId: cta.id }, RECEP, en(D1, 20, 5)), "pedir fiado").novedad;
  exigir(M.resolverCredito(e, nov.id, { aprobar: true }, DUENO, en(D1, 20, 10)), "aprobar fiado");
  exigir(M.cerrarCuenta(e, cta.id, { aCuenta: true }, en(D1, 20, 15)), "fiado usado");

  // Tienda: un pedido entregado, uno cancelado.
  const pd = exigir(M.crearPedidoTienda(e, { items: [{ productoId: "p1", cant: 1 }], nombre: "Ana" }, en(D1, 10)), "pedido").pedido;
  exigir(M.entregarPedido(e, pd.id, { medio: "mercadopago" }, en(D1, 21)), "entregar");
  const pd2 = exigir(M.crearPedidoTienda(e, { items: [{ productoId: "p2", cant: 1 }], nombre: "Beto" }, en(D1, 10)), "pedido 2").pedido;
  exigir(M.cancelarPedido(e, pd2.id, en(D1, 11)), "cancelar pedido");

  // Lo que tiene plata o algo pendiente el 1/9 y NO se archiva:
  //   · una cancelación tardía con seña en suspenso;
  const suspenso = turno(e, D1, "c3", 20, { clienteId: "b", conSena: true });
  exigir(M.registrarPago(e, suspenso.id, { medio: "efectivo", monto: suspenso.sena.monto }, en(D1, 10)), "seña");
  exigir(M.cancelar(e, suspenso.id, {}, en(D1, 19)), "cancela tarde");
  //   · una falta de alguien sin ficha, sin cobrar;
  const falta = turno(e, D1, "c4", 21, { titular: "Sin Ficha", conSena: false });
  exigir(M.marcarNoShow(e, falta.id, {}, en(D1, 21, 30)), "falta sin ficha");
  //   · un turno cancelado por el club a alguien sin ficha, con la plata para devolver;
  const devolver = turno(e, D1, "c3", 9, { titular: "Otro Sin Ficha", conSena: true });
  exigir(M.registrarPago(e, devolver.id, { medio: "efectivo", monto: devolver.sena.monto }, en(D1, 8, 30)), "seña a devolver");
  exigir(M.cancelar(e, devolver.id, { porClub: true }, en(D1, 8, 40)), "cancela el club");
  //   · una cancha cerrada con la mesa que sigue cargando (cuenta abierta).
  const mesa = turno(e, D1, "c2", 21, { clienteId: "a" });
  exigir(M.checkIn(e, mesa.id, en(D1, 21)), "abrir mesa");
  exigir(M.consumoJugador(e, mesa.id, 0, "k-pica", 1, {}, en(D1, 21, 30)), "picada");
  exigir(M.cerrarCanchaYSeguir(e, mesa.id, { medio: "efectivo" }, en(D1, 22, 30)), "la mesa sigue");

  // Cierre de la caja del 1/9 a las 23:50; después, una venta a las 23:55 entra en la caja siguiente (2/9).
  cerrarCajaDe(e, D1, en(D1, 23, 50));
  exigir(M.ventaMostrador(e, [{ productoId: "p10", cant: 1 }], "efectivo", en(D1, 23, 55)), "venta después del cierre");

  // 3/9: un turno jugado y cobrado, pero esa caja NADIE la cerró.
  const sinCerrar = turno(e, D3, "c1", 18, { clienteId: "c", conSena: false });
  exigir(M.checkIn(e, sinCerrar.id, en(D3, 18)), "abrir 3/9");
  exigir(M.cobrarTodoElTurno(e, sinCerrar.id, { medio: "debito" }, en(D3, 19, 30)), "cobrar 3/9");
  if (sinCerrar.estado === "en_cancha") exigir(M.finalizar(e, sinCerrar.id, {}, en(D3, 19, 31)), "cerrar 3/9");

  // 10/9: otra cancha de Dani a cuenta corriente (después del corte: queda en la cuenta corriente).
  const dani10 = turno(e, D10, "c1", 18, { clienteId: "d" });
  exigir(M.checkIn(e, dani10.id, en(D10, 18)), "abrir Dani 10/9");
  exigir(M.finalizar(e, dani10.id, { aCuenta: true }, en(D10, 19, 30)), "Dani 10/9 a cuenta");

  // Un turno por venir.
  const futuro = turno(e, M.sumarDias(HOY, 2), "c1", 20, { clienteId: "a" }, AHORA);
  return { e, jugado, aCuenta, cta, pd, pd2, suspenso, falta, devolver, mesa, sinCerrar, dani10, futuro, nov };
}

test("lo que tiene plata o algo pendiente se queda; lo terminado en caja cerrada se va", () => {
  const s = escenario();
  const res = M.archivarDiasCerrados(s.e, D3, { ahora: AHORA });
  assert.equal(res.ok, true);
  const se = (id: string) => res.anexo.reservas.some((r: any) => r.id === id);
  const queda = (id: string) => !!M.reserva(res.estado, id);
  assert.ok(se(s.jugado.id) && !queda(s.jugado.id), "el turno jugado y cobrado del 1/9 se archiva");
  assert.ok(se(s.aCuenta.id), "el turno pasado a cuenta corriente se archiva (la deuda está en la ficha)");
  assert.ok(queda(s.suspenso.id) && !se(s.suspenso.id), "la seña en suspenso se queda");
  assert.ok(queda(s.falta.id), "la falta sin ficha sin cobrar se queda");
  assert.ok(queda(s.devolver.id), "la plata para devolver se queda");
  assert.ok(queda(s.mesa.id), "la cancha con la mesa que sigue cargando se queda");
  assert.ok(queda(s.sinCerrar.id), "el turno del 3/9 se queda: esa caja no se cerró");
  assert.ok(queda(s.futuro.id), "el turno por venir no se toca");
  assert.ok(queda(s.dani10.id), "lo del 10/9 (después de hasta) no se toca");
  assert.ok(res.estado.cuentas.some((c: any) => c.estado === "abierta" && c.reservaId === s.mesa.id), "la mesa abierta sigue");
  assert.deepEqual(M.mesasAbiertas(res.estado).map((m: any) => m.reserva.id), [s.mesa.id]);
  // La venta de las 23:55 entró en la caja del 2/9, que no se cerró: su cuenta y su movimiento se quedan.
  const despues = M.cajasConMovimientosSinCerrar(res.estado);
  assert.deepEqual(despues, M.cajasConMovimientosSinCerrar(s.e));
  assert.ok(despues.includes(D2) && despues.includes(D3));
  assert.equal(M.resumenCaja(res.estado, D2).ingresos, M.resumenCaja(s.e, D2).ingresos);
  assert.equal(M.resumenCaja(res.estado, D1).movimientos, 0, "los movimientos de la caja cerrada del 1/9 se van");
  assert.ok(M.cajaCerrada(res.estado, D1), "el cierre del 1/9 se queda");
  // Tienda y créditos.
  assert.ok(res.anexo.pedidos.some((p: any) => p.id === s.pd.id) && res.anexo.pedidos.some((p: any) => p.id === s.pd2.id));
  assert.ok(res.anexo.novedades.some((n: any) => n.id === s.nov.id), "el pedido de crédito resuelto se archiva");
  assert.equal(M.cliente(res.estado, "c").fiados.length, 0, "el fiado usado se archiva");
  assert.equal(res.anexo.fiados[0].clienteId, "c");
  // Plata al centavo y pendientes iguales.
  assert.deepEqual(sumaPorDia(M.plataPorDia(res.estado), plataAnexo(res.anexo)), sumaPorDia(M.plataPorDia(s.e)));
  assert.deepEqual(M.pendientesGoLive(res.estado, AHORA), M.pendientesGoLive(s.e, AHORA));
  assert.deepEqual(M.alertas(res.estado, AHORA), M.alertas(s.e, AHORA));

  // Se cierra la caja del 2/9 tarde: ahora sí se va la venta de las 23:55.
  cerrarCajaDe(res.estado, D2, AHORA);
  const otra = M.archivarDiasCerrados(res.estado, D3, { ahora: AHORA });
  assert.equal(otra.vacio, false);
  assert.ok(otra.anexo.cuentas.some((c: any) => c.titular === "Mostrador"));
  assert.ok(M.reserva(otra.estado, s.sinCerrar.id), "el 3/9 sigue sin cerrar");
});

test("cuenta corriente: queda «saldo anterior» y el saldo cuadra al centavo", () => {
  const s = escenario();
  const antes = M.cliente(s.e, "d");
  assert.equal(antes.movCC.length, 3);
  const res = M.archivarDiasCerrados(s.e, D3, { ahora: AHORA });
  const d = M.cliente(res.estado, "d");
  assert.equal(d.deuda, antes.deuda, "la deuda no se toca");
  assert.equal(d.movCC.length, 2);
  assert.equal(d.movCC[0].saldoAnterior, true);
  assert.equal(d.movCC[0].importe, antes.movCC[0].importe + antes.movCC[1].importe);
  assert.equal(d.movCC[0].saldo, antes.movCC[1].saldo);
  assert.equal(d.movCC.reduce((s2: number, m: any) => s2 + m.importe, 0), d.deuda, "Σ movimientos = deuda");
  assert.equal(d.movCC.at(-1).saldo, d.deuda, "el saldo corrido termina en la deuda");
  assert.deepEqual(M.estadoDeCuenta(res.estado, "d").saldo, M.estadoDeCuenta(s.e, "d").saldo);
  const archivados = res.anexo.movCC.find((x: any) => x.clienteId === "d").movimientos;
  assert.deepEqual(archivados, antes.movCC.slice(0, 2));
  // Caro: su fiado (+7600) se archivó y queda la línea de saldo anterior.
  const c = M.cliente(res.estado, "c");
  assert.equal(c.movCC.reduce((s2: number, m: any) => s2 + m.importe, 0), c.deuda);
  // Archivar después con un corte más nuevo junta las dos líneas en una sola.
  const mas = M.archivarDiasCerrados(res.estado, D10, { ahora: AHORA });
  const d2 = M.cliente(mas.estado, "d");
  assert.equal(d2.movCC.length, 1);
  assert.equal(d2.movCC[0].importe, d2.deuda);
  assert.equal(d2.movCC[0].saldo, d2.deuda);
  assert.equal(mas.anexo.movCC.find((x: any) => x.clienteId === "d").movimientos.length, 1, "el «saldo anterior» no va al anexo");
});

test("la seña web y las audiencias siguen contando lo archivado", () => {
  const e = club();
  e.config.politica.senaWeb = "nuevos";
  e.config.politica.turnosConfianza = 2;
  for (const [i, fecha] of ["2026-09-01", "2026-09-02"].entries()) {
    const r = turno(e, fecha, "c1", 18, { clienteId: "a", jugadores: [{ nombre: "Ana", clienteId: "a" }, { nombre: "Caro", clienteId: "c" }] });
    exigir(M.checkIn(e, r.id, en(fecha, 18)), "abrir");
    exigir(M.cobrarTodoElTurno(e, r.id, { medio: "efectivo" }, en(fecha, 19, 30)), "cobrar");
    if (r.estado === "en_cancha") exigir(M.finalizar(e, r.id, {}, en(fecha, 19, 31)), "cerrar");
    cerrarCajaDe(e, fecha, en(fecha, 23, 30 + i));
  }
  const ahora = en("2026-09-25", 12, 30);
  assert.equal(M.requiereSenaWeb(e, "a"), false, "Ana ya jugó 2: es de confianza");
  const res = M.archivarDiasCerrados(e, "2026-09-02", { ahora });
  assert.equal(res.estado.reservas.length, 0);
  assert.equal(M.requiereSenaWeb(res.estado, "a"), false, "sigue siendo de confianza con los turnos archivados");
  assert.equal(M.requiereSenaWeb(res.estado, "c"), true, "Caro jugó como invitada: no cuenta como titular");
  assert.deepEqual(res.estado.archivo.clientes, { a: { jugados: 2, ultima: "2026-09-02" }, c: { jugados: 0, ultima: "2026-09-02" } });
  for (const aud of Object.keys(M.AUDIENCIAS)) assert.deepEqual(M.destinatarios(res.estado, aud, ahora), M.destinatarios(e, aud, ahora), aud);
  const enUnMes = en("2026-10-10", 13);
  assert.deepEqual(M.destinatarios(res.estado, "recuperar", enUnMes).map((x: any) => x.clienteId), ["a", "c"], "los que no vienen hace un mes salen del archivo");
});

// ── Guardar y volver a abrir ──

test("hidratar: un estado viejo sin `archivo` hidrata igual; con archivo, ida y vuelta sin pérdida", () => {
  const s = escenario();
  const viejo = M.serializarEstado(s.e);
  assert.equal("archivo" in viejo.estado, false);
  const h = M.hidratarEstado(structuredClone(viejo));
  assert.equal(h.ok, true);
  assert.equal("archivo" in h.estado, false, "no aparece un campo nuevo en un estado viejo");
  assert.deepEqual(h.estado, M.hidratarEstado(structuredClone(viejo)).estado);
  assert.equal(viejo.v, M.VERSION_ESTADO);
  assert.equal(M.VERSION_ESTADO, 1, "cambio aditivo: la versión no sube");

  const res = M.archivarDiasCerrados(s.e, D3, { ahora: AHORA });
  const foto = JSON.parse(JSON.stringify(M.serializarEstado(res.estado)));
  const vuelta = M.hidratarEstado(foto);
  assert.equal(vuelta.ok, true);
  assert.deepEqual(vuelta.estado.archivo, res.estado.archivo);
  assert.deepEqual(vuelta.estado, JSON.parse(JSON.stringify(res.estado)));

  // Un `archivo` roto no tumba la hidratación: se descarta o se completa.
  const roto = JSON.parse(JSON.stringify(foto));
  roto.estado.archivo = "x";
  assert.equal(M.hidratarEstado(roto).ok, true);
  assert.equal("archivo" in M.hidratarEstado(roto).estado, false);
  roto.estado.archivo = { hasta: 3, dias: "no" };
  const completo = M.hidratarEstado(roto);
  assert.deepEqual(completo.estado.archivo, { hasta: null, dias: [], clientes: {}, anexos: [], codigos: { pedidos: [], refs: [] } });
});

test("hidratar (M3): renglones rotos de `archivo` se descartan sin rechazar la foto; nada que rompa Configuración", () => {
  const s = escenario();
  const res = M.archivarDiasCerrados(s.e, D3, { ahora: AHORA });
  const foto = JSON.parse(JSON.stringify(M.serializarEstado(res.estado)));
  const bueno = foto.estado.archivo.anexos[0];
  const diaBueno = foto.estado.archivo.dias[0];
  foto.estado.archivo.anexos = [null, 3, "x", { hasta: 20260901 }, { hasta: "ayer" }, { ...bueno, fecha: 7, desde: { a: 1 }, por: ["x"], conteos: { reservas: "9", cuentas: 2 } }];
  foto.estado.archivo.dias = [null, { dia: 5 }, { dia: "1/9" }, { ...diaBueno, turnos: "40", cobradoCanchas: null }];
  foto.estado.archivo.clientes = { "a": { jugados: "3", ultima: 9 }, "mal id!": { jugados: 1 }, "b": "x" };
  foto.estado.archivo.codigos = { pedidos: ["T-AB12", 7, "<script>"], refs: "x" };
  const h = M.hidratarEstado(foto);
  assert.equal(h.ok, true, "la foto no se rechaza");
  const a = h.estado.archivo;
  assert.equal(a.anexos.length, 1, "sólo queda el anexo con fecha");
  assert.deepEqual([a.anexos[0].fecha, a.anexos[0].desde, a.anexos[0].por], [null, null, null]);
  assert.deepEqual(a.anexos[0].conteos, { cuentas: 2 }, "los conteos que no son números se van");
  assert.equal(a.dias.length, 1, "sólo queda el día con fecha");
  assert.equal(a.dias[0].turnos, 0, "un número que vino como texto queda en 0 (no se concatena)");
  assert.equal(a.dias[0].cobradoCanchas, 0);
  assert.deepEqual(a.clientes, { a: { jugados: 0, ultima: "" } });
  assert.deepEqual(a.codigos, { pedidos: ["T-AB12"], refs: [] });
  // La seña web sigue calculando con números (no «3» + 0 como texto).
  assert.equal(typeof M.requiereSenaWeb(h.estado, "a"), "boolean");
});

// ── M1: dos cierres en la misma noche ──

test("M1: cierro D 22:00, venta 23:00 (→ D+1), cierro D+1 23:30, venta 23:45 (→ D+2 abierta): esa cuenta NO se archiva", () => {
  const e = club();
  exigir(M.ventaMostrador(e, [{ productoId: "p9", cant: 1 }], "efectivo", en(D1, 20)), "venta 20:00");
  cerrarCajaDe(e, D1, en(D1, 22));
  exigir(M.ventaMostrador(e, [{ productoId: "p9", cant: 1 }], "efectivo", en(D1, 23)), "venta 23:00");
  assert.equal(e.caja.movimientos.at(-1).caja, D2, "la venta de las 23:00 entra en la caja del día siguiente");
  cerrarCajaDe(e, D2, en(D1, 23, 30));
  exigir(M.ventaMostrador(e, [{ productoId: "p10", cant: 1 }], "efectivo", en(D1, 23, 45)), "venta 23:45");
  const mov = e.caja.movimientos.at(-1);
  const cta = e.cuentas.at(-1);
  assert.equal(mov.caja, D3, "la venta de las 23:45 entra en la caja D+2, que nadie cerró");
  const res = M.archivarDiasCerrados(e, D10, { ahora: AHORA });
  assert.equal(res.anexo.cuentas.some((c: any) => c.id === cta.id), false, "la cuenta cobrada en la caja abierta no se archiva");
  assert.ok(res.estado.cuentas.some((c: any) => c.id === cta.id), "…y queda en el estado");
  assert.ok(res.estado.caja.movimientos.some((m: any) => m.id === mov.id), "su movimiento queda (caja sin cerrar)");
  assert.equal(res.anexo.cuentas.length, 2, "las dos ventas de cajas cerradas sí se archivan");
  assert.deepEqual(M.cajasConMovimientosSinCerrar(res.estado), M.cajasConMovimientosSinCerrar(e));
  assert.deepEqual(sumaPorDia(M.plataPorDia(res.estado), plataAnexo(res.anexo)), sumaPorDia(M.plataPorDia(e)));
  // Cerrada también la D+2, se archiva todo.
  cerrarCajaDe(e, D3, en(D2, 13));
  const todo = M.archivarDiasCerrados(e, D10, { ahora: AHORA });
  assert.ok(todo.anexo.cuentas.some((c: any) => c.id === cta.id), "con la caja D+2 cerrada, la cuenta se archiva");
});

// ── M2: códigos de pedidos y de señas archivados ──

test("M2: los códigos T-XXXX y BP-XXXX archivados no se repiten y el WhatsApp de un pedido archivado no se vuelve a cargar", () => {
  const s = escenario();
  const res = M.archivarDiasCerrados(s.e, D3, { ahora: AHORA });
  const e = res.estado;
  assert.ok(res.anexo.pedidos.some((x: any) => x.id === s.pd.id), "el pedido entregado se archivó");
  assert.ok(e.archivo.codigos.pedidos.includes(s.pd.codigo), "su código quedó en el archivo");
  const conRef = res.anexo.reservas.filter((r: any) => r.ref);
  for (const r of conRef) assert.ok(e.archivo.codigos.refs.includes(r.ref), `la seña ${r.ref} quedó en el archivo`);
  // Pegar otra vez el WhatsApp de ese pedido: antes de archivar decía «ya está cargado»; después también.
  const msj = `Hola! Pedido ${s.pd.codigo} de la tienda: 1 × ${s.pd.items[0].nombre} $${s.pd.total}. Soy Ana (11 5555).`;
  const dup = M.pedidoDesdeWhatsApp(e, msj, AHORA);
  assert.equal(dup.ok, false);
  assert.match(dup.motivo, /archivados/);
  // Un azar que primero saca el código archivado y después otro: el generador no lo repite.
  const LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const azarQue = (...codigos: string[]) => { const xs = codigos.join("").split("").map((ch) => (LETRAS.indexOf(ch) + 0.5) / LETRAS.length); let k = 0; return () => xs[k++ % xs.length]; };
  assert.equal(M.nuevoCodigoPedido(e, azarQue(s.pd.codigo.slice(2), "AAAA")), "T-AAAA", "el pedido nuevo no repite uno archivado");
  // Una seña con código (BP-XXXX), jugada y cobrada en una caja cerrada: se archiva y su código no se repite.
  const e0 = club();
  const conSena = turno(e0, D1, "c1", 18, { clienteId: "a", conSena: true });
  assert.match(conSena.ref, /^BP-/);
  exigir(M.registrarPago(e0, conSena.id, { medio: "transferencia", monto: conSena.sena.monto }, en(D1, 13)), "seña");
  exigir(M.checkIn(e0, conSena.id, en(D1, 18)), "abrir");
  exigir(M.cobrarTodoElTurno(e0, conSena.id, { medio: "efectivo" }, en(D1, 19, 30)), "cobrar");
  if (conSena.estado === "en_cancha") exigir(M.finalizar(e0, conSena.id, {}, en(D1, 19, 31)), "cerrar");
  cerrarCajaDe(e0, D1, en(D1, 23, 50));
  const r0 = M.archivarDiasCerrados(e0, D3, { ahora: AHORA });
  assert.ok(r0.anexo.reservas.some((r: any) => r.id === conSena.id), "el turno con seña se archivó");
  assert.deepEqual(r0.estado.archivo.codigos.refs, [conSena.ref]);
  assert.equal(M.nuevaRefPago(r0.estado, azarQue(conSena.ref.slice(3), "BBBB")), "BP-BBBB", "la seña nueva no repite una archivada");
});

// ── B1: el archivo único para archivar y su verificación ──

test("B1: el archivo para archivar se verifica (mismo día, conteos y huella); si algo cambió, pide descargar de nuevo", () => {
  const { e } = mesConVida();
  const hasta = M.diaParaArchivar(e, AHORA_MES);
  const res = M.archivarDiasCerrados(e, hasta, { ahora: AHORA_MES, por: "Majo" });
  const respaldo = { ...M.serializarEstado(e), usuario: "u-rober", guardado: 1 };
  const paquete = JSON.parse(JSON.stringify(M.paqueteParaArchivar(respaldo, res)));
  assert.equal(paquete.tipo, "respaldo-y-archivo");
  assert.equal(paquete.hasta, hasta);
  assert.equal(paquete.huella.length, 16);
  // Paso 2 un rato después, con otro dueño: la huella no depende del minuto ni de quién.
  const otraVez = M.archivarDiasCerrados(e, hasta, { ahora: en(HOY_TORNEO, 19, 40), por: "Roberto" });
  assert.deepEqual(M.verificarPaqueteArchivo(paquete, otraVez, paquete.huella), { ok: true, huella: paquete.huella });
  // Otro archivo (el respaldo común, el anexo solo, cualquier cosa): no.
  assert.equal(M.verificarPaqueteArchivo(respaldo, otraVez, paquete.huella).causa, "otro");
  assert.equal(M.verificarPaqueteArchivo(res.anexo, otraVez, paquete.huella).causa, "otro");
  assert.equal(M.verificarPaqueteArchivo(null, otraVez, paquete.huella).ok, false);
  // Dañado: un turno de menos en el anexo.
  const roto = structuredClone(paquete);
  roto.anexo.reservas.pop();
  assert.equal(M.verificarPaqueteArchivo(roto, otraVez, paquete.huella).causa, "danado");
  // Gate re-auditoría M3: el respaldo de adentro también se controla (sirve para «Restaurar»).
  const respaldoTocado = structuredClone(paquete);
  respaldoTocado.respaldo.estado.reservas.find((r: any) => r.pagos?.length).pagos[0].monto += 1;
  assert.equal(M.verificarPaqueteArchivo(respaldoTocado, otraVez, paquete.huella).causa, "danado", "un peso tocado en el respaldo");
  const respaldoVacio = structuredClone(paquete);
  respaldoVacio.respaldo.estado.reservas = [];
  assert.equal(M.verificarPaqueteArchivo(respaldoVacio, otraVez, paquete.huella).causa, "danado", "sin los turnos");
  const respaldoRoto = structuredClone(paquete);
  delete respaldoRoto.respaldo.estado.caja;
  assert.equal(M.verificarPaqueteArchivo(respaldoRoto, otraVez, paquete.huella).causa, "danado", "un respaldo que no abre");
  // Cambió algo de esos días entre el paso 1 y el 2 (se reabrió... acá: una cuenta vieja se borra del estado).
  const cambiado = structuredClone(e);
  cambiado.cuentas = cambiado.cuentas.filter((c: any) => c.id !== res.anexo.cuentas[0].id);
  const resCambio = M.archivarDiasCerrados(cambiado, hasta, { ahora: AHORA_MES });
  const v = M.verificarPaqueteArchivo(paquete, resCambio, paquete.huella);
  assert.equal(v.ok, false);
  assert.equal(v.causa, "cambio");
  assert.match(v.motivo, /descargá el archivo de nuevo/);
  // Ya archivado (nada para archivar): tampoco achica.
  assert.equal(M.verificarPaqueteArchivo(paquete, M.archivarDiasCerrados(res.estado, hasta, { ahora: AHORA_MES }), paquete.huella).ok, false);
});

test("M5: «Restaurar desde un archivo» acepta el archivo para archivar y explica el anexo solo", () => {
  const { e } = mesConVida();
  const res = M.archivarDiasCerrados(e, M.diaParaArchivar(e, AHORA_MES), { ahora: AHORA_MES });
  const respaldo = JSON.parse(JSON.stringify({ ...M.serializarEstado(e), usuario: "u-rober", guardado: 1 }));
  const paquete = JSON.parse(JSON.stringify(M.paqueteParaArchivar(respaldo, res)));
  const r = M.respaldoDesdeArchivo(paquete);
  assert.equal(r.ok, true);
  assert.equal(r.antesDeArchivar, true);
  assert.equal(M.hidratarEstado(r.foto).ok, true, "lo que se restaura es el respaldo completo de antes de archivar");
  assert.equal(M.hidratarEstado(r.foto).estado.reservas.length, e.reservas.length);
  const anexo = M.respaldoDesdeArchivo(JSON.parse(JSON.stringify(res.anexo)));
  assert.equal(anexo.ok, false);
  assert.match(anexo.motivo, /archivo de los días archivados/);
  assert.deepEqual(M.respaldoDesdeArchivo(respaldo), { ok: true, foto: respaldo, antesDeArchivar: false });
});

test("la limpieza para el go-live borra el resumen del archivo (era de la prueba)", () => {
  const s = escenario();
  const res = M.archivarDiasCerrados(s.e, D1, { ahora: AHORA });
  const e = res.estado;
  // Se resuelve lo pendiente para que la limpieza corra.
  exigir(M.marcarDevuelto(e, s.devolver.id, "efectivo", AHORA), "devolver");
  exigir(M.cobrarFaltaSinFicha(e, s.falta.id, "efectivo", AHORA), "cobrar falta");
  exigir(M.cerrarCargosDelTurno(e, s.mesa.id, { medio: "efectivo" }, AHORA), "cerrar mesa");
  for (const dia of M.cajasConMovimientosSinCerrar(e)) cerrarCajaDe(e, dia, AHORA);
  assert.deepEqual(M.pendientesGoLive(e, AHORA), []);
  exigir(M.limpiarParaGoLive(e, {}, DUENO, AHORA), "go-live");
  assert.equal("archivo" in e, false);
});
