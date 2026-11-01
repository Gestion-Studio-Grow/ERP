// Demo local de REPORTES — el recorrido de /admin/reportes contra una base EFÍMERA, a costo 0.
//
// Postgres en memoria (PGlite), todas las migraciones y dos negocios con ocho meses de movimientos:
//   · `chdemo`  (servicios, sin rubro, como CH): turnos, cobros por todos los medios, ausencias,
//     cancelaciones y comisiones pendientes.
//   · `magra`   (mostrador): ventas cobradas por día, con costo en cada línea.
// No toca Neon ni producción: la base vive en RAM y muere al cortar. Datos inventados y sin azar real
// (el generador va con semilla), así dos corridas dan los mismos números.
//
// Uso:  npx tsx scripts/reportes/demo-local.mts               (servicios, next dev)
//       npx tsx scripts/reportes/demo-local.mts --mostrador   (mostrador, next dev)
//       … --prod                                              (next start; antes, `npx next build`)
//   http://chdemo.localhost:3078/admin/login   dueno@chdemo.demo / reportes1234
//   http://magra.localhost:3078/admin/login    dueno@magra.demo  / reportes1234

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { provisionTenant } from "../provision-tenant";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DB_PORT = 54378;
const APP_PORT = 3078;
const DB_URL = `postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`;
const CLAVE = "reportes1234";
const DIA = 86_400_000;
const MESES = 8;

const log = (m: string) => console.log(`[reportes-demo] ${m}`);
const round2 = (n: number) => Math.round(n * 100) / 100;

// Generador con semilla: los números de la demo no cambian de una corrida a otra.
let estado = 20261101;
const azar = () => {
  estado = (estado * 1664525 + 1013904223) % 4294967296;
  return estado / 4294967296;
};
const uno = <T,>(xs: readonly T[]): T => xs[Math.floor(azar() * xs.length)];
/** Elige por peso: `[["EFECTIVO", 5], ["DEBITO", 2]]`. */
const pesado = <T,>(xs: readonly (readonly [T, number])[]): T => {
  let r = azar() * xs.reduce((s, [, p]) => s + p, 0);
  for (const [v, p] of xs) if ((r -= p) <= 0) return v;
  return xs[xs.length - 1][0];
};

async function migrar(pg: PGlite) {
  const dir = path.join(REPO, "prisma", "migrations");
  let n = 0;
  for (const m of readdirSync(dir).filter((d) => !d.startsWith("migration_lock")).sort()) {
    let sql: string;
    try {
      sql = readFileSync(path.join(dir, m, "migration.sql"), "utf8");
    } catch {
      continue;
    }
    await pg.exec(sql);
    n++;
  }
  // Las preparadas de Gate 2 (Débito y Crédito entre ellas), SÓLO en esta base local.
  const pendientes = path.join(REPO, "prisma", "pending-gate2");
  for (const f of readdirSync(pendientes).filter((f) => f.endsWith(".sql")).sort()) {
    await pg.exec(readFileSync(path.join(pendientes, f), "utf8")).catch((e: Error) => log(`pending-gate2 omitida (${f}): ${e.message}`));
  }
  log(`migraciones aplicadas: ${n}`);
}

async function sembrarServicios(prisma: PrismaClient) {
  const { tenantId } = await provisionTenant(prisma, {
    name: "CH Demo Estética",
    slug: "chdemo",
    blueprint: "servicios",
    owner: { name: "Dueña Demo", email: "dueno@chdemo.demo", password: CLAVE },
    platform: { status: "ACTIVE", plan: "demo", subdomain: "chdemo" },
  });
  // Como CH en producción: sin blueprint y en edición Empresa (la que muestra margen en Reportes).
  await prisma.tenant.update({ where: { id: tenantId }, data: { blueprintId: null, profile: "enterprise" } });

  const boxes = await Promise.all(["Box 1", "Box 2", "Box 3"].map((name) => prisma.box.create({ data: { tenantId, name } })));
  const servicios = await Promise.all(
    ([["Masaje descontracturante", 60, 15000], ["Limpieza facial profunda", 50, 20000], ["Peeling químico", 40, 22000], ["Radiofrecuencia corporal", 45, 25000], ["Uñas semipermanentes", 90, 12000]] as const).map(
      ([name, durationMin, price]) => prisma.service.create({ data: { tenantId, name, durationMin, price } }),
    ),
  );
  const profesionales = await Promise.all(
    ["Laura Gómez", "Marina Suárez", "Carla Díaz"].map((name, i) =>
      prisma.professional.create({ data: { tenantId, name, boxId: boxes[i].id, commissionPercent: 40, services: { connect: servicios.map((s) => ({ id: s.id })) } } }),
    ),
  );
  const clientes = await Promise.all(
    Array.from({ length: 90 }, (_, i) => prisma.client.create({ data: { tenantId, name: `Clienta ${String(i + 1).padStart(2, "0")}`, phone: `11-5000-${String(1000 + i)}` } })),
  );

  const ahora = Date.now();
  let turnos = 0;
  for (let d = MESES * 30; d >= 0; d--) {
    const dia = new Date(ahora - d * DIA);
    if (dia.getDay() === 0) continue; // cerrado los domingos
    // La plata crece con los meses y el sábado trae más gente: algo que un gráfico tiene que dejar ver.
    const cantidad = Math.round((3 + (MESES * 30 - d) / 60 + (dia.getDay() === 6 ? 3 : 0)) * (0.7 + azar() * 0.6));
    for (let i = 0; i < cantidad; i++) {
      const hora = new Date(dia);
      hora.setUTCHours(12 + Math.floor(azar() * 9), 0, 0, 0);
      if (hora.getTime() > ahora) continue;
      const s = uno(servicios);
      const estadoTurno = pesado([["COMPLETED", 86], ["NO_SHOW", 8], ["CANCELLED", 6]] as const);
      const metodo = pesado([["EFECTIVO", 5], ["MERCADOPAGO", 3], ["TRANSFERENCIA", 2], ["DEBITO", 2], ["CREDITO", 1]] as const);
      const inflacion = 1 + (MESES * 30 - d) / 400;
      await prisma.appointment.create({
        data: {
          tenantId,
          clientId: uno(clientes).id,
          professionalId: uno(profesionales).id,
          serviceId: s.id,
          boxId: uno(boxes).id,
          startsAt: hora,
          endsAt: new Date(hora.getTime() + s.durationMin * 60_000),
          status: estadoTurno,
          priceAtBooking: s.price,
          ...(estadoTurno === "COMPLETED"
            ? { payment: { create: { tenantId, amount: round2(s.price * inflacion), method: metodo as never, status: "APPROVED", createdAt: hora } } }
            : {}),
        },
      });
      turnos++;
    }
  }
  log(`servicios: ${turnos} turnos`);
}

async function sembrarMostrador(prisma: PrismaClient) {
  const { tenantId } = await provisionTenant(prisma, {
    name: "Magra Demo",
    slug: "magra",
    blueprint: "carniceria",
    owner: { name: "Dueño Demo", email: "dueno@magra.demo", password: CLAVE },
    platform: { status: "ACTIVE", plan: "demo", subdomain: "magra" },
  });
  const productos = await prisma.product.findMany({ where: { tenantId }, select: { id: true, name: true, saleUnit: true, price: true, pricePerKg: true } });
  const ahora = Date.now();
  let code = 0;
  for (let d = MESES * 30; d >= 0; d--) {
    const dia = new Date(ahora - d * DIA);
    if (dia.getDay() === 0) continue;
    const cantidad = Math.round((5 + (MESES * 30 - d) / 40 + (dia.getDay() >= 5 ? 6 : 0)) * (0.7 + azar() * 0.6));
    for (let i = 0; i < cantidad; i++) {
      const creada = new Date(dia);
      creada.setUTCHours(12 + Math.floor(azar() * 9), Math.floor(azar() * 60), 0, 0);
      if (creada.getTime() > ahora) continue;
      const lineas = Array.from({ length: 1 + Math.floor(azar() * 3) }, () => {
        const p = uno(productos);
        const porKilo = p.saleUnit === "WEIGHT" || (p.pricePerKg ?? 0) > 0;
        const quantity = porKilo ? round2(0.5 + azar() * 2) : 1 + Math.floor(azar() * 2);
        const unitPrice = Number(porKilo ? p.pricePerKg ?? p.price ?? 0 : p.price ?? p.pricePerKg ?? 0);
        return { tenantId, productId: p.id, name: p.name, saleUnit: p.saleUnit, quantity, unitPrice, lineTotal: round2(quantity * unitPrice) };
      });
      const subtotal = round2(lineas.reduce((s, l) => s + l.lineTotal, 0));
      code++;
      await prisma.order.create({
        data: {
          tenantId,
          code,
          status: "DELIVERED",
          channel: "COUNTER",
          fulfillment: "PICKUP",
          customerName: "Mostrador",
          customerPhone: "—",
          subtotal,
          discount: 0,
          total: subtotal,
          paid: true,
          paymentMethod: pesado([["EFECTIVO", 5], ["MERCADOPAGO", 3], ["TRANSFERENCIA", 1]] as const) as never,
          createdAt: creada,
          items: { create: lineas as never },
        },
      });
    }
  }
  log(`mostrador: ${code} ventas`);
}

let db: PGlite | undefined;
let server: PGLiteSocketServer | undefined;
let next: ChildProcess | undefined;

async function cortar(codigo = 0) {
  try {
    if (process.platform === "win32" && next?.pid) spawn("taskkill", ["/F", "/T", "/PID", String(next.pid)], { stdio: "ignore", shell: true });
    else next?.kill();
  } catch {}
  try {
    await server?.stop();
  } catch {}
  process.exit(codigo);
}

async function main() {
  db = await PGlite.create();
  await migrar(db);
  server = new PGLiteSocketServer({ db, port: DB_PORT, host: "127.0.0.1", maxConnections: 50 });
  await server.start();

  // De acá en adelante TODO apunta a la base local, jamás a Neon.
  process.env.DATABASE_URL = DB_URL;
  process.env.RLS_ENFORCEMENT = "off";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });
  // Un negocio por corrida: el alta (ADR-018) no deja crear un segundo sin RLS, y acá no hay por qué saltearla.
  const mostrador = process.argv.includes("--mostrador");
  if (mostrador) await sembrarMostrador(prisma);
  else await sembrarServicios(prisma);
  await prisma.$disconnect();

  const prod = process.argv.includes("--prod");
  next = spawn("npx", ["next", prod ? "start" : "dev", "-p", String(APP_PORT)], {
    cwd: REPO,
    shell: true,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: DB_URL,
      OPERATOR_DATABASE_URL: DB_URL,
      MIGRATE_DATABASE_URL: DB_URL,
      // Una sola: PGlite es UN backend, y con conexiones en paralelo se le cruzan las consultas preparadas.
      DB_CONNECTION_LIMIT: "1",
      RLS_ENFORCEMENT: "off",
      APP_BASE_DOMAIN: "localhost",
      AUTH_SECRET: "demo-local-de-reportes-no-es-un-secreto-real-0123456789",
      OPERATOR_SECRET: "demo-local-de-reportes-operador-no-es-secreto-0123456789",
      MODULE_REGISTRY_ENABLED: "on",
      PORT: String(APP_PORT),
    },
  });
  next.on("exit", () => cortar(0));
  log(`LISTA → http://${mostrador ? "magra" : "chdemo"}.localhost:${APP_PORT}/admin/login`);
}

process.on("SIGINT", () => cortar(0));
process.on("SIGTERM", () => cortar(0));
main().catch((e) => {
  console.error("[reportes-demo] error:", e);
  cortar(1);
});
