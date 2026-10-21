// Dar un turno desde la agenda contra el motor REAL sobre la demo del día: sólo horarios que el motor acepta, el
// precio valle/pico y la seña ANTES de reservar, y que lo que se reserva es exactamente lo que se mostró.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import { ORIGENES_ALTA, ORIGEN_DE_FABRICA, clientesQueCoinciden, fichaPorTelefono, horariosLibres, previaDelTurno, reservar } from "./alta-core";
import { armarAgenda } from "./agenda-core";
import { textoConfirmacion } from "./whatsapp-core";

const HOY = "2026-10-17"; // sábado: todo pico
const AHORA: Ahora = { fecha: HOY, min: 19 * 60 + 10 };
const demo = (): EstadoClub => M.generarDemo(HOY, AHORA.min);

test("los horarios ofrecidos son los que el motor acepta, y no los que ya pasaron", () => {
  const e = demo();
  for (const c of e.canchas) {
    const lista = horariosLibres(e, HOY, c.id, 90, AHORA);
    for (const h of lista) {
      assert.equal(M.validarHueco(e, { canchaId: c.id, fecha: HOY, inicio: h.min, duracion: 90 }).ok, true, `${c.nombre} ${h.texto}`);
      assert.ok(h.min + 90 > AHORA.min, "no se ofrece lo que ya terminó");
    }
  }
});

test("la previa dice el precio (pico el fin de semana, valle/pico en la semana) y la seña; reservar cobra eso mismo", () => {
  const e = demo();
  const c = e.canchas[0];
  const [h] = horariosLibres(e, M.sumarDias(HOY, 1), c.id, 90, AHORA);
  assert.ok(h, "mañana hay lugar");
  const sinFicha = previaDelTurno(e, { canchaId: c.id, fecha: M.sumarDias(HOY, 1), inicio: h.min, duracion: 90, tipo: "turno", clienteId: null });
  assert.ok(sinFicha.ok);
  assert.equal(sinFicha.precio, M.precioTurno(e, { canchaId: c.id, fecha: M.sumarDias(HOY, 1), inicio: h.min, duracion: 90 }));
  assert.equal(sinFicha.franja, "pico", "domingo: todo pico");
  assert.equal(sinFicha.pideSena, M.requiereSena(e, null, "turno"));
  const clase = previaDelTurno(e, { canchaId: c.id, fecha: M.sumarDias(HOY, 1), inicio: h.min, duracion: 90, tipo: "clase", clienteId: null });
  assert.ok(clase.ok && !clase.pideSena, "las clases no piden seña");

  const r = reservar(e, { canchaId: c.id, fecha: M.sumarDias(HOY, 1), inicio: h.min, duracion: 90, tipo: "turno", titular: "Ana Prueba", clienteId: null, otros: "Beto, Caro ,  , Dani, Eze" }, AHORA);
  assert.equal(r.ok, true, r.mensaje);
  const nueva = M.reserva(e, r.reservaId!)!;
  assert.equal(nueva.precio, sinFicha.precio);
  assert.equal(nueva.sena.monto > 0, sinFicha.pideSena, "pide seña si y sólo si la previa lo dijo");
  assert.deepEqual(nueva.jugadores.map((j) => j.nombre), ["Ana Prueba", "Beto", "Caro", "Dani"], "hasta 4 jugadores, sin vacíos");
  assert.match(r.mensaje, /Turno de Ana Prueba en Cancha 1/);

  // Un día de semana a la tarde el precio integra valle y pico minuto a minuto.
  const martes = M.sumarDias(HOY, 3);
  const valle = previaDelTurno(e, { canchaId: "c1", fecha: martes, inicio: 9 * 60, duracion: 60, tipo: "turno", clienteId: null });
  const pico = previaDelTurno(e, { canchaId: "c1", fecha: martes, inicio: 21 * 60, duracion: 60, tipo: "turno", clienteId: null });
  assert.ok(valle.ok && pico.ok);
  assert.equal(valle.franja, "valle");
  assert.equal(pico.franja, "pico");
  assert.ok(pico.precio > valle.precio, "la hora pico sale más que la de valle");
});

test("lo que el motor no acepta no se reserva: el hueco ocupado, el horario pasado, sin nombre", () => {
  const e = demo();
  const ocupado = e.reservas.find((r) => r.fecha === HOY && r.estado === "reservada")!;
  const pisa = previaDelTurno(e, { canchaId: ocupado.canchaId, fecha: HOY, inicio: ocupado.inicio, duracion: 90, tipo: "turno", clienteId: null });
  assert.equal(pisa.ok, false);
  assert.match(pisa.ok ? "" : pisa.motivo, /Se pisa con/);
  const pasado = reservar(e, { canchaId: "c4", fecha: HOY, inicio: 9 * 60, duracion: 60, tipo: "turno", titular: "Tarde", clienteId: null, otros: "" }, AHORA);
  assert.equal(pasado.ok, false);
  const libre = horariosLibres(e, M.sumarDias(HOY, 1), "c2", 60, AHORA)[0];
  const sinNombre = reservar(e, { canchaId: "c2", fecha: M.sumarDias(HOY, 1), inicio: libre.min, duracion: 60, tipo: "turno", titular: "  ", clienteId: null, otros: "" }, AHORA);
  assert.equal(sinNombre.ok, false);
  assert.equal(sinNombre.mensaje, "¿A nombre de quién va el turno?");
});

test("reservar en una franja libre la saca de la grilla y el turno aparece en su cancha", () => {
  const e = demo();
  const antes = armarAgenda(e, HOY, AHORA);
  const franja = antes.libres.find((l) => l.min >= AHORA.min && horariosLibres(e, HOY, l.canchaId, 60, AHORA).some((h) => h.min === l.min));
  assert.ok(franja, "hay una franja libre donde entra un turno de una hora");
  const r = reservar(e, { canchaId: franja.canchaId, fecha: HOY, inicio: franja.min, duracion: 60, tipo: "turno", titular: "Nuevo", clienteId: null, otros: "" }, AHORA);
  assert.equal(r.ok, true, r.mensaje);
  const despues = armarAgenda(e, HOY, AHORA);
  assert.ok(!despues.libres.some((l) => l.id === franja.id));
  assert.ok(despues.turnos.some((t) => t.id === r.reservaId && t.columna === franja.columna && t.fila === franja.fila));
});

test("las fichas que coinciden avisan si debe, tiene créditos o faltas", () => {
  const e = demo();
  const conDeuda = e.clientes.find((c) => c.deuda > 0)!;
  const r = clientesQueCoinciden(e, conDeuda.nombre.slice(0, 5));
  const fila = r.find((x) => x.id === conDeuda.id);
  assert.ok(fila);
  assert.match(fila.detalle, /debe/);
  assert.deepEqual(clientesQueCoinciden(e, "a"), [], "con una letra no se busca");
});

test("al reservar, la confirmación por WhatsApp lleva la seña y el código que puso el motor", () => {
  const e = demo();
  const libre = horariosLibres(e, HOY, "c4", 90, AHORA)[0];
  const d = reservar(e, { canchaId: "c4", fecha: HOY, inicio: libre.min, duracion: 90, tipo: "turno", titular: "Grupo de Bruno", clienteId: null, otros: "" }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  const r = M.reserva(e, d.reservaId!)!;
  assert.ok(r.sena.monto > 0 && r.ref, "sin ficha pide seña con código");
  const texto = textoConfirmacion(e, r);
  assert.ok(texto.startsWith(`¡Hola Grupo! Te confirmamos el turno en Break Point Pádel: Cancha 4, sáb 17/10 a las ${M.hhmm(libre.min)}.`), texto);
  assert.ok(texto.includes(`falta la seña de ${M.pesos(r.sena.monto)}`) && texto.includes(`el código ${r.ref} en el concepto`), texto);
});

// ───────────── titular nuevo con teléfono: queda dado de alta (vanilla app.mjs:1662 y :1680-1681) ─────────────

const manana = M.sumarDias(HOY, 1);
const hueco = (e: EstadoClub, canchaId = "c2") => horariosLibres(e, manana, canchaId, 60, AHORA)[0].min;

test("titular nuevo con teléfono: al reservar queda la ficha (con el teléfono como se tipeó) y el turno atado a ella", () => {
  const e = demo();
  const antes = e.clientes.length;
  const r = reservar(e, { canchaId: "c2", fecha: manana, inicio: hueco(e), duracion: 60, tipo: "turno", titular: "Juan Pérez", clienteId: null, otros: "Gonza", tel: " 11 5555-0004 " }, AHORA);
  assert.equal(r.ok, true, r.mensaje);
  assert.match(r.mensaje, /Juan Pérez quedó dado de alta como cliente\./);
  assert.equal(e.clientes.length, antes + 1);
  const ficha = e.clientes.at(-1)!;
  assert.deepEqual([ficha.nombre, ficha.tel], ["Juan Pérez", "11 5555-0004"]);
  const turno = M.reserva(e, r.reservaId!)!;
  assert.equal(turno.clienteId, ficha.id);
  assert.equal(turno.jugadores[0].clienteId, ficha.id, "el titular juega con su ficha");
  assert.equal(turno.jugadores[1].nombre, "Gonza");
  // Sin teléfono, como antes: sin ficha.
  const sin = reservar(e, { canchaId: "c3", fecha: manana, inicio: hueco(e, "c3"), duracion: 60, tipo: "turno", titular: "Otro", clienteId: null, otros: "", tel: "  " }, AHORA);
  assert.equal(sin.ok, true);
  assert.equal(M.reserva(e, sin.reservaId!)!.clienteId, null);
  assert.equal(e.clientes.length, antes + 1);
});

test("el mismo teléfono escrito de otra forma usa la ficha que ya está (no se duplica); con ficha elegida, el teléfono no cuenta", () => {
  const e = demo();
  const conTel = e.clientes.find((c) => c.activo !== false && c.tel.replace(/\D/g, "").length >= 10)!;
  const digitos = conTel.tel.replace(/\D/g, "");
  const otraForma = `+54 9 ${digitos.slice(-10, -8)} ${digitos.slice(-8, -4)}-${digitos.slice(-4)}`;
  const antes = e.clientes.length;
  const f = fichaPorTelefono(e, "Cualquiera", otraForma);
  assert.deepEqual(f, { ok: true, clienteId: conTel.id, nueva: false });
  const r = reservar(e, { canchaId: "c2", fecha: manana, inicio: hueco(e), duracion: 60, tipo: "turno", titular: "Cualquiera", clienteId: null, otros: "", tel: otraForma }, AHORA);
  assert.equal(r.ok, true, r.mensaje);
  assert.match(r.mensaje, /Ya había una ficha con ese teléfono/);
  assert.equal(e.clientes.length, antes, "no se duplicó la ficha");
  assert.equal(M.reserva(e, r.reservaId!)!.clienteId, conTel.id);
  const elegida = e.clientes.find((c) => c.id !== conTel.id && c.activo !== false)!;
  const r2 = reservar(e, { canchaId: "c3", fecha: manana, inicio: hueco(e, "c3"), duracion: 60, tipo: "turno", titular: elegida.nombre, clienteId: elegida.id, otros: "", tel: "1199998888" }, AHORA);
  assert.equal(r2.ok, true);
  assert.equal(M.reserva(e, r2.reservaId!)!.clienteId, elegida.id);
  assert.equal(e.clientes.length, antes, "con la ficha elegida no se da de alta otra");
});

test("si el turno no se reserva, la ficha nueva no queda; un teléfono corto no se acepta", () => {
  const e = demo();
  const antes = e.clientes.length;
  const ocupado = e.reservas.find((r) => r.fecha === HOY && r.estado === "reservada")!;
  const choca = reservar(e, { canchaId: ocupado.canchaId, fecha: HOY, inicio: ocupado.inicio, duracion: 60, tipo: "turno", titular: "Fantasma", clienteId: null, otros: "", tel: "1155557777" }, AHORA);
  assert.equal(choca.ok, false);
  assert.equal(e.clientes.length, antes, "la ficha del turno que no se reservó no quedó");
  assert.ok(!e.clientes.some((c) => c.nombre === "Fantasma"));
  const corto = reservar(e, { canchaId: "c2", fecha: manana, inicio: hueco(e), duracion: 60, tipo: "turno", titular: "Corto", clienteId: null, otros: "", tel: "1234" }, AHORA);
  assert.equal(corto.ok, false);
  assert.match(corto.mensaje, /teléfono/);
  assert.equal(e.clientes.length, antes);
});

// ───────────── «Llegó por»: el origen del turno, como el «Nuevo turno» del club de hoy (club.html `#f-origen`) ─────────────

test("«Llegó por» ofrece las opciones exactas del vanilla y llega a la reserva; sin elegir, queda «mostrador»", () => {
  assert.deepEqual(
    ORIGENES_ALTA.map((o) => o.valor),
    ["mostrador", "whatsapp", "teléfono", "instagram"],
    "las mismas opciones, en el mismo orden, que el club de hoy",
  );
  assert.equal(ORIGEN_DE_FABRICA, "mostrador");
  const e = demo();
  const canchas = ["c1", "c2", "c3", "c4"];
  ORIGENES_ALTA.forEach((o, i) => {
    const c = canchas[i];
    const r = reservar(e, { canchaId: c, fecha: manana, inicio: hueco(e, c), duracion: 60, tipo: "turno", titular: `Por ${o.etiqueta}`, clienteId: null, otros: "", origen: o.valor }, AHORA);
    assert.equal(r.ok, true, r.mensaje);
    assert.equal(M.reserva(e, r.reservaId!)!.origen, o.valor, `«${o.etiqueta}» queda en la reserva`);
  });
  // Sin «Llegó por» (otros llamadores de `reservar`): el de fábrica, como el motor y el vanilla.
  const sin = reservar(e, { canchaId: "c1", fecha: M.sumarDias(HOY, 2), inicio: horariosLibres(e, M.sumarDias(HOY, 2), "c1", 60, AHORA)[0].min, duracion: 60, tipo: "turno", titular: "Sin origen", clienteId: null, otros: "" }, AHORA);
  assert.equal(sin.ok, true, sin.mensaje);
  assert.equal(M.reserva(e, sin.reservaId!)!.origen, "mostrador");
});

test("«Llegó por» no cambia los flujos de alta: clase sin seña, cliente nuevo con teléfono y turno con seña", () => {
  const e = demo();
  const clase = reservar(e, { canchaId: "c2", fecha: manana, inicio: hueco(e), duracion: 60, tipo: "clase", titular: "Clase de Lucía", clienteId: null, otros: "", origen: "whatsapp" }, AHORA);
  assert.equal(clase.ok, true, clase.mensaje);
  const rc = M.reserva(e, clase.reservaId!)!;
  assert.deepEqual([rc.tipo, rc.origen, rc.sena.monto], ["clase", "whatsapp", 0], "la clase no pide seña y guarda el origen");
  const antes = e.clientes.length;
  const nuevo = reservar(e, { canchaId: "c3", fecha: manana, inicio: hueco(e, "c3"), duracion: 60, tipo: "turno", titular: "Mara Nueva", clienteId: null, otros: "", tel: "11 5555-0099", origen: "instagram" }, AHORA);
  assert.equal(nuevo.ok, true, nuevo.mensaje);
  const rn = M.reserva(e, nuevo.reservaId!)!;
  assert.equal(e.clientes.length, antes + 1, "el cliente nuevo queda dado de alta");
  assert.equal(rn.clienteId, e.clientes.at(-1)!.id);
  assert.equal(rn.origen, "instagram");
  const conSena = reservar(e, { canchaId: "c4", fecha: manana, inicio: hueco(e, "c4"), duracion: 60, tipo: "turno", titular: "Grupo sin ficha", clienteId: null, otros: "", origen: "teléfono" }, AHORA);
  assert.equal(conSena.ok, true, conSena.mensaje);
  const rs = M.reserva(e, conSena.reservaId!)!;
  assert.ok(M.requiereSena(e, null, "turno") && rs.sena.monto > 0 && rs.ref, "sin ficha sigue pidiendo seña con código");
  assert.equal(rs.origen, "teléfono");
});
