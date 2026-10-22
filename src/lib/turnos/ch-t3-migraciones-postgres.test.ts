/**
 * Las tres migraciones de la reingeniería CH, Tanda 3 (M1 tarjeta, M2 reglas, M3 combos), EJECUTADAS
 * contra Postgres local en una base EFÍMERA propia — nunca Neon:
 *
 *   1. Se arma la base «como producción hoy»: TODAS las migraciones del repo MENOS las tres de esta
 *      tanda (`prisma migrate deploy` con una carpeta de migraciones recortada), RLS 0002 + 0001, y
 *      datos de dos negocios (A = CH, B = otro).
 *   2. SIN las migraciones, el código nuevo (cliente de Prisma generado con el schema nuevo) anda:
 *      la agenda lee y escribe turnos, la Localización lee y graba, las reglas caen al placeholder
 *      (CH-053), la tarjeta no se ofrece (CH-032). Y se muestra por qué hace falta el `omit` global:
 *      un cliente SIN él se cae en la primera consulta a `Appointment`.
 *   3. Se aplican las tres con el `migrate deploy` de siempre sobre esa base CON DATOS (CH-072):
 *      ningún servicio, profesional, turno ni fila de Localización cambia (CH-069/070).
 *   4. CON las migraciones: Débito/Crédito existen (CH-031), las reglas se leen y graban por
 *      `tenantId` sin tocar a otro negocio (CH-068), y `AppointmentItem` tiene RLS: con el rol
 *      `app_rls`, el negocio B no ve ni puede escribir ítems de A (CH-065).
 *
 * Sin Postgres local se saltea diciendo por qué (en CI falla), como los demás `*-postgres.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import {
  ROL_APP,
  ROL_DUENIO,
  queHacerSinPostgres,
  urlDeRol,
  urlDelServidor,
  apuntarLaAppA,
  type BaseEfimera,
} from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const RAIZ = path.resolve(__dirname, "..", "..", "..");
const PRISMA_CLI = path.join(RAIZ, "node_modules", "prisma", "build", "index.js");
const MIGRACIONES = path.join(RAIZ, "prisma", "migrations");
const DE_ESTA_TANDA = [
  "20261024120000_ch_medios_tarjeta",
  "20261024120100_ch_reglas_negocio",
  "20261024120200_ch_appointment_items",
];
const CANDADO_DE_ROLES = 7_300_000_001; // el mismo que src/test/base-efimera.ts

const ident = (n: string) => `"${n.replace(/"/g, '""')}"`;
const id = (p: string) => `${p}_${randomBytes(5).toString("hex")}`;

function correr(args: string[], env: Record<string, string | undefined>): Promise<{ codigo: number; salida: string }> {
  return new Promise((ok) => {
    execFile(process.execPath, [PRISMA_CLI, ...args], { cwd: RAIZ, env: env as NodeJS.ProcessEnv, timeout: 180_000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      ok({ codigo: err ? (typeof err.code === "number" ? err.code : 1) : 0, salida: `${stdout}${stderr}` });
    });
  });
}

async function sql(url: string, texto: string, valores: unknown[] = []) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return await c.query(texto, valores);
  } finally {
    await c.end();
  }
}

type Negocio = { id: string; servicio: string; turno: string; profesional: string; box: string; cliente: string };

test("CH Tanda 3 · M1/M2/M3: el código anda sin las migraciones, se aplican sobre datos y AppointmentItem queda aislado", async (t) => {
  // ── 0. El servidor ─────────────────────────────────────────────────────────
  const servidor = urlDelServidor();
  const admin = new pg.Client({ connectionString: servidor, connectionTimeoutMillis: 3000 });
  try {
    await admin.connect();
  } catch (err) {
    await admin.end().catch(() => {});
    const motivo = `sin Postgres en ${urlDeRol(servidor, null, "postgres")}: ${(err as Error).message}`;
    if (queHacerSinPostgres() === "fallar") throw new Error(`${motivo}. En CI el test de base no puede saltearse.`);
    t.skip(`${motivo}: la parte de base queda SIN verificar`);
    return;
  }

  const nombre = `erp_test_${process.pid}_${randomBytes(4).toString("hex")}`;
  const urlDuenio = urlDeRol(servidor, ROL_DUENIO, nombre);
  const urlApp = urlDeRol(servidor, ROL_APP, nombre);
  const comoAdmin = urlDeRol(servidor, null, nombre);
  const carpeta = path.join(RAIZ, "node_modules", ".cache", `ch-t3-${process.pid}-${randomBytes(3).toString("hex")}`);
  const alFinal: Array<() => unknown> = [];
  t.after(async () => {
    for (const fn of alFinal.reverse()) await Promise.resolve().then(fn).catch(() => {});
    await admin.query(`DROP DATABASE IF EXISTS ${ident(nombre)} WITH (FORCE)`).catch(() => {});
    await admin.end().catch(() => {});
    rmSync(carpeta, { recursive: true, force: true });
  });

  await admin.query("SELECT pg_advisory_lock($1)", [CANDADO_DE_ROLES]);
  try {
    await admin.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROL_DUENIO}') THEN
        CREATE ROLE ${ROL_DUENIO} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      END IF;
    END $$`);
  } finally {
    await admin.query("SELECT pg_advisory_unlock($1)", [CANDADO_DE_ROLES]);
  }
  await admin.query(`CREATE DATABASE ${ident(nombre)} OWNER ${ROL_DUENIO}`);

  // ── 1. La base como producción HOY: todas las migraciones menos las de esta tanda ──
  const todas = readdirSync(MIGRACIONES);
  for (const m of DE_ESTA_TANDA) assert.ok(todas.includes(m), `falta la migración ${m}`);
  const recortadas = path.join(carpeta, "migrations");
  mkdirSync(recortadas, { recursive: true });
  for (const m of todas) if (!DE_ESTA_TANDA.includes(m)) cpSync(path.join(MIGRACIONES, m), path.join(recortadas, m), { recursive: true });
  const config = path.join(carpeta, "prisma.config.ts");
  writeFileSync(
    config,
    `import { defineConfig } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";
export default defineConfig({
  schema: ${JSON.stringify(path.join(RAIZ, "prisma", "schema.prisma"))},
  migrations: { path: ${JSON.stringify(recortadas)} },
  datasource: { url: process.env["DATABASE_URL"] },
  migrate: { adapter: async () => new PrismaPg({ connectionString: process.env["DATABASE_URL"] }) },
});
`,
  );
  const env = { ...process.env, DATABASE_URL: urlDuenio, MIGRATE_DATABASE_URL: urlDuenio };
  const hoy = await correr(["migrate", "deploy", "--config", config], env);
  assert.equal(hoy.codigo, 0, `migrate deploy (base de hoy) falló:\n${hoy.salida}`);
  await admin.query("SELECT pg_advisory_lock($1)", [CANDADO_DE_ROLES]);
  try {
    await sql(comoAdmin, readFileSync(path.join(RAIZ, "prisma/rls/0002_app_role.sql"), "utf8"));
  } finally {
    await admin.query("SELECT pg_advisory_unlock($1)", [CANDADO_DE_ROLES]);
  }
  await sql(comoAdmin, readFileSync(path.join(RAIZ, "prisma/rls/0001_enable_rls.sql"), "utf8"));
  const aplicadas = await sql(urlDuenio, `SELECT migration_name FROM _prisma_migrations`);
  for (const m of DE_ESTA_TANDA) assert.ok(!aplicadas.rows.some((r) => r.migration_name === m), `${m} no debía estar aplicada todavía`);

  // Datos de dos negocios, sembrados con SQL (como los tiene producción, sin pasar por el cliente nuevo).
  const sembrar = async (letra: string): Promise<Negocio> => {
    const n: Negocio = { id: id(`tnt_${letra}`), servicio: id("srv"), turno: id("apt"), profesional: id("pro"), box: id("box"), cliente: id("cli") };
    const c = new pg.Client({ connectionString: urlDuenio });
    await c.connect();
    try {
      await c.query(`INSERT INTO "Tenant" (id, name, slug, subdomain, "updatedAt") VALUES ($1, $2, $3, $3, now())`, [n.id, `Negocio ${letra}`, `negocio-${letra}-${n.id.slice(-4)}`]);
      await c.query(`INSERT INTO "BusinessSettings" (id, "tenantId", "shortLabel", whatsapp, "updatedAt") VALUES ($1, $2, $3, $4, now())`, [id("bs"), n.id, `Local ${letra}`, "5491100000000"]);
      await c.query(`INSERT INTO "Box" (id, "tenantId", name, "updatedAt") VALUES ($1, $2, 'Box 1', now())`, [n.box, n.id]);
      await c.query(`INSERT INTO "Service" (id, "tenantId", name, "durationMin", price, "depositAmount", "updatedAt") VALUES ($1, $2, 'Piernas completas', 30, 14000, 5000, '2026-10-01T12:00:00Z')`, [n.servicio, n.id]);
      await c.query(`INSERT INTO "Professional" (id, "tenantId", name, "boxId", "updatedAt") VALUES ($1, $2, 'Caro', $3, now())`, [n.profesional, n.id, n.box]);
      await c.query(`INSERT INTO "Client" (id, "tenantId", name, phone, "updatedAt") VALUES ($1, $2, 'Sofía', $3, now())`, [n.cliente, n.id, `11400030${letra === "a" ? 1 : 2}`]);
      await c.query(
        `INSERT INTO "Appointment" (id, "tenantId", "clientId", "professionalId", "serviceId", "boxId", "startsAt", "endsAt", "priceAtBooking", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, '2026-10-25T13:00:00Z', '2026-10-25T13:30:00Z', 14000, now())`,
        [n.turno, n.id, n.cliente, n.profesional, n.servicio, n.box],
      );
    } finally {
      await c.end();
    }
    return n;
  };
  const A = await sembrar("a");
  const B = await sembrar("b");

  // Foto de los maestros y transaccionales ANTES de migrar (CH-069/070): tiene que quedar igual.
  const foto = async () => ({
    servicios: (await sql(urlDuenio, `SELECT id, name, "durationMin", price, "residentPrice", "depositAmount", "updatedAt" FROM "Service" ORDER BY id`)).rows,
    profesionales: (await sql(urlDuenio, `SELECT id, name, "boxId", "updatedAt" FROM "Professional" ORDER BY id`)).rows,
    turnos: (await sql(urlDuenio, `SELECT id, "serviceId", "startsAt", "endsAt", status, "priceAtBooking", "updatedAt" FROM "Appointment" ORDER BY id`)).rows,
    localizacion: (await sql(urlDuenio, `SELECT id, "tenantId", "shortLabel", whatsapp, "updatedAt" FROM "BusinessSettings" ORDER BY id`)).rows,
  });

  // ── 2. El código nuevo contra la base SIN las migraciones ─────────────────
  const base = { nombre, urlDuenio, urlApp, alBorrar: (fn: () => unknown) => alFinal.push(fn) } as unknown as BaseEfimera;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const { basePrisma } = await import("@/lib/prisma-base");
  const { operatorPrisma, enElNegocio } = await import("@/lib/operator-db");
  const { isColumnMissing } = await import("@/lib/prisma-errors");
  const { leerReglasDelNegocio, guardarReglasDelNegocio, REGLAS_POR_DEFECTO } = await import("@/lib/settings");
  const { mediosDePagoHabilitados, olvidarMediosDePago } = await import("./medios-habilitados.server");
  const { metodosDePago, medioHabilitado, avisoDeTarjeta } = await import("./cobros");
  const { PrismaClient } = await import("@/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");

  await t.test("sin migración · un cliente SIN el omit global se cae en la primera consulta a Appointment (por eso existe)", async () => {
    const sinOmit = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlDuenio }) });
    alFinal.push(() => sinOmit.$disconnect());
    await assert.rejects(sinOmit.appointment.findMany({ where: { tenantId: A.id } }), (e) => isColumnMissing(e, "groupId"));
    await assert.rejects(sinOmit.businessSettings.findUnique({ where: { tenantId: A.id } }), (e) => isColumnMissing(e));
  });

  await t.test("sin migración · la agenda lee, crea y cambia turnos; la Localización lee y graba (cliente de la app, RLS)", async () => {
    for (const db of [basePrisma, operatorPrisma]) {
      const turnos = await enElNegocio(A.id, (tx) => tx.appointment.findMany({ include: { service: true, client: true } }), db);
      assert.deepEqual(turnos.map((x) => x.id), [A.turno]); // sólo los de A (RLS + omit)
      assert.equal((turnos[0] as { groupId?: unknown }).groupId, undefined);
      const nuevo = await enElNegocio(
        A.id,
        (tx) =>
          tx.appointment.create({
            data: {
              tenantId: A.id, clientId: A.cliente, professionalId: A.profesional, serviceId: A.servicio, boxId: A.box,
              startsAt: new Date("2026-10-26T13:00:00Z"), endsAt: new Date("2026-10-26T13:30:00Z"), priceAtBooking: 14000,
            },
          }),
        db,
      );
      await enElNegocio(A.id, (tx) => tx.appointment.update({ where: { id: nuevo.id }, data: { status: "CANCELLED" } }), db);
      await enElNegocio(A.id, (tx) => tx.appointment.delete({ where: { id: nuevo.id } }), db);
      const bs = await enElNegocio(A.id, (tx) => tx.businessSettings.findUnique({ where: { tenantId: A.id } }), db);
      assert.equal(bs?.shortLabel, "Local a");
      await enElNegocio(A.id, (tx) => tx.businessSettings.upsert({ where: { tenantId: A.id }, create: { tenantId: A.id }, update: { contactNote: null } }), db);
    }
    // El alta de un negocio nuevo crea su fila de Localización: con defaults `@default(24)` en el
    // schema, Prisma 7 mandaba la columna en el INSERT y esto reventaba (por eso `dbgenerated`).
    const nuevo = id("tnt_c");
    await sql(urlDuenio, `INSERT INTO "Tenant" (id, name, slug, subdomain, "updatedAt") VALUES ($1, 'Negocio C', $1, $1, now())`, [nuevo]);
    const fila = await enElNegocio(nuevo, (tx) => tx.businessSettings.create({ data: { tenantId: nuevo, shortLabel: "Local c" } }), operatorPrisma);
    assert.equal(fila.shortLabel, "Local c");
    await sql(urlDuenio, `DELETE FROM "BusinessSettings" WHERE "tenantId" = $1`, [nuevo]);
    await sql(urlDuenio, `DELETE FROM "Tenant" WHERE id = $1`, [nuevo]);
  });

  await t.test("sin migración · CH-053: las reglas caen al placeholder D2/D5 y no se pueden grabar (nada falla)", async () => {
    const reglas = await enElNegocio(A.id, (tx) => leerReglasDelNegocio(A.id, tx), basePrisma);
    assert.deepEqual(reglas, { ...REGLAS_POR_DEFECTO, activas: false });
    const g = await enElNegocio(
      A.id,
      (tx) => guardarReglasDelNegocio(A.id, { ...REGLAS_POR_DEFECTO, aliasSenia: "ch.estetica.mp" }, tx),
      basePrisma,
    );
    assert.deepEqual(g, { ok: false, motivo: "pendiente-de-migracion" });
    // Pedir a propósito una columna sin migrar falla con P2022: es lo que la tolerancia atrapa.
    await assert.rejects(
      enElNegocio(A.id, (tx) => tx.appointment.findFirst({ select: { id: true, groupId: true } }), basePrisma),
      (e) => isColumnMissing(e, "groupId"),
    );
  });

  await t.test("sin migración · CH-032: la base no tiene DEBITO/CREDITO, no se ofrecen y escribirlos fallaría", async () => {
    olvidarMediosDePago();
    const enBase = await mediosDePagoHabilitados(basePrisma);
    assert.deepEqual([...enBase].sort(), ["EFECTIVO", "MERCADOPAGO", "TRANSFERENCIA"]);
    assert.deepEqual(metodosDePago(enBase), ["EFECTIVO", "MERCADOPAGO", "TRANSFERENCIA"]);
    assert.equal(medioHabilitado("DEBITO", enBase), false);
    assert.equal(avisoDeTarjeta(enBase), "Hoy la tarjeta se registra como Mercado Pago.");
    await assert.rejects(sql(urlApp, `SELECT 'DEBITO'::"PaymentMethod"`), /invalid input value for enum/);
  });

  // ── 3. Aplicar las tres, con el migrate deploy de siempre, sobre la base CON datos ──
  const antes = await foto();
  const migrar = await correr(["migrate", "deploy"], env);
  assert.equal(migrar.codigo, 0, `migrate deploy de la tanda falló:\n${migrar.salida}`);
  for (const m of DE_ESTA_TANDA) assert.match(migrar.salida, new RegExp(m));
  await t.test("CH-072/069/070 · aplicar no cambió ni un servicio, profesional, turno ni fila de Localización", async () => {
    assert.deepEqual(await foto(), antes);
    const nuevas = (await sql(urlDuenio, `SELECT "cancelacionHoras", "seniaCancelaTarde", "seniaNoVino", "topeBajaSaldoRecepcion"::text AS tope, "aliasSenia" FROM "BusinessSettings"`)).rows;
    for (const r of nuevas) assert.deepEqual(r, { cancelacionHoras: 24, seniaCancelaTarde: "retener", seniaNoVino: "retener", tope: "0.00", aliasSenia: null });
    const grupos = (await sql(urlDuenio, `SELECT count(*)::int AS n FROM "Appointment" WHERE "groupId" IS NOT NULL`)).rows[0].n;
    assert.equal(grupos, 0);
    // Correr de nuevo no aplica nada (idempotente) y no falla.
    const otraVez = await correr(["migrate", "deploy"], env);
    assert.equal(otraVez.codigo, 0, otraVez.salida);
  });

  // ── 4. Con las migraciones ────────────────────────────────────────────────
  await t.test("con migración · CH-031: la base tiene DEBITO/CREDITO y se ofrecen; el cast ya no falla", async () => {
    olvidarMediosDePago();
    const enBase = await mediosDePagoHabilitados(basePrisma);
    assert.deepEqual(metodosDePago(enBase), ["EFECTIVO", "MERCADOPAGO", "TRANSFERENCIA", "DEBITO", "CREDITO"]);
    assert.equal(medioHabilitado("CREDITO", enBase), true);
    assert.equal(avisoDeTarjeta(enBase), null);
    const r = await sql(urlApp, `SELECT 'DEBITO'::"PaymentMethod"::text AS m`);
    assert.equal(r.rows[0].m, "DEBITO");
  });

  await t.test("con migración · CH-068: las reglas se leen y graban por tenantId; otro negocio no cambia", async () => {
    const leidas = await enElNegocio(A.id, (tx) => leerReglasDelNegocio(A.id, tx), basePrisma);
    assert.deepEqual(leidas, { ...REGLAS_POR_DEFECTO, activas: true });
    const reglas = { aliasSenia: "ch.estetica.mp", cbuSenia: null, cancelacionHoras: 12, seniaCancelaTarde: "a-favor" as const, seniaNoVino: "retener" as const, topeBajaSaldoRecepcion: 2000 };
    assert.deepEqual(await enElNegocio(A.id, (tx) => guardarReglasDelNegocio(A.id, reglas, tx), basePrisma), { ok: true });
    assert.deepEqual(await enElNegocio(A.id, (tx) => leerReglasDelNegocio(A.id, tx), basePrisma), { ...reglas, activas: true });
    // Parado en A, grabar las de B choca contra RLS: no se escribe nada en B.
    await assert.rejects(enElNegocio(A.id, (tx) => guardarReglasDelNegocio(B.id, reglas, tx), basePrisma));
    const deB = await enElNegocio(B.id, (tx) => leerReglasDelNegocio(B.id, tx), basePrisma);
    assert.deepEqual(deB, { ...REGLAS_POR_DEFECTO, activas: true });
    // Y la Localización de A siguió intacta.
    const loc = (await sql(urlDuenio, `SELECT "shortLabel", whatsapp FROM "BusinessSettings" WHERE "tenantId" = $1`, [A.id])).rows[0];
    assert.deepEqual(loc, { shortLabel: "Local a", whatsapp: "5491100000000" });
  });

  await t.test("con migración · CH-065: AppointmentItem tiene RLS — con app_rls, B no ve ni escribe ítems de A", async () => {
    // Ítems de los dos negocios, sembrados por el dueño (exento de RLS, como un seed).
    for (const n of [A, B]) {
      await sql(
        urlDuenio,
        `INSERT INTO "AppointmentItem" (id, "tenantId", "appointmentId", "serviceId", "order", "durationMin", "priceAtBooking")
         VALUES ($1, $2, $3, $4, 0, 30, 14000), ($5, $2, $3, $4, 1, 15, 8000)`,
        [id("itm"), n.id, n.turno, n.servicio, id("itm")],
      );
    }
    const comoApp = new pg.Client({ connectionString: urlApp });
    await comoApp.connect();
    alFinal.push(() => comoApp.end());
    const verComo = async (tenant: string | null) => {
      await comoApp.query("BEGIN");
      try {
        if (tenant) await comoApp.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenant]);
        return (await comoApp.query(`SELECT "tenantId" FROM "AppointmentItem"`)).rows.map((r) => r.tenantId as string);
      } finally {
        await comoApp.query("ROLLBACK");
      }
    };
    assert.deepEqual(await verComo(B.id), [B.id, B.id]);
    assert.deepEqual(await verComo(A.id), [A.id, A.id]);
    assert.deepEqual(await verComo(null), []); // sin negocio no se ve nada (fail-closed)

    // Parado en B, escribir un ítem con el tenantId de A: WITH CHECK lo rechaza.
    await comoApp.query("BEGIN");
    await comoApp.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [B.id]);
    await assert.rejects(
      comoApp.query(
        `INSERT INTO "AppointmentItem" (id, "tenantId", "appointmentId", "serviceId", "order", "durationMin", "priceAtBooking") VALUES ($1, $2, $3, $4, 5, 10, 1)`,
        [id("itm"), A.id, A.turno, A.servicio],
      ),
      /row-level security/,
    );
    await comoApp.query("ROLLBACK");
    // Ni borrar ni cambiar los de A desde B (0 filas afectadas).
    await comoApp.query("BEGIN");
    await comoApp.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [B.id]);
    const borrados = await comoApp.query(`DELETE FROM "AppointmentItem" WHERE "tenantId" = $1`, [A.id]);
    await comoApp.query("COMMIT");
    assert.equal(borrados.rowCount, 0);

    // Lo mismo por el cliente de la app (Prisma con el omit, rol app_rls).
    const deB = await enElNegocio(B.id, (tx) => tx.appointmentItem.findMany({ orderBy: { order: "asc" } }), basePrisma);
    assert.deepEqual(deB.map((i) => [i.tenantId, i.order, Number(i.priceAtBooking)]), [[B.id, 0, 14000], [B.id, 1, 8000]]);
    const conItems = await enElNegocio(A.id, (tx) => tx.appointment.findFirst({ where: { id: B.turno }, include: { items: true } }), basePrisma);
    assert.equal(conItems, null); // el turno de B no existe para A

    // El árbitro: la misma posición dos veces en un turno no entra.
    await assert.rejects(
      sql(urlDuenio, `INSERT INTO "AppointmentItem" (id, "tenantId", "appointmentId", "serviceId", "order", "durationMin", "priceAtBooking") VALUES ($1, $2, $3, $4, 0, 30, 1)`, [id("itm"), A.id, A.turno, A.servicio]),
      /AppointmentItem_appointmentId_order_key/,
    );
    // Y `groupId` ya se puede pedir a propósito.
    const g = await enElNegocio(A.id, (tx) => tx.appointment.findFirst({ where: { id: A.turno }, select: { id: true, groupId: true } }), basePrisma);
    assert.deepEqual(g, { id: A.turno, groupId: null });
  });
});
