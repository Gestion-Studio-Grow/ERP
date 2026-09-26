// Demo local de Qué Bien Olés — vidriera + panel contra una base EFÍMERA, a costo 0.
//
// QUÉ HACE: el mismo patrón que `npm run demo` (scripts/demo.mts): Postgres 16 en memoria (PGlite)
// servido por un socket local, TODAS las migraciones del repo, el alta del tenant `quebienoles`
// (rubro `perfumeria`) con su catálogo real de 25 perfumes, stock y costos DE EJEMPLO, un proveedor
// con una compra (para ver margen) y un pedido en cada paso de su proceso: web con envío, por
// Instagram sin coordinar, coordinado a un punto de encuentro, listo, entregado sin cobrar y
// entregado cobrado. Arranca `next dev`. NO toca Neon ni producción: la base vive en RAM y muere
// al cortar.
//
// Por qué un script aparte y no un flag de demo.mts: aquel siembra a MAGRA y se usa en su guion de
// venta; éste es el de la perfumería. Puertos propios (base 54322, app 3057) para no pisarse.
//
// Uso:  npx tsx scripts/tenants/quebienoles-demo.mts           (next dev)
//       npx tsx scripts/tenants/quebienoles-demo.mts --prod    (next start; antes, `npx next build`)
// Usuario de PRUEBA (sólo existe en esta base local): dueno@quebienoles.demo / quebienoles1234

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { provisionTenant } from "../provision-tenant";
import { PERFUMES, nombreEnCatalogo } from "../../src/app/tienda/quebienoles/perfumes";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DB_PORT = 54322;
const APP_PORT = 3057;
const DB_URL = `postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`;
const OWNER_EMAIL = "dueno@quebienoles.demo";
const OWNER_PASSWORD = "quebienoles1234";

let db: PGlite | undefined;
let server: PGLiteSocketServer | undefined;
let next: ChildProcess | undefined;

const log = (msg: string) => console.log(`\x1b[33m[quebienoles-demo]\x1b[0m ${msg}`);
const round2 = (n: number) => Math.round(n * 100) / 100;

// Igual que demo.mts: migraciones del repo + las preparadas de Gate 2 (sólo en esta base local).
async function aplicarMigraciones(pg: PGlite) {
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
  log(`migraciones aplicadas: ${n}`);
  const pendientes = path.join(REPO, "prisma", "pending-gate2");
  for (const f of readdirSync(pendientes).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await pg.exec(readFileSync(path.join(pendientes, f), "utf8"));
    } catch (e) {
      log(`pending-gate2 omitida (${f}): ${(e as Error).message}`);
    }
  }
}

/** "2026-09-27T18:30:00-03:00": un horario de Buenos Aires, a `dias` de hoy. */
function horarioAR(dias: number, hora: string): Date {
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  const d = new Date(`${hoy}T12:00:00-03:00`);
  d.setUTCDate(d.getUTCDate() + dias);
  const fecha = d.toISOString().slice(0, 10);
  return new Date(`${fecha}T${hora}:00-03:00`);
}

async function sembrarCatalogo(prisma: PrismaClient, tenantId: string) {
  // Stock de EJEMPLO: casi todo con unidades, un par en "últimas" y uno agotado, para ver los
  // tres estados en la vidriera y en el panel. Los números reales los carga el dueño.
  const stockDe = (i: number) => (i === 17 ? 0 : [4, 6, 2, 5, 3, 1, 7][i % 7]);
  for (const [i, p] of PERFUMES.entries()) {
    await prisma.product.create({
      data: {
        tenantId,
        name: nombreEnCatalogo(p),
        saleUnit: "UNIT",
        price: p.precio,
        unit: "unidades",
        stock: stockDe(i),
        lowStockAt: 2,
        trackStock: true,
        codigo: p.clave,
      },
    });
  }
  log(`catálogo: ${PERFUMES.length} perfumes (stock de ejemplo)`);
}

async function sembrarCompra(prisma: PrismaClient, tenantId: string) {
  const prods = await prisma.product.findMany({ where: { tenantId }, select: { id: true, name: true, price: true } });
  const proveedor = await prisma.supplier.create({
    data: { tenantId, name: "Distribuidora de ejemplo", phone: "11-4000-2020", notes: "Proveedor de DEMO: reemplazar por el real." },
  });
  // Costo de ejemplo ≈ 62 % del precio de venta (para que el reporte de margen tenga qué mostrar).
  const items = prods.map((p) => {
    const unitCost = Math.round((p.price ?? 0) * 0.62);
    return { tenantId, productId: p.id, name: p.name, unit: "u", quantity: 3, unitCost, lineTotal: round2(3 * unitCost) };
  });
  await prisma.stockPurchase.create({
    data: {
      tenantId,
      code: 1,
      kind: "COMPRA",
      supplier: proveedor.name,
      supplierId: proveedor.id,
      totalCost: round2(items.reduce((s, it) => s + it.lineTotal, 0)),
      createdBy: "system:demo",
      items: { create: items },
    },
  });
  log("proveedor + compra de ejemplo (costos al 62 %)");
}

async function sembrarPedidos(prisma: PrismaClient, tenantId: string) {
  const prods = await prisma.product.findMany({ where: { tenantId }, select: { id: true, name: true, price: true, codigo: true } });
  const de = (clave: string) => prods.find((p) => p.codigo === clave);
  type Pedido = {
    cliente: string;
    tel: string;
    fulfillment: "PICKUP" | "DELIVERY";
    address: string | null;
    status: "PENDING" | "CONFIRMED" | "READY" | "DELIVERED";
    paid: boolean;
    medio: "EFECTIVO" | "TRANSFERENCIA" | "MERCADOPAGO" | null;
    horario: Date | null;
    notes: string | null;
    lineas: string[];
  };
  // Un pedido por paso del proceso (docs/tenants/quebienoles/proceso.md). Personas de EJEMPLO.
  const pedidos: Pedido[] = [
    { cliente: "Lucía Fernández", tel: "11-2345-6789", fulfillment: "DELIVERY", address: "Los Álamos 450, Ezeiza", status: "PENDING", paid: false, medio: null, horario: null, notes: "Es para regalo (pedido por la web)", lineas: ["dul-khamrah", "fem-yara"] },
    { cliente: "Martina Sosa", tel: "11-3456-7890", fulfillment: "PICKUP", address: null, status: "PENDING", paid: false, medio: null, horario: null, notes: "Llegó por Instagram (@marti.sosa). Coordinar punto de encuentro.", lineas: ["fem-eclaire"] },
    { cliente: "Tomás Paz", tel: "11-4567-8901", fulfillment: "PICKUP", address: null, status: "CONFIRMED", paid: false, medio: null, horario: horarioAR(1, "18:30"), notes: "Por Instagram (@tomipaz). Punto de encuentro: estación Ezeiza. Paga por transferencia.", lineas: ["ver-9pm", "ver-cdn-intense-man"] },
    { cliente: "Carla Méndez", tel: "11-5678-9012", fulfillment: "DELIVERY", address: "Av. Rotta 1200, Ezeiza", status: "READY", paid: true, medio: "TRANSFERENCIA", horario: horarioAR(0, "20:00"), notes: null, lineas: ["fem-sakeena"] },
    { cliente: "Julián Ríos", tel: "11-6789-0123", fulfillment: "PICKUP", address: null, status: "DELIVERED", paid: false, medio: null, horario: null, notes: "Entregado en el punto de encuentro; paga el viernes.", lineas: ["fre-hawas-ice"] },
    { cliente: "Valentina Gómez", tel: "11-7890-1234", fulfillment: "PICKUP", address: null, status: "DELIVERED", paid: true, medio: "EFECTIVO", horario: null, notes: null, lineas: ["dul-liquid-brun", "dul-asad-bourbon"] },
  ];
  let code = 0;
  for (const o of pedidos) {
    const lineas = o.lineas
      .map((c) => de(c))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => ({ tenantId, productId: p.id, name: p.name, saleUnit: "UNIT", quantity: 1, unitPrice: p.price ?? 0, lineTotal: p.price ?? 0 }));
    const subtotal = round2(lineas.reduce((s, l) => s + l.lineTotal, 0));
    code++;
    await prisma.order.create({
      data: {
        tenantId,
        code,
        status: o.status as never,
        channel: "ONLINE" as never,
        fulfillment: o.fulfillment as never,
        customerName: o.cliente,
        customerPhone: o.tel,
        address: o.address,
        scheduledFor: o.horario,
        notes: o.notes,
        subtotal,
        discount: 0,
        total: subtotal,
        paid: o.paid,
        paymentMethod: o.medio as never,
        items: { create: lineas as never },
      },
    });
  }
  log(`pedidos de ejemplo: ${code} (uno por paso del proceso)`);
}

async function cortar(codigo = 0) {
  try {
    next?.kill();
  } catch {}
  try {
    await server?.stop();
  } catch {}
  try {
    await db?.close();
  } catch {}
  process.exit(codigo);
}

async function main() {
  log("base efímera (PGlite en memoria)…");
  db = await PGlite.create();
  await aplicarMigraciones(db);
  server = new PGLiteSocketServer({ db, port: DB_PORT, host: "127.0.0.1", maxConnections: 50 });
  await server.start();

  // Desde acá TODO apunta a la base local, jamás a Neon.
  process.env.DATABASE_URL = DB_URL;
  process.env.RLS_ENFORCEMENT = "off";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });
  const res = await provisionTenant(prisma, {
    name: "Qué Bien Olés",
    slug: "quebienoles",
    blueprint: "perfumeria",
    skipCatalog: true,
    owner: { name: "Qué Bien Olés", email: OWNER_EMAIL, password: OWNER_PASSWORD },
    branding: {
      shortLabel: "Perfumería",
      city: "Ezeiza",
      instagram: "quebienoles",
      hoursLabel: "Pedidos por mensaje",
      contactNote: "Perfumes árabes al mejor precio. Envío o punto de encuentro en Ezeiza.",
    },
    platform: { status: "ACTIVE", plan: "demo" },
  });
  await sembrarCatalogo(prisma, res.tenantId);
  await sembrarCompra(prisma, res.tenantId);
  await sembrarPedidos(prisma, res.tenantId);
  await prisma.$disconnect();

  // --prod: el build ya hecho, sin recarga en caliente (detrás del proxy del panel de Claude el
  // socket de HMR no conecta y el modo dev deja las pantallas en "Cargando…").
  const produccion = process.argv.includes("--prod");
  next = spawn("npx", ["next", produccion ? "start" : "dev", "--port", String(APP_PORT)], {
    cwd: REPO,
    shell: true,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: DB_URL,
      RLS_ENFORCEMENT: "off",
      // PGlite tiene UNA sola sesión para todas las conexiones del socket: con el pool de 5 de
      // siempre, dos consultas en paralelo se pisan la sentencia preparada ("bind message supplies 5
      // parameters, but prepared statement requires 2" en el Inicio). Una conexión las ordena.
      // Es sólo de esta base de juguete: Neon es un Postgres real.
      DB_CONNECTION_LIMIT: "1",
      AUTH_SECRET: "demo-only-secret-not-for-prod-000000000000",
      NODE_ENV: produccion ? "production" : "development",
    },
  });
  next.on("exit", () => cortar(0));
  console.log(`
  QUÉ BIEN OLÉS · demo LOCAL (base efímera, sin Neon)
  Vidriera:  http://localhost:${APP_PORT}/tienda
  Panel:     http://localhost:${APP_PORT}/admin/login   ·   ${OWNER_EMAIL} / ${OWNER_PASSWORD}
  Cortar:    Ctrl-C (la base se borra sola)
`);
}

process.on("SIGINT", () => cortar(0));
process.on("SIGTERM", () => cortar(0));
main().catch((e) => {
  console.error("\x1b[31m[quebienoles-demo] error:\x1b[0m", e);
  cortar(1);
});
