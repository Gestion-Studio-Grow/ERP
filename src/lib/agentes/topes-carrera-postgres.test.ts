// ============================================================================
// EQUIPO DE AGENTES · topes y carreras contra Postgres (03 §14, primero de la tanda 1).
// ============================================================================
// Todo a la vez de verdad (varias transacciones en paralelo contra la base efímera, como `app_rls`)
// y con el reloj fijo: ni `Date.now()` ni azar deciden nada.
//   · un cupo nunca pasa su máximo, aunque N lo pidan a la vez;
//   · el cupo de pedidos es POR PERSONA y el de partes a pedido también;
//   · doble envío (misma clave) = un pedido y un cupo;
//   · dos procesos sobre el mismo pedido: lo toma uno; un intento viejo no pisa al nuevo;
//   · el rescate es sólo de lo propio, una vez, y no relanza con menos de 30 s;
//   · vencidos: SIN_RESPONDER una sola vez;
//   · único parcial de compromisos abiertos con createMany + skipDuplicates (S20);
//   · nada toca un pedido EN_BANDEJA.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { COBRANZAS, COORDINACION, EQUIPOS_DE_PRUEBA, HERRAMIENTAS_DE_PRUEBA, T0, aLaVez, actorDePrueba, relojFijo, vistaDe } from "@/test/agentes-de-prueba";
import { periodoDelTope, TOPES } from "./permisos-core";
import type { PrismaClient } from "@/generated/prisma/client";

let secuencia = 0;
/** Prende (o apaga) un interruptor del negocio como lo deja la consola, sembrado como dueño de la base. */
async function interruptor(duenio: PrismaClient, tenantId: string, id: string, encendido = true): Promise<void> {
  secuencia++;
  await duenio.auditLog.create({
    data: {
      tenantId,
      actor: "operator:qa",
      action: encendido ? "interruptor.encender" : "interruptor.apagar",
      entity: "Interruptor",
      entityId: id,
      channel: "operador",
      createdAt: new Date(T0.getTime() - 3_600_000 + secuencia * 1000),
    },
  });
}


const N = 8;

test("agentes: topes y carreras del buzón (cupos, doble envío, toma, rescate, vencidos, únicos parciales, bandeja)", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();

  const { prisma } = await import("@/lib/prisma");
  const { tenantTransaction } = await import("@/lib/rls");
  const { tomarCupo } = await import("./contadores.server");
  const { dejarPedido, tomarPedido, cerrarPedido, vencerPropios, pedidosParaRescatar } = await import("./buzon.server");
  const { procesarPedido } = await import("./motor.server");
  base.alBorrar(() => prisma.$disconnect());
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  await interruptor(duenio, a.id, "equipo-agentes");

  const r = relojFijo();
  const duenia = vistaDe(a.id, a.duenia.id);
  const recepcion = vistaDe(a.id, a.recepcion.id);
  const deps = { equipos: EQUIPOS_DE_PRUEBA, herramientas: HERRAMIENTAS_DE_PRUEBA, actorDe: actorDePrueba, reloj: r.reloj };
  const dejar = (v: typeof duenia, clave: string, extra: Record<string, unknown> = {}) =>
    dejarPedido(v, { puesto: COBRANZAS, tipo: "LISTA", frecuente: "cobranzas_pendientes", clave, ...extra }, { equipos: EQUIPOS_DE_PRUEBA, ahora: r.reloj() });
  const contador = (puesto: string, tope: string, sujeto: string) =>
    duenio.agenteContador.findFirst({ where: { tenantId: a.id, puesto, tope, sujeto, periodo: periodoDelTope(tope as keyof typeof TOPES, r.reloj()) } }).then((c) => c?.n ?? 0);

  // ── 1) Un cupo no pasa su máximo aunque 12 lo pidan a la vez ──
  const cupo = { tenantId: a.id, puesto: COBRANZAS, tope: "prueba", sujeto: "*", periodo: "2026-11-12", max: 5 };
  const tomas = await aLaVez(12, () => tenantTransaction((tx) => tomarCupo(tx, cupo), { tenantId: a.id, timeoutMs: 20_000 }));
  assert.equal(tomas.filter(Boolean).length, 5, "exactamente el máximo");
  assert.equal((await duenio.agenteContador.findFirstOrThrow({ where: { tenantId: a.id, tope: "prueba" } })).n, 5);

  // ── 2) Cupo de pedidos POR PERSONA: con 58 usados, de 6 a la vez entran 2 ──
  await duenio.agenteContador.create({
    data: { tenantId: a.id, puesto: "*", tope: "pedidos_por_dia", sujeto: a.duenia.id, periodo: periodoDelTope("pedidos_por_dia", r.reloj()), n: TOPES.pedidos_por_dia.max - 2 },
  });
  const altas = await aLaVez(6, (i) => dejar(duenia, `tope-alta-${i}`));
  assert.equal(altas.filter((x) => x.ok).length, 2, "sólo hasta 60");
  assert.ok(altas.filter((x) => !x.ok).every((x) => !x.ok && x.motivo === "tope"));
  assert.equal(await duenio.agentePedido.count({ where: { tenantId: a.id, userId: a.duenia.id, clave: { startsWith: "tope-" } } }), 2, "el rechazado no deja pedido");
  assert.equal(await contador("*", "pedidos_por_dia", a.duenia.id), TOPES.pedidos_por_dia.max);
  const otraPersona = await dejar(recepcion, "tope-recepcion");
  assert.ok(otraPersona.ok, "el cupo de una persona no frena a otra");

  // ── 3) Doble envío: la misma clave 8 veces a la vez = un pedido y un cupo ──
  const antesRecepcion = await contador("*", "pedidos_por_dia", a.recepcion.id);
  const dobles = await aLaVez(N, () => dejar(recepcion, "doble-envio"));
  assert.ok(dobles.every((x) => x.ok));
  const ids = new Set(dobles.map((x) => (x.ok ? x.pedido.id : "")));
  assert.equal(ids.size, 1, "todos devuelven el mismo pedido");
  assert.equal(dobles.filter((x) => x.ok && x.nuevo).length, 1, "uno solo es nuevo");
  assert.equal(await duenio.agentePedido.count({ where: { tenantId: a.id, clave: "doble-envio" } }), 1);
  assert.equal(await contador("*", "pedidos_por_dia", a.recepcion.id), antesRecepcion + 1, "un solo cupo");
  const idDoble = [...ids][0];

  // ── 4) Dos (ocho) procesos sobre el mismo pedido: lo toma uno ──
  const procesos = await aLaVez(N, () => procesarPedido(idDoble, recepcion, deps));
  assert.equal(procesos.filter((p) => p.procesado).length, 1, "un solo proceso");
  assert.ok(procesos.filter((p) => !p.procesado).every((p) => !p.procesado && p.motivo === "ocupado"));
  assert.equal(await duenio.agenteAccion.count({ where: { tenantId: a.id, pedidoId: idDoble, tipo: "RESPUESTA" } }), 1, "una sola respuesta registrada");
  assert.equal((await duenio.agentePedido.findUniqueOrThrow({ where: { id: idDoble } })).intentos, 1);

  // ── 5) Rescate: sólo lo propio, una vez ──
  const colgado = await dejar(duenia, "rescate-1", {});
  assert.ok(!colgado.ok, "la dueña ya no tiene cupo hoy");
  await duenio.agenteContador.updateMany({ where: { tenantId: a.id, sujeto: a.duenia.id, tope: "pedidos_por_dia" }, data: { n: 0 } });
  const x = await dejar(duenia, "rescate-1");
  assert.ok(x.ok);
  const idX = x.pedido.id;
  assert.deepEqual(await pedidosParaRescatar({ tenantId: a.id, userId: a.duenia.id, ahora: r.reloj() }), [], "recién dejado: todavía no está colgado");
  r.avanzar(11_000);
  assert.ok((await pedidosParaRescatar({ tenantId: a.id, userId: a.duenia.id, ahora: r.reloj() })).includes(idX), "RECIBIDO hace más de 10 s");
  assert.ok(!(await pedidosParaRescatar({ tenantId: a.id, userId: a.recepcion.id, ahora: r.reloj() })).includes(idX), "el rescate de otra persona no lo ve");
  assert.deepEqual(await procesarPedido(idX, recepcion, deps), { procesado: false, motivo: "no_existe" }, "ni lo toma");
  const rescates = await aLaVez(4, () => procesarPedido(idX, duenia, deps));
  assert.equal(rescates.filter((p) => p.procesado).length, 1, "se relanza una sola vez");

  // ── 6) Un intento viejo no pisa al nuevo: toma vencida → se retoma, y el cierre del primero no vale ──
  const y = await dejar(duenia, "intento-viejo");
  assert.ok(y.ok);
  const primera = await tomarPedido({ tenantId: a.id, id: y.pedido.id, userId: a.duenia.id, ahora: r.reloj() });
  assert.ok(primera.tomado && primera.intento === 1);
  assert.deepEqual(await tomarPedido({ tenantId: a.id, id: y.pedido.id, userId: a.duenia.id, ahora: r.reloj() }), { tomado: false, motivo: "ocupado" }, "en curso: no se toma");
  r.poner(new Date(primera.hasta.getTime() + 1000));
  assert.ok((await pedidosParaRescatar({ tenantId: a.id, userId: a.duenia.id, ahora: r.reloj() })).includes(y.pedido.id), "toma vencida y con plazo");
  const segunda = await tomarPedido({ tenantId: a.id, id: y.pedido.id, userId: a.duenia.id, ahora: r.reloj() });
  assert.ok(segunda.tomado && segunda.intento === 2);
  const resultado = { estado: "RESPONDIDO" as const, respuesta: "vieja", filas: null, motivo: null, conModelo: false };
  const viejo = await cerrarPedido({ tenantId: a.id, id: y.pedido.id, userId: a.duenia.id, puesto: COBRANZAS, intento: 1, ahora: r.reloj(), resultado, rastro: { acciones: [], consumo: null } });
  assert.deepEqual(viejo, { cerrado: false, estado: null }, "el intento 1 ya no cierra");
  const nuevo = await cerrarPedido({ tenantId: a.id, id: y.pedido.id, userId: a.duenia.id, puesto: COBRANZAS, intento: 2, ahora: r.reloj(), resultado: { ...resultado, respuesta: "nueva" }, rastro: { acciones: [], consumo: null } });
  assert.equal(nuevo.cerrado, true);
  assert.equal((await duenio.agentePedido.findUniqueOrThrow({ where: { id: y.pedido.id } })).respuesta, "nueva");

  // ── 7) Con menos de 30 s de plazo no se toma ni se rescata ──
  r.poner(T0);
  const z = await dejar(duenia, "poco-plazo");
  assert.ok(z.ok);
  r.poner(new Date(z.pedido.venceEl.getTime() - 25_000));
  assert.ok(!(await pedidosParaRescatar({ tenantId: a.id, userId: a.duenia.id, ahora: r.reloj() })).includes(z.pedido.id));
  assert.deepEqual(await tomarPedido({ tenantId: a.id, id: z.pedido.id, userId: a.duenia.id, ahora: r.reloj() }), { tomado: false, motivo: "sin_tiempo" });

  // ── 8) Vencidos: SIN_RESPONDER una sola vez aunque 4 lo cierren a la vez ──
  r.poner(new Date(z.pedido.venceEl.getTime() + 1000));
  const abiertosVencidos = await duenio.agentePedido.count({ where: { tenantId: a.id, userId: a.duenia.id, estado: { in: ["RECIBIDO", "EN_CURSO"] }, venceEl: { lt: r.reloj() } } });
  assert.ok(abiertosVencidos >= 1);
  const cierres = await aLaVez(4, () => vencerPropios({ tenantId: a.id, userId: a.duenia.id, ahora: r.reloj() }));
  assert.equal(cierres.reduce((s, n) => s + n, 0), abiertosVencidos, "cada vencido se cierra una sola vez");
  assert.equal(await duenio.agentePedido.count({ where: { tenantId: a.id, userId: a.recepcion.id, estado: "SIN_RESPONDER" } }), 0, "los de otra persona no se tocan");
  assert.equal((await duenio.agentePedido.findUniqueOrThrow({ where: { id: z.pedido.id } })).estado, "SIN_RESPONDER");
  assert.equal(await duenio.agenteAccion.count({ where: { pedidoId: z.pedido.id, tipo: "VENCIDO" } }), 1);

  // ── 9) Parte a pedido: cupo POR PERSONA (con 9 usados, de 4 a la vez entra 1) ──
  r.poner(T0);
  await duenio.agenteContador.create({
    data: { tenantId: a.id, puesto: COORDINACION, tope: "partes_a_pedido", sujeto: a.recepcion.id, periodo: periodoDelTope("partes_a_pedido", r.reloj()), n: TOPES.partes_a_pedido.max - 1 },
  });
  const partes = await aLaVez(4, (i) => dejarPedido(recepcion, { puesto: COORDINACION, tipo: "LISTA", frecuente: "parte_del_dia", clave: `parte-alta-${i}` }, { equipos: EQUIPOS_DE_PRUEBA, ahora: r.reloj() }));
  assert.equal(partes.filter((p) => p.ok).length, 1);
  const parteDuenia = await dejarPedido(duenia, { puesto: COORDINACION, tipo: "LISTA", frecuente: "parte_del_dia", clave: "parte-duenia" }, { equipos: EQUIPOS_DE_PRUEBA, ahora: r.reloj() });
  assert.ok(parteDuenia.ok, "el cupo de partes es por persona");

  // ── 10) Único parcial: un compromiso ABIERTO por clave, aunque 8 lo creen a la vez (S20) ──
  const compromiso = { tenantId: a.id, puesto: COORDINACION, texto: "Cobrar seña", fecha: new Date("2026-11-20T00:00:00.000Z"), clave: "cuota:1:aviso", creadoPor: "agente:administracion.coordinacion", createdAt: T0 };
  const altasC = await aLaVez(N, () => tenantTransaction((tx) => tx.agenteCompromiso.createMany({ data: [compromiso], skipDuplicates: true }), { tenantId: a.id, timeoutMs: 20_000 }));
  assert.equal(altasC.reduce((s, c) => s + c.count, 0), 1);
  assert.equal(await duenio.agenteCompromiso.count({ where: { tenantId: a.id, clave: compromiso.clave } }), 1);
  await duenio.agenteCompromiso.updateMany({ where: { tenantId: a.id, clave: compromiso.clave }, data: { estado: "CUMPLIDO", cerradoEl: T0 } });
  const reabierto = await tenantTransaction((tx) => tx.agenteCompromiso.createMany({ data: [compromiso], skipDuplicates: true }), { tenantId: a.id });
  assert.equal(reabierto.count, 1, "cerrado el anterior, la misma clave vuelve a abrir");

  // ── 11) EN_BANDEJA: nadie lo toma, nadie lo rescata ni lo vence ──
  const bandeja = await dejarPedido(duenia, { puesto: COBRANZAS, tipo: "LIBRE", texto: "¿Me armás el resumen del mes?", clave: "bandeja-1" }, { equipos: EQUIPOS_DE_PRUEBA, ahora: r.reloj(), env: {} });
  assert.ok(bandeja.ok && bandeja.pedido.estado === "EN_BANDEJA" && !bandeja.procesar, "sin clave de IA: a la bandeja, con plazo");
  const idB = bandeja.pedido.id;
  assert.ok((await duenio.agentePedido.findUniqueOrThrow({ where: { id: idB } })).venceEl.getTime() > T0.getTime());
  assert.deepEqual(await procesarPedido(idB, duenia, deps), { procesado: false, motivo: "en_bandeja" });
  r.avanzar(60_000);
  assert.ok(!(await pedidosParaRescatar({ tenantId: a.id, userId: a.duenia.id, ahora: r.reloj() })).includes(idB));
  r.avanzar(3_600_000);
  await vencerPropios({ tenantId: a.id, userId: a.duenia.id, ahora: r.reloj() });
  const enBandeja = await duenio.agentePedido.findUniqueOrThrow({ where: { id: idB } });
  assert.equal(enBandeja.estado, "EN_BANDEJA", "vencido y todo, sigue en la bandeja");
  assert.equal(enBandeja.intentos, 0);
});
