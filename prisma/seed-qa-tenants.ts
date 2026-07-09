// ============================================================================
// SEED QA MULTI-TENANT — un tenant demo por RUBRO (piloto multi-tenant).
// ============================================================================
//
// Complementa `seed-magra.ts` (carnicería). Siembra 3 tenants más, cada uno con SU rubro
// correcto: estética/servicios, velas/retail, pádel/deportes. Cada tenant nace con:
//   - `modules` = defaultModulesForBlueprint(rubro)  → la FUENTE CANÓNICA (FU1). Con
//     MODULE_REGISTRY_ENABLED=on, la nav muestra SU rubro (nunca estética en un retail).
//   - `subdomain` seteado (estetica/velas/padel) → resolución por host (TENANT_HOST_MAP).
//   - Datos de ejemplo propios del rubro (retail: catálogo real del rubro + ventas;
//     servicios: turnos).
//   - Login FIJO de QA (autorizado por el dueño, NO secreto): admin@<slug> / ERP, OWNER.
//
// 🔴 SOLO DEV / QA — baranda anti-prod dura. Idempotente: upsert por slug + borrado y
//    re-siembra de los datos de CADA tenant demo. No toca magra-demo (lo maneja seed-magra).
//
// CÓMO SE CORRE (dev):
//   DATABASE_URL="<qa-branch>" npx tsx prisma/seed-qa-tenants.ts
//   (para el piloto completo: correr también `npm run seed:magra`)

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/auth-password";
import { defaultModulesForBlueprint } from "../src/blueprints/presets-meta";
import { getRetailRubro } from "../src/blueprints/retail/rubros";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const ACTOR = "system:seed";
const QA_PASSWORD = "ERP"; // login fijo autorizado (no secreto)
const now = new Date();

/** Borra el usuario OWNER de QA (admin@<slug>) y lo recrea con password ERP. Idempotente. */
async function upsertQaOwner(tenantId: string, slug: string, name: string) {
  const email = `admin@${slug}`;
  await prisma.user.deleteMany({ where: { tenantId, email } });
  await prisma.user.create({
    data: {
      tenantId,
      name,
      email,
      passwordHash: await hashPassword(QA_PASSWORD),
      role: "OWNER",
      active: true,
    },
  });
  return email;
}

/** Upsert del tenant con rubro + modules canónicos + subdomain. */
async function upsertTenant(cfg: {
  slug: string; name: string; blueprintId: string; subdomain: string; accent: string; theme: "light" | "dark";
}) {
  const base = {
    name: cfg.name, profile: "lite" as const, blueprintId: cfg.blueprintId, status: "TRIAL" as const,
    accentPreset: cfg.accent, frontTheme: cfg.theme, subdomain: cfg.subdomain,
    modules: defaultModulesForBlueprint(cfg.blueprintId),
  };
  const t = await prisma.tenant.upsert({ where: { slug: cfg.slug }, update: base, create: { slug: cfg.slug, ...base } });
  return t.id;
}

// ── Retail (velas, pádel): catálogo real del rubro + clientes + ventas de hoy ──────────
async function seedRetail(cfg: { slug: string; name: string; rubro: string; subdomain: string; accent: string }) {
  const tenantId = await upsertTenant({ ...cfg, blueprintId: cfg.rubro, theme: "light" });

  // Reset scoped.
  await prisma.orderItem.deleteMany({ where: { tenantId } });
  await prisma.order.deleteMany({ where: { tenantId } });
  await prisma.product.deleteMany({ where: { tenantId } });
  await prisma.client.deleteMany({ where: { tenantId } });
  await prisma.businessSettings.deleteMany({ where: { tenantId } });

  await prisma.businessSettings.create({
    data: { tenantId, shortLabel: `${cfg.name} · DEMO`, city: "Buenos Aires", contactNote: "DEMO — datos ficticios para QA." },
  });

  const rubro = getRetailRubro(cfg.rubro);
  const items = (rubro?.catalog ?? []).slice(0, 10);
  const products = await Promise.all(
    items.map((it, i) =>
      prisma.product.create({
        data: {
          tenantId,
          name: it.name,
          unit: it.sale === "kg" ? "kg" : "unidades",
          // Forzamos un caso de STOCK BAJO en el primer producto (para el home retail).
          stock: i === 0 ? 2 : it.stock,
          lowStockAt: 5,
          saleUnit: it.sale === "kg" ? "WEIGHT" : "UNIT",
          pricePerKg: it.sale === "kg" ? it.pricePerKg : null,
          price: it.sale === "u" ? it.price : null,
          trackStock: true,
          active: true,
        },
      }),
    ),
  );

  const cliente = await prisma.client.create({ data: { tenantId, name: "Cliente DEMO", phone: "11-5000-0000" } });

  // 2 ventas de HOY (mostrador) → pueblan "Ventas hoy" / "Ingresos hoy".
  let code = 1;
  for (const p of products.slice(0, 2)) {
    const unitPrice = p.saleUnit === "WEIGHT" ? p.pricePerKg ?? 0 : p.price ?? 0;
    const qty = 1;
    const total = Math.round(unitPrice * qty * 100) / 100;
    await prisma.order.create({
      data: {
        tenantId, code: code++, status: "DELIVERED", channel: "COUNTER", fulfillment: "PICKUP",
        clientId: cliente.id, customerName: cliente.name, customerPhone: cliente.phone,
        subtotal: total, discount: 0, total, paymentMethod: "EFECTIVO", paid: true, createdAt: now,
        items: { create: [{ tenantId, name: p.name, saleUnit: p.saleUnit, quantity: qty, unitPrice, lineTotal: total }] },
      },
    });
  }

  const email = await upsertQaOwner(tenantId, cfg.slug, `Dueño — ${cfg.name}`);
  return { slug: cfg.slug, subdomain: cfg.subdomain, rubro: cfg.rubro, modules: defaultModulesForBlueprint(cfg.rubro), email, productos: products.length };
}

// ── Servicios (estética): turnos ────────────────────────────────────────────────────
async function seedServicios(cfg: { slug: string; name: string; subdomain: string; accent: string }) {
  const tenantId = await upsertTenant({ ...cfg, blueprintId: "servicios", theme: "dark" });

  // Reset scoped (appointments antes que sus FKs Restrict).
  await prisma.appointment.deleteMany({ where: { tenantId } });
  await prisma.professional.deleteMany({ where: { tenantId } });
  await prisma.service.deleteMany({ where: { tenantId } });
  await prisma.serviceCategory.deleteMany({ where: { tenantId } });
  await prisma.box.deleteMany({ where: { tenantId } });
  await prisma.client.deleteMany({ where: { tenantId } });
  await prisma.businessSettings.deleteMany({ where: { tenantId } });

  await prisma.businessSettings.create({
    data: { tenantId, shortLabel: `${cfg.name} · DEMO`, city: "Buenos Aires", hoursLabel: "Lun a Sáb 9–20h", contactNote: "DEMO — datos ficticios para QA." },
  });

  const cat = await prisma.serviceCategory.create({ data: { tenantId, name: "Estética", order: 0 } });
  const corte = await prisma.service.create({ data: { tenantId, categoryId: cat.id, name: "Corte y peinado", durationMin: 45, price: 12000 } });
  await prisma.service.create({ data: { tenantId, categoryId: cat.id, name: "Coloración", durationMin: 90, price: 28000 } });
  const box = await prisma.box.create({ data: { tenantId, name: "Box 1" } });
  const profesional = await prisma.professional.create({ data: { tenantId, name: "Ana (DEMO)", boxId: box.id } });
  const cliente = await prisma.client.create({ data: { tenantId, name: "Cliente DEMO", phone: "11-5000-0000" } });

  // 1 turno HOY (a las 15:00 local aprox) → puebla "Turnos hoy" del home servicios.
  const start = new Date(now); start.setHours(15, 0, 0, 0);
  const end = new Date(start.getTime() + 45 * 60 * 1000);
  await prisma.appointment.create({
    data: {
      tenantId, clientId: cliente.id, professionalId: profesional.id, serviceId: corte.id, boxId: box.id,
      startsAt: start, endsAt: end, status: "CONFIRMED", priceAtBooking: 12000,
    },
  });

  const email = await upsertQaOwner(tenantId, cfg.slug, `Dueño — ${cfg.name}`);
  return { slug: cfg.slug, subdomain: cfg.subdomain, rubro: "servicios", modules: defaultModulesForBlueprint("servicios"), email, servicios: 2 };
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (/prod|production|\bmain\b/i.test(url)) {
    throw new Error("seed-qa-tenants: DATABASE_URL parece PRODUCCIÓN/main. Solo dev/QA. Abortado.");
  }
  if (!/dev|qa|preview|staging|localhost|127\.0\.0\.1/i.test(url)) {
    throw new Error("seed-qa-tenants: DATABASE_URL sin marcador dev/qa/preview. Apuntá a la Neon branch de QA. Abortado.");
  }

  const results = [];
  results.push(await seedServicios({ slug: "estetica-demo", name: "Estética DEMO", subdomain: "estetica", accent: "rosa" }));
  results.push(await seedRetail({ slug: "velas-demo", name: "Velas DEMO", rubro: "velas", subdomain: "velas", accent: "ambar" }));
  results.push(await seedRetail({ slug: "padel-demo", name: "Pádel DEMO", rubro: "padel", subdomain: "padel", accent: "verde" }));

  console.log("✔ Tenants QA sembrados (además de magra-demo):");
  for (const r of results) {
    console.log(`  · ${r.slug.padEnd(14)} subdomain=${(r.subdomain).padEnd(9)} rubro=${(r.rubro).padEnd(11)} login=${r.email} / ${QA_PASSWORD}`);
    console.log(`      modules=[${r.modules.join(", ")}]`);
  }
  console.log("  (magra-demo lo siembra `npm run seed:magra`, mismo login admin@magra-demo / ERP.)");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
