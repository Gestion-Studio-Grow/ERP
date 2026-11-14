// ============================================================================
// CONEXIÓN DE LOS AGENTES (agente-db.ts, rol gsg_agente) contra Postgres efímero. Nunca Neon.
// ============================================================================
//
// Aplica prisma/pending-gate2/MANT_roles_soporte.sql como neondb_owner y prueba, conectando como
// gsg_agente (Prisma de agente-db.ts y un pg.Client de UNA conexión):
//   · sin AGENTE_DATABASE_URL → apagado, sin tocar la base;
//   · aislamiento entre negocios A y B;
//   · cartera: cliente con permiso → se ve; cliente sin permiso → no; cliente revoca → deja de verse en
//     la siguiente consulta de la MISMA conexión; cliente CH (slug beauty-spa, protegido por la siembra
//     del SQL) → nunca, aunque tenga un permiso cargado;
//   · la función SECURITY DEFINER: sin parámetros, sólo boolean, nada para app_rls; no es un oráculo de
//     negocios ajenos a la cartera del estudio parado;
//   · carrera: revocación entre la lectura y la escritura del borrador → la escritura falla y no queda nada;
//   · CH o slug vacío → no toca la base; el agente nunca escribe `respuesta`;
//   · certificación adversarial ronda 1 (cada ataque, ahora rechazado): cerrar un ticket (estado), leer
//     permisos de un negocio fijándose el contexto, listar negocios (Tenant), evento «borrador_aprobado»
//     falso, borrador de mail falso en AuditLog, permiso dado a una versión vieja del texto;
//   · ronda 2: slug y permiso de CH (como estudio o cliente) y de un estudio sin permiso → NULL/false;
//     carrera en REPEATABLE READ / SERIALIZABLE → 0 filas; borrador en un ticket resuelto o cerrado → 0 filas.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import type { PrismaClient } from "@/generated/prisma/client";
import { baseEfimeraParaElTest, urlDeRol, urlDelServidor } from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { TEXTO_CONSENTIMIENTO } from "./consentimiento-core";
import { ESTADOS_ABIERTOS } from "./config";

const SQL = readFileSync(path.join(process.cwd(), "prisma/pending-gate2/MANT_roles_soporte.sql"), "utf8");
const CANDADO_DE_ROLES = 7_300_000_001; // el mismo de base-efimera.ts
const denegado = (e: unknown) => {
  const x = e as { code?: string; meta?: { code?: string; driverAdapterError?: { cause?: { originalCode?: string } } } };
  return x.code === "42501" || x.meta?.code === "42501" || x.meta?.driverAdapterError?.cause?.originalCode === "42501";
};

async function conectar(url: string): Promise<pg.Client> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  return c;
}

/** Una base que explota si se la toca: prueba que el código decidió sin abrir la conexión. */
const bomba = new Proxy({}, { get: () => { throw new Error("tocó la base"); } }) as PrismaClient;

test("agente-db: apagado sin variable, aislamiento, cartera con permiso del cliente, CH nunca, carrera con revocación", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  const servidor = urlDelServidor();

  const admin = await conectar(urlDeRol(servidor, null, base.nombre));
  try {
    await admin.query("SELECT pg_advisory_lock($1)", [CANDADO_DE_ROLES]);
    await admin.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gsg_operador') THEN CREATE ROLE gsg_operador LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gsg_agente') THEN CREATE ROLE gsg_agente LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; END IF;
    END $$`);
  } finally {
    await admin.query("SELECT pg_advisory_unlock($1)", [CANDADO_DE_ROLES]).catch(() => {});
    await admin.end();
  }

  const urlAgente = urlDeRol(servidor, "gsg_agente", base.nombre);
  const duenio = await conectar(base.urlDuenio);
  const agente = await conectar(urlAgente); // UNA conexión, para «la siguiente consulta de la misma conexión»
  const app = await conectar(base.urlApp);
  base.alBorrar(() => Promise.all([duenio, agente, app].map((c) => c.end().catch(() => {}))));

  const A = base.a.id; // el estudio
  const B = base.b.id; // otro negocio
  const C = `${A}-c`; // cliente de cartera de A, con permiso
  const D = `${A}-d`; // cliente de cartera de A, sin permiso
  const CH = `${A}-ch`; // slug beauty-spa: lo protege la siembra del SQL
  const titular: Record<string, string> = { [A]: base.a.duenia.id, [B]: base.b.duenia.id, [C]: `${C}-t`, [D]: `${D}-t`, [CH]: `${CH}-t` };
  for (const [id, slug] of [[C, C], [D, D], [CH, "beauty-spa"]] as const) {
    await duenio.query(`INSERT INTO "Tenant" (id, name, slug, subdomain, "updatedAt") VALUES ($1, $1, $2, $2, now())`, [id, slug]);
    await duenio.query(
      `INSERT INTO "User" (id, "tenantId", name, email, "passwordHash", role, "updatedAt") VALUES ($1, $2, 'Titular', $1 || '@x.test', 'x', 'OWNER', now())`,
      [titular[id], id],
    );
  }
  await duenio.query(SQL); // CH ya existe: la siembra lo protege
  const protegidos = await duenio.query(`SELECT "negocioId" FROM "NegocioProtegido"`);
  assert.deepEqual(protegidos.rows.map((r) => r.negocioId), [CH], "la siembra protegió a CH (beauty-spa)");

  const ticket = (id: string, tenantId: string, numero: number, cliente: string | null = null) =>
    duenio.query(
      `INSERT INTO "SupportTicket" (id, "tenantId", numero, tipo, prioridad, asunto, canal, "creadoPor", "clienteTenantId", "updatedAt")
       VALUES ($1, $2, $3, 'consulta', 'P3', 'asunto', 'erp', 'test', $4, now())`,
      [id, tenantId, numero, cliente],
    );
  await ticket("tk-a1", A, 1);
  await ticket("tk-a2", A, 2, C);
  await ticket("tk-a3", A, 3, D);
  await ticket("tk-a4", A, 4, CH);
  await ticket("tk-b1", B, 1);
  await ticket("tk-ch1", CH, 1);
  await ticket("tk-d1", D, 1, C); // estudio SIN permiso con cartera de C (ronda 2)
  await ticket("tk-ch2", CH, 2, C); // CH como estudio, con cartera de C (ronda 2)
  let n = 0;
  // La hora del permiso la pone la base con milisegundos y, a igual hora, gana la revocación (falla
  // cerrado). Para que «revoca y vuelve a dar» no caiga en el mismo milisegundo, cada casilla espera 3 ms.
  const permiso = async (tenantId: string, aceptado: boolean, version: string = TEXTO_CONSENTIMIENTO.version) => {
    await new Promise((r) => setTimeout(r, 3));
    return duenio.query(
      `INSERT INTO "SoporteConsentimiento" (id, "tenantId", nivel, aceptado, "versionTexto", "userId") VALUES ($1, $2, 'n1', $3, $5, $4)`,
      [`cs-${++n}`, tenantId, aceptado, titular[tenantId], version],
    );
  };
  for (const x of [A, B, C, CH]) await permiso(x, true); // CH CON permiso: igual nunca
  await permiso(D, false);

  // ── Sin AGENTE_DATABASE_URL: apagado, sin tocar la base ──
  const antes = process.env.AGENTE_DATABASE_URL;
  delete process.env.AGENTE_DATABASE_URL;
  t.after(() => {
    if (antes === undefined) delete process.env.AGENTE_DATABASE_URL;
    else process.env.AGENTE_DATABASE_URL = antes;
  });
  prepararAccionesDeServidor();
  const m = await import("./agente-db");
  base.alBorrar(() => m.cerrarAgenteDb());
  const pA = (numero: number, extra: Record<string, unknown> = {}) => ({ tenantId: A, slug: base.a.slug, nivel: "n1", numero, ...extra });
  assert.equal(m.agenteDb(), null);
  assert.equal(m.agenteDb({ AGENTE_DATABASE_URL: base.urlApp, DATABASE_URL: base.urlApp }), null, "igual a la de la app: apagado");
  const apagado = await m.leerTicketComoAgente(pA(1));
  assert.ok(!apagado.ok && apagado.apagado === true, "sin variable: apagado");
  assert.equal((await m.guardarBorradorComoAgente({ ...pA(1), borrador: { tipo: "consulta", prioridad: "P3", respuesta: "x", motivo: "" } })).ok, false);
  assert.deepEqual(await m.enElNegocioComoAgente(A, "n1", async () => 1), { apagado: true });
  // Rol equivocado (la app, sin el candado del agente): falla cerrado.
  const comoApp = m.agenteDb({ AGENTE_DATABASE_URL: base.urlApp });
  assert.ok(comoApp);
  await assert.rejects(m.enElNegocioComoAgente(A, "n1", async () => 1, comoApp), /no es gsg_agente/);
  await m.cerrarAgenteDb();

  process.env.AGENTE_DATABASE_URL = urlAgente;
  const db = m.agenteDb();
  assert.ok(db, "con la variable, prende");
  const ids = (tenantId: string, cliente: string | null = null) =>
    m.enElNegocioComoAgente(tenantId, "n1", (tx) => tx.$queryRaw<{ id: string }[]>`SELECT id FROM "SupportTicket" ORDER BY id`, db, { clienteTenantId: cliente })
      .then((r) => (r.apagado ? null : r.valor.map((x) => x.id)));

  // ── CH o slug vacío: decide el código, sin tocar la base ──
  const ch = await m.leerTicketComoAgente({ tenantId: CH, slug: "beauty-spa", nivel: "n1", numero: 1 }, { db: bomba });
  assert.equal(ch.ok, false);
  assert.equal(!ch.ok && ch.decision, "borrador_al_duenio", "CH: el borrador lo guarda la consola, no el agente");
  assert.equal((await m.guardarBorradorComoAgente({ tenantId: CH, slug: "beauty-spa", nivel: "n1", numero: 1, borrador: {} }, { db: bomba })).ok, false);
  assert.equal((await m.leerTicketComoAgente({ ...pA(1), slug: "" }, { db: bomba })).ok, false);
  assert.equal((await m.leerTicketComoAgente({ ...pA(1), nivel: "n9" }, { db: bomba })).ok, false);

  // ── Aislamiento A/B ──
  assert.deepEqual(await ids(A), ["tk-a1"], "A: sólo lo suyo sin cartera (sin cliente fijado)");
  assert.deepEqual(await ids(B), ["tk-b1"], "B: sólo lo suyo");
  const leidoA = await m.leerTicketComoAgente(pA(1));
  assert.ok(leidoA.ok && leidoA.ticket.id === "tk-a1");
  assert.ok(leidoA.ok && !("respuesta" in leidoA.ticket), "no trae la respuesta");
  assert.equal((await m.leerTicketComoAgente({ tenantId: A, slug: base.b.slug, nivel: "n1", numero: 1 })).ok, false, "slug de otro negocio");
  const cruzado = await m.enElNegocioComoAgente(A, "n1", (tx) => tx.$executeRaw`UPDATE "SupportTicket" SET "updatedAt" = now() WHERE "tenantId" = ${B}`, db);
  assert.deepEqual(cruzado, { apagado: false, valor: 0 }, "parado en A no toca B");
  assert.deepEqual(await ids(CH), [], "parado en CH: 0 filas aunque tenga permiso");

  // ── Cartera ──
  assert.deepEqual(await ids(A, C), ["tk-a1", "tk-a2"], "cliente con permiso: se ve");
  assert.deepEqual(await ids(A, D), ["tk-a1"], "cliente sin permiso: no");
  assert.deepEqual(await ids(A, CH), ["tk-a1"], "cliente CH: nunca");
  assert.ok((await m.leerTicketComoAgente(pA(2, { clienteTenantId: C }))).ok);
  assert.equal((await m.leerTicketComoAgente(pA(2))).ok, false, "de cartera sin decir el cliente: no");
  assert.equal((await m.leerTicketComoAgente(pA(3, { clienteTenantId: D }))).ok, false);
  assert.equal((await m.leerTicketComoAgente(pA(4, { clienteTenantId: CH }))).ok, false);
  assert.equal((await m.leerTicketComoAgente({ tenantId: B, slug: base.b.slug, nivel: "n1", numero: 1, clienteTenantId: C })).ok, false, "B no tiene cartera con C");

  // ── La función SECURITY DEFINER: sólo boolean, sin oráculo fuera de la cartera del estudio parado ──
  const fn = async (estudio: string | null, cliente: string | null) => {
    await agente.query("BEGIN");
    try {
      if (estudio) await agente.query("SELECT set_config('app.current_tenant_id', $1, true)", [estudio]);
      if (cliente) await agente.query("SELECT set_config('app.cliente_tenant_id', $1, true)", [cliente]);
      return (await agente.query("SELECT gsg_permiso_n1_cliente_de_cartera() AS v")).rows[0].v as boolean;
    } finally {
      await agente.query("COMMIT");
    }
  };
  assert.equal(await fn(A, C), true);
  assert.equal(await fn(A, D), false, "cliente sin permiso");
  assert.equal(await fn(A, CH), false, "cliente CH con permiso: false");
  assert.equal(await fn(B, C), false, "C con permiso, pero no es cartera de B: no es oráculo");
  assert.equal(await fn(C, A), false, "al revés tampoco");
  assert.equal(await fn(null, C), false, "sin estudio");
  assert.equal(await fn(A, null), false, "sin cliente");
  await assert.rejects(agente.query("SELECT gsg_permiso_n1_cliente_de_cartera('x')"), /does not exist/, "no acepta parámetros");
  await assert.rejects(app.query("SELECT gsg_permiso_n1_cliente_de_cartera()"), denegado, "app_rls no la ejecuta");
  // Tabla temporal que quiere tapar el permiso: no la ve (search_path con pg_temp al final).
  await agente.query(`CREATE TEMP TABLE "SoporteConsentimiento" ("tenantId" TEXT, nivel TEXT, aceptado BOOLEAN, "createdAt" TIMESTAMP);
    INSERT INTO "SoporteConsentimiento" VALUES ('${D}', 'n1', true, now()), ('${CH}', 'n1', true, now())`);
  try {
    assert.equal(await fn(A, D), false, "temp: D sigue sin permiso");
  } finally {
    await agente.query(`DROP TABLE IF EXISTS pg_temp."SoporteConsentimiento"`);
  }

  // ── Revocación del cliente: deja de verse en la siguiente consulta de la MISMA conexión ──
  const enCartera = async (sql: string) => {
    await agente.query("BEGIN");
    try {
      await agente.query("SELECT set_config('app.current_tenant_id', $1, true), set_config('app.cliente_tenant_id', $2, true)", [A, C]);
      const r = await agente.query(sql);
      await agente.query("COMMIT");
      return r;
    } catch (e) {
      await agente.query("ROLLBACK");
      throw e;
    }
  };
  assert.equal((await enCartera(`SELECT id FROM "SupportTicket" WHERE id = 'tk-a2'`)).rowCount, 1);
  await permiso(C, false);
  assert.equal((await enCartera(`SELECT id FROM "SupportTicket" WHERE id = 'tk-a2'`)).rowCount, 0, "revocado: siguiente consulta, 0 filas");
  assert.equal((await m.leerTicketComoAgente(pA(2, { clienteTenantId: C }))).ok, false);
  await permiso(C, true);
  assert.equal((await enCartera(`SELECT id FROM "SupportTicket" WHERE id = 'tk-a2'`)).rowCount, 1, "vuelto a dar");

  // ── Guardar el borrador: sólo borradorIa/updatedAt, con evento y AuditLog del agente ──
  const borrador = { tipo: "consulta", prioridad: "P3", respuesta: "Hola, ya lo miramos.", motivo: "m" };
  const g1 = await m.guardarBorradorComoAgente({ ...pA(1), borrador });
  assert.deepEqual(g1, { ok: true, ticketId: "tk-a1" });
  const g2 = await m.guardarBorradorComoAgente({ ...pA(2, { clienteTenantId: C }), borrador });
  assert.deepEqual(g2, { ok: true, ticketId: "tk-a2" }, "cartera con permiso de los dos");
  assert.equal((await m.guardarBorradorComoAgente({ ...pA(3, { clienteTenantId: D }), borrador })).ok, false, "cartera sin permiso del cliente");
  assert.equal((await m.guardarBorradorComoAgente({ ...pA(1), borrador: { ...borrador, respuesta: " " } }, { db: bomba })).ok, false, "vacío: ni abre la base");
  const fila = await duenio.query(`SELECT respuesta, "borradorIa" FROM "SupportTicket" WHERE id = 'tk-a1'`);
  assert.equal(fila.rows[0].respuesta, null, "el agente nunca escribe la respuesta");
  assert.equal(fila.rows[0].borradorIa.respuesta, borrador.respuesta);
  assert.equal(fila.rows[0].borradorIa.autor, "agente:n1");
  const ev = await duenio.query(`SELECT "ticketId", actor FROM "SupportTicketEvento" WHERE tipo = 'borrador_ia' ORDER BY "ticketId"`);
  assert.deepEqual(ev.rows, [{ ticketId: "tk-a1", actor: "agente:n1" }, { ticketId: "tk-a2", actor: "agente:n1" }]);
  const al = await duenio.query(`SELECT "entityId", actor FROM "AuditLog" WHERE action = 'soporte.agente.borrador' ORDER BY "entityId"`);
  assert.deepEqual(al.rows, [{ entityId: "tk-a1", actor: "agente:n1" }, { entityId: "tk-a2", actor: "agente:n1" }]);
  assert.equal((await duenio.query(`SELECT 1 FROM "SupportTicket" WHERE id = 'tk-a3' AND "borradorIa" IS NOT NULL`)).rowCount, 0);

  // ── Carrera: el cliente revoca entre la lectura y la escritura → la escritura falla, no queda nada ──
  const borradorDe = async (id: string) => (await duenio.query(`SELECT "borradorIa" FROM "SupportTicket" WHERE id = $1`, [id])).rows[0].borradorIa;
  const eventosDe = async (id: string) => (await duenio.query(`SELECT count(*)::int AS n FROM "SupportTicketEvento" WHERE "ticketId" = $1`, [id])).rows[0].n;
  const previo = await borradorDe("tk-a2");
  const eventosPrevios = await eventosDe("tk-a2");
  // (a) Revoca después de leer, antes del UPDATE: el UPDATE no encuentra la fila.
  const r1 = await m.enElNegocioComoAgente(A, "n1", async (tx) => {
    const vistos = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "SupportTicket" WHERE id = 'tk-a2'`;
    assert.equal(vistos.length, 1, "antes de revocar se ve");
    await permiso(C, false); // otra conexión, confirmada
    return tx.$executeRaw`UPDATE "SupportTicket" SET "borradorIa" = '{"respuesta":"tarde"}'::jsonb, "updatedAt" = now() WHERE id = 'tk-a2'`;
  }, db, { clienteTenantId: C });
  assert.deepEqual(r1, { apagado: false, valor: 0 }, "la escritura después de la revocación no toca nada");
  await permiso(C, true);
  // (b) Revoca después del UPDATE, antes del evento: el evento lo rechaza la base y se deshace todo.
  await assert.rejects(
    m.enElNegocioComoAgente(A, "n1", async (tx) => {
      const filas = await tx.$executeRaw`UPDATE "SupportTicket" SET "borradorIa" = '{"respuesta":"a medias"}'::jsonb, "updatedAt" = now() WHERE id = 'tk-a2'`;
      assert.equal(filas, 1);
      await permiso(C, false);
      await tx.$executeRaw`INSERT INTO "SupportTicketEvento" (id, "tenantId", "ticketId", tipo, actor) VALUES ('ev-carrera', ${A}, 'tk-a2', 'borrador_ia', 'agente:n1')`;
    }, db, { clienteTenantId: C }),
    denegado,
  );
  // (c) Con la función del módulo: revocado entre la lectura y guardarBorradorEnTx → Rechazo, nada escrito.
  await permiso(C, true);
  await assert.rejects(
    m.enElNegocioComoAgente(A, "n1", async (tx) => {
      assert.equal((await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "SupportTicket" WHERE id = 'tk-a2'`).length, 1);
      await permiso(C, false);
      return m.guardarBorradorEnTx(tx, { ...pA(2, { clienteTenantId: C }), borrador: { ...borrador, respuesta: "tarde" } });
    }, db, { clienteTenantId: C }),
    /dejó de estar disponible|No hay un ticket/,
  );
  assert.deepEqual(await borradorDe("tk-a2"), previo, "ninguna de las tres carreras dejó un borrador");
  assert.equal(await eventosDe("tk-a2"), eventosPrevios, "ni un evento");

  // ── Certificación adversarial, ronda 1: cada ataque de la prueba, ahora rechazado por la base ──
  const comoAgente = async (negocio: string, sql: string, params: unknown[] = [], cliente: string | null = null) => {
    await agente.query("BEGIN");
    try {
      await agente.query("SELECT set_config('app.current_tenant_id', $1, true), set_config('app.cliente_tenant_id', $2, true)", [negocio, cliente ?? ""]);
      const r = await agente.query(sql, params);
      await agente.query("COMMIT");
      return r;
    } catch (e) {
      await agente.query("ROLLBACK");
      throw e;
    }
  };
  // A1: cerrar un ticket sin que lo apruebe nadie (UPDATE de estado).
  await assert.rejects(comoAgente(A, `UPDATE "SupportTicket" SET estado = 'resuelto' WHERE id = 'tk-a1'`), denegado, "A1: el agente no cambia el estado");
  assert.equal((await duenio.query(`SELECT estado FROM "SupportTicket" WHERE id = 'tk-a1'`)).rows[0].estado, "nuevo", "A1: el ticket sigue igual");
  // A3: fijarse un negocio ajeno (D: sin permiso, ni relación de agente) y leer sus permisos.
  await assert.rejects(comoAgente(D, `SELECT "tenantId", aceptado, "userId", "versionTexto" FROM "SoporteConsentimiento"`), denegado, "A3: sin SELECT de permisos");
  await assert.rejects(comoAgente(A, `SELECT 1 FROM "SoporteConsentimiento" LIMIT 1`), denegado, "A3: ni de su propio negocio");
  // El permiso sale de la función SECURITY DEFINER sin parámetros, sobre el negocio fijado: sólo boolean.
  const n1De = async (negocio: string) => (await comoAgente(negocio, "SELECT gsg_permiso_n1_vigente() AS v")).rows[0].v as boolean;
  assert.equal(await n1De(A), true);
  assert.equal(await n1De(D), false, "D sin permiso");
  assert.equal(await n1De(CH), false, "CH con permiso cargado: la función dice false (ronda 2, BAJO a)");
  await assert.rejects(agente.query("SELECT gsg_permiso_n1_vigente('x')"), /does not exist/, "no acepta parámetros");
  await assert.rejects(app.query("SELECT gsg_permiso_n1_vigente()"), denegado, "app_rls no la ejecuta");
  await agente.query(`CREATE TEMP TABLE "SoporteConsentimiento" ("tenantId" TEXT, nivel TEXT, aceptado BOOLEAN, "versionTexto" TEXT, "createdAt" TIMESTAMP);
    INSERT INTO "SoporteConsentimiento" VALUES ('${D}', 'n1', true, '${TEXTO_CONSENTIMIENTO.version}', now() + interval '1 day')`);
  try {
    assert.equal(await n1De(D), false, "temp: D sigue sin permiso");
  } finally {
    await agente.query(`DROP TABLE IF EXISTS pg_temp."SoporteConsentimiento"`);
  }
  // A4: listar los negocios (CH incluido) desde Tenant.
  await assert.rejects(comoAgente(D, `SELECT slug FROM "Tenant"`), denegado, "A4: no lista negocios");
  assert.equal((await comoAgente(A, "SELECT gsg_slug_del_negocio() AS s")).rows[0].s, base.a.slug, "el slug del negocio fijado");
  assert.equal((await comoAgente(A, "SELECT gsg_slug_del_cliente() AS s", [], C)).rows[0].s, null, "C revocado (carrera c): sin slug");
  await permiso(C, true);
  assert.equal((await comoAgente(A, "SELECT gsg_slug_del_cliente() AS s", [], C)).rows[0].s, C, "el del cliente de su cartera, con permiso");
  assert.equal((await comoAgente(B, "SELECT gsg_slug_del_cliente() AS s", [], CH)).rows[0].s, null, "un cliente que no es de su cartera: nada");
  await assert.rejects(app.query("SELECT gsg_slug_del_negocio()"), denegado, "app_rls no la ejecuta");
  // A5: evento de aprobación falso.
  await assert.rejects(
    comoAgente(A, `INSERT INTO "SupportTicketEvento" (id, "tenantId", "ticketId", tipo, actor, datos) VALUES ('evx', $1, 'tk-a1', 'borrador_aprobado', 'agente:n1', '{"aprobadoPor":"Dueño"}')`, [A]),
    denegado,
    "A5: el agente no escribe «borrador_aprobado»",
  );
  // A2: borrador de mail falso en AuditLog (lo mostraba el panel del titular).
  await assert.rejects(
    comoAgente(A, `INSERT INTO "AuditLog" (id, "tenantId", actor, action, entity, "entityId", changes, channel) VALUES ('alx', $1, 'agente:n1', 'soporte.permiso.copia_borrador', 'MailBorrador', 'x', $2::jsonb, 'agente')`,
      [A, JSON.stringify({ para: "atacante@evil.test", asunto: "Confirmá tu clave", cuerpo: "Entrá a http://evil.test", enviado: false })]),
    denegado,
    "A2: sólo acciones 'soporte.agente.%'",
  );
  assert.equal((await duenio.query(`SELECT 1 FROM "AuditLog" WHERE id IN ('alx')`)).rowCount, 0);
  // V: el último permiso de B es de una versión VIEJA del texto → no vale (ni en la base ni en el código).
  assert.deepEqual(await ids(B), ["tk-b1"]);
  await permiso(B, true, "VERSION-VIEJA-1999");
  assert.deepEqual(await ids(B), [], "V: permiso de versión vieja, 0 filas");
  assert.equal(await n1De(B), false);
  assert.equal((await m.leerTicketComoAgente({ tenantId: B, slug: base.b.slug, nivel: "n1", numero: 1 })).ok, false);
  await permiso(B, true);
  assert.deepEqual(await ids(B), ["tk-b1"], "re-tildado con la versión vigente");

  // ── Certificación adversarial, ronda 2: cada ataque, ahora rechazado ──
  const slugDe = async (negocio: string, cliente: string | null = null) =>
    (await comoAgente(negocio, "SELECT gsg_slug_del_negocio() AS n, gsg_slug_del_cliente() AS c", [], cliente)).rows[0] as { n: string | null; c: string | null };
  // MEDIO: slug del cliente con un estudio SIN permiso (D tiene cartera con C) → nada.
  assert.deepEqual(await slugDe(D, C), { n: null, c: null }, "MEDIO: estudio sin permiso: ni su slug ni el del cliente");
  // BAJO a: CH, como estudio o como cliente, nunca da slug ni permiso (aunque tenga permiso cargado).
  assert.deepEqual(await slugDe(CH), { n: null, c: null }, "BAJO a: slug de CH → NULL");
  assert.deepEqual(await slugDe(CH, C), { n: null, c: null }, "MEDIO: CH como estudio con cartera → NULL");
  assert.deepEqual(await slugDe(A, CH), { n: base.a.slug, c: null }, "MEDIO: CH como cliente de cartera → NULL");
  assert.equal((await comoAgente(CH, "SELECT gsg_permiso_n1_vigente() AS v")).rows[0].v, false, "BAJO a: permiso de CH → false");
  assert.equal((await comoAgente(A, "SELECT gsg_slug_del_cliente() AS s", [], D)).rows[0].s, null, "cliente sin permiso: tampoco su slug");
  assert.equal((await m.leerTicketComoAgente({ tenantId: D, slug: D, nivel: "n1", numero: 1, clienteTenantId: C })).ok, false);
  // BAJO b: REPEATABLE READ / SERIALIZABLE: la foto es la del comienzo; el candado exige READ COMMITTED.
  for (const nivel of ["REPEATABLE READ", "SERIALIZABLE"]) {
    await agente.query(`BEGIN ISOLATION LEVEL ${nivel}`);
    try {
      await agente.query("SELECT set_config('app.current_tenant_id', $1, true)", [A]);
      assert.equal((await agente.query(`SELECT id FROM "SupportTicket"`)).rowCount, 0, `${nivel}: 0 filas antes de revocar`);
      await permiso(A, false); // el titular revoca con la transacción abierta
      assert.equal((await agente.query(`SELECT id FROM "SupportTicket"`)).rowCount, 0, `${nivel}: 0 filas después`);
      assert.equal((await agente.query(`UPDATE "SupportTicket" SET "borradorIa" = '{"respuesta":"post-revocacion"}'::jsonb WHERE id = 'tk-a1'`)).rowCount, 0, `${nivel}: no escribe`);
      await assert.rejects(
        agente.query(`INSERT INTO "AuditLog" (id, "tenantId", actor, action, entity, "entityId", changes, channel) VALUES ('al-rr', $1, 'agente:n1', 'soporte.agente.x', 'x', 'x', '{}'::jsonb, 'agente')`, [A]),
        denegado,
        `${nivel}: ni AuditLog`,
      );
    } finally {
      await agente.query("ROLLBACK");
    }
    await permiso(A, true);
  }
  assert.notEqual((await borradorDe("tk-a1"))?.respuesta, "post-revocacion");
  assert.deepEqual(await ids(A), ["tk-a1"], "READ COMMITTED (el de agente-db.ts): se ve");
  // BAJO c: borrador por SQL directo en un ticket resuelto o cerrado → 0 filas (y por el módulo, rechazo).
  const sqlAbiertos = /mant_agente_abierto[\s\S]*?USING \("estado" IN \(([^)]*)\)\)/.exec(SQL)?.[1] ?? "";
  assert.deepEqual([...sqlAbiertos.matchAll(/'([^']+)'/g)].map((x) => x[1]), [...ESTADOS_ABIERTOS], "el SQL usa ESTADOS_ABIERTOS de config.ts");
  // C3 (ronda 3): el evento borrador_ia también exige ticket abierto, con la misma lista.
  const sqlEventoAbiertos = /ON "SupportTicketEvento"[\s\S]*?t\."estado" IN \(([^)]*)\)/.exec(SQL)?.[1] ?? "";
  assert.deepEqual([...sqlEventoAbiertos.matchAll(/'([^']+)'/g)].map((x) => x[1]), [...ESTADOS_ABIERTOS], "C3: el evento usa ESTADOS_ABIERTOS");
  for (const estado of ["resuelto", "cerrado"]) {
    await duenio.query(`UPDATE "SupportTicket" SET estado = $1 WHERE id = 'tk-a1'`, [estado]);
    const previoCerrado = await borradorDe("tk-a1");
    assert.equal((await comoAgente(A, `UPDATE "SupportTicket" SET "borradorIa" = '{"respuesta":"y"}'::jsonb WHERE id = 'tk-a1'`)).rowCount, 0, `BAJO c: ${estado}, 0 filas`);
    assert.equal((await comoAgente(A, `SELECT id FROM "SupportTicket" WHERE id = 'tk-a1'`)).rowCount, 1, `${estado}: lo sigue pudiendo leer`);
    assert.equal((await m.guardarBorradorComoAgente({ ...pA(1), borrador })).ok, false);
    assert.deepEqual(await borradorDe("tk-a1"), previoCerrado, `${estado}: el borrador no cambió`);
    const eventosCerrado = await eventosDe("tk-a1");
    await assert.rejects(
      comoAgente(A, `INSERT INTO "SupportTicketEvento" (id, "tenantId", "ticketId", tipo, actor) VALUES ($2, $1, 'tk-a1', 'borrador_ia', 'agente:n1')`, [A, `ev-c3-${estado}`]),
      denegado,
      `C3: ${estado}, ni un evento borrador_ia`,
    );
    assert.equal(await eventosDe("tk-a1"), eventosCerrado, `C3: ${estado}, no quedó el evento`);
  }
  await duenio.query(`UPDATE "SupportTicket" SET estado = 'nuevo' WHERE id = 'tk-a1'`);
  assert.equal((await comoAgente(A, `UPDATE "SupportTicket" SET "updatedAt" = now() WHERE id = 'tk-a1'`)).rowCount, 1, "reabierto: vuelve a poder");

  // ── Revocación del ESTUDIO: tampoco ve lo suyo ──
  await permiso(A, false);
  assert.deepEqual(await ids(A), [], "estudio sin permiso: nada");
  assert.equal((await m.guardarBorradorComoAgente({ ...pA(1), borrador })).ok, false);

  // ── T1 (ronda 3): la hora del permiso no depende de la TimeZone de la sesión ──
  // El titular da n1 desde una sesión en Pacific/Kiritimati (UTC+14) y revoca después desde una en UTC:
  // la revocación es posterior y gana. Con clock_timestamp() a secas, el permiso quedaba 14 h «adelante».
  const permisoEnZona = async (aceptado: boolean, zona: string) => {
    await new Promise((r) => setTimeout(r, 3));
    await duenio.query("BEGIN");
    try {
      await duenio.query(`SELECT set_config('TimeZone', $1, true)`, [zona]);
      await duenio.query(
        `INSERT INTO "SoporteConsentimiento" (id, "tenantId", nivel, aceptado, "versionTexto", "userId") VALUES ($1, $2, 'n1', $3, $4, $5)`,
        [`cs-${++n}`, A, aceptado, TEXTO_CONSENTIMIENTO.version, titular[A]],
      );
      await duenio.query("COMMIT");
    } catch (e) {
      await duenio.query("ROLLBACK");
      throw e;
    }
  };
  await permisoEnZona(true, "Pacific/Kiritimati");
  assert.equal(await n1De(A), true, "T1: dado desde Kiritimati, vale");
  await permisoEnZona(false, "UTC");
  assert.equal(await n1De(A), false, "T1: revocado después desde UTC, ya no vale");
  assert.deepEqual(await ids(A), [], "T1: el agente ve 0 tickets");
});
