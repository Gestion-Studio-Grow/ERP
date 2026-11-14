// ============================================================================
// EQUIPO DE AGENTES · vigencia contra Postgres (03 §12.1, §14; primero de la tanda 1).
// ============================================================================
// La vigencia se lee con `tx` y sin caché en cada transacción que escribe. Se mide:
//   · equipo apagado o puesto en pausa: no entra ningún pedido;
//   · pausa (o apagado) entre el alta y la toma: el pedido se cierra NECESITA_PERSONA con el motivo
//     (o SIN_RESPONDER si ya venció) y su fila de registro, no queda colgado;
//   · pausa EN MEDIO de un pedido de texto libre: lo único que se escribe es el cierre de la reserva
//     (plata ya gastada); no hay otra llamada al modelo ni respuesta a medio armar;
//   · IA apagada entre el alta y el proceso: ninguna reserva ni llamada;
//   · pausar es idempotente bajo carrera; reanudar con el equipo apagado no reanuda;
//   · sin las tablas (migración sin aplicar): el alta devuelve «sin_tablas» y no rompe;
//   · una pausa espera a la escritura que tiene el puesto; un apagado a mitad de una escritura la deshace;
//   · la reserva de gasto se cierra aunque el proveedor o el costo lancen.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { COBRANZAS, COORDINACION, EQUIPOS_DE_PRUEBA, HERRAMIENTAS_DE_PRUEBA, aLaVez, actorDePrueba, gastoDePrueba, T0, relojFijo, vistaDe } from "@/test/agentes-de-prueba";
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


test("agentes: vigencia sin caché (apagado, pausa antes y en medio del pedido, IA apagada)", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();

  const { prisma } = await import("@/lib/prisma");
  const { dejarPedido, tomarPedido, cerrarPedido } = await import("./buzon.server");
  const { procesarPedido } = await import("./motor.server");
  const { pausarPuestos, reanudarPuesto, tablasDeAgentes } = await import("./estado.server");
  const { proveedorDeGuion } = await import("./proveedor");
  base.alBorrar(() => prisma.$disconnect());
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;

  const r = relojFijo();
  const vista = vistaDe(a.id, a.duenia.id);
  const env = { AGENTES_ANTHROPIC_API_KEY: "clave-de-prueba-no-real" };
  const deps = { equipos: EQUIPOS_DE_PRUEBA, herramientas: HERRAMIENTAS_DE_PRUEBA, actorDe: actorDePrueba, reloj: r.reloj, modeloDe: () => "modelo-de-prueba" };
  const lista = (clave: string, puesto = COBRANZAS) =>
    dejarPedido(vista, puesto === COBRANZAS ? { puesto, tipo: "LISTA", frecuente: "cobranzas_pendientes", clave } : { puesto, tipo: "LISTA", frecuente: "parte_del_dia", clave }, { equipos: EQUIPOS_DE_PRUEBA, ahora: r.reloj() });
  const libre = (clave: string) => dejarPedido(vista, { puesto: COBRANZAS, tipo: "LIBRE", texto: "¿Cuántos clientes hay?", clave }, { equipos: EQUIPOS_DE_PRUEBA, ahora: r.reloj(), env });
  const pedido = (id: string) => duenio.agentePedido.findUniqueOrThrow({ where: { id } });

  // ── 1) Apagado de fábrica: no entra nada ──
  const apagado = await lista("apagado-1");
  assert.ok(!apagado.ok && apagado.motivo === "apagado");
  assert.equal(await duenio.agentePedido.count(), 0);

  await interruptor(duenio, a.id, "equipo-agentes");
  await interruptor(duenio, a.id, "equipo-agentes-ia");

  // ── 2) Pausa: el puesto pausado no recibe; el otro sí. Pausar a la vez = una sola pausa ──
  const pausas = await aLaVez(4, () => pausarPuestos({ tenantId: a.id, puestos: [COORDINACION], quien: "Duenia A", actor: "user:a", ahora: r.reloj() }));
  assert.equal(pausas.reduce((s, p) => s + p.pausados, 0), 1);
  assert.equal(await duenio.agenteAccion.count({ where: { tenantId: a.id, puesto: COORDINACION, tipo: "PAUSA" } }), 1);
  const enPausa = await lista("pausa-coord-1", COORDINACION);
  assert.ok(!enPausa.ok && enPausa.motivo === "pausado" && enPausa.mensaje.includes("Duenia A"));
  assert.ok((await lista("activo-cobr-1")).ok, "otro puesto sigue");
  assert.deepEqual(await reanudarPuesto({ tenantId: a.id, puesto: COORDINACION, actor: "user:a", ahora: r.reloj() }), { ok: true });
  assert.ok((await lista("reanudado-1", COORDINACION)).ok);

  // ── 3) Pausa entre el alta y la toma: NECESITA_PERSONA con motivo y registro ──
  const p3 = await lista("pausa-antes-de-tomar");
  assert.ok(p3.ok);
  await pausarPuestos({ tenantId: a.id, puestos: [COBRANZAS], quien: "Duenia A", actor: "user:a", ahora: r.reloj() });
  assert.deepEqual(await procesarPedido(p3.pedido.id, vista, deps), { procesado: false, motivo: "cerrado_sin_vigencia" });
  const c3 = await pedido(p3.pedido.id);
  assert.equal(c3.estado, "NECESITA_PERSONA");
  assert.ok(c3.motivo?.includes("pausa"));
  assert.equal(c3.respuesta, null);
  assert.equal(await duenio.agenteAccion.count({ where: { pedidoId: p3.pedido.id, tipo: "PAUSA" } }), 1);
  await reanudarPuesto({ tenantId: a.id, puesto: COBRANZAS, actor: "user:a", ahora: r.reloj() });

  // ── 4) Apagado entre el alta y la toma, ya vencido: SIN_RESPONDER ──
  const p4 = await lista("apagado-y-vencido");
  assert.ok(p4.ok);
  await interruptor(duenio, a.id, "equipo-agentes", false);
  r.poner(new Date(p4.pedido.venceEl.getTime() + 1000));
  assert.deepEqual(await procesarPedido(p4.pedido.id, vista, deps), { procesado: false, motivo: "cerrado_sin_vigencia" });
  assert.equal((await pedido(p4.pedido.id)).estado, "SIN_RESPONDER");
  assert.equal(await duenio.agenteAccion.count({ where: { pedidoId: p4.pedido.id, tipo: "VENCIDO" } }), 1);
  assert.deepEqual(await reanudarPuesto({ tenantId: a.id, puesto: COBRANZAS, actor: "user:a", ahora: r.reloj() }), { ok: false, motivo: "apagado" }, "apagado no se reanuda");
  await interruptor(duenio, a.id, "equipo-agentes");
  r.poner(new Date(p4.pedido.venceEl.getTime() + 60_000));

  // ── 5) Pausa EN MEDIO de un texto libre: sólo se cierra la reserva; ninguna otra llamada ──
  const p5 = await libre("pausa-en-medio-1");
  assert.ok(p5.ok && p5.pedido.estado === "RECIBIDO");
  const g5 = gastoDePrueba();
  const prov5 = proveedorDeGuion([
    async () => {
      await pausarPuestos({ tenantId: a.id, puestos: [COBRANZAS], quien: "Duenia A", actor: "user:a", ahora: r.reloj() });
      return { ok: true, texto: "", llamadas: [{ id: "l1", herramienta: "cobranzas.resumen", argumentos: {} }], uso: { entrada: 10, salida: 3 }, corte: "tool_use" };
    },
    { ok: true, texto: "No debería llegar acá.", llamadas: [], uso: { entrada: 1, salida: 1 }, corte: "end_turn" },
  ]);
  assert.deepEqual(await procesarPedido(p5.pedido.id, vista, { ...deps, proveedor: prov5, gasto: g5 }), { procesado: true, estado: "NECESITA_PERSONA" });
  assert.equal(prov5.llamadas, 1, "después de la pausa no sale otra llamada");
  assert.equal(g5.reservas, 1);
  assert.deepEqual(g5.cierres, [13], "la reserva se cierra con lo gastado");
  const c5 = await pedido(p5.pedido.id);
  assert.equal(c5.respuesta, null, "sin respuesta a medio armar");
  assert.ok(c5.motivo?.includes("pausa"));
  assert.equal(await duenio.agenteAccion.count({ where: { pedidoId: p5.pedido.id, tipo: { in: ["RESPUESTA", "LECTURA"] } } }), 0, "no se registra el trabajo hecho después de la pausa");
  const pausa5 = await duenio.agenteAccion.findFirstOrThrow({ where: { pedidoId: p5.pedido.id, tipo: "PAUSA" } });
  assert.equal(pausa5.microUsd, 13, "pero sí lo gastado");
  await reanudarPuesto({ tenantId: a.id, puesto: COBRANZAS, actor: "user:a", ahora: r.reloj() });

  // ── 6) Pausa mientras el modelo escribe la respuesta final: no se guarda la respuesta ──
  const p6 = await libre("pausa-en-medio-2");
  assert.ok(p6.ok);
  const prov6 = proveedorDeGuion([
    async () => {
      await pausarPuestos({ tenantId: a.id, puestos: [COBRANZAS], quien: "Duenia A", actor: "user:a", ahora: r.reloj() });
      return { ok: true, texto: "No hay nada pendiente.", llamadas: [], uso: { entrada: 5, salida: 5 }, corte: "end_turn" };
    },
  ]);
  assert.deepEqual(await procesarPedido(p6.pedido.id, vista, { ...deps, proveedor: prov6, gasto: gastoDePrueba() }), { procesado: true, estado: "NECESITA_PERSONA" });
  assert.equal((await pedido(p6.pedido.id)).respuesta, null);
  await reanudarPuesto({ tenantId: a.id, puesto: COBRANZAS, actor: "user:a", ahora: r.reloj() });

  // ── 7) IA apagada entre el alta y el proceso: ni reserva ni llamada ──
  const p7 = await libre("ia-apagada-1");
  assert.ok(p7.ok && p7.pedido.estado === "RECIBIDO");
  await interruptor(duenio, a.id, "equipo-agentes-ia", false);
  const g7 = gastoDePrueba();
  const prov7 = proveedorDeGuion([]);
  assert.deepEqual(await procesarPedido(p7.pedido.id, vista, { ...deps, proveedor: prov7, gasto: g7 }), { procesado: true, estado: "NECESITA_PERSONA" });
  assert.equal(prov7.llamadas, 0);
  assert.equal(g7.reservas, 0);
  const tarde = await libre("ia-apagada-2");
  assert.ok(tarde.ok && tarde.pedido.estado === "EN_BANDEJA", "con la IA apagada, el texto libre va a la bandeja");

  // ── 8) Lo de A no prende ni pausa nada en B ──
  const enB = await dejarPedido(vistaDe(b.id, b.duenia.id), { puesto: COBRANZAS, tipo: "LISTA", frecuente: "cobranzas_pendientes", clave: "negocio-b-1" }, { equipos: EQUIPOS_DE_PRUEBA, ahora: r.reloj() });
  assert.ok(!enB.ok && enB.motivo === "apagado", "B sigue apagado");

  // ── 9) El código llega antes que su migración (03 §3): sin tablas, «sin_tablas», no un error ──
  // Sólo en la base efímera: se esconde una tabla y se la devuelve.
  assert.equal(await tablasDeAgentes(a.id), true);
  await duenio.$executeRawUnsafe('ALTER TABLE "AgentePuesto" RENAME TO "AgentePuesto_escondida"');
  try {
    assert.equal(await tablasDeAgentes(a.id), false);
    const sinTablas = await lista("sin-tablas-1");
    assert.ok(!sinTablas.ok && sinTablas.motivo === "sin_tablas");
  } finally {
    await duenio.$executeRawUnsafe('ALTER TABLE "AgentePuesto_escondida" RENAME TO "AgentePuesto"');
  }
  assert.equal(await tablasDeAgentes(a.id), true);

  // ── 10) Pausa o apagado A MITAD de una transacción que escribe (hallazgos de las certificaciones) ──
  // Una fila se traba como dueño y la transacción de la app queda esperándola. Sin sleeps: se espera
  // a ver en pg_locks los candados pedidos y no concedidos (las otras conexiones, bloqueadas).
  const esperarBloqueos = async (n: number) => {
    for (let i = 0; i < 2000; i++) {
      const filas = await duenio.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid WHERE a.datname = current_database() AND NOT l.granted`,
      );
      if (Number(filas[0].n) >= n) return;
      await new Promise((res) => setImmediate(res));
    }
    throw new Error(`nunca hubo ${n} conexiones esperando un candado`);
  };
  const trabarFila = async (sql: string, valor: string) => {
    let soltar!: () => void;
    const suelto = new Promise<void>((res) => (soltar = res));
    let trabada!: () => void;
    const yaTrabada = new Promise<void>((res) => (trabada = res));
    const candado = duenio.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(sql, valor);
        trabada();
        await suelto;
      },
      { timeout: 60_000 },
    );
    await yaTrabada;
    return async () => {
      soltar();
      await candado;
    };
  };
  const enEspera = async <T>(enVuelo: Promise<T>, n: number) =>
    Promise.race([esperarBloqueos(n), enVuelo.then(() => Promise.reject(new Error("terminó sin esperar el candado")))]);
  const pausarCobranzas = () => pausarPuestos({ tenantId: a.id, puestos: [COBRANZAS], quien: "Duenia A", actor: "user:a", ahora: r.reloj() });
  const reanudar = () => reanudarPuesto({ tenantId: a.id, puesto: COBRANZAS, actor: "user:a", ahora: r.reloj() });

  // 10a · Pausa durante un cierre: la pausa ESPERA a que el cierre confirme (traba del puesto), así
  // que no hay un RESPONDIDO escrito con el puesto ya pausado. Queda en orden: respondido, después pausa.
  const p10 = await lista("toctou-cierre-1");
  assert.ok(p10.ok);
  const toma10 = await tomarPedido({ tenantId: a.id, id: p10.pedido.id, userId: a.duenia.id, ahora: r.reloj() });
  assert.ok(toma10.tomado);
  const soltar10 = await trabarFila('SELECT 1 FROM "AgentePedido" WHERE id = $1 FOR UPDATE', p10.pedido.id);
  const cierre10 = cerrarPedido({
    tenantId: a.id,
    id: p10.pedido.id,
    userId: a.duenia.id,
    puesto: COBRANZAS,
    intento: toma10.intento,
    ahora: r.reloj(),
    resultado: { estado: "RESPONDIDO", respuesta: "respuesta armada", filas: null, motivo: null, conModelo: false },
    rastro: { acciones: [], consumo: null },
  });
  await enEspera(cierre10, 1);
  let pausaConfirmada = false;
  const pausa10 = pausarCobranzas().then((x) => ((pausaConfirmada = true), x));
  await enEspera(pausa10, 2);
  assert.equal(pausaConfirmada, false, "la pausa espera al cierre que ya tenía el puesto");
  await soltar10();
  assert.deepEqual(await cierre10, { cerrado: true, estado: "RESPONDIDO" });
  assert.deepEqual(await pausa10, { pausados: 1 });
  const c10 = await pedido(p10.pedido.id);
  assert.equal(c10.respuesta, "respuesta armada");
  assert.equal(await duenio.agenteAccion.count({ where: { pedidoId: p10.pedido.id, tipo: "RESPUESTA" } }), 1);
  // Y con el puesto ya pausado, el alta siguiente se rechaza.
  const despues10 = await lista("toctou-cierre-2");
  assert.ok(!despues10.ok && despues10.motivo === "pausado");
  await reanudar();

  // 10b · Apagado durante el alta: la relectura del final la deshace entera (cupo incluido).
  const periodo = new Date(r.reloj().getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
  await duenio.agenteContador.createMany({ data: [{ tenantId: a.id, puesto: "*", tope: "pedidos_por_dia", sujeto: a.duenia.id, periodo, n: 0 }], skipDuplicates: true });
  const contador = () => duenio.agenteContador.findMany({ where: { tenantId: a.id, sujeto: a.duenia.id }, select: { tope: true, puesto: true, periodo: true, n: true }, orderBy: [{ tope: "asc" }, { puesto: "asc" }, { periodo: "asc" }] });
  const cuposAntes = await contador();
  const soltar10b = await trabarFila(
    `SELECT 1 FROM "AgenteContador" WHERE "tenantId" = $1 AND "tope" = 'pedidos_por_dia' AND "sujeto" = '${a.duenia.id}' FOR UPDATE`,
    a.id,
  );
  const alta10 = lista("toctou-alta-1");
  await enEspera(alta10, 1);
  await interruptor(duenio, a.id, "equipo-agentes", false);
  await soltar10b();
  const res10b = await alta10;
  assert.ok(!res10b.ok && res10b.motivo === "apagado");
  assert.equal(await duenio.agentePedido.count({ where: { tenantId: a.id, clave: "toctou-alta-1" } }), 0, "el alta se deshizo entera");
  assert.deepEqual(await contador(), cuposAntes, "y no consumió cupo");
  await interruptor(duenio, a.id, "equipo-agentes");

  // 10c · Apagado durante la reserva de gasto: la reserva se deshace y la llamada no sale.
  await interruptor(duenio, a.id, "equipo-agentes-ia");
  const p10c = await libre("toctou-reserva-1");
  assert.ok(p10c.ok && p10c.pedido.estado === "RECIBIDO");
  const g10 = gastoDePrueba();
  const reservarOriginal = g10.reservar;
  g10.reservar = async (tx, datos) => {
    await interruptor(duenio, a.id, "equipo-agentes", false);
    return reservarOriginal(tx, datos);
  };
  const prov10 = proveedorDeGuion([{ ok: true, texto: "No debería salir.", llamadas: [], uso: { entrada: 1, salida: 1 }, corte: "end_turn" }]);
  const proc10c = await procesarPedido(p10c.pedido.id, vista, { ...deps, proveedor: prov10, gasto: g10 });
  assert.ok(proc10c.procesado && proc10c.estado !== "RESPONDIDO");
  assert.equal(prov10.llamadas, 0, "sin vigencia al final de la reserva no hay llamada");
  assert.deepEqual(g10.cierres, [], "nada que cerrar: la reserva se deshizo con su transacción");
  await interruptor(duenio, a.id, "equipo-agentes");

  // 10d · Un proveedor que LANZA no deja la reserva abierta: se cierra con el estimado.
  const p10d = await libre("proveedor-lanza-1");
  assert.ok(p10d.ok && p10d.pedido.estado === "RECIBIDO");
  const g10d = gastoDePrueba();
  const prov10d = proveedorDeGuion([
    () => {
      throw new Error("se cortó la conexión");
    },
  ]);
  const proc10d = await procesarPedido(p10d.pedido.id, vista, { ...deps, proveedor: prov10d, gasto: g10d });
  assert.ok(proc10d.procesado, "el pedido no queda colgado");
  assert.equal(g10d.reservas, 1);
  assert.deepEqual(g10d.cierres, [100], "la reserva se cierra con el estimado");

  // 10e · Si el costo no se puede calcular (modelo sin precio), la reserva igual se cierra, con el estimado.
  const p10e = await libre("costo-lanza-1");
  assert.ok(p10e.ok && p10e.pedido.estado === "RECIBIDO");
  const g10e = gastoDePrueba();
  g10e.costo = () => {
    throw new Error("Sin precio cargado para el modelo x");
  };
  const prov10e = proveedorDeGuion([{ ok: true, texto: "Hay clientes.", llamadas: [], uso: { entrada: 1, salida: 1 }, corte: "end_turn" }]);
  const proc10e = await procesarPedido(p10e.pedido.id, vista, { ...deps, proveedor: prov10e, gasto: g10e });
  assert.ok(proc10e.procesado);
  assert.equal(prov10e.llamadas, 1);
  assert.deepEqual(g10e.cierres, [100], "la reserva se cierra aunque el costo lance");
});
