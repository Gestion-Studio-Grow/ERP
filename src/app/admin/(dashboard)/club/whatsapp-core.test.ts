// Los avisos por WhatsApp del club: los textos son los del vanilla (contra el texto esperado, palabra por palabra, y
// contra el motor del piloto en public/previews), el teléfono se normaliza a formato argentino y en la demo, o sin
// celular, el link abre para elegir el chat (nunca un número roto).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { EstadoClub, Reserva } from "@/lib/club/motor.mjs";
import {
  NOTA_CELULAR_RARO,
  NOTA_DEMO,
  NOTA_SIN_CELULAR,
  avisosLluvia,
  celularDeLaEspera,
  celularDelTurno,
  enlaceLoLibre,
  enlaceWhatsApp,
  fechaCorta,
  loLibre,
  textoLoLibre,
  recordatorioDisponible,
  textoConfirmacion,
  textoOfertaEspera,
  textoRecordatorio,
} from "./whatsapp-core";

const HOY = "2026-10-14"; // miércoles
const A_LAS_8 = { fecha: HOY, min: 8 * 60 };

function club(): EstadoClub {
  return M.crearEstado({
    // Clientes de siempre: sin «seña a los nuevos» (esa regla tiene sus tests en motor.test.ts y alta-core.test.ts).
    config: { ...M.CONFIG_DEMO, politica: { ...M.CONFIG_DEMO.politica, senaNuevos: false } },
    // Break Point tiene las 4 techadas; para la lluvia, la Cancha 4 descubierta (otro club).
    canchas: M.CANCHAS_DEMO.map((c) => (c.id === "c4" ? { ...c, cubierta: false } : c)),
    clientes: [
      { id: "a", nombre: "Ana Pérez", tel: "011 15-4000-7919" },
      { id: "b", nombre: "Beto Gómez", tel: "" },
    ],
    productos: M.PRODUCTOS_DEMO,
    usuarios: M.USUARIOS_DEMO,
  });
}
function turno(e: EstadoClub, datos: M.DatosReserva): Reserva {
  const r = M.crearReserva(e, datos, A_LAS_8);
  assert.ok(r.ok, r.ok ? "" : r.motivo);
  return r.reserva;
}
const textoDe = (href: string) => decodeURIComponent(href.slice(href.indexOf("?text=") + 6));

test("confirmación: sin seña, y con seña + alias + código (texto del vanilla)", () => {
  const e = club();
  const ana = turno(e, { canchaId: "c1", fecha: HOY, inicio: 20 * 60, clienteId: "a", titular: "Ana Pérez" });
  assert.equal(textoConfirmacion(e, ana), "¡Hola Ana! Te confirmamos el turno en Break Point Pádel: Cancha 1, mié 14/10 a las 20:00. ¡Nos vemos en la cancha! 🎾");
  // Sin ficha: pide seña; el código para la transferencia lo pone el motor.
  const bruno = turno(e, { canchaId: "c2", fecha: HOY, inicio: 21 * 60, titular: "Grupo de Bruno" });
  assert.ok(bruno.sena.monto > 0 && bruno.ref);
  assert.equal(
    textoConfirmacion(e, bruno),
    `¡Hola Grupo! Te confirmamos el turno en Break Point Pádel: Cancha 2, mié 14/10 a las 21:00. Para dejarlo firme falta la seña de $ 21.000: transferí al alias bp.demo.ficticio y poné el código ${bruno.ref} en el concepto y mandanos el comprobante por acá. ¡Nos vemos en la cancha! 🎾`,
  );
  // Sin alias cargado: la seña por transferencia o Mercado Pago.
  e.config.cobro = { alias: "" };
  assert.match(textoConfirmacion(e, bruno), /falta la seña de \$ 21\.000 \(transferencia o Mercado Pago\)\. ¡Nos vemos/);
});

test("recordatorio, oferta a la espera y fecha corta (texto del vanilla)", () => {
  const e = club();
  const ana = turno(e, { canchaId: "c1", fecha: HOY, inicio: 20 * 60, clienteId: "a", titular: "Ana Pérez" });
  assert.equal(textoRecordatorio(e, ana), "¡Hola Ana! Te esperamos hoy a las 20:00 en Cancha 1. Si no llegan, avisanos así le damos la cancha a otro grupo. ¡Gracias!");
  assert.equal(recordatorioDisponible(ana), true);
  assert.equal(recordatorioDisponible({ estado: "cancelada" }), false);
  assert.equal(recordatorioDisponible({ estado: "finalizada" }), false);
  const espera = { titular: "Daniela Navarro", fecha: HOY };
  assert.equal(textoOfertaEspera(e, espera, "c4", 22 * 60 + 30, HOY), "¡Hola Daniela! Se liberó un turno: Cancha 4 a las 22:30 (hoy). ¿Lo querés? Respondé SÍ y te lo reservamos.");
  assert.equal(textoOfertaEspera(e, { ...espera, fecha: "2026-10-16" }, "c1", 19 * 60, HOY), "¡Hola Daniela! Se liberó un turno: Cancha 1 a las 19:00 (vie 16/10). ¿Lo querés? Respondé SÍ y te lo reservamos.");
  assert.equal(fechaCorta("2026-10-18"), "dom 18/10");
});

test("lluvia: movido a techada, suspendido (con crédito o sin cargo), con plata para devolver y cortado en juego", () => {
  const e = club();
  const ahora = { fecha: HOY, min: 19 * 60 + 10 };
  // Cancha 4 (descubierta): Ana a las 20 (se mueve a techada si hay), Beto a las 21:30.
  turno(e, { canchaId: "c4", fecha: HOY, inicio: 20 * 60, clienteId: "a", titular: "Ana Pérez" });
  // Llenar las techadas a las 21:30 para que Beto (con ficha, pagó) no tenga a dónde ir y se suspenda con crédito.
  for (const c of ["c1", "c2", "c3"]) turno(e, { canchaId: c, fecha: HOY, inicio: 21 * 60 + 30, titular: `Ocupa ${c}` });
  const beto = turno(e, { canchaId: "c4", fecha: HOY, inicio: 21 * 60 + 30, clienteId: "b", titular: "Beto Gómez" });
  assert.ok(M.registrarPago(e, beto.id, { medio: "efectivo", monto: 5000 }, A_LAS_8).ok);
  const { resultado } = M.planLluvia(e, HOY, 19 * 60 + 30, 23 * 60, ahora);
  const avisos = avisosLluvia(e, resultado);
  const deAna = avisos.find((a) => a.titular === "Ana Pérez")!;
  const deBeto = avisos.find((a) => a.titular === "Beto Gómez")!;
  assert.match(deAna.que, /^pasa a Cancha \d$/);
  const techada = deAna.que.slice("pasa a ".length);
  assert.equal(deAna.texto, `¡Hola Ana! Por la lluvia pasamos tu turno de las 20:00 a ${techada} (techada). Mismo horario, mismo precio. ¡Los esperamos!`);
  assert.equal(deAna.celular, "011 15-4000-7919");
  assert.equal(deBeto.que, "suspendido, $ 5.000 como crédito");
  assert.equal(deBeto.texto, "¡Hola Beto! Por la lluvia suspendimos tu turno de las 21:30. Te dejamos $ 5.000 de crédito para cuando quieras volver. ¡Disculpá!");
  assert.equal(deBeto.celular, "");

  // Los otros dos textos (sin cargo y devolución en mano), y el cortado en juego, sin texto.
  const sinCargo = avisosLluvia(e, [{ reservaId: beto.id, titular: "Beto Gómez", accion: "suspendido" }])[0];
  assert.equal(sinCargo.texto, "¡Hola Beto! Por la lluvia suspendimos tu turno de las 21:30. No se te cobra nada; avisanos y te lo reprogramamos sin cargo. ¡Disculpá!");
  const devolver = avisosLluvia(e, [{ reservaId: beto.id, titular: "Grupo de Bruno", accion: "suspendido", devolverEnMano: 7000 }])[0];
  assert.equal(devolver.que, "suspendido, hay que devolverle $ 7.000");
  assert.equal(devolver.texto, "¡Hola Grupo! Por la lluvia suspendimos tu turno de las 21:30. Te devolvemos los $ 7.000 que habías pagado: ¿te lo pasamos por transferencia o lo retirás en el club? ¡Disculpá!");
  const cortado = avisosLluvia(e, [{ reservaId: beto.id, titular: "Beto Gómez", accion: "cortado", credito: 3000, noJugados: 20 }])[0];
  assert.equal(cortado.texto, null);
  assert.equal(cortado.que, "estaban jugando: 20′ sin jugar, se reconocen $ 3.000. Cobrá lo jugado y cerrá la cancha.");
});

test("los textos son los del motor del piloto (public/previews), carácter por carácter", async () => {
  const ruta = new URL("../../../../../public/previews/breakpoint/club/motor.mjs", import.meta.url).href;
  const piloto = (await import(ruta)) as { mensajeWhatsApp: typeof M.mensajeWhatsApp };
  const casos: [M.TipoMensajeWhatsApp, Record<string, string>][] = [
    ["confirmacion", { nombre: "Ana", cancha: "Cancha 1", fecha: "mié 14/10", hora: "20:00", sena: "$ 7.000", alias: "bp.club", ref: "BP-ABCD" }],
    ["confirmacion", { nombre: "Ana", cancha: "Cancha 1", fecha: "mié 14/10", hora: "20:00", sena: "" }],
    ["recordatorio", { nombre: "Ana", hora: "20:00", cancha: "Cancha 1" }],
    ["espera", { nombre: "Dani", cancha: "Cancha 4", hora: "22:30", fecha: "hoy" }],
    ["lluvia_movido", { nombre: "Ana", hora: "20:00", cancha: "Cancha 2" }],
    ["lluvia_suspendido", { nombre: "Ana", hora: "20:00", credito: "$ 5.000" }],
    ["lluvia_suspendido", { nombre: "Ana", hora: "20:00", credito: "" }],
    ["lluvia_devolucion", { nombre: "Ana", hora: "20:00", monto: "$ 7.000" }],
  ];
  for (const [tipo, datos] of casos) assert.equal(M.mensajeWhatsApp(tipo, datos), piloto.mensajeWhatsApp(tipo, datos), tipo);
});

test("teléfono a formato argentino: con o sin 0, con o sin 15, con o sin +54 9 — todos al mismo chat", () => {
  const mismo = "https://wa.me/5491140007919?text=hola";
  for (const tel of ["11 4000-7919", "1140007919", "011 4000-7919", "011 15-4000-7919", "11 15 4000 7919", "+54 9 11 4000-7919", "5491140007919", "54 11 4000 7919", "0054 9 11 4000 7919"]) {
    const e = enlaceWhatsApp(tel, "hola", "real");
    assert.equal(e.href, mismo, tel);
    assert.equal(e.directo, true);
    assert.equal(e.nota, null);
  }
  // Interior (La Plata, área 221) con el 0 y el 15.
  assert.equal(enlaceWhatsApp("0221 15 555-1234", "x", "real").href, "https://wa.me/5492215551234?text=x");
  // El texto va codificado y vuelve igual.
  const largo = "¡Hola Ana! Te esperamos hoy a las 20:00 en Cancha 1 & 2? 🎾";
  assert.equal(textoDe(enlaceWhatsApp("1140007919", largo, "real").href), largo);
});

test("sin celular, con uno raro o en la demo: el link abre para elegir el chat, y se dice por qué (nunca un link roto)", () => {
  const vacio = enlaceWhatsApp("", "hola", "real");
  assert.deepEqual(vacio, { href: "https://wa.me/?text=hola", texto: "hola", directo: false, nota: NOTA_SIN_CELULAR });
  assert.equal(enlaceWhatsApp(null, "hola", "real").nota, NOTA_SIN_CELULAR);
  assert.equal(enlaceWhatsApp("   ", "hola", "real").nota, NOTA_SIN_CELULAR);
  // 15 sin código de área: 8 dígitos, no es un número completo.
  const raro = enlaceWhatsApp("15 4000-7919", "hola", "real");
  assert.equal(raro.directo, false);
  assert.equal(raro.href, "https://wa.me/?text=hola");
  assert.equal(raro.nota, NOTA_CELULAR_RARO);
  // En la demo, aunque tenga celular, no se abre su chat (como el vanilla).
  const demo = enlaceWhatsApp("1140007919", "hola", "demo");
  assert.equal(demo.href, "https://wa.me/?text=hola");
  assert.equal(demo.nota, NOTA_DEMO);
  // Sin área, o con pocos dígitos: tampoco.
  for (const tel of ["4000-7919", "123", "1540007919", "abc"]) assert.equal(enlaceWhatsApp(tel, "hola", "real").directo, false, tel);
  for (const x of [vacio, raro, demo]) assert.match(x.href, /^https:\/\/wa\.me\/\?text=/);
});

test("de dónde sale el celular: la ficha del titular, o lo anotado en la espera", () => {
  const e = club();
  const ana = turno(e, { canchaId: "c1", fecha: HOY, inicio: 20 * 60, clienteId: "a", titular: "Ana Pérez" });
  const sinFicha = turno(e, { canchaId: "c2", fecha: HOY, inicio: 20 * 60, titular: "Grupo de Bruno" });
  assert.equal(celularDelTurno(e, ana), "011 15-4000-7919");
  assert.equal(celularDelTurno(e, sinFicha), "");
  assert.equal(celularDeLaEspera(e, { tel: "11 5555-0000", clienteId: "a" }), "11 5555-0000");
  assert.equal(celularDeLaEspera(e, { tel: "", clienteId: "a" }), "011 15-4000-7919");
  assert.equal(celularDeLaEspera(e, { tel: "", clienteId: null }), "");
});

test("BP-065 · «Compartir lo libre · hoy · noche»: 3 huecos de 90 después de las 18 → el texto con los 3, el precio y el link del turnero", () => {
  const e = club();
  // Sólo la Cancha 1 abierta (las otras en mantenimiento) y un turno a las 22:30: quedan 18:00, 19:30 y 21:00.
  for (const c of e.canchas) if (c.id !== "c1") c.estado = "mantenimiento";
  turno(e, { canchaId: "c1", fecha: HOY, inicio: 22 * 60 + 30, clienteId: "a", titular: "Ana Pérez" });
  const ahora = { fecha: HOY, min: 17 * 60 };
  const renglones = loLibre(e, HOY, "noche", ahora);
  assert.deepEqual(renglones.map((r) => [M.hhmm(r.inicio), r.canchas]), [
    ["18:00", ["Cancha 1"]],
    ["19:30", ["Cancha 1"]],
    ["21:00", ["Cancha 1"]],
  ]);
  const link = "https://club.example/turnero?modo=pedido";
  const texto = textoLoLibre(e, "hoy", "noche", ahora, link);
  const precio = (m: number) => M.pesos(M.precioTurno(e, { canchaId: "c1", fecha: HOY, inicio: m, duracion: 90 }));
  assert.equal(
    texto,
    [
      "¡Hola! Esto es lo que nos queda libre en Break Point Pádel hoy (mié 14/10) a la noche, turnos de 90 min:",
      `• 18:00 · Cancha 1 · ${precio(18 * 60)}`,
      `• 19:30 · Cancha 1 · ${precio(19 * 60 + 30)}`,
      `• 21:00 · Cancha 1 · ${precio(21 * 60)}`,
      `Reservalo desde acá: ${link}`,
      "O contestame por acá y te lo guardo.",
    ].join("\n"),
  );
  // El link de WhatsApp abre para elegir el chat (es para quien preguntó) con ese mismo texto.
  assert.equal(textoDe(enlaceLoLibre(texto)), texto);
  // Lo que ya empezó no se ofrece: a las 18:10, la de las 18:00 ya no; se arma desde el próximo horario (18:30 y 20:00).
  assert.deepEqual(loLibre(e, HOY, "noche", { fecha: HOY, min: 18 * 60 + 10 }).map((r) => M.hhmm(r.inicio)), ["18:30", "20:00"]);
});

test("«Compartir lo libre»: varias canchas a la misma hora en un renglón; sin nada libre lo dice; mañana y la tarde", () => {
  const e = club();
  const ahora = { fecha: HOY, min: 8 * 60 };
  const tarde = loLibre(e, HOY, "tarde", ahora);
  assert.equal(tarde[0].inicio, 14 * 60, "la tarde arranca a las 14");
  assert.deepEqual(tarde[0].canchas, ["Cancha 1", "Cancha 2", "Cancha 3", "Cancha 4"]);
  assert.ok(tarde.every((r) => r.inicio >= 14 * 60 && r.inicio < 18 * 60), "sólo lo que arranca en la franja");
  assert.match(textoLoLibre(e, "hoy", "tarde", ahora), /• 14:00 · Cancha 1, Cancha 2, Cancha 3 y Cancha 4 · \$/);
  assert.match(textoLoLibre(e, "manana", "noche", ahora), /mañana \(jue 15\/10\) a la noche/);
  assert.match(textoLoLibre(e, "hoy", "noche", ahora), /Contestame por acá y te lo guardo\.$/, "sin link, que contesten por el chat");
  for (const c of e.canchas) c.estado = "mantenimiento";
  assert.equal(textoLoLibre(e, "hoy", "noche", ahora), "¡Hola! Hoy (mié 14/10) a la noche no nos queda cancha libre para 90 min en Break Point Pádel. ¿Te sirve otro horario? Decime y te busco lugar.");
});
