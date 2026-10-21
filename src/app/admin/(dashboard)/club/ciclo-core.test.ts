// El ciclo del turno contra el motor REAL sobre la demo, con la propiedad de plata de las devoluciones: lo
// devuelto (crédito o en mano) nunca supera lo cobrado de ese turno, y la caja es lo cobrado menos lo devuelto en
// mano (los créditos no tocan la caja). Las previas dicen exactamente lo que después hace el motor.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub, Reserva } from "@/lib/club/motor.mjs";
import { operadorDeLaDemo } from "./almacen";
import { reservar } from "./alta-core";
import { destinosParaMover, ejecutarCiclo, fueraDeGrilla, opcionesCiclo, previaCancelar, previaExtender, previaFalta, previaInterrumpir } from "./ciclo-core";
import { previaLluvia, ejecutarCanchas } from "./canchas-core";

const HOY = "2026-10-17";
const MANANA = M.sumarDias(HOY, 1);
const AHORA: Ahora = { fecha: HOY, min: 19 * 60 + 10 };
const demo = (): { e: EstadoClub; auth: Auth } => {
  const e = M.generarDemo(HOY, AHORA.min);
  return { e, auth: operadorDeLaDemo(e, "RECEPTION")!.auth };
};

/** Lo que entró a la caja (sin créditos) y lo que salió como devolución en mano. */
function plata(e: EstadoClub) {
  const movs = e.caja.movimientos;
  const ingresos = movs.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + m.monto, 0);
  const devueltoEnMano = movs.filter((m) => m.tipo === "egreso" && m.concepto.startsWith("Devolución")).reduce((s, m) => s + m.monto, 0);
  const otrosEgresos = movs.filter((m) => m.tipo === "egreso" && !m.concepto.startsWith("Devolución")).reduce((s, m) => s + m.monto, 0);
  return { ingresos, devueltoEnMano, neto: ingresos - devueltoEnMano - otrosEgresos };
}

/** Un turno de mañana, pagado entero, a nombre de un cliente con ficha (o sin ficha). */
function turnoPago(e: EstadoClub, conFicha: boolean, canchaId = "c2", inicio = 18 * 60): Reserva {
  const ficha = conFicha ? e.clientes.find((c) => c.activo !== false && c.deuda === 0)! : null;
  const r = reservar(e, { canchaId, fecha: MANANA, inicio, duracion: 90, tipo: "turno", titular: ficha?.nombre ?? "Sin Ficha", clienteId: ficha?.id ?? null, otros: "" }, AHORA);
  assert.ok(r.ok, r.mensaje);
  const t = M.reserva(e, r.reservaId!)!;
  assert.ok(M.registrarPago(e, t.id, { medio: "efectivo", monto: t.precio }, AHORA).ok);
  return t;
}

test("cancelar con tiempo: con ficha vuelve como crédito (la caja no se toca); sin ficha queda para devolver y sale de la caja al devolverlo", () => {
  const { e, auth } = demo();
  const conFicha = turnoPago(e, true, "c2");
  const sinFicha = turnoPago(e, false, "c3");
  const ficha = M.cliente(e, conFicha.clienteId!)!;
  const creditosAntes = ficha.monedero;
  const p0 = plata(e);

  const previa = previaCancelar(e, conFicha.id, false, AHORA);
  assert.ok(previa.ok);
  assert.match(previa.texto, /vuelve como crédito/);
  const d = ejecutarCiclo(e, conFicha.id, { tipo: "cancelar", porClub: false, motivo: "" }, AHORA, auth);
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(ficha.monedero - creditosAntes, conFicha.precio, "vuelve exactamente lo cobrado");
  assert.equal(plata(e).neto, p0.neto, "el crédito no sale de la caja");

  assert.match((previaCancelar(e, sinFicha.id, false, AHORA) as { texto: string }).texto, /devolverle .* en mano/);
  assert.equal(ejecutarCiclo(e, sinFicha.id, { tipo: "cancelar", porClub: false, motivo: "" }, AHORA, auth).ok, true);
  const pendiente = fueraDeGrilla(e, MANANA).find((x) => x.id === sinFicha.id)!;
  assert.equal(pendiente.devolver, sinFicha.precio);
  assert.equal(ejecutarCiclo(e, sinFicha.id, { tipo: "devolver", medio: "efectivo" }, AHORA, auth).ok, true);
  const p1 = plata(e);
  assert.equal(p1.devueltoEnMano, sinFicha.precio);
  assert.equal(p1.neto, p0.neto - sinFicha.precio, "caja = cobrado − devuelto en mano");
  assert.equal(ejecutarCiclo(e, sinFicha.id, { tipo: "devolver", medio: "efectivo" }, AHORA, auth).ok, false, "no se devuelve dos veces");
});

test("cancelar tarde: la seña queda en suspenso (no se devuelve nada) y vuelve sola si se vende el hueco", () => {
  const { e, auth } = demo();
  const ficha = e.clientes.find((c) => c.activo !== false && c.deuda === 0)!;
  const r = reservar(e, { canchaId: "c2", fecha: HOY, inicio: 22 * 60 + 30 + 90, duracion: 60, tipo: "turno", titular: ficha.nombre, clienteId: ficha.id, otros: "" }, AHORA);
  const t = r.ok ? M.reserva(e, r.reservaId!)! : e.reservas.find((x) => x.fecha === HOY && x.estado === "reservada" && x.clienteId && x.inicio > AHORA.min)!;
  if (!(M.cobrado(t) > 0)) assert.ok(M.registrarPago(e, t.id, { medio: "efectivo", monto: 5000 }, AHORA).ok);
  const creditos = M.cliente(e, t.clienteId!)!.monedero;
  assert.match((previaCancelar(e, t.id, false, AHORA) as { texto: string }).texto, /en suspenso/);
  assert.equal(ejecutarCiclo(e, t.id, { tipo: "cancelar", porClub: false, motivo: "" }, AHORA, auth).ok, true);
  assert.equal(t.senaEnSuspenso, true);
  assert.equal(M.cliente(e, t.clienteId!)!.monedero, creditos, "no se devuelve nada todavía");
  // Si el club cancela, siempre vuelve.
  const otro = turnoPago(e, true, "c1", 9 * 60);
  assert.match((previaCancelar(e, otro.id, true, AHORA) as { texto: string }).texto, /vuelve como crédito/);
});

test("interrumpir: se reconoce sólo lo no jugado y lo pagado de más vuelve; lo devuelto nunca supera lo cobrado", () => {
  const { e, auth } = demo();
  const r = e.reservas.find((x) => x.fecha === HOY && x.estado === "en_cancha" && M.saldo(x) === 0)!;
  const cobrado = M.cobrado(r);
  const ficha = r.clienteId ? M.cliente(e, r.clienteId)! : null;
  const creditos = ficha?.monedero ?? 0;
  const previa = previaInterrumpir(e, r.id, AHORA);
  assert.ok(previa.ok);
  const d = ejecutarCiclo(e, r.id, { tipo: "interrumpir", motivo: "corte de luz" }, AHORA, auth);
  assert.equal(d.ok, true, d.mensaje);
  const vuelta = (ficha ? ficha.monedero - creditos : 0) + (r.devolucionPendiente ?? 0);
  assert.ok(vuelta > 0 && vuelta <= cobrado, `lo que vuelve (${vuelta}) no supera lo cobrado (${cobrado})`);
  assert.equal(r.precio + vuelta, cobrado, "lo cobrado = lo jugado + lo devuelto");
  assert.equal(opcionesCiclo(r).interrumpir, false, "una sola vez");
  assert.equal(ejecutarCiclo(e, r.id, { tipo: "interrumpir", motivo: "otra" }, AHORA, auth).ok, false);
});

test("plan lluvia: la previa es lo que hace; mueve a techada lo que entra y suspende el resto devolviendo lo cobrado, nunca más", () => {
  const { e } = demo();
  M.configurarTecho(e, "c4", false); // Break Point tiene las 4 techadas; la lluvia se prueba con una descubierta (otro club).
  const desde = 20 * 60;
  const hasta = 23 * 60 + 30;
  // Pagamos la seña de uno de la descubierta para que haya plata en juego.
  const desc = e.reservas.filter((r) => r.fecha === HOY && r.canchaId === "c4" && ["reservada", "en_cancha"].includes(r.estado) && r.inicio < hasta && r.inicio + r.duracion > desde);
  assert.ok(desc.length >= 2);
  for (const r of desc) if (r.sena.monto > 0 && !r.sena.pagada) assert.ok(M.registrarPago(e, r.id, { medio: "transferencia", monto: r.sena.monto }, AHORA).ok);
  const cobradoAntes = new Map(desc.map((r) => [r.id, M.cobrado(r)]));
  const creditosAntes = new Map(e.clientes.map((c) => [c.id, c.monedero]));
  const previa = previaLluvia(e, HOY, desde, hasta, AHORA);
  assert.equal(previa.resultado.length, desc.length);
  const d = ejecutarCanchas(e, { tipo: "lluvia", fecha: HOY, desde, hasta }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  for (const x of previa.resultado) {
    const r = M.reserva(e, x.reservaId)!;
    if (x.accion === "movido") assert.notEqual(r.canchaId, "c4", "pasó a techada");
    if (x.accion === "suspendido") {
      assert.equal(r.estado, "suspendida");
      const vuelta = (r.clienteId ? M.cliente(e, r.clienteId)!.monedero - (creditosAntes.get(r.clienteId) ?? 0) : 0) + (r.devolucionPendiente ?? 0);
      assert.equal(vuelta, cobradoAntes.get(r.id), "vuelve lo cobrado, ni más ni menos");
    }
  }
});

test("mover y extender: sólo a huecos que el motor acepta, con el precio del tramo nuevo", () => {
  const { e, auth } = demo();
  const r = e.reservas.find((x) => x.fecha === HOY && x.estado === "reservada" && x.canchaId === "c4" && x.inicio >= 21 * 60)!;
  const destinos = destinosParaMover(e, r.id, AHORA);
  assert.ok(destinos.length > 0);
  for (const d of destinos) for (const h of d.horas) assert.ok(M.validarHueco(e, { canchaId: d.canchaId, fecha: HOY, inicio: h.min, duracion: r.duracion }, r.id).ok);
  const [d0] = destinos;
  assert.equal(ejecutarCiclo(e, r.id, { tipo: "mover", canchaId: d0.canchaId, inicio: d0.horas[0].min }, AHORA, auth).ok, true);
  assert.equal(r.canchaId, d0.canchaId);

  const ultimo = e.reservas.find((x) => x.fecha === HOY && x.estado === "reservada" && x.inicio + x.duracion + 60 <= M.horarioDe(e, HOY).cierra && M.validarHueco(e, { canchaId: x.canchaId, fecha: HOY, inicio: x.inicio + x.duracion, duracion: 30 }).ok)!;
  const p = previaExtender(e, ultimo.id, 30);
  assert.ok(p.ok);
  const precio = ultimo.precio;
  assert.equal(ejecutarCiclo(e, ultimo.id, { tipo: "extender", minutos: 30 }, AHORA, auth).ok, true);
  assert.equal(ultimo.precio, precio + p.extra, "cobra lo que dijo la previa");
  const pisa = e.reservas.find((x) => x.fecha === HOY && x.estado === "reservada" && !M.validarHueco(e, { canchaId: x.canchaId, fecha: HOY, inicio: x.inicio + x.duracion, duracion: 90 }).ok)!;
  assert.equal(previaExtender(e, pisa.id, 90).ok, false);
});

test("no vino: pasada la tolerancia se cobra el turno entero a la cuenta corriente; sin cargo lo decide un dueño", () => {
  const { e, auth } = demo();
  const r = reservar(e, { canchaId: "c3", fecha: HOY, inicio: 19 * 60, duracion: 60, tipo: "turno", titular: e.clientes[0].nombre, clienteId: e.clientes[0].id, otros: "" }, { fecha: HOY, min: 18 * 60 });
  const t = r.ok ? M.reserva(e, r.reservaId!)! : e.reservas.find((x) => x.fecha === HOY && x.estado === "reservada" && x.inicio + 15 <= AHORA.min && x.clienteId)!;
  const pronto = previaFalta(e, t.id, "titular", { fecha: HOY, min: t.inicio + 5 });
  assert.equal(pronto.ok, false, "dentro de la tolerancia no");
  const sinCargo = ejecutarCiclo(e, t.id, { tipo: "falta", cobrarA: "nadie" }, AHORA, auth);
  assert.equal(sinCargo.ok, false, "recepción no perdona una falta");
  const ficha = M.cliente(e, t.clienteId!)!;
  const deuda = ficha.deuda;
  const falta = M.saldo(t);
  assert.ok(previaFalta(e, t.id, "titular", AHORA).ok);
  assert.equal(ejecutarCiclo(e, t.id, { tipo: "falta", cobrarA: "titular" }, AHORA, auth).ok, true);
  assert.equal(ficha.deuda - deuda, falta);
  assert.equal(t.estado, "no_show");
  const dueno = operadorDeLaDemo(e, "OWNER")!.auth;
  const otro = e.reservas.find((x) => x.fecha === HOY && x.estado === "reservada" && x.inicio + 15 <= AHORA.min && x.id !== t.id);
  if (otro) assert.equal(ejecutarCiclo(e, otro.id, { tipo: "falta", cobrarA: "nadie" }, AHORA, dueno).ok, true);
});

test("esta semana no vienen: el fijo libera esa fecha y sigue", () => {
  const { e, auth } = demo();
  const r = e.reservas.find((x) => x.fecha === HOY && x.estado === "reservada" && x.fijoId)!;
  assert.equal(opcionesCiclo(r).liberarFijo, true);
  assert.equal(ejecutarCiclo(e, r.id, { tipo: "liberarFijo" }, AHORA, auth).ok, true);
  assert.equal(r.estado, "cancelada");
  const f = e.fijos.find((x) => x.id === r.fijoId)!;
  assert.ok(f.excepciones.includes(HOY));
  assert.deepEqual(M.materializarFijos(e, HOY), [], "no lo vuelve a bajar");
});

// PERFORMANCE-TERMINALES.md, ronda 3: la pantalla simula las previas sobre una copia sacada del TEXTO del estado
// (`almacen.simular`: `JSON.parse`), no con `structuredClone`. Tienen que decir lo mismo para TODOS los turnos de la
// semana y todas las opciones, y no tocar el estado.
test("las previas sobre la copia del texto del estado dicen lo mismo que sobre structuredClone, turno por turno", () => {
  const e = M.generarDemo(HOY, 19 * 60 + 10);
  for (let d = 1; d < 7; d++) M.materializarFijos(e, M.sumarDias(HOY, d));
  const ahora: Ahora = { fecha: HOY, min: 19 * 60 + 10 };
  const antes = JSON.stringify(e);
  const delTexto = () => (JSON.parse(JSON.stringify({ v: M.VERSION_ESTADO, estado: e, secuencia: M.secuenciaIds() })) as M.FotoEstado).estado;
  let comparadas = 0;
  for (const r of e.reservas) {
    for (const porClub of [false, true]) {
      assert.deepEqual(previaCancelar(e, r.id, porClub, ahora, delTexto()), previaCancelar(e, r.id, porClub, ahora), `cancelar ${r.id}`);
      comparadas++;
    }
    for (const cobrarA of ["titular", "grupo"] as const) {
      assert.deepEqual(previaFalta(e, r.id, cobrarA, ahora, delTexto()), previaFalta(e, r.id, cobrarA, ahora), `falta ${r.id}`);
      comparadas++;
    }
    assert.deepEqual(previaInterrumpir(e, r.id, ahora, delTexto()), previaInterrumpir(e, r.id, ahora), `interrumpir ${r.id}`);
    comparadas++;
  }
  for (let d = 0; d < 3; d++) {
    const fecha = M.sumarDias(HOY, d);
    const { abre, cierra } = M.horarioDe(e, fecha);
    for (const desde of [abre, 19 * 60, 20 * 60 + 30]) {
      assert.deepEqual(previaLluvia(e, fecha, desde, cierra, ahora, delTexto()), previaLluvia(e, fecha, desde, cierra, ahora), `lluvia ${fecha} ${desde}`);
      comparadas++;
    }
  }
  assert.equal(JSON.stringify(e), antes, "ninguna previa tocó el estado");
  assert.ok(comparadas > 100, `comparadas ${comparadas}`);
});

test("«Cancela el club» (devolver todo) lo decide un dueño: recepción no puede, aunque mande la acción (regresión 21/10)", () => {
  const { e, auth } = demo();
  const t = e.reservas.find((r) => r.fecha === HOY && r.estado === "reservada" && r.inicio > AHORA.min)!;
  const d = ejecutarCiclo(e, t.id, { tipo: "cancelar", porClub: true, motivo: "" }, AHORA, auth);
  assert.equal(d.ok, false);
  assert.match(d.mensaje, /dueño/);
  assert.equal(M.reserva(e, t.id)?.estado, "reservada", "no se tocó el turno");
  const duenio = operadorDeLaDemo(e, "OWNER")!.auth;
  assert.equal(ejecutarCiclo(e, t.id, { tipo: "cancelar", porClub: true, motivo: "lluvia" }, AHORA, duenio).ok, true);
});
