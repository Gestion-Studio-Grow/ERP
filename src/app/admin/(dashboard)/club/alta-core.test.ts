// Dar un turno desde la agenda contra el motor REAL sobre la demo del día: sólo horarios que el motor acepta, el
// precio valle/pico y la seña ANTES de reservar, y que lo que se reserva es exactamente lo que se mostró.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { Fijo } from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import { ORIGENES_ALTA, ORIGEN_DE_FABRICA, SEMANAS_DEL_FIJO, alternativas, previaFijoSemanal, anotarEnEsperaDesdeAlta, clientesQueCoinciden, fichaPorTelefono, horariosDelDia, horariosLibres, previaDelTurno, reservar, senaDelAlta, ventanaDeReserva } from "./alta-core";
import { armarAgenda } from "./agenda-core";
import { textoConfirmacion } from "./whatsapp-core";
import { ejecutarBajaFijo, otroFijoQuePisa } from "./canchas-core";

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

// ───────────── reingeniería BP · 1A: la seña del nuevo se cobra de verdad (BP-001…004) ─────────────

const martes = M.sumarDias(HOY, 3); // 20/10: abre hasta la 01:00
/** Un club chico y conocido: Beto juega en la Cancha 2. Regla de fábrica (seña a los nuevos). */
function clubConBeto(inicioBeto = 21 * 60): EstadoClub {
  const e = M.crearEstado({
    config: M.CONFIG_DEMO,
    canchas: M.CANCHAS_DEMO,
    clientes: [
      { id: "beto", nombre: "Beto", tel: "1155550002" },
      { id: "fiel", nombre: "Fiel", tel: "1155550003" },
      { id: "faltador", nombre: "Faltador", tel: "1155550004", strikes: 2 },
    ],
    productos: M.PRODUCTOS_DEMO,
    usuarios: M.USUARIOS_DEMO,
    proveedores: M.PROVEEDORES_DEMO,
  });
  const beto = M.crearReserva(e, { canchaId: "c2", fecha: martes, inicio: inicioBeto, duracion: 90, clienteId: "beto", conSena: false }, AHORA);
  assert.ok(beto.ok);
  for (const id of ["fiel", "faltador", "faltador", "faltador"]) {
    const r = M.crearReserva(e, { canchaId: "c4", fecha: HOY, inicio: 9 * 60 + 90 * e.reservas.length, duracion: 90, clienteId: id, conSena: false });
    assert.ok(r.ok, r.ok ? "" : r.motivo);
    r.reserva.estado = "finalizada";
  }
  return e;
}

test("BP-001: «Juan» con teléfono nuevo — la previa dice la seña con su monto y el turno queda con esa seña y código BP", () => {
  const e = clubConBeto();
  const d = { canchaId: "c1", fecha: martes, inicio: 21 * 60, duracion: 90, tipo: "turno" as const, clienteId: null, titular: "Juan", tel: "11 5555-1234" };
  // Aunque el club no pida seña a los turnos sin ficha (como la jornada real), Juan va a quedar con ficha nueva: es nuevo.
  e.config.politica.senaSinCliente = false;
  const previa = previaDelTurno(e, d, AHORA);
  assert.ok(previa.ok);
  assert.equal(previa.pideSena, true);
  assert.equal(previa.motivoSena, "cliente nuevo");
  assert.equal(previa.sena, 21000);
  assert.match(previa.texto, /pide seña \(50 %\): \$ 21\.000, cliente nuevo/);
  const r = reservar(e, { ...d, otros: "" }, AHORA);
  assert.equal(r.ok, true, r.mensaje);
  const turno = M.reserva(e, r.reservaId!)!;
  assert.equal(turno.sena.monto, previa.sena, "lo que dijo la previa es lo que quedó");
  assert.match(turno.ref ?? "", /^BP-[A-Z2-9]{4}$/);
  assert.equal(M.cliente(e, turno.clienteId!)!.nombre, "Juan");
  assert.match(r.mensaje, /Pide seña de \$ 21\.000 \(código BP-/);
});

test("BP-001: con la regla apagada, la previa y el turno siguen coincidiendo (una sola decisión)", () => {
  for (const [senaNuevos, senaSinCliente] of [[false, true], [false, false], [true, true]] as const) {
    const e = clubConBeto();
    e.config.politica.senaNuevos = senaNuevos;
    e.config.politica.senaSinCliente = senaSinCliente;
    const d = { canchaId: "c1", fecha: martes, inicio: 19 * 60, duracion: 60, tipo: "turno" as const, clienteId: null, titular: "Mara", tel: "1166667777" };
    const previa = previaDelTurno(e, d, AHORA);
    assert.ok(previa.ok);
    const r = reservar(e, { ...d, otros: "" }, AHORA);
    assert.equal(r.ok, true, r.mensaje);
    assert.equal(M.reserva(e, r.reservaId!)!.sena.monto, previa.sena, `senaNuevos=${senaNuevos} senaSinCliente=${senaSinCliente}`);
  }
});

test("BP-002/003/004: 3 jugados sin faltas no deja seña; 2 faltas sí aunque haya jugado; la clase nunca", () => {
  const e = clubConBeto();
  e.reservas.filter((r) => r.clienteId === "fiel").forEach((r) => (r.estado = "finalizada"));
  for (let i = 0; i < 2; i++) {
    const r = M.crearReserva(e, { canchaId: "c3", fecha: HOY, inicio: 9 * 60 + 90 * i, duracion: 90, clienteId: "fiel", conSena: false });
    assert.ok(r.ok);
    r.reserva.estado = "finalizada";
  }
  assert.equal(M.turnosJugados(e, "fiel"), 3);
  const base = { canchaId: "c1", fecha: martes, inicio: 19 * 60, duracion: 60 };
  const fiel = previaDelTurno(e, { ...base, tipo: "turno", clienteId: "fiel" }, AHORA);
  assert.ok(fiel.ok && !fiel.pideSena && fiel.sena === 0, "BP-002");
  assert.match(fiel.ok ? fiel.texto : "", /sin seña/);
  const faltador = previaDelTurno(e, { ...base, tipo: "turno", clienteId: "faltador" }, AHORA);
  assert.ok(faltador.ok && faltador.pideSena && faltador.motivoSena === "tiene 2 faltas", "BP-003");
  const clase = previaDelTurno(e, { ...base, tipo: "clase", clienteId: null, titular: "Nuevo", tel: "1177778888" }, AHORA);
  assert.ok(clase.ok && !clase.pideSena, "BP-004");
  assert.deepEqual(senaDelAlta(e, { tipo: "clase", clienteId: "faltador" }), { pide: false, motivo: null });
  // El teléfono de una ficha que ya está se mira con su historia (no como nuevo).
  assert.deepEqual(senaDelAlta(e, { tipo: "turno", clienteId: null, titular: "Otro nombre", tel: "11 5555 0003" }), { pide: false, motivo: null });
});

// ───────────── reingeniería BP · 1A: el hueco donde no entra la duración (BP-010…012) ─────────────

test("BP-010: Beto en C2 21:00, «+ 20:30» con 90 min — la hora sigue, no entra y avisa en criollo", () => {
  const e = clubConBeto();
  const alt = alternativas(e, { canchaId: "c2", fecha: martes, inicio: 20 * 60 + 30, duracion: 90 }, AHORA);
  assert.equal(alt.entra, false);
  assert.equal(alt.cuantoEntra, 30);
  assert.equal(alt.aviso, "A las 20:30 en Cancha 2 entran 30 min (Beto juega 21:00).");
  assert.deepEqual(
    alt.opciones.slice(0, 2).map((o) => o.etiqueta),
    ["Cancha 1 · 20:30 · 90 min · $ 42.000", "Cancha 2 · 22:30 · 90 min · $ 42.000"],
    "otra cancha a la misma hora y el siguiente hueco en esa cancha",
  );
  assert.ok(alt.opciones.every((o) => M.validarHueco(e, { canchaId: o.canchaId, fecha: martes, inicio: o.inicio, duracion: o.duracion }).ok), "toda opción entra de verdad");
  assert.ok(!alt.opciones.some((o) => o.tipo === "menosTiempo"), "30 min no es un turno: no se ofrece");
  assert.deepEqual(alt.espera, { fecha: martes, desde: 20 * 60 + 30, hasta: 21 * 60 + 30, duracion: 90 });
  // La previa dice lo mismo y no deja reservar; la lista de horas conserva la elegida, marcada.
  const previa = previaDelTurno(e, { canchaId: "c2", fecha: martes, inicio: 20 * 60 + 30, duracion: 90, tipo: "turno", clienteId: null }, AHORA);
  assert.deepEqual(previa, { ok: false, motivo: "A las 20:30 en Cancha 2 entran 30 min (Beto juega 21:00)." });
  const hora = horariosDelDia(e, martes, "c2", 90, AHORA, 20 * 60 + 30).find((h) => h.min === 20 * 60 + 30)!;
  assert.deepEqual([hora.entra, hora.cuanto, hora.texto], [false, 30, "20:30 · entran 30 min"]);
});

test("BP-010/012: con 60 min libres ofrece «60 min acá»; la hora nunca cambia al cambiar la duración", () => {
  const e = clubConBeto(21 * 60 + 30);
  const alt = alternativas(e, { canchaId: "c2", fecha: martes, inicio: 20 * 60 + 30, duracion: 90 }, AHORA);
  assert.deepEqual(
    alt.opciones.map((o) => [o.tipo, o.canchaId, M.hhmm(o.inicio), o.duracion]),
    [
      ["otraCancha", "c1", "20:30", 90],
      ["siguienteHueco", "c2", "23:00", 90],
      ["menosTiempo", "c2", "20:30", 60],
    ],
  );
  assert.equal(alt.opciones[2].etiqueta, `60 min acá · ${M.pesos(M.precioTurno(e, { canchaId: "c2", fecha: martes, inicio: 20 * 60 + 30, duracion: 60 }))}`);
  // BP-012: un alta de 60 a las 19:00 que pasa a 120 y no entra: la hora sigue y aparece el aviso.
  const e2 = clubConBeto(20 * 60 + 30);
  assert.equal(alternativas(e2, { canchaId: "c2", fecha: martes, inicio: 19 * 60, duracion: 60 }, AHORA).entra, true);
  const a120 = alternativas(e2, { canchaId: "c2", fecha: martes, inicio: 19 * 60, duracion: 120 }, AHORA);
  assert.equal(a120.entra, false);
  assert.match(a120.aviso ?? "", /^A las 19:00 en Cancha 2 entran 90 min \(Beto juega 20:30\)\.$/);
  assert.ok(horariosDelDia(e2, martes, "c2", 120, AHORA, 19 * 60).some((h) => h.min === 19 * 60), "la hora elegida sigue en la lista");
});

test("BP-011: tocar «Cancha 1 · 20:30» deja el alta en C1 20:30 90 min y se puede reservar", () => {
  const e = clubConBeto();
  const [otra] = alternativas(e, { canchaId: "c2", fecha: martes, inicio: 20 * 60 + 30, duracion: 90 }, AHORA).opciones;
  const ahora = alternativas(e, { canchaId: otra.canchaId, fecha: martes, inicio: otra.inicio, duracion: otra.duracion }, AHORA);
  assert.equal(ahora.entra, true);
  assert.deepEqual(ahora.opciones, []);
  const previa = previaDelTurno(e, { canchaId: otra.canchaId, fecha: martes, inicio: otra.inicio, duracion: otra.duracion, tipo: "turno", clienteId: "beto" }, AHORA);
  assert.ok(previa.ok, "Reservar se prende");
  const r = reservar(e, { canchaId: otra.canchaId, fecha: martes, inicio: otra.inicio, duracion: otra.duracion, tipo: "turno", titular: "Beto", clienteId: "beto", otros: "" }, AHORA);
  assert.equal(r.ok, true, r.mensaje);
  const t = M.reserva(e, r.reservaId!)!;
  assert.deepEqual([t.canchaId, t.inicio, t.duracion], ["c1", 20 * 60 + 30, 90]);
});

test("«Anotar en espera» desde el alta que no entra: con el día, la franja y la duración tomados", () => {
  const e = clubConBeto();
  const alt = alternativas(e, { canchaId: "c2", fecha: martes, inicio: 20 * 60 + 30, duracion: 90 }, AHORA);
  assert.equal(anotarEnEsperaDesdeAlta(e, { titular: "  ", clienteId: null, espera: alt.espera }, AHORA).ok, false);
  const d = anotarEnEsperaDesdeAlta(e, { titular: "Juan", clienteId: null, tel: "1155551234", espera: alt.espera }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  assert.match(d.mensaje, /^Juan quedó en la lista de espera: mar 20\/10, de 20:30 a 21:30, 90 min\.$/);
  const anotado = e.espera.at(-1)!;
  assert.deepEqual([anotado.titular, anotado.tel, anotado.fecha, anotado.desde, anotado.duracion], ["Juan", "1155551234", martes, 20 * 60 + 30, 90]);
});

test("BP-013: se reserva hasta 14 días adelante (+13 y +14 sí, +15 no)", () => {
  const domingo: Ahora = { fecha: "2026-10-18", min: 10 * 60 };
  const e = clubConBeto();
  assert.deepEqual(ventanaDeReserva(e, domingo), { dias: 14, hasta: "2026-11-01" });
  const dia = (n: number) => M.sumarDias(domingo.fecha, n);
  const sabado = dia(13);
  assert.equal(M.diaSemana(sabado), 6, "+13 es el sábado de la semana próxima");
  const d = (fecha: string) => ({ canchaId: "c1", fecha, inicio: 19 * 60, duracion: 90, tipo: "turno" as const, clienteId: "beto" });
  assert.ok(previaDelTurno(e, d(sabado), domingo).ok);
  assert.ok(alternativas(e, d(sabado), domingo).entra);
  assert.ok(previaDelTurno(e, d(dia(14)), domingo).ok);
  const lejos = previaDelTurno(e, d(dia(15)), domingo);
  assert.deepEqual(lejos, { ok: false, motivo: "Los turnos se dan hasta 14 días adelante (hasta el dom 1/11)." });
  assert.equal(alternativas(e, d(dia(15)), domingo).entra, false);
  const r = reservar(e, { ...d(dia(15)), titular: "Beto", otros: "" }, domingo);
  assert.equal(r.ok, false);
  assert.ok(reservar(e, { ...d(sabado), titular: "Beto", otros: "" }, domingo).ok);
});


test("H3 · la hora elegida que YA PASÓ (el alta quedó abierta): la lista, la previa y el aviso lo dicen y «Reservar» no se prende", () => {
  const e = demo();
  const tarde: Ahora = { fecha: HOY, min: 23 * 60 };
  let hit: { c: string; m: number } | null = null;
  for (const c of e.canchas) for (let m = 9 * 60; m < 20 * 60 && !hit; m += 30) if (M.validarHueco(e, { canchaId: c.id, fecha: HOY, inicio: m, duracion: 60 }).ok) hit = { c: c.id, m };
  assert.ok(hit, "hay un hueco libre a la tarde");
  const h = horariosDelDia(e, HOY, hit.c, 60, tarde, hit.m).find((x) => x.min === hit!.m)!;
  assert.equal(h.entra, false);
  assert.match(h.texto, /· ya pasó$/);
  const alt = alternativas(e, { canchaId: hit.c, fecha: HOY, inicio: hit.m, duracion: 60 }, tarde);
  assert.equal(alt.entra, false, "Reservar apagado");
  assert.equal(alt.aviso, "Ese horario ya pasó.");
  for (const o of alt.opciones) assert.ok(o.inicio + o.duracion > tarde.min, "sólo se ofrece lo que está a tiempo");
  const p = previaDelTurno(e, { canchaId: hit.c, fecha: HOY, inicio: hit.m, duracion: 60, tipo: "turno", clienteId: null }, tarde);
  assert.deepEqual(p, { ok: false, motivo: "Ese horario ya pasó." });
  // Lo mismo que dice el motor al tocar «Reservar».
  assert.equal(reservar(e, { canchaId: hit.c, fecha: HOY, inicio: hit.m, duracion: 60, tipo: "turno", clienteId: null, titular: "X", otros: "" }, tarde).mensaje, p.motivo);
});

// ───────────── Tanda 3C · «Fijo semanal» desde el alta (BP-103) ─────────────

test("BP-101 (cert v2-1): tras acortar una pausa, la previa del «Fijo semanal» marca que se pisa con el fijo que vuelve", () => {
  const e = demo();
  const f = e.fijos[0];
  M.materializarFijosHasta(e, HOY, 14);
  let en7 = M.sumarDias(HOY, 7);
  while (M.diaSemana(en7) !== f.dia) en7 = M.sumarDias(en7, 1);
  assert.equal(M.darDeBajaFijo(e, f.id, { desde: HOY, pausaHasta: M.sumarDias(en7, 7) }, AHORA).ok, true);
  const d = { canchaId: f.canchaId, fecha: M.sumarDias(en7, -7), inicio: f.inicio, duracion: f.duracion };
  // Datos guardados antes del arreglo: la pausa ya es más corta pero el turno cancelado por la pausa sigue sin volver.
  const viejo = structuredClone(e);
  viejo.fijos[0].pausa = { desde: HOY, hasta: M.sumarDias(en7, -1) };
  const p1 = previaFijoSemanal(viejo, d);
  assert.equal(p1[0].fecha, en7);
  assert.equal(p1[0].entra, false, p1[0].texto);
  assert.match(p1[0].texto, new RegExp(`se pisa con el fijo de ${f.titular}`));
  // Con el arreglo, acortar la pausa lo devuelve a la grilla y la previa también lo marca.
  assert.equal(M.darDeBajaFijo(e, f.id, { desde: HOY, pausaHasta: M.sumarDias(en7, -1) }, AHORA).ok, true);
  const p2 = previaFijoSemanal(e, d);
  assert.equal(p2[0].entra, false, p2[0].texto);
});

test("BP-101 (cert v4): el fijo de otro en pausa no choca en las fechas de la pausa, sí cuando vuelve (función compartida)", () => {
  const e = demo();
  const f = e.fijos[0];
  M.materializarFijosHasta(e, HOY, 14);
  let en7 = M.sumarDias(HOY, 7);
  while (M.diaSemana(en7) !== f.dia) en7 = M.sumarDias(en7, 1);
  assert.equal(M.darDeBajaFijo(e, f.id, { desde: HOY, pausaHasta: M.sumarDias(en7, 7) }, AHORA).ok, true);
  const p = previaFijoSemanal(e, { canchaId: f.canchaId, fecha: M.sumarDias(en7, -7), inicio: f.inicio, duracion: f.duracion });
  assert.deepEqual(p.slice(0, 3).map((x) => x.entra), [true, true, false]);
  assert.match(p[2].texto, new RegExp(`se pisa con el fijo de ${f.titular}`));
});

test("BP-103: alta del jueves 20:00 con «Fijo semanal»: la previa marca la semana que choca; al reservar, las otras quedan en la grilla", () => {
  const e = demo();
  const jueves = M.sumarDias(HOY, 5); // jueves 22/10
  assert.equal(M.diaSemana(jueves), 4);
  const d = { canchaId: "c4", fecha: jueves, inicio: 20 * 60, duracion: 90, tipo: "turno" as const, titular: "Juan Pérez", clienteId: null, otros: "", fijo: true };
  // Otro turno a esa hora dentro de dos semanas: la previa lo marca, y un fijo de otro que juega los jueves también.
  const choca = M.sumarDias(jueves, 14);
  assert.equal(M.crearReserva(e, { canchaId: "c4", fecha: choca, inicio: 20 * 60, duracion: 60, clienteId: null, titular: "Beto", conSena: false }, AHORA).ok, true);
  const semanas = previaFijoSemanal(e, d);
  assert.equal(semanas.length, SEMANAS_DEL_FIJO);
  assert.deepEqual(semanas.map((x) => x.fecha), [7, 14, 21, 28].map((n) => M.sumarDias(jueves, n)));
  assert.deepEqual(semanas.map((x) => x.entra), [true, false, true, true]);
  assert.match(semanas[1].texto, /^5\/11 · se pisa con Beto/);
  assert.equal(semanas[0].texto, "29/10 ✔");
  const antes = JSON.stringify(e);
  previaFijoSemanal(e, d);
  assert.equal(JSON.stringify(e), antes, "la previa no toca el club");
  // Reservar con «Fijo semanal».
  const r = reservar(e, d, AHORA);
  assert.equal(r.ok, true, r.mensaje);
  const turno = M.reserva(e, r.reservaId!)!;
  const f = e.fijos.find((x) => x.id === turno.fijoId)!;
  assert.ok(f, "el turno es el primero del fijo");
  assert.deepEqual([f.dia, f.inicio, f.duracion, f.canchaId, f.desde], [4, 20 * 60, 90, "c4", jueves]);
  const enGrilla = e.reservas.filter((x) => x.fijoId === f.id && x.estado === "reservada").map((x) => x.fecha).sort();
  assert.deepEqual(enGrilla, [jueves, ...semanas.filter((x) => x.entra).map((x) => x.fecha)], "el alta y las semanas que entraban; la que chocaba, no");
  assert.match(r.mensaje, /Fijo los jueves a las 20:00: 29\/10, 12\/11, 19\/11 en la grilla; 5\/11 no entró/);
  // No se baja dos veces ni antes del alta.
  M.materializarFijosHasta(e, HOY, 40);
  assert.equal(e.reservas.filter((x) => x.fijoId === f.id && x.fecha <= M.sumarDias(jueves, 28)).length, 4);
  assert.ok(!e.reservas.some((x) => x.fijoId === f.id && x.fecha < jueves), "nada antes de su primera fecha");
});

test("«Fijo semanal» sólo con «Turno»: una clase con la marca no crea fijo", () => {
  const e = demo();
  const n = e.fijos.length;
  const r = reservar(e, { canchaId: "c4", fecha: M.sumarDias(HOY, 5), inicio: 10 * 60, duracion: 60, tipo: "clase", titular: "Profe", clienteId: null, otros: "", fijo: true }, AHORA);
  assert.equal(r.ok, true, r.mensaje);
  assert.equal(e.fijos.length, n);
});

// ── Dictamen v5 (BP-101): idempotencia de la pausa, un solo guardián del fijo nuevo, baja que devuelve lo liberado ──
{
  const HOY = "2026-10-17";
  const AHORA: Ahora = { fecha: HOY, min: 19 * 60 + 10 };
  const k = 3;
  const d = (i: number) => M.sumarDias(HOY, k + 7 * i);
  function base(semanas = 14) {
    const e = M.generarDemo(HOY, AHORA.min) as EstadoClub;
    const dia = M.diaSemana(d(0));
    const canchaId = e.canchas.find((c) => Array.from({ length: semanas }, (_, i) => i).every((i) => M.validarHueco(e, { canchaId: c.id, fecha: d(i), inicio: 22 * 60, duracion: 60 }).ok))!.id;
    const f = M.crearFijo(e, { clienteId: null, canchaId, dia, inicio: 22 * 60, duracion: 60, titular: "Juan Fijo", desde: HOY });
    M.materializarFijosHasta(e, HOY, 14);
    return { e, f, canchaId, dia };
  }
  /** Estado heredado (fijo de Pedro dentro de la pausa de Juan) como lo deja la UI vieja o una réplica. Por defecto
   * Pedro juega sólo d(4) y d(5) (choque acotado: Juan vuelve el d(6)); `{}` = Pedro permanente. */
  function conPedro(desde = d(4), extra: Partial<Fijo> = { hasta: d(5) } as Partial<Fijo>) {
    const b = base();
    ejecutarBajaFijo(b.e, { tipo: "pausa", fijoId: b.f.id, desde: HOY, hasta: d(10) }, AHORA);
    const P = M.crearFijo(b.e, { clienteId: null, canchaId: b.canchaId, dia: b.dia, inicio: 22 * 60, duracion: 60, titular: "Pedro Nuevo", desde });
    Object.assign(P, extra);
    return { ...b, P, acortar: { tipo: "pausa" as const, fijoId: b.f.id, desde: HOY, hasta: M.sumarDias(d(4), -1) } };
  }
  /** Pares de fijos permanentes que juegan la misma fecha en el mismo hueco (próximas 80 semanas). */
  function solapes(e: EstadoClub, f: Fijo) {
    const out: string[] = [];
    for (let i = 0; i < 80; i++) {
      const fecha = M.sumarDias(HOY, k + 7 * i);
      if (!M.fijoJuegaEl(f, fecha)) continue;
      const o = otroFijoQuePisa({ ...e, reservas: [] } as EstadoClub, { canchaId: f.canchaId, fecha, inicio: f.inicio, duracion: f.duracion }, f.id);
      if (o) out.push(`${fecha}:${o.titular}`);
    }
    return out;
  }

  const GUARDIAN = /^Ese horario ya es del fijo de Juan Fijo \(martes 22:00; lo juega el .*\)\. Elegí otro día, hora o cancha\./;

  test("v5-8 alta-core: la previa del «Fijo semanal» sigue igual (fijo bajado lo ve validarHueco; libre ✔)", () => {
    const { e, canchaId } = base();
    const p = previaFijoSemanal(e, { canchaId, fecha: d(0), inicio: 22 * 60, duracion: 60 });
    assert.equal(p[0].entra, false); // d(1) bajado → validarHueco
    assert.equal(p[2].entra, false); // d(3) sin bajar → otroFijoQuePisa
    assert.match(p[2].texto, /se pisa con el fijo de Juan Fijo/);
  });

  test("v5-9 alta con «Fijo semanal» en el hueco de Juan pausado: el guardián lo frena y no reserva nada", () => {
    const { e, f, canchaId } = base();
    ejecutarBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: d(10) }, AHORA);
    const antes = JSON.stringify(e);
    const r = reservar(e, { canchaId, fecha: d(0), inicio: 22 * 60, duracion: 60, tipo: "turno", titular: "Pedro Alta", clienteId: null, otros: "", fijo: true }, AHORA);
    assert.equal(r.ok, false);
    assert.match(r.mensaje, GUARDIAN);
    assert.match(r.mensaje, /sacá «Fijo semanal»/);
    assert.equal(JSON.stringify(e), antes);
    // Sin «Fijo semanal», ese día suelto sí entra.
    const s = reservar(e, { canchaId, fecha: d(0), inicio: 22 * 60, duracion: 60, tipo: "turno", titular: "Pedro Alta", clienteId: null, otros: "", fijo: false }, AHORA);
    assert.equal(s.ok, true, s.mensaje);
  });
}
