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

// ── Tanda 2D: «Cerrar la de X y abrir» y «la mesa sigue · dividido» en UN comando («cierre»), y el aviso de la falta ──
import { avisoDeLaFalta, ejecutarCierre, mediosDelCierre } from "./ciclo-core";
import { armarCuenta, canchaOcupada } from "./cuenta-core";
import { correrComando, describirComando, rebasar, vaSinInternet, type Comando } from "./comandos-core";
import { textoDelEstado } from "./almacen";
import { mesasDelBuffet } from "./buffet-mesa-core";
import { operadorDesdeAuth } from "./operador-del-club";

/** Lo que entró a la caja por medio (ingresos). */
function porMedio(e: EstadoClub): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of e.caja.movimientos) if (m.tipo === "ingreso") out[m.medio] = (out[m.medio] ?? 0) + m.monto;
  return out;
}
const delta = (antes: Record<string, number>, despues: Record<string, number>) =>
  Object.fromEntries(Object.keys({ ...antes, ...despues }).map((k) => [k, (despues[k] ?? 0) - (antes[k] ?? 0)]).filter(([, v]) => v !== 0));

/** 20:25: Martín Ríos (C1 17:30) sigue en cancha debiendo $ 21.000 y llega Lucas Fernández (C1 20:30). */
const A_LAS_2025: Ahora = { fecha: HOY, min: 20 * 60 + 25 };
function canchaUnoOcupada(conSena = false) {
  M.prefijoIds("");
  const e = M.generarDemo(HOY, AHORA.min);
  const x = e.reservas.find((r) => r.fecha === HOY && r.canchaId === "c1" && r.estado === "en_cancha")!;
  const sig = e.reservas.find((r) => r.fecha === HOY && r.canchaId === "c1" && r.estado === "reservada" && r.inicio === 20 * 60 + 30)!;
  if (conSena) sig.sena = { ...sig.sena, monto: 21000, pagada: false };
  return { e, x, sig, auth: operadorDeLaDemo(e, "RECEPTION")!.auth };
}

let nCmd = 0;
function comandoCierre(e: EstadoClub, auth: Auth, args: Comando<"cierre">["args"], ahora: Ahora): Comando<"cierre"> {
  return { id: `c2d-${++nCmd}`, equipo: "pc", persona: auth.usuarioId ?? "", versionBase: 1, version: M.VERSION_ESTADO, nombre: "cierre", args, ahora, auth, azar: 500 + nCmd, idsDesde: M.secuenciaIds() };
}

test("2D · la cuenta del que llega: «sigue ocupada por X», sin «Abrir la cancha»; sólo el que sigue puede cerrar y abrir", () => {
  const { e, x, sig } = canchaUnoOcupada();
  const v = armarCuenta(e, sig.id)!;
  assert.deepEqual(v.cierres.cerrarYAbrir, { cerrarId: x.id, titular: x.titular, cancha: "Cancha 1", desde: M.hhmm(x.inicio), debe: M.saldo(x), aCuenta: v.cierres.cerrarYAbrir!.aCuenta, sena: null, esElQueSigue: true });
  assert.equal(v.cierres.abrirCancha, false, "no se ofrece «Abrir la cancha» (diría «sigue ocupada»)");
  assert.equal(v.cierres.cobrarSenaYAbrir, null);
  const despues = e.reservas.find((r) => r.fecha === HOY && r.canchaId === "c1" && r.estado === "reservada" && r.inicio > sig.inicio)!;
  assert.equal(canchaOcupada(e, despues)?.esElQueSigue, false, "el de las 22:00 no saltea al de las 20:30");
  // Con la cancha libre no hay nada de esto.
  const libre = e.reservas.find((r) => r.fecha === HOY && r.canchaId === "c4" && r.estado === "reservada")!;
  assert.equal(armarCuenta(e, libre.id)!.cierres.cerrarYAbrir, null);
});

test("BP-072 · «Cerrar la de X y abrir» en UN comando: X paga lo que debe en efectivo, la cancha pasa al que llega con la luz prendida; re-aplicado da lo mismo byte a byte", () => {
  const { e, x, sig, auth } = canchaUnoOcupada();
  const texto = textoDelEstado(e);
  const antes = porMedio(e);
  const debe = M.saldo(x);
  assert.ok(debe > 0);
  const c = comandoCierre(e, auth, [{ tipo: "cerrarYAbrir", cerrarId: x.id, abrirId: sig.id, medio: "efectivo" }], A_LAS_2025);
  const d = correrComando(e, c);
  assert.equal(d.ok, true, d.mensaje);
  assert.match(d.mensaje, /^Cerrada la de Martín Ríos \(cobrados \$ 21\.000 en Efectivo\)\. Cancha abierta para Lucas Fernández y luz prendida\.$/);
  assert.deepEqual(delta(antes, porMedio(e)), { efectivo: debe }, "a la caja entra exactamente lo que debía X, en efectivo");
  assert.equal(M.reserva(e, x.id)!.estado !== "en_cancha", true);
  assert.equal(M.saldo(M.reserva(e, x.id)!), 0);
  assert.equal(M.reserva(e, sig.id)!.estado, "en_cancha");
  assert.equal(e.luces.c1, true);
  // Re-aplicado sobre la misma base (otro puesto, o «Volver a aplicar»): el mismo estado, byte a byte.
  const deNuevo = (JSON.parse(texto) as { estado: EstadoClub }).estado;
  const r = rebasar(deNuevo, [c], new Set());
  assert.deepEqual(r.rechazados, []);
  assert.equal(JSON.stringify(deNuevo), JSON.stringify(e));
  assert.match(describirComando(c, (JSON.parse(texto) as { estado: EstadoClub }).estado), /Cerrar la de Martín Ríos \(cobro \$ 21\.000 efectivo\) y abrir la de Lucas Fernández/);
});

test("BP-072 · sin plata doble: el doble toque no cobra de nuevo, y si OTRO puesto ya la cerró y abrió, el comando va a «para resolver» sin tocar la caja", () => {
  const { e, x, sig, auth } = canchaUnoOcupada();
  const base = textoDelEstado(e);
  const accion = { tipo: "cerrarYAbrir" as const, cerrarId: x.id, abrirId: sig.id, medio: "efectivo" as const };
  const mio = comandoCierre(e, auth, [accion], A_LAS_2025);
  assert.equal(correrComando(e, mio).ok, true);
  const caja = JSON.stringify(e.caja);
  const otraVez = correrComando(e, comandoCierre(e, auth, [accion], A_LAS_2025));
  assert.equal(otraVez.ok, false, "el segundo toque no hace nada");
  assert.equal(JSON.stringify(e.caja), caja, "ni un peso más");
  // La tablet hizo lo mismo antes de enterarse: llega a la base después que la PC.
  const enLaBase = (JSON.parse(base) as { estado: EstadoClub }).estado;
  M.prefijoIds("pc-");
  assert.equal(correrComando(enLaBase, comandoCierre(enLaBase, auth, [{ ...accion, medio: "mercadopago" }], A_LAS_2025)).ok, true);
  M.prefijoIds("");
  const cajaBase = JSON.stringify(enLaBase.caja);
  const r = rebasar(enLaBase, [mio], new Set());
  assert.equal(r.rechazados.length, 1, "lo de la tablet queda «para resolver»");
  assert.equal(JSON.stringify(enLaBase.caja), cajaBase, "la deuda de X entró UNA vez (la de la PC)");
});

test("BP-070/071 · el que llega pide seña: sin medio de la seña no se cierra ni se cobra nada; con él, X paga en efectivo y la seña entra por MP, en un paso", () => {
  const { e, x, sig, auth } = canchaUnoOcupada(true);
  assert.equal(armarCuenta(e, sig.id)!.cierres.cerrarYAbrir!.sena, 21000);
  const intacto = JSON.stringify(e);
  const sinSena = ejecutarCierre(e, { tipo: "cerrarYAbrir", cerrarId: x.id, abrirId: sig.id, medio: "efectivo" }, A_LAS_2025, auth);
  assert.equal(sinSena.ok, false);
  assert.match(sinSena.mensaje, /seña/);
  assert.equal(JSON.stringify(e), intacto, "no se tocó nada");
  const antes = porMedio(e);
  const d = ejecutarCierre(e, { tipo: "cerrarYAbrir", cerrarId: x.id, abrirId: sig.id, medio: "efectivo", medioSena: "mercadopago", seguir: true }, A_LAS_2025, auth);
  assert.equal(d.ok, true, d.mensaje);
  assert.match(d.mensaje, /Su mesa sigue en Buffet\..*Seña cobrada: \$ 21\.000 \(Mercado Pago/);
  assert.deepEqual(delta(antes, porMedio(e)), { efectivo: 21000, mercadopago: 21000 });
  assert.equal(M.reserva(e, sig.id)!.sena.pagada, true);
  assert.equal(M.reserva(e, sig.id)!.estado, "en_cancha");
  assert.ok(mesasDelBuffet(e).some((m) => m.reservaId === x.id), "con «se quedan a comer», la mesa de X sigue en Buffet");
});

test("BP-073/074 · «La mesa sigue · dividido»: cada uno paga SU parte con SU medio (MP, efectivo, transferencia), la cancha queda libre y la mesa en Buffet con los 4; re-aplicado byte a byte", () => {
  const { e, x, auth } = canchaUnoOcupada();
  const texto = textoDelEstado(e);
  const v = armarCuenta(e, x.id)!;
  const dividido = v.cierres.mesaSigueDividido!;
  assert.deepEqual(dividido.partes.map((p) => p.monto), [7000, 7000, 7000], "Martín ya pagó lo suyo: los otros 3, $ 7.000 cada uno");
  assert.equal(dividido.resto, 0);
  assert.equal(dividido.partes.reduce((s, p) => s + p.monto, 0), M.saldo(x), "suman exacto lo que debe la cancha");
  const [a, b, c] = dividido.partes.map((p) => p.idx);
  // Falta un medio: no se cobra nada.
  const intacto = JSON.stringify(e);
  assert.equal(ejecutarCierre(e, { tipo: "mesaSigue", reservaId: x.id, porJugador: { [a]: "mercadopago", [b]: "efectivo" } }, AHORA, auth).ok, false);
  assert.equal(JSON.stringify(e), intacto);
  const antes = porMedio(e);
  const cmd = comandoCierre(e, auth, [{ tipo: "mesaSigue", reservaId: x.id, porJugador: { [a]: "mercadopago", [b]: "efectivo", [c]: "transferencia" } }], AHORA);
  const d = correrComando(e, cmd);
  assert.equal(d.ok, true, d.mensaje);
  assert.match(d.mensaje, /^Cancha cerrada y libre \(cobrados \$ 21\.000: Efectivo \$ 7\.000 · Mercado Pago .* \$ 7\.000 · Transferencia \$ 7\.000\)\. La mesa sigue en Buffet con sus 4\.$/);
  assert.deepEqual(delta(antes, porMedio(e)), { mercadopago: 7000, efectivo: 7000, transferencia: 7000 });
  assert.equal(e.luces.c1, false, "la cancha queda libre y apagada");
  const mesa = mesasDelBuffet(e).find((m) => m.reservaId === x.id)!;
  assert.ok(mesa, "la mesa aparece en Buffet");
  assert.equal(mesa.comensales.length, 4);
  const deNuevo = (JSON.parse(texto) as { estado: EstadoClub }).estado;
  assert.deepEqual(rebasar(deNuevo, [cmd], new Set()).rechazados, []);
  assert.equal(JSON.stringify(deNuevo), JSON.stringify(e), "el mismo estado, byte a byte");
  assert.doesNotMatch(describirComando(cmd, deNuevo), /Operación «/);
});

test("2D · qué va sin internet: el cierre sólo si todo lo que cobra es efectivo (o a cuenta corriente); un medio raro no corre", () => {
  assert.equal(vaSinInternet("cierre", [{ tipo: "cerrarYAbrir", cerrarId: "a", abrirId: "b", medio: "efectivo" }]), true);
  assert.equal(vaSinInternet("cierre", [{ tipo: "cerrarYAbrir", cerrarId: "a", abrirId: "b", medio: "efectivo", medioSena: "mercadopago" }]), false);
  assert.equal(vaSinInternet("cierre", [{ tipo: "cerrarYAbrir", cerrarId: "a", abrirId: "b", aCuenta: true, medio: "debito" }]), true, "a cuenta corriente no cobra con el medio");
  assert.equal(vaSinInternet("cierre", [{ tipo: "mesaSigue", reservaId: "a", porJugador: { 1: "efectivo", 2: "transferencia" } }]), false);
  assert.equal(vaSinInternet("cierre", [{ tipo: "mesaSigue", reservaId: "a", porJugador: { 1: "efectivo" } }]), true);
  assert.deepEqual(mediosDelCierre({ tipo: "mesaSigue", reservaId: "a", porJugador: { 1: "efectivo" }, medio: "debito" }), ["efectivo", "debito"]);
  const { e, x, auth } = canchaUnoOcupada();
  const intacto = JSON.stringify(e);
  const raro = ejecutarCierre(e, { tipo: "mesaSigue", reservaId: x.id, porJugador: { 1: "monedero" as never, 2: "efectivo", 3: "efectivo" } }, AHORA, auth);
  assert.equal(raro.ok, false);
  assert.equal(JSON.stringify(e), intacto);
});

test("BP-056 · después de la falta, el WhatsApp lleva lo que le quedó al titular en su cuenta; sin cargo, no hay aviso", () => {
  const { e, auth } = demo();
  const r = e.reservas.find((x) => x.fecha === HOY && x.estado === "reservada" && x.inicio + 15 < AHORA.min)!;
  assert.ok(r, "la demo trae un turno reservado pasada la tolerancia");
  const debe = M.saldo(r);
  assert.equal(avisoDeLaFalta(e, r.id), null, "antes de marcarla, nada");
  assert.equal(ejecutarCiclo(e, r.id, { tipo: "falta", cobrarA: "titular" }, AHORA, auth).ok, true);
  const aviso = avisoDeLaFalta(e, r.id)!;
  assert.equal(aviso.titular, r.titular);
  assert.ok(aviso.texto.includes(M.pesos(debe)), aviso.texto);
  assert.match(aviso.texto, /te quedó .* en tu cuenta/);
  // «Sin cargo»: recepción no puede (lo valida el motor, no sólo la pantalla) y el dueño sí; ahí no hay nada que avisar.
  const otro = demo();
  const r2 = otro.e.reservas.find((x) => x.id === r.id)!;
  assert.equal(operadorDesdeAuth(otro.e, otro.auth).esDuenio, false);
  assert.equal(ejecutarCiclo(otro.e, r2.id, { tipo: "falta", cobrarA: "nadie" }, AHORA, otro.auth).ok, false);
  const duenio = operadorDeLaDemo(otro.e, "OWNER")!.auth;
  assert.equal(operadorDesdeAuth(otro.e, duenio).esDuenio, true);
  assert.equal(ejecutarCiclo(otro.e, r2.id, { tipo: "falta", cobrarA: "nadie" }, AHORA, duenio).ok, true);
  assert.equal(avisoDeLaFalta(otro.e, r2.id), null);
});
