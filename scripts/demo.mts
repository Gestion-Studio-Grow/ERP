// Demo local a costo 0 — `npm run demo`.
//
// QUÉ HACE: levanta el ERP completo contra una base **efímera en memoria**
// (PGlite = Postgres 16 en WASM, sin servidor ni instalación) servida por un
// socket local, siembra el tenant `magra` (carnicería premium) con catálogo y
// pedidos de ejemplo, y arranca `next dev`. Todo local: NO toca Neon ni prod,
// no gasta un centavo, no deja residuo (la base vive en RAM y muere al cortar).
//
// POR QUÉ ASÍ: el código de la app se conecta por `DATABASE_URL` vía el driver
// `pg` (adapter-pg). PGlite-socket expone la base embebida como un Postgres
// normal en `localhost`, así que la app corre SIN un solo cambio de código —
// solo apuntando `DATABASE_URL` al socket. Ver `DEMO.md` para el guion.
//
// RUNTIME: tsx (mismo runtime que `npm run seed`). Uso: `npm run demo`.

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { provisionTenant } from "./provision-tenant";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PORT = 54321;
const DB_URL = `postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`;
const OWNER_EMAIL = "dueno@magra.demo";
const OWNER_PASSWORD = "magra1234";

// Precio de venta vigente según cómo se vende (kg → precio/kg; unidad → precio).
const sellPrice = (p: { saleUnit: string; price: number | null; pricePerKg: number | null }) =>
  (p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price) ?? 0;
const round2 = (n: number) => Math.round(n * 100) / 100;

let db: PGlite | undefined;
let server: PGLiteSocketServer | undefined;
let next: ChildProcess | undefined;

function log(msg: string) {
  console.log(`\x1b[36m[demo]\x1b[0m ${msg}`);
}

async function applyMigrations(pg: PGlite) {
  const dir = path.join(REPO, "prisma", "migrations");
  const migs = readdirSync(dir).filter((d) => !d.startsWith("migration_lock")).sort();
  let n = 0;
  for (const m of migs) {
    let sql: string;
    try {
      sql = readFileSync(path.join(dir, m, "migration.sql"), "utf8");
    } catch {
      continue;
    }
    await pg.exec(sql);
    n++;
  }
  log(`migraciones aplicadas in-process: ${n}`);
}

// Proveedores + una COMPRA con costos reales (media res / línea), directo por Prisma.
// Da de qué valuar el inventario y de qué calcular el MARGEN por corte (el panel lee el
// último `unitCost` de `StockPurchaseItem`). Sin esto todo sale "sin costo" — poco demo.
// Costos ~63–68 % del precio de venta (realista para carnicería). Local, efímero.
async function seedPurchases(prisma: PrismaClient, tenantId: string) {
  const prods = await prisma.product.findMany({
    where: { tenantId },
    select: { id: true, name: true, pricePerKg: true, price: true, saleUnit: true },
  });
  const pick = (needle: string) => prods.find((p) => p.name.toLowerCase().includes(needle));

  // Proveedores reales de MAGRA (de su web).
  const donRamon = await prisma.supplier.create({
    data: { tenantId, name: "Estancia Don Ramón", taxId: "30-71234567-0", phone: "11-4000-1001" },
  });
  const paladini = await prisma.supplier.create({
    data: { tenantId, name: "Paladini", taxId: "30-50012345-6", phone: "11-4000-1002" },
  });

  // Costo por corte (ARS/kg o ARS/u). Realista: ~63–68 % del precio de venta.
  const costs: { needle: string; cost: number }[] = [
    { needle: "lomo", cost: 12200 },
    { needle: "ojo de bife", cost: 11000 },
    { needle: "bife de chorizo", cost: 10300 },
    { needle: "entraña", cost: 11800 },
    { needle: "cuadril", cost: 8300 },
    { needle: "asado de tira", cost: 7400 },
    { needle: "vacío", cost: 8100 },
    { needle: "picada", cost: 6200 },
    { needle: "bondiola", cost: 7000 },
    { needle: "pechuga de pollo", cost: 5700 },
  ];

  const supplierFor = (name: string) =>
    /cerdo|bondiola|pollo|pechuga/i.test(name) ? paladini : donRamon;

  const items = costs
    .map(({ needle, cost }) => {
      const p = pick(needle);
      if (!p) return null;
      const qty = 20;
      return {
        tenantId,
        productId: p.id,
        name: p.name,
        unit: p.saleUnit === "WEIGHT" ? "kg" : "u",
        quantity: qty,
        unitCost: cost,
        lineTotal: round2(qty * cost),
        _supplier: supplierFor(p.name),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Dos compras (una por proveedor) para que la valuación tenga procedencia clara.
  let code = 0;
  for (const supplier of [donRamon, paladini]) {
    const mine = items.filter((it) => it._supplier.id === supplier.id);
    if (mine.length === 0) continue;
    code++;
    const totalCost = round2(mine.reduce((s, it) => s + it.lineTotal, 0));
    await prisma.stockPurchase.create({
      data: {
        tenantId,
        code,
        kind: "COMPRA",
        supplier: supplier.name,
        supplierId: supplier.id,
        totalCost,
        createdBy: "system:demo",
        items: {
          create: mine.map(({ _supplier, ...it }) => it),
        },
      },
    });
  }
  log(`proveedores + compras sembradas: 2 (${items.length} cortes con costo)`);
}

// Pedidos de ejemplo (venta real de carnicería), directo por Prisma. Snapshot de
// precio y correlativo por tenant, igual criterio que la acción real del POS.
async function seedOrders(prisma: PrismaClient, tenantId: string) {
  const prods = await prisma.product.findMany({
    where: { tenantId },
    select: { id: true, name: true, saleUnit: true, price: true, pricePerKg: true },
  });
  const pick = (needle: string) => prods.find((p) => p.name.toLowerCase().includes(needle));

  type Line = { p?: (typeof prods)[number]; qty: number };
  const orders: {
    customerName: string;
    customerPhone: string;
    channel: "COUNTER" | "ONLINE";
    fulfillment: "PICKUP" | "DELIVERY";
    address: string | null;
    status: string;
    paid: boolean;
    paymentMethod: string | null;
    lines: Line[];
  }[] = [
    {
      customerName: "Mostrador",
      customerPhone: "—",
      channel: "COUNTER",
      fulfillment: "PICKUP",
      address: null,
      status: "DELIVERED",
      paid: true,
      paymentMethod: "EFECTIVO",
      lines: [{ p: pick("asado de tira"), qty: 1.5 }, { p: pick("vacío"), qty: 0.8 }],
    },
    {
      customerName: "Sofía Ramírez",
      customerPhone: "11-5544-2210",
      channel: "ONLINE",
      fulfillment: "PICKUP",
      address: null,
      status: "READY",
      paid: false,
      paymentMethod: null,
      lines: [{ p: pick("bife de chorizo"), qty: 1.2 }, { p: pick("chorizo parrillero"), qty: 1 }],
    },
    {
      customerName: "Javier Molina",
      customerPhone: "11-6677-8890",
      channel: "ONLINE",
      fulfillment: "DELIVERY",
      address: "Av. Canning 1234, Canning",
      status: "PENDING",
      paid: false,
      paymentMethod: null,
      lines: [{ p: pick("pollo entero"), qty: 2 }, { p: pick("carne picada"), qty: 1 }],
    },
  ];

  let code = 0;
  for (const o of orders) {
    const lines = o.lines
      .filter((l): l is { p: (typeof prods)[number]; qty: number } => Boolean(l.p))
      .map((l) => {
        const unitPrice = sellPrice(l.p);
        return {
          tenantId,
          productId: l.p.id,
          name: l.p.name,
          saleUnit: l.p.saleUnit,
          quantity: l.qty,
          unitPrice,
          lineTotal: round2(l.qty * unitPrice),
        };
      });
    if (lines.length === 0) continue;
    const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
    code++;
    await prisma.order.create({
      data: {
        tenantId,
        code,
        status: o.status as never,
        channel: o.channel as never,
        fulfillment: o.fulfillment as never,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        address: o.address,
        subtotal,
        discount: 0,
        total: subtotal,
        paid: o.paid,
        paymentMethod: o.paymentMethod as never,
        items: { create: lines as never },
      },
    });
  }
  log(`pedidos de ejemplo sembrados: ${code}`);
}

async function shutdown(codeExit = 0) {
  try {
    next?.kill();
  } catch {}
  try {
    await server?.stop();
  } catch {}
  try {
    await db?.close();
  } catch {}
  process.exit(codeExit);
}

async function main() {
  log("levantando base efímera (PGlite en memoria)…");
  db = await PGlite.create();
  await applyMigrations(db);

  // maxConnections > 1: el default de pglite-socket es 1 y rechazaría el pool de
  // `pg` (la app dispara queries concurrentes, p. ej. getStorefront hace Promise.all).
  // Las queries igual se serializan en una cola interna (transaction-safe).
  server = new PGLiteSocketServer({ db, port: DB_PORT, host: "127.0.0.1", maxConnections: 50 });
  await server.start();
  log(`socket Postgres local en ${DB_PORT}`);

  // A partir de acá TODO apunta a la base local, jamás a Neon.
  process.env.DATABASE_URL = DB_URL;
  process.env.RLS_ENFORCEMENT = "off";

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });
  log("sembrando tenant `magra` (carnicería) + OWNER + catálogo…");
  const res = await provisionTenant(prisma, {
    name: "Magra — Carnicería Premium",
    slug: "magra",
    blueprint: "carniceria",
    owner: { name: "Dueño Magra", email: OWNER_EMAIL, password: OWNER_PASSWORD },
    branding: {
      shortLabel: "Magra",
      city: "Canning",
      addressLine: "Av. Canning 1234",
      whatsapp: "11-6677-8890",
      hoursLabel: "Lun a sáb · 9 a 20 h",
      contactNote: "Envasado al vacío · delivery en el día",
    },
    platform: { status: "ACTIVE", plan: "demo" },
  });
  await seedPurchases(prisma, res.tenantId);
  await seedOrders(prisma, res.tenantId);
  await prisma.$disconnect();

  log("arrancando la app (next dev)…");
  next = spawn("npx", ["next", "dev"], {
    cwd: REPO,
    shell: true,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: DB_URL,
      RLS_ENFORCEMENT: "off",
      AUTH_SECRET: "demo-only-secret-not-for-prod-000000000000",
      ARCA_INVOICING_ENABLED: "true",
      NODE_ENV: "development",
    },
  });
  next.on("exit", () => shutdown(0));

  console.log(`
\x1b[32m========================================================\x1b[0m
  DEMO MAGRA lista  ·  base LOCAL efímera  ·  costo 0  ·  sin Neon
\x1b[32m========================================================\x1b[0m
  Vidriera (cliente):   http://localhost:3000/tienda
  Backoffice / Caja:    http://localhost:3000/admin/login
     email:    ${OWNER_EMAIL}
     password: ${OWNER_PASSWORD}

  Guion paso a paso:    DEMO.md
  Cortar la demo:       Ctrl-C  (la base se borra sola)
\x1b[32m========================================================\x1b[0m
`);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
main().catch((e) => {
  console.error("\x1b[31m[demo] error:\x1b[0m", e);
  shutdown(1);
});
