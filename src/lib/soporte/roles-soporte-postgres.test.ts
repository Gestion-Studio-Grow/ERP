// ============================================================================
// ROLES DE SOPORTE (D9) + CANDADO DE CH (D5) + PERMISO DEL CLIENTE (D4) contra Postgres efímero.
// ============================================================================
//
// Aplica prisma/pending-gate2/MANT_roles_soporte.sql como `neondb_owner` sobre la base efímera (nunca
// Neon) y prueba, conectando como cada rol:
//   · ningún rol de app/soporte tiene BYPASSRLS;
//   · gsg_agente: no lee User ni plata; sin set_config no ve nada; otro negocio → 0 filas; el negocio
//     protegido (B hace de CH) → 0 filas y no escribe aunque tenga permiso; un ticket de cartera cuyo
//     cliente es el protegido tampoco se ve; sin permiso n1 vigente → 0 filas (y la revocación gana,
//     también a igual hora); sólo cambia estado/borrador, no asunto; no borra tickets ni AuditLog;
//   · NegocioProtegido: nadie salvo el dueño lo escribe; SoporteConsentimiento: sólo se agregan filas;
//   · gsg_operador no edita ni borra AuditLog;
//   · el guardado del permiso (consentimiento.server) como app_rls: sólo el titular, con su AuditLog;
//   · el SQL se puede correr dos veces.
// Refutación del 14/11 (cubierta acá): tablas temporales que tapan a las del candado; ticket de cartera
// cuyo cliente sacó el permiso (negocio C); permiso firmado por quien no es titular; AuditLog con actor
// que no es agente. Los roles los crea el admin del test (el neondb_owner local es NOCREATEROLE); el
// CREATE ROLE del archivo corre en el ensayo en rama de Neon (TARJETA-D9-ROLES.md).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraParaElTest, urlDeRol, urlDelServidor } from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const SQL = readFileSync(path.join(process.cwd(), "prisma/pending-gate2/MANT_roles_soporte.sql"), "utf8");
const CANDADO_DE_ROLES = 7_300_000_001; // el mismo de base-efimera.ts: los roles son del servidor

async function conectar(url: string): Promise<pg.Client> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  return c;
}

/** Corre `sql` parado en un negocio (como enElNegocio) o sin parar (negocio null). Siempre ROLLBACK si falla. */
async function en(c: pg.Client, negocio: string | null, sql: string, params: unknown[] = []): Promise<pg.QueryResult> {
  await c.query("BEGIN");
  try {
    if (negocio) await c.query("SELECT set_config('app.current_tenant_id', $1, true)", [negocio]);
    const r = await c.query(sql, params);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  }
}

const denegado = (e: unknown) => (e as { code?: string }).code === "42501"; // permiso o RLS

test("roles de soporte: aislamiento por negocio, CH bloqueado desde la base y permiso del cliente", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  const servidor = urlDelServidor();

  // Roles del servidor: los crea el admin con el candado (en Neon los crea el mismo SQL como neondb_owner).
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

  const duenio = await conectar(base.urlDuenio);
  const agente = await conectar(urlDeRol(servidor, "gsg_agente", base.nombre));
  const operador = await conectar(urlDeRol(servidor, "gsg_operador", base.nombre));
  const app = await conectar(base.urlApp);
  base.alBorrar(() => Promise.all([duenio, agente, operador, app].map((c) => c.end().catch(() => {}))));

  const A = base.a.id;
  const B = base.b.id; // hace de CH
  const C = `${base.a.id}-c`; // tercer negocio: cliente de cartera de A, sin permiso
  const titular: Record<string, string> = { [A]: base.a.duenia.id, [B]: base.b.duenia.id, [C]: `${C}-titular` };

  // ── Aplicar dos veces (idempotente) y marcar B como protegido ──
  await duenio.query(SQL);
  await duenio.query(SQL);
  await duenio.query(`INSERT INTO "Tenant" (id, name, slug, subdomain, "updatedAt") VALUES ($1, 'Negocio C', $1, $1, now())`, [C]);
  await duenio.query(
    `INSERT INTO "User" (id, "tenantId", name, email, "passwordHash", role, "updatedAt") VALUES ($1, $2, 'Titular C', $1 || '@c.test', 'x', 'OWNER', now())`,
    [titular[C], C],
  );
  await duenio.query(`INSERT INTO "NegocioProtegido" ("negocioId", motivo) VALUES ($1, 'test: hace de CH')`, [B]);

  const ticket = (id: string, tenantId: string, numero: number, clienteTenantId: string | null = null) =>
    duenio.query(
      `INSERT INTO "SupportTicket" (id, "tenantId", numero, tipo, prioridad, asunto, canal, "creadoPor", "clienteTenantId", "updatedAt")
       VALUES ($1, $2, $3, 'consulta', 'P3', 'asunto original', 'erp', 'test', $4, now())`,
      [id, tenantId, numero, clienteTenantId],
    );
  await ticket("tk-a", A, 1);
  await ticket("tk-a-cartera-ch", A, 2, B); // ticket de cartera de A cuyo cliente es el protegido
  await ticket("tk-b", B, 1);
  await ticket("tk-a-cart-c", A, 3, C); // ticket de cartera de A cuyo cliente (C) no dio permiso
  await duenio.query(
    `INSERT INTO "SupportTicketEvento" (id, "tenantId", "ticketId", tipo, actor) VALUES
       ('ev-a', $1, 'tk-a', 'nota', 'test'), ('ev-a-ch', $1, 'tk-a-cartera-ch', 'nota', 'test'), ('ev-b', $2, 'tk-b', 'nota', 'test')`,
    [A, B],
  );
  const permiso = (id: string, tenantId: string, aceptado: boolean, cuando: string) =>
    duenio.query(
      `INSERT INTO "SoporteConsentimiento" (id, "tenantId", nivel, aceptado, "versionTexto", "userId", "createdAt")
       VALUES ($1, $2, 'n1', $3, 'test', $5, $4::timestamp)`,
      [id, tenantId, aceptado, cuando, titular[tenantId]],
    );
  await permiso("c-b", B, true, "2026-01-01 10:00"); // el protegido CON permiso: igual no se ve
  await permiso("c-c", C, false, "2026-01-01 10:00"); // C revocó (o nunca dio): su ticket de cartera no se ve
  // El permiso lo firma sólo el titular del MISMO negocio, también para el dueño de la base (trigger).
  await assert.rejects(
    duenio.query(`INSERT INTO "SoporteConsentimiento" (id, "tenantId", nivel, aceptado, "versionTexto", "userId") VALUES ('x1', $1, 'n1', true, 'v', $2)`, [A, base.a.recepcion.id]),
    denegado,
    "recepción no firma",
  );
  await assert.rejects(
    duenio.query(`INSERT INTO "SoporteConsentimiento" (id, "tenantId", nivel, aceptado, "versionTexto", "userId") VALUES ('x2', $1, 'n1', true, 'v', $2)`, [A, base.b.duenia.id]),
    denegado,
    "el titular de otro negocio no firma",
  );
  await assert.rejects(
    duenio.query(`INSERT INTO "SoporteConsentimiento" (id, "tenantId", nivel, aceptado, "versionTexto", "userId") VALUES ('x3', $1, 'n1', true, 'v', 'no-existe')`, [A]),
    denegado,
    "usuario inexistente",
  );

  // ── Ningún rol con BYPASSRLS ──
  const roles = await duenio.query(`SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname IN ('gsg_operador','gsg_agente','app_rls') ORDER BY 1`);
  assert.equal(roles.rows.length, 3);
  for (const r of roles.rows) assert.ok(!r.rolbypassrls && !r.rolsuper, r.rolname);

  // ── gsg_agente: lo que no tiene, ni lo ve ──
  await assert.rejects(en(agente, A, `SELECT 1 FROM "User" LIMIT 1`), denegado, "User");
  await assert.rejects(en(agente, A, `SELECT 1 FROM "Payment" LIMIT 1`), denegado, "plata");
  await assert.rejects(en(agente, A, `SELECT 1 FROM "CashMovement" LIMIT 1`), denegado, "caja");
  await assert.rejects(en(agente, A, `SELECT "modules" FROM "Tenant" LIMIT 1`), denegado, "Tenant fuera de las columnas otorgadas");

  // ── Sin permiso n1: nada, aunque esté parado en su negocio ──
  assert.equal((await en(agente, A, `SELECT id FROM "SupportTicket"`)).rowCount, 0, "A sin permiso");
  await permiso("c-a1", A, true, "2026-01-01 10:00");

  // ── Con permiso: sólo lo suyo, y nunca lo del protegido ──
  assert.equal((await en(agente, null, `SELECT id FROM "SupportTicket"`)).rowCount, 0, "sin set_config");
  const deA = await en(agente, A, `SELECT id FROM "SupportTicket" ORDER BY id`);
  assert.deepEqual(deA.rows.map((r) => r.id), ["tk-a"], "ni el de cartera cuyo cliente es CH, ni el de C sin permiso");
  assert.equal((await en(agente, A, `SELECT id FROM "SupportTicket" WHERE "tenantId" = $1`, [B])).rowCount, 0, "otro negocio");
  assert.deepEqual((await en(agente, A, `SELECT id FROM "SupportTicketEvento" ORDER BY id`)).rows.map((r) => r.id), ["ev-a"], "eventos: sólo de tickets visibles");
  assert.equal((await en(agente, B, `SELECT id FROM "SupportTicket"`)).rowCount, 0, "CH: 0 filas con permiso y parado en CH");
  assert.equal((await en(agente, B, `SELECT id FROM "SupportTicketEvento"`)).rowCount, 0);
  assert.equal((await en(agente, B, `SELECT id FROM "SoporteConsentimiento"`)).rowCount, 0);

  // ── Ataque con tablas temporales (pg_temp va primero en el search_path por defecto) ──
  const ataque = `CREATE TEMP TABLE "NegocioProtegido" ("negocioId" TEXT);
    CREATE TEMP TABLE "SoporteConsentimiento" ("tenantId" TEXT, nivel TEXT, aceptado BOOLEAN, "createdAt" TIMESTAMP);
    INSERT INTO "SoporteConsentimiento" VALUES ('${B}', 'n1', true, now()), ('${C}', 'n1', true, now()), ('${A}', 'n1', true, now());`;
  await agente.query(ataque);
  try {
    assert.equal((await en(agente, B, `SELECT id FROM "SupportTicket"`)).rowCount, 0, "temp: CH sigue en 0 filas");
    assert.equal((await en(agente, B, `UPDATE "SupportTicket" SET estado = 'en_curso', "updatedAt" = now() WHERE id = 'tk-b'`)).rowCount, 0, "temp: CH no se actualiza");
    assert.deepEqual((await en(agente, A, `SELECT id FROM "SupportTicket" ORDER BY id`)).rows.map((r) => r.id), ["tk-a"], "temp: ni cartera de CH ni de C");
  } finally {
    await agente.query(`DROP TABLE IF EXISTS pg_temp."NegocioProtegido", pg_temp."SoporteConsentimiento"`);
  }

  // ── Escrituras ──
  assert.equal((await en(agente, A, `UPDATE "SupportTicket" SET estado = 'en_curso', "updatedAt" = now() WHERE id = 'tk-a'`)).rowCount, 1);
  assert.equal((await en(agente, B, `UPDATE "SupportTicket" SET estado = 'en_curso', "updatedAt" = now() WHERE id = 'tk-b'`)).rowCount, 0, "CH: no actualiza");
  await assert.rejects(en(agente, A, `UPDATE "SupportTicket" SET asunto = 'otro' WHERE id = 'tk-a'`), denegado, "asunto");
  await assert.rejects(en(agente, A, `UPDATE "SupportTicket" SET "tenantId" = $1 WHERE id = 'tk-a'`, [B]), denegado, "mudar de negocio");
  await assert.rejects(en(agente, A, `DELETE FROM "SupportTicket" WHERE id = 'tk-a'`), denegado);
  await assert.rejects(en(agente, A, `INSERT INTO "SupportTicket" (id, "tenantId", numero, tipo, prioridad, asunto, canal, "creadoPor", "updatedAt") VALUES ('x', $1, 9, 'consulta', 'P3', 'x', 'erp', 'x', now())`, [A]), denegado);
  const audit = (tenantId: string) => `INSERT INTO "AuditLog" (id, "tenantId", actor, action, entity) VALUES ('al-' || md5(random()::text), '${tenantId}', 'agente:n1', 'test', 'SupportTicket')`;
  assert.equal((await en(agente, A, audit(A))).rowCount, 1, "AuditLog en su negocio");
  await assert.rejects(en(agente, B, audit(B)), denegado, "AuditLog en CH");
  await assert.rejects(en(agente, A, audit(B)), denegado, "AuditLog de otro negocio");
  await assert.rejects(
    en(agente, A, `INSERT INTO "AuditLog" (id, "tenantId", actor, action, entity) VALUES ('al-falso', $1, 'user:duenia', 'soporte.permiso.dar', 'SoporteConsentimiento')`, [A]),
    denegado,
    "el agente no firma auditoría a nombre de una persona",
  );
  await assert.rejects(en(agente, A, `DELETE FROM "AuditLog"`), denegado);
  await assert.rejects(en(agente, A, `SELECT 1 FROM "AuditLog" LIMIT 1`), denegado, "AuditLog: sólo INSERT");
  assert.equal((await en(agente, A, `INSERT INTO "SupportTicketEvento" (id, "tenantId", "ticketId", tipo, actor) VALUES ('ev-ag', $1, 'tk-a', 'nota', 'agente:n1')`, [A])).rowCount, 1);
  await assert.rejects(
    en(agente, A, `INSERT INTO "SupportTicketEvento" (id, "tenantId", "ticketId", tipo, actor) VALUES ('ev-falso', $1, 'tk-a', 'aprobado', 'duenia:x')`, [A]),
    denegado,
    "el agente no firma eventos a nombre de una persona",
  );
  await assert.rejects(en(agente, A, `INSERT INTO "SupportTicketEvento" (id, "tenantId", "ticketId", tipo, actor) VALUES ('ev-ag2', $1, 'tk-a-cartera-ch', 'nota', 'agente:n1')`, [A]), denegado, "evento sobre ticket de CH");
  await assert.rejects(en(agente, B, `INSERT INTO "SupportTicketEvento" (id, "tenantId", "ticketId", tipo, actor) VALUES ('ev-ag3', $1, 'tk-b', 'nota', 'agente:n1')`, [B]), denegado, "evento en CH");

  // ── Revocación: gana la última; a igual hora, gana la revocación ──
  await permiso("c-a2", A, false, "2026-01-01 11:00");
  assert.equal((await en(agente, A, `SELECT id FROM "SupportTicket"`)).rowCount, 0, "revocado");
  await permiso("c-a3", A, true, "2026-01-01 12:00");
  assert.equal((await en(agente, A, `SELECT id FROM "SupportTicket"`)).rowCount, 1, "vuelto a dar");
  await permiso("c-a4", A, false, "2099-01-01 12:00");
  await permiso("c-a5", A, true, "2099-12-31 12:00"); // fecha futura: la base la pisa con su hora
  await permiso("c-a6", A, false, "2000-01-01 00:00"); // revocación posterior con fecha vieja: igual gana
  assert.equal((await en(agente, A, `SELECT id FROM "SupportTicket"`)).rowCount, 0, "la hora del permiso la pone la base");
  // (el empate a igual hora lo cubre consentimiento-core.test.ts; acá la base no deja elegir la hora)

  // ── NegocioProtegido: sólo el dueño lo escribe ──
  for (const [nombre, c] of [["app_rls", app], ["gsg_operador", operador], ["gsg_agente", agente]] as const) {
    await assert.rejects(en(c, A, `INSERT INTO "NegocioProtegido" ("negocioId", motivo) VALUES ($1, 'x')`, [A]), denegado, `${nombre} INSERT`);
    await assert.rejects(en(c, A, `DELETE FROM "NegocioProtegido"`), denegado, `${nombre} DELETE`);
  }

  // ── SoporteConsentimiento: sólo se agregan filas ──
  for (const [nombre, c] of [["app_rls", app], ["gsg_operador", operador]] as const) {
    await assert.rejects(en(c, A, `UPDATE "SoporteConsentimiento" SET aceptado = true`), denegado, `${nombre} UPDATE`);
    await assert.rejects(en(c, A, `DELETE FROM "SoporteConsentimiento"`), denegado, `${nombre} DELETE`);
  }
  const firmar = `INSERT INTO "SoporteConsentimiento" (id, "tenantId", nivel, aceptado, "versionTexto", "userId") VALUES ('z', $1, 'n1', true, 'v', $2)`;
  await assert.rejects(en(agente, A, firmar, [A, titular[A]]), denegado, "el agente no se da permiso");
  await assert.rejects(en(operador, A, firmar, [A, titular[A]]), denegado, "la consola no firma permisos");
  await assert.rejects(en(app, A, firmar, [B, titular[B]]), denegado, "app_rls: otro negocio");
  await assert.rejects(en(app, A, firmar, [A, base.a.recepcion.id]), denegado, "app_rls: recepción no firma");
  await assert.rejects(en(app, A, firmar, [A, titular[B]]), denegado, "app_rls: titular de otro negocio no firma");

  // ── gsg_operador: AuditLog sin editar ni borrar; RLS igual que app_rls ──
  await assert.rejects(en(operador, A, `UPDATE "AuditLog" SET actor = 'x'`), denegado);
  await assert.rejects(en(operador, A, `DELETE FROM "AuditLog"`), denegado);
  assert.equal((await en(operador, A, `SELECT id FROM "SupportTicket" WHERE "tenantId" = $1`, [B])).rowCount, 0, "operador: otro negocio");

  // ── El guardado del permiso, como la app (app_rls) ──
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const { operatorPrisma } = await import("@/lib/operator-db");
  const { registrarConsentimiento, leerConsentimiento } = await import("./consentimiento.server");
  base.alBorrar(() => operatorPrisma.$disconnect());
  const negada = await registrarConsentimiento({ tenantId: base.b.id, userId: base.b.recepcion.id, rol: "RECEPTION", nivel: "n1", aceptado: true });
  assert.equal(negada.ok, false, "recepción no da permiso");
  assert.deepEqual(await leerConsentimiento(base.b.id), { n1: true, n2: false }, "B ya tenía n1 (sembrado)");
  const n2 = await registrarConsentimiento({ tenantId: base.b.id, userId: base.b.duenia.id, rol: "OWNER", nivel: "n2", aceptado: true });
  assert.deepEqual(n2, { ok: true, vigente: { n1: true, n2: true } });
  const sacar = await registrarConsentimiento({ tenantId: base.b.id, userId: base.b.duenia.id, rol: "OWNER", nivel: "n1", aceptado: false });
  assert.deepEqual(sacar, { ok: true, vigente: { n1: false, n2: false } }, "sin n1, n2 no vale");
  const rastro = await duenio.query(`SELECT action FROM "AuditLog" WHERE "tenantId" = $1 AND entity = 'SoporteConsentimiento' ORDER BY "createdAt"`, [B]);
  assert.deepEqual(rastro.rows.map((r) => r.action), ["soporte.permiso.dar", "soporte.permiso.sacar"]);
});
