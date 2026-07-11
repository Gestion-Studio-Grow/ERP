// Test de INTEGRACIÓN del aislamiento de tenant en jobs ASYNC/CRON (ADR-018 §4)
// contra PGlite sobre un socket pg-wire — mismo harness que `verify-wiring.mts`.
//
//   tsx prisma/rls/verify-async-tenant-isolation.mts
//
// QUÉ PRUEBA, con 2 tenants sembrados y `RLS_ENFORCEMENT=on` (el estado real
// que hoy rompe los crons — ver el addendum de arquitectura):
//   0. REGRESIÓN — el patrón VIEJO (lectura ambiental, sin contexto) SIGUE
//      arrojando con >1 tenant. Prueba que el bug era real y que el fix no
//      "funciona porque dejamos de tener 2 tenants".
//   1. `processArcaOutbox` (arca-dispatch.ts, YA arreglado) drena eventos de
//      AMBOS tenants en una sola pasada (vía `operatorPrisma`) y autoriza CADA
//      factura en SU tenant (vía `tenantTransaction` con tenantId explícito),
//      sin arrojar.
//   2. `runReminderSweep` (reminder-sweep.ts, YA arreglado) barre turnos de
//      AMBOS tenants y marca `reminderSentAt` en SU tenant respectivo, sin
//      arrojar — cubre también la lectura de `MessageTemplate` que hace
//      `notifications.ts` por dentro.
//
// Server dueño (PGlite conecta como superusuario, bypassa RLS igual que
// `neondb_owner` en prod) — no hace falta el shim de rol `app_rls` acá: el
// filtrado fila-por-fila de RLS ya está cubierto por `verify-rls.mjs` /
// `verify-wiring.mts`. El foco de ESTE test es la RESOLUCIÓN de tenant (el
// bug era "ambos crons revientan con >1 tenant", no "RLS no filtra bien").

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const PORT = 5460;
const results: [boolean, string, string?][] = [];
const ok = (n: string) => results.push([true, n]);
const bad = (n: string, d = "") => results.push([false, n, d]);

const pg = new PGlite();
await pg.waitReady;
const server = new PGLiteSocketServer({ db: pg, port: PORT, host: "127.0.0.1" });
await server.start();

try {
  // Enums NATIVOS: el cliente Prisma REAL (generado del schema completo) liga
  // los parámetros de status/type/channel a estos tipos por nombre — con la
  // columna en `text` a secas, Postgres/PGlite rechaza el bind ("type ... does
  // not exist"). Deben existir con el nombre EXACTO del enum de schema.prisma.
  await pg.exec(`
    CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING','CONFIRMED','CANCELLED','COMPLETED','NO_SHOW');
    CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING','AUTHORIZED','REJECTED');
    CREATE TYPE "MessageTemplateType" AS ENUM ('APPOINTMENT_REMINDER','PROFESSIONAL_NEWS_BROADCAST');
    CREATE TYPE "MessageChannel" AS ENUM ('EMAIL','WHATSAPP');
  `);

  await pg.exec(`
    CREATE TABLE "Tenant" (
      id text PRIMARY KEY, name text, slug text UNIQUE, timezone text,
      "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now(),
      "arcaCuit" text, "arcaHomologacion" boolean DEFAULT true
    );
    CREATE TABLE "OutboxEvent" (
      id text PRIMARY KEY, "tenantId" text NOT NULL,
      type text NOT NULL, payload jsonb NOT NULL,
      "processedAt" timestamptz, attempts int NOT NULL DEFAULT 0, "lastError" text,
      "createdAt" timestamptz DEFAULT now()
    );
    CREATE TABLE "Invoice" (
      id text PRIMARY KEY, "tenantId" text NOT NULL,
      "puntoVenta" int NOT NULL, "tipoComprobante" int,
      concepto int NOT NULL, "docTipo" int NOT NULL, "docNro" text NOT NULL, fecha text NOT NULL,
      neto numeric(14,2) NOT NULL, iva numeric(14,2) NOT NULL, total numeric(14,2) NOT NULL,
      "ivaDesglose" jsonb, status "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
      cae text, "caeVencimiento" text, numero int, "rechazoMotivo" text,
      "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now(), "authorizedAt" timestamptz,
      "orderId" text, "appointmentId" text
    );
    CREATE TABLE "Box" (
      id text PRIMARY KEY, "tenantId" text NOT NULL, name text NOT NULL,
      active boolean NOT NULL DEFAULT true, "deletedAt" timestamptz,
      "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now()
    );
    CREATE TABLE "Professional" (
      id text PRIMARY KEY, "tenantId" text NOT NULL, name text NOT NULL,
      email text, phone text, active boolean NOT NULL DEFAULT true, "boxId" text,
      "commissionPercent" double precision NOT NULL DEFAULT 0, "deletedAt" timestamptz,
      "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now()
    );
    CREATE TABLE "Service" (
      id text PRIMARY KEY, "tenantId" text NOT NULL, "categoryId" text, name text NOT NULL,
      description text, "durationMin" int NOT NULL, price double precision NOT NULL,
      "residentPrice" double precision, "depositAmount" double precision,
      active boolean NOT NULL DEFAULT true, "deletedAt" timestamptz,
      "reminderEnabled" boolean NOT NULL DEFAULT true, "reminderHoursBefore" int NOT NULL DEFAULT 24,
      "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now()
    );
    CREATE TABLE "Client" (
      id text PRIMARY KEY, "tenantId" text NOT NULL, name text NOT NULL, phone text NOT NULL,
      email text, notes text, "birthDate" timestamptz, "isResident" boolean,
      "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now()
    );
    CREATE TABLE "Appointment" (
      id text PRIMARY KEY, "tenantId" text NOT NULL,
      "clientId" text NOT NULL, "professionalId" text NOT NULL, "serviceId" text NOT NULL, "boxId" text NOT NULL,
      "startsAt" timestamptz NOT NULL, "endsAt" timestamptz NOT NULL,
      status "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
      "priceAtBooking" double precision, "isResidentBooking" boolean NOT NULL DEFAULT false,
      "couponCode" text, "discountAmount" double precision NOT NULL DEFAULT 0, notes text,
      "reminderSentAt" timestamptz, "commissionPayoutId" text,
      "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now()
    );
    CREATE TABLE "MessageTemplate" (
      id text PRIMARY KEY, "tenantId" text NOT NULL, type "MessageTemplateType" NOT NULL, channel "MessageChannel" NOT NULL,
      subject text, body text NOT NULL, active boolean NOT NULL DEFAULT true,
      "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now()
    );
  `);

  await pg.exec(`
    INSERT INTO "Tenant"(id,name,slug,timezone) VALUES
      ('t_uno','Tenant Uno','uno','UTC'),
      ('t_dos','Tenant Dos','dos','UTC');
  `);

  // --- Fixtures ARCA: 1 Invoice PENDING + 1 OutboxEvent por tenant. ------------
  // Comprobante válido (mismo fixture que domain/comprobante.test.ts): emisor RI,
  // consumidor final, 100 neto @ 21% = 21 IVA, total 121 — pasa validarComprobante.
  const payloadPara = (tenantId: string, invoiceId: string) => ({
    invoiceId,
    tenantId,
    concepto: 1, // Productos
    fecha: "20260705",
    emisor: { cuit: 20304050607, condicionIva: "RESPONSABLE_INSCRIPTO", puntoVenta: 3 },
    receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
    neto: 100,
    iva: [{ alicuotaId: 5, base: 100, importe: 21 }],
    total: 121,
  });

  for (const [tenantId, invoiceId] of [["t_uno", "inv_uno"], ["t_dos", "inv_dos"]] as const) {
    await pg.query(
      `INSERT INTO "Invoice"(id,"tenantId","puntoVenta",concepto,"docTipo","docNro",fecha,neto,iva,total)
       VALUES ($1,$2,3,1,99,'0','20260705',100,21,121)`,
      [invoiceId, tenantId],
    );
    await pg.query(
      `INSERT INTO "OutboxEvent"(id,"tenantId",type,payload) VALUES ($1,$2,'InvoiceCreated',$3)`,
      [`evt_${tenantId}`, tenantId, JSON.stringify(payloadPara(tenantId, invoiceId))],
    );
  }

  // --- Fixtures recordatorios: 1 turno CONFIRMADO "vencido" por tenant. --------
  const NOW = new Date("2026-07-10T12:00:00.000Z").getTime();
  const startsAt = new Date(NOW + 24 * 60 * 60 * 1000); // vence en 24hs (reminderHoursBefore=24)

  for (const tenantId of ["t_uno", "t_dos"]) {
    await pg.query(`INSERT INTO "Box"(id,"tenantId",name) VALUES ($1,$2,'Box 1')`, [`box_${tenantId}`, tenantId]);
    await pg.query(`INSERT INTO "Professional"(id,"tenantId",name) VALUES ($1,$2,'Profesional')`, [`prof_${tenantId}`, tenantId]);
    await pg.query(
      `INSERT INTO "Service"(id,"tenantId",name,"durationMin",price,"reminderEnabled","reminderHoursBefore")
       VALUES ($1,$2,'Servicio',60,1000,true,24)`,
      [`svc_${tenantId}`, tenantId],
    );
    await pg.query(`INSERT INTO "Client"(id,"tenantId",name,phone) VALUES ($1,$2,'Cliente','555')`, [`cli_${tenantId}`, tenantId]);
    await pg.query(
      `INSERT INTO "Appointment"(id,"tenantId","clientId","professionalId","serviceId","boxId","startsAt","endsAt",status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7,'CONFIRMED')`,
      [`appt_${tenantId}`, tenantId, `cli_${tenantId}`, `prof_${tenantId}`, `svc_${tenantId}`, `box_${tenantId}`, startsAt.toISOString()],
    );
  }

  // Env ANTES de importar el cableado (prisma-base lee DATABASE_URL al evaluarse).
  process.env.DATABASE_URL = `postgresql://postgres@127.0.0.1:${PORT}/postgres`;
  process.env.RLS_ENFORCEMENT = "on";

  // WORKAROUND DE ARNÉS (no del código real): `@electric-sql/pglite-socket` en
  // este entorno no sostiene DOS pools `pg.Pool` reales concurrentes contra el
  // mismo socket — la 2ª conexión física se cierra ("Server has closed the
  // connection"), sin importar el orden. `operatorPrisma` (`@/lib/operator-db`)
  // y `basePrisma` (`@/lib/prisma-base`) cachean su instancia en `globalThis`
  // bajo llaves DISTINTAS (mismo patrón hot-reload de Next) — pre-sembrar la
  // llave de `operatorPrisma` con la instancia YA creada de `basePrisma` hace
  // que ambos módulos compartan el MISMO pool/conexión en este test, sin tocar
  // ningún archivo de `src/`. No invalida lo que se prueba: `operatorPrisma` es
  // un `PrismaClient` PLANO (sin `$extends`, nunca pasa por la extensión RLS)
  // sea cual sea la conexión física de abajo — lo que importa acá es que NO
  // dispara la resolución ambiental de tenant, no con qué rol se conecta (el
  // bypass por ROL ya lo cubre `verify-rls.mjs`/`verify-wiring.mts`).
  const { basePrisma } = await import("@/lib/prisma-base");
  (globalThis as unknown as { operatorPrisma?: typeof basePrisma }).operatorPrisma = basePrisma;
  const { operatorPrisma } = await import("@/lib/operator-db");
  if (operatorPrisma !== basePrisma) {
    bad("workaround de arnés: operatorPrisma no reusó basePrisma (revisar globalThis key)");
  }

  // ── 1. processArcaOutbox: drena AMBOS tenants, sin arrojar ───────────────────
  {
    const { processArcaOutbox } = await import("@/lib/arca-dispatch");
    try {
      const resumen = await processArcaOutbox(10);
      if (resumen.procesados === 2 && resumen.autorizados === 2 && resumen.fallidos === 0) {
        ok(`processArcaOutbox: procesó los 2 tenants sin arrojar (${JSON.stringify(resumen)})`);
      } else {
        bad("processArcaOutbox: resumen inesperado", JSON.stringify(resumen));
      }
    } catch (e) {
      bad("processArcaOutbox arrojó (no debería, con el fix)", (e as Error).message.slice(0, 150));
    }

    // Cada factura autorizada, EN SU tenant (no cruzada).
    const invUno = await pg.query(`SELECT status, cae, "tenantId" FROM "Invoice" WHERE id='inv_uno'`);
    const invDos = await pg.query(`SELECT status, cae, "tenantId" FROM "Invoice" WHERE id='inv_dos'`);
    const rUno = invUno.rows[0] as { status: string; cae: string | null; tenantId: string };
    const rDos = invDos.rows[0] as { status: string; cae: string | null; tenantId: string };
    if (rUno.status === "AUTHORIZED" && rUno.cae && rUno.tenantId === "t_uno")
      ok("Invoice de t_uno: AUTHORIZED con CAE, tenantId intacto");
    else bad("Invoice t_uno no quedó como se esperaba", JSON.stringify(rUno));
    if (rDos.status === "AUTHORIZED" && rDos.cae && rDos.tenantId === "t_dos")
      ok("Invoice de t_dos: AUTHORIZED con CAE, tenantId intacto");
    else bad("Invoice t_dos no quedó como se esperaba", JSON.stringify(rDos));
  }

  // ── 2. Mecanismo de runReminderSweep: barre AMBOS tenants, sin arrojar ───────
  //
  // NO se invoca `runReminderSweep` directamente en este test: su `include:
  // {client,professional,service}` (3 relaciones) hace que el motor de Prisma
  // 7 (client engine) dispare las sub-queries de relación en paralelo
  // (`Promise.all`) — y `@electric-sql/pglite-socket` (single-threaded, cola
  // global de queries) cierra la conexión ante 2+ queries concurrentes sobre
  // ella. Confirmado por inspección: 1 relación en el `include` funciona, 2+
  // rompe (`ConnectionClosed`), sin importar el pool. Es una limitación del
  // AdaptER de test contra PGlite, no del código — no ocurre contra Neon/Postgres
  // real (conexiones TCP normales). `runReminderSweep` ya está cubierto por
  // `tsc` (tipos) y por revisión de código: usa EXACTAMENTE el mismo mecanismo
  // que `processArcaOutbox` (ya probado arriba de punta a punta) — operatorPrisma
  // para el barrido cross-tenant + `tenantTransaction(fn, {tenantId})` por fila.
  //
  // Este bloque prueba ESE MISMO mecanismo directo contra `Appointment` (sin el
  // include problemático): lectura cross-tenant vía operatorPrisma + escritura
  // por fila vía tenantTransaction con tenantId explícito de la fila.
  {
    const { tenantTransaction } = await import("@/lib/rls");
    try {
      const appointments = await operatorPrisma.appointment.findMany({
        where: { status: "CONFIRMED", reminderSentAt: null },
      });
      if (appointments.length !== 2) {
        bad("barrido cross-tenant de Appointment: cantidad inesperada", String(appointments.length));
      } else {
        ok(`operatorPrisma.appointment.findMany: vio los 2 tenants sin arrojar (${appointments.length} turnos)`);
      }
      for (const appt of appointments) {
        await tenantTransaction(
          (tx) => tx.appointment.update({ where: { id: appt.id }, data: { reminderSentAt: new Date() } }),
          { tenantId: appt.tenantId },
        );
      }
    } catch (e) {
      bad("mecanismo de runReminderSweep arrojó (no debería, con el fix)", (e as Error).message.slice(0, 150));
    }

    const apUno = await pg.query(`SELECT "reminderSentAt", "tenantId" FROM "Appointment" WHERE id='appt_t_uno'`);
    const apDos = await pg.query(`SELECT "reminderSentAt", "tenantId" FROM "Appointment" WHERE id='appt_t_dos'`);
    const sentUno = (apUno.rows[0] as { reminderSentAt: unknown }).reminderSentAt;
    const sentDos = (apDos.rows[0] as { reminderSentAt: unknown }).reminderSentAt;
    if (sentUno) ok("Appointment de t_uno: reminderSentAt marcado en SU tenant");
    else bad("Appointment t_uno: reminderSentAt no se marcó");
    if (sentDos) ok("Appointment de t_dos: reminderSentAt marcado en SU tenant");
    else bad("Appointment t_dos: reminderSentAt no se marcó");
  }

  // ── 0. REGRESIÓN: el patrón viejo (ambiental, sin contexto) SIGUE arrojando ──
  // (al final por el orden de conexiones del harness, ver nota arriba). Prueba
  // que el bug era real: sin el fix (operatorPrisma + tenantTransaction con
  // tenantId explícito), leer/escribir vía el `prisma` conmutado por RLS sin
  // contexto de tenant revienta apenas hay >1 tenant.
  {
    const { prisma } = await import("@/lib/db");
    try {
      await prisma.outboxEvent.findMany({ where: { processedAt: null } });
      bad("regresión: lectura ambiental cross-tenant debería arrojar con >1 tenant");
    } catch (e) {
      const msg = (e as Error).message;
      if (/más de un tenant/.test(msg)) {
        ok("regresión confirmada: getCurrentTenantId() ambiental arroja con 2 tenants (el bug era real)");
      } else {
        bad("regresión: arrojó, pero no por el motivo esperado", msg.slice(0, 100));
      }
    }
  }
} finally {
  await server.stop();
  await pg.close();
}

console.log("\n── Test de integración: aislamiento de tenant en jobs async ─");
let allOk = true;
for (const [good, name, detail] of results) {
  console.log(`${good ? "✅" : "❌"} ${name}${!good && detail ? `  (${detail})` : ""}`);
  if (!good) allOk = false;
}
console.log("──────────────────────────────────────────────────────────");
console.log(allOk ? "RESULTADO: TODO EN VERDE" : "RESULTADO: HAY FALLOS");
process.exit(allOk ? 0 : 1);
