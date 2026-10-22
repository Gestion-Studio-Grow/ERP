// La grilla de canchas del día contra el motor REAL del club sobre la demo: columnas y franjas, cada turno en su
// lugar con su señal, la raya de «ahora», las flechas del teclado y el reuso de celdas (que React sólo repinte el
// tramo que cambió).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import { destinosParaMover, opcionesCiclo } from "./ciclo-core";
import { reservar } from "./alta-core";
import { DIAS_ANTES, DIAS_DESPUES, abrirCobrandoLaDeuda, armarAgenda, botonesDelMomento, buscarLugar, calendarioDeLaAgenda, compartirAgenda, diasDeLaAgenda, fueraDelCalendario, horaPorDefecto, marcaDelTurno, opcionesDelMenu, ponerLuz, previaArrastre, senalDelTurno, velocidadAlBorde, vecino } from "./agenda-core";
import { bajarFijosDelDia, diasDeLaEspera, ejecutarEspera, fijosPorBajar } from "./canchas-core";
import { correrComando, describirComando, rebasar, type Comando } from "./comandos-core";
import { textoDelEstado } from "./almacen";
import { ejecutar } from "./cuenta-core";

const HOY = "2026-10-17";
const AHORA: Ahora = { fecha: HOY, min: 19 * 60 + 10 };
const demo = (): EstadoClub => M.generarDemo(HOY, AHORA.min);

test("columnas por cancha y franjas del horario del día; cada turno en su cancha, desde su hora y por su duración", () => {
  const e = demo();
  const v = armarAgenda(e, HOY, AHORA);
  const { abre, cierra } = M.horarioDe(e, HOY);
  assert.deepEqual(v.canchas.map((c) => c.nombre), e.canchas.map((c) => c.nombre));
  assert.equal(v.desde, abre);
  assert.equal(v.filas, (cierra - abre) / e.config.paso, "una fila por franja, hasta el cierre (la madrugada incluida)");
  assert.equal(v.horas[0].texto, M.hhmm(abre));
  assert.ok(v.canchas.every((c) => !/Techada|Descubierta/.test(c.detalle)), "con las 4 techadas el techo no se repite en cada columna");
  M.configurarTecho(e, "c4", false, AHORA);
  assert.ok(armarAgenda(e, HOY, AHORA).canchas.some((c) => c.detalle.startsWith("Descubierta")), "en un club mixto se ve cuál es la descubierta");

  const delDia = e.reservas.filter((r) => r.fecha === HOY && ["reservada", "en_cancha", "finalizada"].includes(r.estado));
  assert.equal(v.turnos.length, delDia.length);
  for (const r of delDia) {
    const t = v.turnos.find((x) => x.id === r.id);
    assert.ok(t, `${r.titular} está en la grilla`);
    assert.equal(t.columna, e.canchas.findIndex((c) => c.id === r.canchaId));
    assert.equal(t.fila, (r.inicio - abre) / e.config.paso);
    assert.equal(t.alto, r.duracion / e.config.paso);
    assert.equal(t.horario, `${M.hhmm(r.inicio)}–${M.hhmm(r.inicio + r.duracion)}`);
    assert.match(t.etiqueta, new RegExp(r.titular.replace(/[()]/g, ".")));
    assert.match(t.etiqueta, new RegExp(M.cancha(e, r.canchaId)!.nombre));
  }
  // Orden de lectura (el del Tab): cancha por cancha, de arriba hacia abajo.
  for (let i = 1; i < v.turnos.length; i++) {
    const a = v.turnos[i - 1];
    const b = v.turnos[i];
    assert.ok(a.columna < b.columna || (a.columna === b.columna && a.fila <= b.fila));
  }
  assert.equal(v.ahora, (AHORA.min - abre) / e.config.paso, "la raya de ahora, a las 19:10");
  assert.match(v.resumen, /^\d+ turnos · \d+ en cancha/);
});

test("una sola señal por turno, y sólo si pide acción (falta la seña, debe la cancha, la mesa sigue)", () => {
  const e = demo();
  const v = armarAgenda(e, HOY, AHORA);
  for (const t of v.turnos) {
    const r = M.reserva(e, t.id)!;
    assert.equal(t.senal, senalDelTurno(e, r));
    assert.deepEqual(t.marca, marcaDelTurno(r, t.senal));
  }
  const debe = v.turnos.find((t) => t.estado === "en_cancha" && t.senal);
  assert.ok(debe, "hay un turno en cancha que debe");
  assert.equal(debe.senal, `debe ${M.pesos(M.saldo(M.reserva(e, debe.id)!))}`);
  assert.equal(debe.marca.tipo, "atencion");
  const sinSena = v.turnos.find((t) => t.estado === "reservada" && t.senal?.startsWith("falta seña"));
  assert.ok(sinSena, "hay un turno reservado al que le falta la seña");
  assert.deepEqual(sinSena.marca, { tipo: "atencion", texto: "Reservada" }, "la forma pide acción; la señal dice cuánto");
  // Lo que está bien no se anuncia.
  const cerrados = v.turnos.filter((t) => t.estado === "finalizada" && !t.senal);
  assert.ok(cerrados.length > 0 && cerrados.every((t) => t.marca.tipo === "hecho"));
});

test("la grilla de otro día no lleva la raya de ahora; lo cancelado no ocupa la cancha", () => {
  const e = demo();
  const manana = M.sumarDias(HOY, 1);
  assert.equal(armarAgenda(e, manana, AHORA).ahora, null);
  const r = e.reservas.find((x) => x.fecha === HOY && x.estado === "reservada");
  assert.ok(r);
  r.estado = "cancelada";
  assert.ok(!armarAgenda(e, HOY, AHORA).turnos.some((t) => t.id === r.id));
});

test("compartirAgenda: misma grilla → la MISMA vista; tocar un turno → sólo su celda es nueva", () => {
  const e = demo();
  const v1 = armarAgenda(e, HOY, AHORA);
  const v2 = compartirAgenda(v1, armarAgenda(e, HOY, AHORA));
  assert.equal(v2, v1, "sin cambios, React no repinta la agenda");

  // «A cargo de» no cambia nada de la grilla (no se cobra): la agenda queda igual.
  const enJuego = e.reservas.find((r) => r.fecha === HOY && r.estado === "en_cancha" && r.jugadores.length === 4 && M.saldo(r) > 0)!;
  assert.equal(ejecutar(e, enJuego.id, { tipo: "aCargoCancha", idx: 2, de: "1" }, AHORA).ok, true);
  assert.equal(compartirAgenda(v1, armarAgenda(e, HOY, AHORA)), v1);

  // Cobrar todo cambia la señal de ESE turno: sólo su celda es un objeto nuevo.
  assert.equal(ejecutar(e, enJuego.id, { tipo: "cobrarTodo", medio: "efectivo" }, AHORA).ok, true);
  const v3 = compartirAgenda(v1, armarAgenda(e, HOY, AHORA));
  assert.notEqual(v3, v1);
  const nuevas = v3.turnos.filter((t) => !v1.turnos.includes(t)).map((t) => t.id);
  assert.deepEqual(nuevas, [enJuego.id]);
  assert.equal(v3.turnos.find((t) => t.id === enJuego.id)!.senal, null);
  assert.equal(v3.canchas, v1.canchas, "el encabezado tampoco se repinta");
  assert.equal(v3.horas, v1.horas);
});

test("las flechas: ↑/↓ en la misma cancha, ←/→ al turno de la cancha de al lado que se superpone", () => {
  const turnos = [
    { id: "a1", columna: 0, fila: 0, alto: 3 },
    { id: "a2", columna: 0, fila: 3, alto: 3 },
    { id: "b1", columna: 1, fila: 2, alto: 3 },
    { id: "d1", columna: 3, fila: 10, alto: 3 },
  ];
  assert.equal(vecino(turnos, "a1", "abajo"), "a2");
  assert.equal(vecino(turnos, "a2", "arriba"), "a1");
  assert.equal(vecino(turnos, "a1", "arriba"), null);
  assert.equal(vecino(turnos, "a2", "abajo"), null);
  assert.equal(vecino(turnos, "a2", "derecha"), "b1", "se superpone con b1");
  assert.equal(vecino(turnos, "b1", "izquierda"), "a2", "el centro de b1 cae en a2");
  assert.equal(vecino(turnos, "b1", "derecha"), "d1", "saltea la cancha vacía");
  assert.equal(vecino(turnos, "d1", "derecha"), null);
  assert.equal(vecino(turnos, "a1", "izquierda"), null);
  assert.equal(vecino(turnos, "x", "abajo"), null);
});

test("los días de arriba: ayer, hoy y los cinco que siguen (los del vanilla)", () => {
  const dias = diasDeLaAgenda(HOY);
  assert.equal(DIAS_ANTES, 1);
  assert.equal(DIAS_DESPUES, 5);
  assert.deepEqual(dias.map((d) => d.fecha), [-1, 0, 1, 2, 3, 4, 5].map((i) => M.sumarDias(HOY, i)));
  assert.deepEqual(dias.slice(0, 3).map((d) => d.cerca), ["Ayer", "Hoy", "Mañana"]);
  assert.equal(dias[1].nombre, "Hoy");
  assert.match(dias[0].nombre, /^[A-ZÁÉÍÓÚ][a-záéíóú]{2}$/, "ayer se lee con el nombre del día, como el club de hoy");
  assert.equal(dias[3].nombre, M.NOMBRE_DIA[M.diaSemana(dias[3].fecha)].slice(0, 3));
  assert.equal(dias[1].ddmm, "17/10");
  assert.match(dias[0].etiqueta, /^Ayer, \S+ 16\/10$/);
});

test("ayer es la MISMA grilla: el encabezado y las horas se reusan, sin raya de ahora ni huecos para reservar", () => {
  const e = demo();
  const ayer = M.sumarDias(HOY, -1);
  const v1 = armarAgenda(e, HOY, AHORA);
  const v2 = compartirAgenda(v1, armarAgenda(e, ayer, AHORA));
  assert.equal(v2.fecha, ayer);
  assert.equal(v2.canchas, v1.canchas, "mismas canchas: el encabezado no se repinta");
  if (M.horarioDe(e, ayer).abre === M.horarioDe(e, HOY).abre && M.horarioDe(e, ayer).cierra === M.horarioDe(e, HOY).cierra) assert.equal(v2.horas, v1.horas);
  assert.equal(v2.ahora, null);
  assert.equal(v2.libres.length, 0, "lo de ayer ya pasó: no hay huecos para dar turno");
  assert.ok(v2.turnos.every((t) => !t.atencion), "lo urgente se marca sólo en la grilla de hoy");
});

test("necesita atención: los turnos de una alerta urgente del motor, sólo hoy", () => {
  const e = demo();
  const v = armarAgenda(e, HOY, AHORA);
  const urgentes = new Set(M.alertas(e, AHORA).filter((a) => a.nivel === "alta" && a.reservaId).map((a) => a.reservaId));
  assert.ok(urgentes.size > 0, "la demo trae alertas urgentes de turnos");
  for (const t of v.turnos) {
    assert.equal(t.atencion, urgentes.has(t.id), t.titular);
    if (t.atencion) assert.match(t.etiqueta, /necesita atención/);
  }
});

test("la luz: se prende y se apaga a mano; el motor la prende al abrir la cancha y la apaga al cerrarla", () => {
  const e = demo();
  const c = e.canchas.find((x) => x.estado === "ok" && !e.luces[x.id])!;
  assert.ok(c, "hay una cancha con la luz apagada");
  assert.deepEqual(ponerLuz(e, c.id, true), { ok: true, mensaje: `Luz de ${c.nombre} prendida.` });
  assert.equal(e.luces[c.id], true);
  assert.equal(ponerLuz(e, c.id, true).ok, false, "ya estaba prendida");
  assert.deepEqual(ponerLuz(e, c.id, false), { ok: true, mensaje: `Luz de ${c.nombre} apagada.` });
  assert.equal(ponerLuz(e, "no-existe", true).ok, false);

  // Prender o apagar no cambia la grilla: la MISMA vista (ni la agenda ni los turnos se repintan).
  const v1 = armarAgenda(e, HOY, AHORA);
  ponerLuz(e, c.id, true);
  assert.equal(compartirAgenda(v1, armarAgenda(e, HOY, AHORA)), v1);
  ponerLuz(e, c.id, false);

  // Abrir la cancha la prende; cerrarla la apaga (motor: checkIn / finalizar).
  const r = e.reservas.find((x) => x.fecha === HOY && x.estado === "reservada" && x.canchaId === c.id && M.minutosHasta(AHORA, x.fecha, x.inicio) > 0) ??
    e.reservas.find((x) => x.fecha === HOY && x.estado === "reservada" && M.minutosHasta(AHORA, x.fecha, x.inicio) > 0)!;
  assert.ok(r, "hay un turno por empezar");
  for (const x of e.canchas) e.luces[x.id] = false;
  r.sena.pagada = true;
  const abrir = M.checkIn(e, r.id, AHORA);
  assert.equal(abrir.ok, true, abrir.ok ? "" : abrir.motivo);
  assert.equal(e.luces[r.canchaId], true, "al abrir la cancha se prende la luz");
  M.registrarPago(e, r.id, { medio: "efectivo", monto: M.saldo(r) }, AHORA);
  const cerrar = M.finalizar(e, r.id, {}, AHORA);
  assert.equal(cerrar.ok, true, cerrar.ok ? "" : cerrar.motivo);
  assert.equal(e.luces[r.canchaId], false, "al cerrar la cancha se apaga la luz");
});

test("menú rápido del turno (clic derecho): abrir la cancha si llegan hoy, cerrar si no debe, cobrar con el monto", () => {
  const e = demo();
  const reservado = e.reservas.find((r) => r.fecha === HOY && r.estado === "reservada")!;
  assert.deepEqual(opcionesDelMenu(e, reservado.id, HOY).map((o) => o.accion).slice(0, 1), ["abrirCancha"]);
  const debe = e.reservas.find((r) => r.fecha === HOY && r.estado === "en_cancha" && M.saldo(r) > 0)!;
  const op = opcionesDelMenu(e, debe.id, HOY);
  assert.ok(!op.some((o) => o.accion === "cerrarCancha"), "debe plata: no se cierra desde el menú");
  assert.match(op.find((o) => o.accion === "ver")!.texto, /^Cobrar · \$/);
  M.registrarPago(e, debe.id, { medio: "efectivo", monto: M.saldo(debe) }, AHORA);
  assert.ok(opcionesDelMenu(e, debe.id, HOY).some((o) => o.accion === "cerrarCancha"));
  assert.deepEqual(opcionesDelMenu(e, "no-existe", HOY), []);
});

test("arrastrar un turno: cae en la cancha y hora de la grilla y respeta los solapes (como «Mover»); estirar de a media hora", () => {
  const e = demo();
  const v = armarAgenda(e, HOY, AHORA);
  const r = e.reservas.find((x) => x.fecha === HOY && x.estado === "reservada")!;
  const col = v.canchas.findIndex((c) => c.id === r.canchaId);
  const fila = Math.round((r.inicio - v.desde) / v.paso);
  const mismo = previaArrastre(e, v, r.id, { modo: "mover", columna: col, fila }, AHORA)!;
  assert.equal(mismo.ok, false, "soltarlo donde estaba no hace nada");
  // Encima de otro turno de su misma cancha: no entra.
  const otro = e.reservas.find((x) => x.fecha === HOY && x.canchaId === r.canchaId && x.id !== r.id && ["reservada", "en_cancha"].includes(x.estado))!;
  const choca = previaArrastre(e, v, r.id, { modo: "mover", columna: col, fila: Math.round((otro.inicio - v.desde) / v.paso) }, AHORA)!;
  assert.equal(choca.ok, false);
  assert.ok(choca.motivo.length > 0);
  // Fuera de la grilla, se acomoda adentro (no se cae del borde).
  const borde = previaArrastre(e, v, r.id, { modo: "mover", columna: 99, fila: -5 }, AHORA)!;
  assert.equal(borde.columna, v.canchas.length - 1);
  assert.equal(borde.fila, 0);
  const estira = previaArrastre(e, v, r.id, { modo: "estirar", filas: 1.4 }, AHORA)!;
  assert.equal(estira.modo === "estirar" && estira.minutos, v.paso);
  assert.equal(previaArrastre(e, v, "no-existe", { modo: "estirar", filas: 1 }, AHORA), null);
});

test("arrastrar respeta las reglas de «Mover»: nada a una hora que ya pasó; jugando, sólo otra cancha a la misma hora (regresión 21/10)", () => {
  const e = demo();
  const v = armarAgenda(e, HOY, AHORA);
  // Un turno reservado de más tarde, soltado a primera hora (ya pasó): no.
  const tarde = e.reservas.find((x) => x.fecha === HOY && x.estado === "reservada" && x.inicio > AHORA.min)!;
  const colT = v.canchas.findIndex((c) => c.id === tarde.canchaId);
  const temprano = previaArrastre(e, v, tarde.id, { modo: "mover", columna: colT, fila: 0 }, AHORA)!;
  assert.equal(temprano.ok, false);
  assert.match(temprano.motivo, /ya pasó/);
  // Jugando: a otra hora, no (aunque el hueco esté libre).
  const jugando = e.reservas.find((x) => x.fecha === HOY && x.estado === "en_cancha")!;
  const colJ = v.canchas.findIndex((c) => c.id === jugando.canchaId);
  const filaJ = Math.round((jugando.inicio - v.desde) / v.paso);
  const antes = previaArrastre(e, v, jugando.id, { modo: "mover", columna: colJ, fila: filaJ - 2 }, AHORA)!;
  assert.equal(antes.ok, false);
  assert.match(antes.motivo, /misma hora/);
  // Jugando, a otra cancha a la misma hora, si está libre: sí (lo mismo que ofrece «Mover»).
  const destinos = destinosParaMover(e, jugando.id, AHORA);
  if (destinos.length) {
    const d = destinos[0];
    const ok = previaArrastre(e, v, jugando.id, { modo: "mover", columna: v.canchas.findIndex((c) => c.id === d.canchaId), fila: filaJ }, AHORA)!;
    assert.equal(ok.ok, true, "a otra cancha libre a la misma hora, entra");
  }
  // Un reservado a una hora libre que todavía no pasó: entra (y coincide con «Mover»).
  const libre = destinosParaMover(e, tarde.id, AHORA)[0];
  const h = libre.horas[0].min;
  const entra = previaArrastre(e, v, tarde.id, { modo: "mover", columna: v.canchas.findIndex((c) => c.id === libre.canchaId), fila: Math.round((h - v.desde) / v.paso) }, AHORA)!;
  assert.equal(entra.ok, true);
  // Un turno cerrado no se arrastra; uno que ya terminó no se estira.
  const cerrado = e.reservas.find((x) => x.fecha === HOY && x.estado === "finalizada");
  if (cerrado) assert.equal(previaArrastre(e, v, cerrado.id, { modo: "estirar", filas: 1 }, AHORA), null);
  const tardeDeMas = { fecha: HOY, min: tarde.inicio + tarde.duracion + 30 };
  const noEstira = previaArrastre(e, v, tarde.id, { modo: "estirar", filas: 1 }, tardeDeMas)!;
  assert.equal(noEstira.ok, false);
  assert.match(noEstira.motivo, /ya terminó/);
});

test("el motor también valida «Mover» y «Extender» (no sólo la pantalla): jugando, misma hora; nada a una hora pasada; se alarga uno en cancha aunque se haya pasado de hora (21/10)", () => {
  const e = demo();
  const jugando = e.reservas.find((x) => x.fecha === HOY && x.estado === "en_cancha")!;
  const otra = e.canchas.find((c) => c.id !== jugando.canchaId)!;
  const r1 = M.mover(e, jugando.id, { canchaId: otra.id, inicio: jugando.inicio - 60 }, AHORA);
  assert.equal(r1.ok, false);
  assert.match((r1 as { motivo: string }).motivo, /misma hora/);
  const tarde = e.reservas.find((x) => x.fecha === HOY && x.estado === "reservada" && x.inicio > AHORA.min)!;
  const r2 = M.mover(e, tarde.id, { canchaId: tarde.canchaId, inicio: 9 * 60 }, AHORA);
  assert.equal(r2.ok, false);
  assert.match((r2 as { motivo: string }).motivo, /ya pasó/);
  // Reservado que ya terminó sin jugarse: no se alarga.
  const r3 = M.extender(e, tarde.id, 30, { fecha: HOY, min: tarde.inicio + tarde.duracion + 10 });
  assert.equal(r3.ok, false);
  // En cancha y pasado de hora (se quedan): se alarga si hay lugar.
  const pasado = { fecha: HOY, min: jugando.inicio + jugando.duracion + 5 };
  const libre = M.validarHueco(e, { canchaId: jugando.canchaId, fecha: HOY, inicio: jugando.inicio + jugando.duracion, duracion: 30 }).ok;
  assert.equal(M.extender(e, jugando.id, 30, pasado).ok, libre);
});

test("plan lluvia con la regla nueva de «Mover»: un reservado que ya terminó sin jugarse no se toca, y nada figura «movido» si no se movió (Gate 21/10)", () => {
  const e = demo();
  const c1 = e.canchas[0];
  M.configurarTecho(e, c1.id, false, AHORA);
  // Un turno de la mañana, reservado y nunca jugado, en la cancha que ahora es descubierta.
  const { abre } = M.horarioDe(e, HOY);
  const libre = Array.from({ length: 16 }, (_, i) => abre + i * e.config.paso).find((m) => M.validarHueco(e, { canchaId: c1.id, fecha: HOY, inicio: m, duracion: 60 }).ok)!;
  assert.ok(libre < AHORA.min - 60, "hay un hueco a la mañana");
  const r = reservar(e, { canchaId: c1.id, fecha: HOY, inicio: libre, duracion: 60, tipo: "turno", titular: "Mañanero", clienteId: null, otros: "" }, { fecha: HOY, min: 8 * 60 });
  assert.ok(r.ok, r.mensaje);
  const p = M.planLluvia(e, HOY, 8 * 60, 22 * 60, AHORA);
  assert.equal(p.ok, true);
  assert.ok(!p.resultado.some((x) => x.reservaId === r.reservaId), "el de la mañana que no vino no es de la lluvia");
  assert.equal(M.reserva(e, r.reservaId!)!.canchaId, c1.id);
  for (const x of p.resultado.filter((y) => y.accion === "movido")) assert.notEqual(M.reserva(e, x.reservaId)!.canchaId, c1.id, `${x.titular} figura movido y se movió`);
});

test("menú rápido: «Mover…» y «Marcar falta…» con las MISMAS reglas que la cuenta del turno (opcionesCiclo)", () => {
  const e = demo();
  const acciones = (id: string) => opcionesDelMenu(e, id, HOY).map((o) => o.accion);
  for (const r of e.reservas.filter((x) => x.fecha === HOY)) {
    const ciclo = opcionesCiclo(r);
    assert.equal(acciones(r.id).includes("mover"), ciclo.mover, `${r.titular} (${r.estado}): «Mover…» como en la cuenta`);
    assert.equal(acciones(r.id).includes("falta"), ciclo.falta, `${r.titular} (${r.estado}): «Marcar falta…» como en la cuenta`);
  }
  // Reservado: Mover… y, al final, separada y en rojo, la falta. Jugando: se mueve (a otra cancha), la falta no.
  const reservado = e.reservas.find((r) => r.fecha === HOY && r.estado === "reservada")!;
  const op = opcionesDelMenu(e, reservado.id, HOY);
  assert.deepEqual(op.slice(-2).map((o) => [o.texto, !!o.peligro]), [["Mover…", false], ["Marcar falta…", true]]);
  const jugando = e.reservas.find((r) => r.fecha === HOY && r.estado === "en_cancha")!;
  assert.ok(acciones(jugando.id).includes("mover"));
  assert.ok(!acciones(jugando.id).includes("falta"));
  // Cerrado: sólo verlo.
  const cerrado = e.reservas.find((r) => r.fecha === HOY && r.estado === "finalizada");
  if (cerrado) assert.deepEqual(acciones(cerrado.id), ["ver"]);
});

test("arrastrar hasta el borde corre la grilla: quieto en el medio, más rápido cuanto más adentro de la franja del borde", () => {
  const borde = { zona: 40, maxima: 18 };
  // La parte visible va de 100 a 500 (debajo de la cabecera fija).
  assert.equal(velocidadAlBorde(300, 100, 500, borde), 0, "en el medio no se corre");
  assert.equal(velocidadAlBorde(140, 100, 500, borde), 0);
  assert.equal(velocidadAlBorde(460, 100, 500, borde), 0);
  assert.ok(velocidadAlBorde(130, 100, 500, borde) < 0, "cerca de arriba, sube");
  assert.ok(velocidadAlBorde(470, 100, 500, borde) > 0, "cerca de abajo, baja");
  assert.ok(Math.abs(velocidadAlBorde(105, 100, 500, borde)) > Math.abs(velocidadAlBorde(135, 100, 500, borde)), "más cerca del borde, más rápido");
  // Afuera de la grilla (sobre la cabecera, o el puntero se fue de la tablet), la máxima.
  assert.equal(velocidadAlBorde(20, 100, 500, borde), -18);
  assert.equal(velocidadAlBorde(900, 100, 500, borde), 18);
  // Una grilla chica: la franja se achica a un tercio, siempre queda un medio quieto.
  assert.equal(velocidadAlBorde(130, 100, 160, borde), 0);
  assert.equal(velocidadAlBorde(100, 100, 100, borde), 0, "sin lugar visible no se corre");
});

test("cada hueco libre dice cuánto entra: «+ 20:30 · 30 min» si no aguanta la duración de siempre (reingeniería BP · 1A)", () => {
  const e = demo();
  const martes = M.sumarDias(HOY, 3);
  const beto = reservar(e, { canchaId: "c2", fecha: martes, inicio: 21 * 60, duracion: 90, tipo: "clase", titular: "Beto", clienteId: null, otros: "" }, AHORA);
  assert.equal(beto.ok, true, beto.mensaje);
  const v = armarAgenda(e, martes, AHORA);
  const hueco = (min: number) => v.libres.find((l) => l.canchaId === "c2" && l.min === min);
  assert.deepEqual([hueco(20 * 60 + 30)?.cuantoEntra, hueco(20 * 60 + 30)?.corto], [30, true], "a las 20:30 entran 30 min: corto");
  assert.deepEqual([hueco(19 * 60 + 30)?.cuantoEntra, hueco(19 * 60 + 30)?.corto], [90, false], "a las 19:30 entra justo");
  for (const l of v.libres) assert.equal(l.cuantoEntra, M.cuantoEntra(e, martes, l.canchaId, l.min).minutos, l.etiqueta);
  // La etiqueta para el lector de pantalla no cambia (la usa la navegación por teclado).
  assert.equal(hueco(20 * 60 + 30)?.etiqueta, "Cancha 2, 20:30, libre: reservar");
  // Un turno que cambia cuánto entra en un hueco cambia la firma (React repinta ese hueco).
  const antes = armarAgenda(e, martes, AHORA);
  const r = reservar(e, { canchaId: "c2", fecha: martes, inicio: 18 * 60 + 30, duracion: 60, tipo: "clase", titular: "Otra", clienteId: null, otros: "" }, AHORA);
  assert.equal(r.ok, true, r.mensaje);
  const despues = compartirAgenda(antes, armarAgenda(e, martes, AHORA));
  const h = despues.libres.find((l) => l.canchaId === "c2" && l.min === 18 * 60)!;
  assert.equal(h.cuantoEntra, 30);
  assert.notEqual(despues.firma, antes.firma);
});

test("BP-005 · el menú del bloque: con la seña sin pagar, «Cobrar la seña y abrir · $X» en vez de «Abrir cancha»", () => {
  const e = M.generarDemo(HOY, AHORA.min);
  const r = e.reservas.find((x) => x.fecha === HOY && x.estado === "reservada" && !(x.sena.monto > 0))!;
  assert.deepEqual(opcionesDelMenu(e, r.id, HOY).map((o) => o.accion).slice(0, 1), ["abrirCancha"]);
  r.sena = { ...r.sena, monto: 14000, pagada: false };
  const op = opcionesDelMenu(e, r.id, HOY);
  assert.equal(op[0].accion, "cobrarSenaYAbrir");
  assert.equal(op[0].texto, `Cobrar la seña y abrir · ${M.pesos(14000 - r.pagos.reduce((s, p) => s + p.monto, 0))}`);
  assert.ok(!op.some((o) => o.accion === "abrirCancha"), "no «Abrir cancha»");
});

test("BP-013 · el calendario de la agenda: hoy es domingo → +13 (el sábado de la semana próxima) se elige y se ve; +15 no", () => {
  const e = M.generarDemo(HOY, AHORA.min);
  const domingo = M.sumarDias(HOY, (7 - M.diaSemana(HOY)) % 7);
  assert.equal(M.diaSemana(domingo), 0);
  const cal = calendarioDeLaAgenda(e, domingo);
  assert.equal(cal.dias, 14, "el mismo número que el turnero");
  assert.equal(cal.min, domingo);
  assert.equal(cal.max, M.sumarDias(domingo, 14));
  const mas13 = M.sumarDias(domingo, 13);
  assert.equal(M.diaSemana(mas13), 6, "+13 es el sábado de la semana próxima");
  assert.equal(fueraDelCalendario(cal, mas13), null);
  assert.equal(fueraDelCalendario(cal, M.sumarDias(domingo, 14)), null);
  assert.match(fueraDelCalendario(cal, M.sumarDias(domingo, 15))!, /^Todavía no se reserva para ese día\. Se reserva hasta el domingo \d+\/\d+ \(14 días\)\.$/);
  assert.match(fueraDelCalendario(cal, M.sumarDias(domingo, -3))!, /ya pasó/);
  // El día elegido fuera de los 7 se suma como un botón más (y uno fuera de la ventana, no).
  const dias = diasDeLaAgenda(domingo, mas13, cal.dias);
  assert.equal(dias.length, 8);
  assert.equal(dias.at(-1)!.fecha, mas13);
  assert.equal(dias.at(-1)!.nombre, "Sáb");
  assert.equal(diasDeLaAgenda(domingo, M.sumarDias(domingo, 15), cal.dias).length, 7);
  assert.equal(diasDeLaAgenda(domingo, M.sumarDias(domingo, 2), cal.dias).length, 7, "uno de los 7 no se repite");
  // Lo edita el dueño en Reglas: con 10, +11 ya no.
  e.config.diasAdelante = 10;
  assert.ok(fueraDelCalendario(calendarioDeLaAgenda(e, domingo), M.sumarDias(domingo, 11)));
});

test("BP-013 · un día lejano del calendario baja sus turnos fijos a la grilla (una vez: abrirlo de nuevo no los repite)", () => {
  const e = M.generarDemo(HOY, AHORA.min);
  const f = e.fijos[0];
  assert.ok(f, "la demo trae turnos fijos");
  let lejos = M.sumarDias(HOY, 8);
  while (M.diaSemana(lejos) !== f.dia) lejos = M.sumarDias(lejos, 1);
  assert.ok(fijosPorBajar(e, lejos) > 0, "a +8 o más, los fijos todavía no están en la grilla");
  const d = bajarFijosDelDia(e, lejos);
  assert.equal(d.ok, true, d.mensaje);
  assert.ok(e.reservas.some((r) => r.fijoId === f.id && r.fecha === lejos));
  assert.equal(fijosPorBajar(e, lejos), 0);
  const n = e.reservas.length;
  bajarFijosDelDia(e, lejos);
  assert.equal(e.reservas.length, n, "idempotente");
});

// ═════════════ Tanda 2C · la agenda: botón del momento, calendario +14, buscar lugar, marcas (BP-060…BP-066) ═════════════

/** Un día sin la historia de la demo (martes que viene): la grilla vacía para armar cada caso a mano. */
const MARTES = M.sumarDias(HOY, 3);
const a = (min: number, fecha = MARTES): Ahora => ({ fecha, min });
/** Un turno nuevo en ese día, con la ficha de un cliente de la demo. Sin seña salvo que el caso la ponga. */
function turno(e: EstadoClub, canchaId: string, inicio: number, extra: Partial<{ duracion: number; clienteId: string | null; titular: string; origen: string; tipo: "turno" | "fijo" | "clase" }> = {}) {
  const res = M.crearReserva(e, { canchaId, fecha: MARTES, inicio, duracion: 90, clienteId: "k3", ...extra } as Parameters<typeof M.crearReserva>[1], a(8 * 60));
  assert.equal(res.ok, true, res.ok ? "" : res.motivo);
  const r = res.reserva;
  r.sena = { ...r.sena, monto: 0, pagada: false };
  return r;
}
const acciones = (e: EstadoClub, r: { id: string }, ahora: Ahora) => botonesDelMomento(e, M.reserva(e, r.id)!, ahora).map((b) => b.accion);

test("BP-060 · el calendario de la agenda y la lista de espera llegan a hoy + 14; +15 no (ni en el calendario ni al anotar)", () => {
  const e = demo();
  const cal = calendarioDeLaAgenda(e, HOY);
  assert.equal(cal.max, M.sumarDias(HOY, 14));
  assert.equal(fueraDelCalendario(cal, M.sumarDias(HOY, 14)), null);
  assert.ok(fueraDelCalendario(cal, M.sumarDias(HOY, 15)));
  // La lista de espera: la misma ventana (antes, sólo la semana a la vista).
  const dias = diasDeLaEspera(e, HOY);
  assert.equal(dias.length, 15);
  assert.equal(dias.at(-1), M.sumarDias(HOY, 14));
  const anotar = (fecha: string) => ejecutarEspera(e, { tipo: "anotar", titular: "Lola Paz", clienteId: null, fecha, desde: 20 * 60, hasta: 22 * 60, duracion: 90, soloCubierta: false }, AHORA);
  assert.equal(anotar(M.sumarDias(HOY, 14)).ok, true);
  const mas15 = anotar(M.sumarDias(HOY, 15));
  assert.equal(mas15.ok, false);
  assert.match(mas15.mensaje, /hasta 14 días adelante/);
  assert.equal(anotar(M.sumarDias(HOY, -1)).ok, false, "un día que ya pasó, tampoco");
  e.config.diasAdelante = 10;
  assert.equal(diasDeLaEspera(e, HOY).length, 11, "lo edita el dueño en Reglas");
});

test("BP-061 · «Abrir» aparece en el bloque a ≤ 15 min con la seña paga (o sin seña), y no antes; respeta «minutos antes para entrar»", () => {
  const e = demo();
  const r = turno(e, "c2", 20 * 60);
  assert.deepEqual(acciones(e, r, a(20 * 60 - 16)), [], "a 16 min, todavía nada");
  assert.deepEqual(acciones(e, r, a(20 * 60 - 15)), ["abrir"]);
  assert.deepEqual(acciones(e, r, a(20 * 60 + 10)), ["abrir"], "llegaron tarde, dentro de la tolerancia");
  r.sena = { monto: 21000, pagada: true };
  assert.deepEqual(acciones(e, r, a(20 * 60 - 5)), ["abrir"], "con la seña paga, «Abrir»");
  e.config.politica.minutosAntesParaEntrar = 10;
  assert.deepEqual(acciones(e, r, a(20 * 60 - 12)), [], "el club abre desde 10 min antes: a 12, nada");
  assert.deepEqual(acciones(e, r, a(20 * 60 - 10)), ["abrir"]);
  // El toque hace lo mismo que el menú: el comando «cuenta» abrirCancha (en cancha, luz prendida).
  const c = comando(e, "cuenta", [r.id, { tipo: "abrirCancha" }], a(20 * 60 - 5));
  assert.equal(correrComando(e, c).ok, true);
  assert.equal(M.reserva(e, r.id)!.estado, "en_cancha");
  assert.equal(e.luces.c2, true);
});

test("BP-062 · con la seña sin pagar el bloque ofrece «Seña y abrir» (no «Abrir»); con transferencia queda en cancha y la caja la tiene", () => {
  const e = demo();
  const r = turno(e, "c2", 20 * 60);
  r.sena = { monto: 21000, pagada: false };
  const [b] = botonesDelMomento(e, r, a(20 * 60 - 5));
  assert.equal(b.accion, "cobrarSenaYAbrir");
  assert.equal(b.monto, 21000);
  assert.equal(b.texto, "Seña y abrir");
  assert.match(b.etiqueta, /^Cobrar la seña de \$\s?21\.000 y abrir la cancha de /);
  const caja = e.caja.movimientos.length;
  assert.equal(correrComando(e, comando(e, "cuenta", [r.id, { tipo: "cobrarSenaYAbrir", medio: "transferencia" }], a(20 * 60 - 5))).ok, true);
  assert.equal(M.reserva(e, r.id)!.estado, "en_cancha");
  assert.equal(e.luces.c2, true);
  const nuevos = e.caja.movimientos.slice(caja);
  assert.deepEqual(nuevos.map((m) => [m.medio, m.monto]), [["transferencia", 21000]]);
});

test("BP-063 · el punto rojo de «debe» y el botón del momento también en los bloques de 60 min", () => {
  const e = demo();
  const agus = M.cliente(e, "k10")!;
  assert.ok(agus.deuda > 0, "Agustina debe de antes (demo)");
  const r = turno(e, "c3", 19 * 60, { duracion: 60, clienteId: "k10" });
  const celda = armarAgenda(e, MARTES, a(19 * 60 - 10)).turnos.find((t) => t.id === r.id)!;
  assert.equal(celda.alto, 2, "un turno de 60 min ocupa dos franjas");
  assert.equal(celda.deudor, true, "lleva la marca de deuda (el punto rojo lo pinta la grilla en TODOS los bloques)");
  assert.match(celda.etiqueta, /tiene saldo deudor de/);
  // «Abrir» con punto rojo: el botón dice cuánto debe de antes.
  assert.deepEqual(celda.momento.map((m) => [m.accion, m.monto]), [["abrir", agus.deuda]]);
  assert.match(celda.momento[0].etiqueta, /debe \$\s?21\.000 de antes/);
});

test("botón del momento en cancha: +30 min (≤ 10 min y hueco libre), cobrar si no se puede extender o terminó y debe, «Cerrar» y «La mesa sigue» si está paga; «No vino» pasada la tolerancia", () => {
  const e = demo();
  const r = turno(e, "c2", 18 * 60);
  M.checkIn(e, r.id, a(18 * 60));
  assert.deepEqual(acciones(e, r, a(19 * 60)), [], "a media hora del final, nada");
  const [ext] = botonesDelMomento(e, r, a(19 * 60 + 20));
  assert.equal(ext.accion, "extender");
  assert.equal(ext.minutos, 30);
  assert.equal(ext.monto, M.precioTurno(e, { canchaId: "c2", fecha: MARTES, inicio: 19 * 60 + 30, duracion: 30 }));
  assert.equal(ext.texto, `+30 min · ${M.pesos(ext.monto)}`);
  // Viene otro turno pegado: no se ofrece extender; como debe la cancha, «Cobrar».
  turno(e, "c2", 19 * 60 + 30, { clienteId: "k5" });
  const [cob] = botonesDelMomento(e, M.reserva(e, r.id)!, a(19 * 60 + 25));
  assert.equal(cob.accion, "cobrar");
  assert.equal(cob.monto, M.saldo(M.reserva(e, r.id)!));
  assert.deepEqual(acciones(e, r, a(19 * 60 + 35)), ["cobrar"], "terminó y debe");
  // Cobrar con un medio (comando «cuenta» cobrarCancha por lo que debe la cancha): queda paga → «Cerrar» · «La mesa sigue».
  assert.equal(correrComando(e, comando(e, "cuenta", [r.id, { tipo: "cobrarCancha", monto: cob.monto, medio: "mercadopago" }], a(19 * 60 + 35))).ok, true);
  assert.deepEqual(acciones(e, r, a(19 * 60 + 35)), ["cerrar", "mesaSigue"]);
  assert.equal(correrComando(e, comando(e, "cuenta", [r.id, { tipo: "cerrarYSeguir", medio: "efectivo" }], a(19 * 60 + 36))).ok, true);
  assert.equal(M.reserva(e, r.id)!.estado, "finalizada");
  assert.equal(M.reserva(e, r.id)!.mesaSigue, true);
  assert.deepEqual(acciones(e, r, a(19 * 60 + 40)), [], "cerrada: nada");
  // Reservado que no llegó: pasada la tolerancia (15 min), «No vino».
  const tarde = turno(e, "c4", 21 * 60);
  assert.deepEqual(acciones(e, tarde, a(21 * 60 + 15)), ["abrir"], "en el minuto 15 todavía está en tolerancia");
  assert.deepEqual(acciones(e, tarde, a(21 * 60 + 16)), ["noVino"]);
});

let nCmd = 0;
function comando<N extends Comando["nombre"]>(e: EstadoClub, nombre: N, args: Comando<N>["args"], ahora: Ahora): Comando<N> {
  return { id: `cmd-2c-${++nCmd}`, equipo: "pc", persona: "u-lu", versionBase: 1, version: M.VERSION_ESTADO, nombre, args, ahora, auth: { usuarioId: "u-lu" }, azar: 300 + nCmd, idsDesde: M.secuenciaIds() };
}

test("«Abrir» con deuda de antes → «Cobrar ahora»: la deuda y la cancha en UN comando (abrirConDeuda); o las dos cosas o ninguna", () => {
  const e = demo();
  const r = turno(e, "c3", 19 * 60, { clienteId: "k10" });
  const deuda = M.cliente(e, "k10")!.deuda;
  const caja = e.caja.movimientos.length;
  // Temprano (el club abre 10 min antes): no se abre y NO se cobra.
  e.config.politica.minutosAntesParaEntrar = 10;
  const temprano = abrirCobrandoLaDeuda(e, r.id, "efectivo", a(19 * 60 - 14));
  assert.equal(temprano.ok, false);
  assert.match(temprano.mensaje, /No se cobró nada/);
  assert.equal(e.caja.movimientos.length, caja);
  assert.equal(M.cliente(e, "k10")!.deuda, deuda);
  // Medio que no es de caja: nada.
  assert.equal(abrirCobrandoLaDeuda(e, r.id, "monedero" as never, a(19 * 60 - 5)).ok, false);
  // A tiempo: cobra la deuda entera con el medio y abre.
  const ok = abrirCobrandoLaDeuda(e, r.id, "debito", a(19 * 60 - 5));
  assert.equal(ok.ok, true, ok.mensaje);
  assert.equal(M.cliente(e, "k10")!.deuda, 0);
  assert.equal(M.reserva(e, r.id)!.estado, "en_cancha");
  assert.deepEqual(e.caja.movimientos.slice(caja).map((m) => [m.medio, m.monto]), [["debito", deuda]]);
  // Doble toque (o el otro puesto ya la abrió): no cobra dos veces.
  const otra = abrirCobrandoLaDeuda(e, r.id, "debito", a(19 * 60 - 4));
  assert.equal(otra.ok, false);
  assert.equal(e.caja.movimientos.length, caja + 1);
  // Con la seña sin pagar, no: primero la seña.
  const conSena = turno(e, "c4", 19 * 60, { clienteId: "k10" });
  conSena.sena = { monto: 21000, pagada: false };
  M.cliente(e, "k10")!.deuda = 5000;
  assert.match(abrirCobrandoLaDeuda(e, conSena.id, "efectivo", a(19 * 60 - 5)).mensaje, /Falta la seña/);
});

test("comando «abrirConDeuda»: re-aplicado sobre la misma base da lo mismo byte a byte; en otro puesto donde la deuda ya se cobró, abre sin cobrar dos veces; se cuenta en criollo", () => {
  M.prefijoIds("");
  const e0 = demo();
  const r = turno(e0, "c3", 19 * 60, { clienteId: "k10" });
  const texto = textoDelEstado(e0);
  const abrir = () => (JSON.parse(texto) as { estado: EstadoClub }).estado;
  const local = abrir();
  const c = comando(local, "abrirConDeuda", [r.id, "efectivo"], a(19 * 60 - 5));
  assert.equal(correrComando(local, c).ok, true);
  const deNuevo = abrir();
  const rb = rebasar(deNuevo, [c], new Set());
  assert.deepEqual(rb.rechazados, []);
  assert.equal(JSON.stringify(deNuevo), JSON.stringify(local), "el mismo estado, byte a byte");
  assert.equal(describirComando(c, abrir()), `18:55 · Cobro de la deuda ${M.pesos(21000)} efectivo y abrir la cancha de Agustina Romero (turno 19:00 C3) · Lu`);
  // Otro puesto ya cobró la deuda desde la ficha: al re-aplicar, abre y no cobra de nuevo.
  const otro = abrir();
  M.cobrarDeuda(otro, "k10", { medio: "efectivo" }, a(19 * 60 - 8));
  const caja = otro.caja.movimientos.length;
  const rb2 = rebasar(otro, [c], new Set());
  assert.deepEqual(rb2.rechazados, []);
  assert.equal(otro.caja.movimientos.length, caja, "ni un peso más");
  assert.equal(M.reserva(otro, r.id)!.estado, "en_cancha");
});

test("BP-064 · «Buscar lugar 20:00 · 90»: primero la cancha que ENTRA a esa hora, después lo más cerca en cada una; tocarla da cancha, hora y duración", () => {
  const e = demo();
  turno(e, "c1", 19 * 60 + 30); // C1 ocupada 19:30–21:00
  turno(e, "c2", 20 * 60 + 30); // C2: a las 20:00 entran 30 min
  const { opciones, aviso } = buscarLugar(e, { fecha: MARTES, inicio: 20 * 60, duracion: 90 }, AHORA);
  assert.equal(aviso, null);
  assert.deepEqual(
    opciones.map((o) => [o.canchaId, M.hhmm(o.inicio), o.exacto]),
    [
      ["c3", "20:00", true],
      ["c4", "20:00", true],
      ["c2", "19:00", false],
      ["c1", "21:00", false],
    ],
    "C3 y C4 entran a las 20:00 (en su orden); después lo más cerca: C2 a las 19:00 y C1 a las 21:00 (a 1 h las dos: primero la de antes)",
  );
  for (const o of opciones) {
    assert.equal(o.duracion, 90);
    assert.equal(o.precio, M.precioTurno(e, { canchaId: o.canchaId, fecha: MARTES, inicio: o.inicio, duracion: 90 }));
    assert.equal(o.etiqueta, `${M.cancha(e, o.canchaId)!.nombre} · ${M.hhmm(o.inicio)} · ${M.pesos(o.precio)}`);
    assert.equal(M.validarHueco(e, { canchaId: o.canchaId, fecha: MARTES, inicio: o.inicio, duracion: 90 }).ok, true, "lo que ofrece, entra");
  }
  // Ninguna entra a esa hora: lo dice y ofrece lo más cerca.
  turno(e, "c3", 19 * 60 + 30);
  turno(e, "c4", 19 * 60 + 30);
  const r2 = buscarLugar(e, { fecha: MARTES, inicio: 20 * 60, duracion: 90 }, AHORA);
  assert.match(r2.aviso!, /^A las 20:00 no entran 90 min en ninguna cancha/);
  assert.ok(r2.opciones.every((o) => !o.exacto));
  // Fuera de la ventana (+15) o un día que pasó: no ofrece nada.
  assert.match(buscarLugar(e, { fecha: M.sumarDias(HOY, 15), inicio: 20 * 60, duracion: 90 }, AHORA).aviso!, /Todavía no se reserva/);
  // Hoy: nada que ya empezó (salvo la hora pedida si sigue en juego). A las 19:10 no ofrece las 18:00.
  const hoy = buscarLugar(e, { fecha: HOY, inicio: 18 * 60, duracion: 60 }, AHORA);
  assert.ok(hoy.opciones.every((o) => o.inicio >= AHORA.min || o.inicio === 18 * 60));
  assert.equal(horaPorDefecto(e, MARTES, AHORA), 20 * 60, "propone las 20:00");
});

test("BP-066 · marcas del turno: «nuevo» (primer turno de la ficha), «web» (vino del turnero) y «fijo»; la firma cambia con ellas", () => {
  const e = demo();
  e.clientes.push({ ...M.cliente(e, "k3")!, id: "k-nuevo", nombre: "Bruno Nuevo", deuda: 0, movCC: [] });
  const nuevo = turno(e, "c1", 19 * 60, { clienteId: "k-nuevo" });
  const web = turno(e, "c2", 19 * 60, { origen: "web" });
  const fijo = turno(e, "c3", 19 * 60, { tipo: "fijo" });
  const sinFicha = turno(e, "c4", 19 * 60, { clienteId: null, titular: "Grupo de Bruno" });
  const v = armarAgenda(e, MARTES, AHORA);
  const celda = (id: string) => v.turnos.find((t) => t.id === id)!;
  assert.deepEqual([celda(nuevo.id).nuevo, celda(nuevo.id).web], [true, false]);
  assert.match(celda(nuevo.id).etiqueta, /cliente nuevo/);
  assert.deepEqual([celda(web.id).nuevo, celda(web.id).web], [false, true], "Martín ya jugó: no es nuevo");
  assert.match(celda(web.id).etiqueta, /reservó por la web/);
  assert.equal(celda(fijo.id).tipo, "Turno fijo");
  assert.equal(celda(sinFicha.id).nuevo, false, "sin ficha no se sabe: no se marca");
  // Jugó su primer turno: deja de ser nuevo (y la celda se repinta).
  const r = M.reserva(e, nuevo.id)!;
  r.estado = "finalizada";
  const otro = turno(e, "c1", 21 * 60, { clienteId: "k-nuevo" });
  const v2 = armarAgenda(e, MARTES, AHORA);
  assert.equal(v2.turnos.find((t) => t.id === otro.id)!.nuevo, false);
});
