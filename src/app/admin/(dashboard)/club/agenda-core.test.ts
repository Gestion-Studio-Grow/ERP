// La grilla de canchas del día contra el motor REAL del club sobre la demo: columnas y franjas, cada turno en su
// lugar con su señal, la raya de «ahora», las flechas del teclado y el reuso de celdas (que React sólo repinte el
// tramo que cambió).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import { DIAS_ANTES, DIAS_DESPUES, armarAgenda, compartirAgenda, diasDeLaAgenda, marcaDelTurno, ponerLuz, senalDelTurno, vecino } from "./agenda-core";
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
  assert.ok(v.canchas.some((c) => c.detalle.startsWith("Descubierta")), "se ve cuál es la descubierta");

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
  assert.deepEqual(dias.slice(0, 3).map((d) => d.nombre), ["Ayer", "Hoy", "Mañana"]);
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
