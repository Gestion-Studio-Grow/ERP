// ============================================================================
// EQUIPO DE AGENTES · aislamiento entre negocios contra Postgres (03 §14, primero de la tanda 1).
// ============================================================================
// Base efímera (src/test/base-efimera.ts) con la app como `app_rls`, igual que producción. Se mide:
//   · `ctx.db` ve sólo lo del negocio (aunque el where pida otro) y lanza dentro de una transacción;
//   · el buzón de A no se ve ni se toma desde B, ni por otra persona de A;
//   · el modelo nunca recibe `tenantId` ni el id del negocio;
//   · las FK compuestas impiden colgar el registro de un pedido de otro negocio;
//   · RLS en las 11 tablas: insertar con el tenantId de otro negocio falla;
//   · AgenteAccion es sólo INSERT para `app_rls`, también después de correr 0002 dos veces;
//   · 0002 corre sin error en una base que no tiene la tabla.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, urlDeRol, urlDelServidor } from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { COBRANZAS, EQUIPOS_DE_PRUEBA, HERRAMIENTAS_DE_PRUEBA, T0, actorDePrueba, gastoDePrueba, relojFijo, vistaDe } from "@/test/agentes-de-prueba";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";

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


/** El mismo candado entre procesos que usa el arnés para crear roles (base-efimera.ts, CANDADO_DE_ROLES). */
const CANDADO_DE_ROLES = 7_300_000_001;
const SQL_0002 = readFileSync(path.join(process.cwd(), "prisma/rls/0002_app_role.sql"), "utf8");

async function correr0002(url: string): Promise<void> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query("SELECT pg_advisory_lock($1)", [CANDADO_DE_ROLES]);
    try {
      await c.query(SQL_0002);
    } finally {
      await c.query("SELECT pg_advisory_unlock($1)", [CANDADO_DE_ROLES]);
    }
  } finally {
    await c.end();
  }
}

const TABLAS = ["AgentePuesto", "AgentePedido", "AgenteCompromiso", "AgenteNota", "AgentePropuesta", "AgenteParte", "AgenteContador", "AgenteAccion", "AgenteGasto", "AgenteReserva", "AgenteAjuste"];

test("agentes: aislamiento entre negocios, RLS de las 11 tablas y registro sólo INSERT", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();

  const { prisma } = await import("@/lib/prisma");
  const { tenantTransaction } = await import("@/lib/rls");
  const { lecturaDelNegocio, LecturaNoPermitida } = await import("./lectura.server");
  const { dejarPedido, tomarPedido, listarPedidos } = await import("./buzon.server");
  const { procesarPedido } = await import("./motor.server");
  const { proveedorDeGuion } = await import("./proveedor");
  base.alBorrar(() => prisma.$disconnect());
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  for (const n of [a, b]) {
    await interruptor(duenio, n.id, "equipo-agentes");
    await interruptor(duenio, n.id, "equipo-agentes-ia");
  }

  // ── 1) Las 11 tablas con RLS y su política (lo deja la migración) ──
  const rls = await duenio.$queryRawUnsafe<{ relname: string; relrowsecurity: boolean; politicas: bigint }[]>(
    `SELECT c.relname, c.relrowsecurity, (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS politicas
       FROM pg_class c WHERE c.relname = ANY($1::text[]) AND c.relkind = 'r'`,
    TABLAS,
  );
  assert.equal(rls.length, 11, "las 11 tablas existen");
  for (const r of rls) {
    assert.equal(r.relrowsecurity, true, `${r.relname} con RLS`);
    assert.equal(Number(r.politicas), 1, `${r.relname} con tenant_isolation`);
  }

  // ── 2) ctx.db: sólo lo del negocio, aunque el where pida otro; nunca dentro de una transacción ──
  const dbA = lecturaDelNegocio(a.id, { client: {} });
  const dbB = lecturaDelNegocio(b.id, { client: {} });
  const deA = (await dbA.client.findMany({ select: { id: true, tenantId: true } })) as { id: string; tenantId: string }[];
  assert.equal(deA.length, a.clientes.length, "A ve sus clientes");
  assert.ok(deA.length > 0 && deA.every((c) => c.tenantId === a.id));
  const pidiendoB = (await dbA.client.findMany({ where: { tenantId: b.id }, select: { id: true, tenantId: true } })) as { tenantId: string }[];
  assert.ok(pidiendoB.every((c) => c.tenantId === a.id), "un tenantId en el where se pisa");
  assert.equal(await dbB.client.count(), b.clientes.length);
  await assert.rejects(tenantTransaction(() => dbA.client.findMany(), { tenantId: a.id }), LecturaNoPermitida, "dentro de una transacción lanza");
  assert.throws(() => (dbA.client as unknown as { update: unknown }).update, LecturaNoPermitida, "no hay escritura");
  assert.throws(() => lecturaDelNegocio(a.id, { agentePedido: {} }), LecturaNoPermitida, "las tablas del motor no se leen por ctx.db");

  // ── 3) El buzón de A: B no lo ve ni lo toma; otra persona de A tampoco lo toma ──
  const r = relojFijo();
  const vistaA = vistaDe(a.id, a.duenia.id);
  const alta = await dejarPedido(vistaA, { puesto: COBRANZAS, tipo: "LISTA", frecuente: "cobranzas_pendientes", clave: "aislamiento-1" }, { equipos: EQUIPOS_DE_PRUEBA, ahora: r.reloj() });
  assert.ok(alta.ok && alta.nuevo);
  const idA = alta.pedido.id;
  // 06 C4 · el recorte de quien pidió queda guardado: sólo módulos, proyectos y columnas; nada del negocio ni de terceros.
  const guardado = (await duenio.agentePedido.findUniqueOrThrow({ where: { id: idA }, select: { recorte: true } })).recorte as Record<string, unknown>;
  assert.deepEqual(Object.keys(guardado).sort(), ["columnasOcultas", "modulos", "proyectos", "veSinProyecto"]);
  assert.equal(guardado.proyectos, "todos");
  const textoRecorte = JSON.stringify(guardado);
  for (const ajeno of [a.id, b.id, a.duenia.id, "Persona de prueba", "tenantId", "userId"]) assert.ok(!textoRecorte.includes(ajeno), `el recorte no lleva ${ajeno}`);
  assert.equal(await tenantTransaction((tx) => tx.agentePedido.count({ where: { recorte: { not: Prisma.DbNull } } }), { tenantId: b.id }), 0, "la RLS del pedido cubre el recorte");
  await assert.rejects(
    duenio.$executeRawUnsafe(`UPDATE "AgentePedido" SET "recorte" = '[1]'::jsonb WHERE id = $1`, idA),
    /AgentePedido_recorte_check/,
    "el recorte es siempre un objeto",
  );
  assert.equal(await tenantTransaction((tx) => tx.agentePedido.count(), { tenantId: b.id }), 0, "B no ve pedidos de A");
  assert.equal((await listarPedidos({ tenantId: b.id, userId: a.duenia.id, puestos: [COBRANZAS], ahora: r.reloj() })).length, 0);
  assert.deepEqual(await tomarPedido({ tenantId: b.id, id: idA, userId: a.duenia.id, ahora: r.reloj() }), { tomado: false, motivo: "no_existe" }, "desde B no se toma");
  assert.deepEqual(await tomarPedido({ tenantId: a.id, id: idA, userId: a.recepcion.id, ahora: r.reloj() }), { tomado: false, motivo: "no_existe" }, "otra persona de A no lo toma");
  const deps = { equipos: EQUIPOS_DE_PRUEBA, herramientas: HERRAMIENTAS_DE_PRUEBA, actorDe: actorDePrueba, reloj: r.reloj };
  assert.deepEqual(await procesarPedido(idA, vistaDe(b.id, b.duenia.id), deps), { procesado: false, motivo: "no_existe" });
  assert.equal((await duenio.agentePedido.findUniqueOrThrow({ where: { id: idA } })).estado, "RECIBIDO", "sigue intacto");

  // ── 4) Procesado por su dueña: sólo renglones de A ──
  assert.deepEqual(await procesarPedido(idA, vistaA, deps), { procesado: true, estado: "RESPONDIDO" });
  const respondido = await duenio.agentePedido.findUniqueOrThrow({ where: { id: idA } });
  const filas = respondido.filas as { entidadId: string }[];
  assert.deepEqual(filas.map((f) => f.entidadId).sort(), [...a.clientes].sort(), "sólo clientes de A");
  for (const idB of b.clientes) assert.ok(!(respondido.respuesta ?? "").includes(idB));

  // ── 5) Texto libre: el modelo nunca recibe tenantId ni el id de un negocio ──
  const env = { AGENTES_ANTHROPIC_API_KEY: "clave-de-prueba-no-real" };
  const libre = await dejarPedido(vistaA, { puesto: COBRANZAS, tipo: "LIBRE", texto: "¿Cuántos clientes tengo?", clave: "aislamiento-2" }, { equipos: EQUIPOS_DE_PRUEBA, ahora: r.reloj(), env });
  assert.ok(libre.ok && libre.pedido.estado === "RECIBIDO");
  const proveedor = proveedorDeGuion([
    { ok: true, texto: "", llamadas: [{ id: "l1", herramienta: "cobranzas.resumen", argumentos: {} }], uso: { entrada: 10, salida: 5 }, corte: "tool_use" },
    { ok: true, texto: `Tenés ${a.clientes.length} clientes.\n[[filas:r1]]\nFuente: inventada`, llamadas: [], uso: { entrada: 20, salida: 8 }, corte: "end_turn" },
  ]);
  const gasto = gastoDePrueba();
  const pl = await procesarPedido(libre.pedido.id, vistaA, { ...deps, proveedor, gasto, modeloDe: () => "modelo-de-prueba" });
  assert.deepEqual(pl, { procesado: true, estado: "RESPONDIDO" });
  const recibido = JSON.stringify(proveedor.recibido);
  assert.ok(!recibido.includes("tenantId"), "ningún tenantId al modelo");
  assert.ok(!recibido.includes(a.id) && !recibido.includes(b.id), "ningún id de negocio al modelo");
  assert.equal(proveedor.llamadas, 2);
  assert.deepEqual(gasto.cierres, [15, 28], "cada llamada reserva y cierra con el costo real");
  const textoLibre = (await duenio.agentePedido.findUniqueOrThrow({ where: { id: libre.pedido.id } })).respuesta ?? "";
  assert.ok(!textoLibre.includes("inventada"), "la «Fuente:» del modelo se descarta");
  assert.ok(textoLibre.includes("(Fuente: Clientes ·"), "los renglones con su origen los pone el código");

  // 06 C3 · el registro admite la copia para IA (el CHECK del tipo la incluye).
  await duenio.agenteAccion.create({ data: { tenantId: a.id, puesto: COBRANZAS, tipo: "COPIA_PARA_IA", actor: "operator:qa", pedidoId: idA, createdAt: T0 } });

  // ── 6) FK compuesta: el registro no se cuelga de un pedido de otro negocio (ni como dueño) ──
  await assert.rejects(
    duenio.agenteAccion.create({ data: { tenantId: b.id, puesto: COBRANZAS, tipo: "LECTURA", actor: "agente:x", pedidoId: idA, createdAt: T0 } }),
    "FK (tenantId, pedidoId)",
  );

  // ── 7) RLS: desde B no se escribe con el tenantId de A, en ninguna tabla del equipo ──
  await assert.rejects(
    tenantTransaction((tx) => tx.agentePuesto.createMany({ data: [{ tenantId: a.id, puesto: COBRANZAS, updatedAt: T0 }] }), { tenantId: b.id }),
    "WITH CHECK de RLS",
  );
  await assert.rejects(
    tenantTransaction((tx) => tx.agenteAccion.createMany({ data: [{ tenantId: a.id, puesto: COBRANZAS, tipo: "LECTURA", actor: "agente:x", createdAt: T0 }] }), { tenantId: b.id }),
  );
  const cambiadosDesdeB = await tenantTransaction((tx) => tx.agentePedido.updateMany({ where: { id: idA }, data: { estado: "SIN_RESPONDER" } }), { tenantId: b.id });
  assert.equal(cambiadosDesdeB.count, 0, "desde B un update por id de A no encuentra nada");

  // ── 8) AgenteAccion sólo INSERT para app_rls; idem tras correr 0002 dos veces ──
  const accionesDeA = await duenio.agenteAccion.count({ where: { tenantId: a.id } });
  assert.ok(accionesDeA > 0, "el proceso dejó registro");
  const sinCambiar = async () => {
    await assert.rejects(tenantTransaction((tx) => tx.agenteAccion.updateMany({ where: {}, data: { actor: "otro" } }), { tenantId: a.id }), /permission denied|denegado/i);
    await assert.rejects(tenantTransaction((tx) => tx.agenteAccion.deleteMany({}), { tenantId: a.id }), /permission denied|denegado/i);
    assert.equal(await duenio.agenteAccion.count({ where: { tenantId: a.id } }), accionesDeA);
  };
  await sinCambiar();
  const comoAdmin = urlDeRol(urlDelServidor(), null, base.nombre);
  await correr0002(comoAdmin);
  await correr0002(comoAdmin);
  await sinCambiar();
  const priv = await duenio.$queryRawUnsafe<{ ins: boolean; upd: boolean; del: boolean }[]>(
    `SELECT has_table_privilege('app_rls', '"AgenteAccion"', 'INSERT') AS ins, has_table_privilege('app_rls', '"AgenteAccion"', 'UPDATE') AS upd, has_table_privilege('app_rls', '"AgenteAccion"', 'DELETE') AS del`,
  );
  assert.deepEqual(priv[0], { ins: true, upd: false, del: false });

  // ── 9) 0002 en una base SIN la tabla (orden de despliegue al revés): corre sin error ──
  const servidor = urlDelServidor();
  const nombre = `erp_test_${process.pid}_${randomBytes(4).toString("hex")}`;
  const admin = new pg.Client({ connectionString: urlDeRol(servidor, null, "postgres") });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${nombre}" OWNER neondb_owner`);
    try {
      await correr0002(urlDeRol(servidor, null, nombre));
    } finally {
      await admin.query(`DROP DATABASE IF EXISTS "${nombre}"`);
    }
  } finally {
    await admin.end();
  }
});
