// ============================================================================
// SEED de PREVIEW — tenant tipo MAGRA (carnicería/mostrador) para QA en dev branch.
// ============================================================================
//
// Deja listo A UN BOTÓN un tenant de ejemplo tipo Magra para recorrer el QA de Comercio y
// Empresa sobre los MISMOS datos (ver docs/runbooks/qa-preview-empresa-2026-07-08.md).
// Siembra: cortes de carne (precio + costo), ventas, proveedores, 2 compras con cuentas a
// pagar (una con CHEQUE DIFERIDO), fiado (cuentas a cobrar) y un caso de STOCK BAJO para que
// el inventario muestre faltante.
//
// 🔴 SOLO DEV / QA — NUNCA prod. Datos FICTICIOS, tenant marcado "DEMO". Corre contra una
//    Neon dev branch de QA; la baranda dura ABORTA si la URL parece productiva. No toca ARCA
//    real ni cobros reales.
//
// IDEMPOTENTE: upsert del tenant por slug + borrado y re-siembra de SUS datos hijos (estado
// limpio y repetible en cada corrida; re-correr = resetear la demo). No toca otros tenants.
//
// PERFIL: siembra `Tenant.profile` desde `MAGRA_PROFILE` (env), default "lite" (Comercio).
//   Para FLIPEAR a Empresa en QA: re-correr con MAGRA_PROFILE=enterprise (idempotente, ~1s).
//
// CÓMO SE CORRE (dev, manual — NO es parte del publish):
//   DATABASE_URL="<neon-dev-branch>" npx tsx prisma/seed-magra.ts            # Comercio (lite)
//   DATABASE_URL="<neon-dev-branch>" MAGRA_PROFILE=enterprise npx tsx prisma/seed-magra.ts  # Empresa
//   Requiere que las migraciones (incl. Supplier/Collection/AccountPayable/AccountReceivable/
//   DEVOLUCION_PROVEEDOR) estén aplicadas en esa dev branch (`prisma migrate deploy`).

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/auth-password";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SLUG = "magra-demo";
const ACTOR = "system:seed";
// Usuario OWNER para poder ENTRAR al backoffice en el preview (un tenant sin usuario no es
// operable). Credenciales de DEMO, conocidas, SOLO para la dev branch de QA.
const OWNER_EMAIL = "dueno@magra-demo.test";
const OWNER_PASSWORD = "magra1234";
const PROFILE = process.env.MAGRA_PROFILE === "enterprise" ? "enterprise" : "lite";

// Fechas relativas para el aging (calculadas al correr el seed — es un script, no un workflow).
const now = new Date();
const daysFromNow = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);

// Catálogo de cortes (precio de venta por kg + costo de compra ~65%). Un caso con STOCK BAJO.
const CATALOG = [
  { name: "Lomo", pricePerKg: 18900, cost: 12000, stock: 14, low: 5 },
  { name: "Ojo de bife", pricePerKg: 16900, cost: 11000, stock: 18, low: 5 },
  { name: "Bife de chorizo", pricePerKg: 15900, cost: 10300, stock: 20, low: 5 },
  { name: "Asado de tira", pricePerKg: 11500, cost: 7500, stock: 30, low: 8 },
  { name: "Vacío", pricePerKg: 12500, cost: 8100, stock: 2, low: 6 }, // ← STOCK BAJO (2 ≤ 6)
  { name: "Milanesas de nalga", pricePerKg: 12900, cost: 8400, stock: 25, low: 5 },
  { name: "Carne picada especial", pricePerKg: 9500, cost: 6200, stock: 3, low: 10 }, // ← STOCK BAJO
  { name: "Pollo entero", pricePerKg: 4200, cost: 2700, stock: 22, low: 5 },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  // Baranda dura: si la URL parece de PRODUCCIÓN, ABORTAR (esto es QA de dev). Requiere,
  // además, que exista una dev branch explícita: pedimos un marcador dev/qa/preview en la URL
  // para NO correr por accidente contra cualquier base sin ese sello.
  if (/prod|production|\bmain\b/i.test(url)) {
    throw new Error(
      "seed-magra: DATABASE_URL parece PRODUCCIÓN/main. Este seed es SOLO una dev branch de QA. Abortado.",
    );
  }
  if (!/dev|qa|preview|staging|localhost|127\.0\.0\.1/i.test(url)) {
    throw new Error(
      "seed-magra: DATABASE_URL no tiene marcador de entorno dev/qa/preview. Apuntá a la Neon dev branch de QA (no a una base sin sello). Abortado por seguridad.",
    );
  }

  // 1) Tenant (upsert por slug) + perfil desde env.
  const tenant = await prisma.tenant.upsert({
    where: { slug: SLUG },
    update: { name: "Magra — DEMO (carnicería)", profile: PROFILE, blueprintId: "carniceria", status: "TRIAL", accentPreset: "oxblood", frontTheme: "light" },
    create: { slug: SLUG, name: "Magra — DEMO (carnicería)", profile: PROFILE, blueprintId: "carniceria", status: "TRIAL", accentPreset: "oxblood", frontTheme: "light" },
  });
  const tenantId = tenant.id;

  // 2) Borrado de datos hijos de ESTE tenant (FK-safe), para re-sembrar limpio.
  await prisma.collection.deleteMany({ where: { tenantId } });
  await prisma.payableCheque.deleteMany({ where: { tenantId } });
  await prisma.accountPayable.deleteMany({ where: { tenantId } });
  await prisma.accountReceivable.deleteMany({ where: { tenantId } });
  await prisma.orderItem.deleteMany({ where: { tenantId } });
  await prisma.order.deleteMany({ where: { tenantId } });
  await prisma.stockMovement.deleteMany({ where: { tenantId } });
  await prisma.stockPurchaseItem.deleteMany({ where: { tenantId } });
  await prisma.stockPurchase.deleteMany({ where: { tenantId } });
  await prisma.product.deleteMany({ where: { tenantId } });
  await prisma.supplier.deleteMany({ where: { tenantId } });
  await prisma.client.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.businessSettings.deleteMany({ where: { tenantId } });

  // 3) Localización / branding (banda "demo" la da el nombre + status TRIAL).
  await prisma.businessSettings.create({
    data: {
      tenantId,
      shortLabel: "Magra · DEMO",
      addressLine: "Av. Ficticia 1234, Canning",
      city: "Canning, Buenos Aires",
      hoursLabel: "Lun a Sáb 9–20h",
      contactNote: "Carnicería DEMO — datos ficticios para QA.",
    },
  });

  // 4) Productos (cortes por kg, con caso de stock bajo).
  const products = await Promise.all(
    CATALOG.map((c) =>
      prisma.product.create({
        data: {
          tenantId,
          name: c.name,
          unit: "kg",
          stock: c.stock,
          lowStockAt: c.low,
          saleUnit: "WEIGHT",
          pricePerKg: c.pricePerKg,
          price: null,
          trackStock: true,
          active: true,
        },
      }),
    ),
  );
  const bySku = new Map(products.map((p, i) => [CATALOG[i].name, p]));

  // 5) Proveedores (2).
  const frigorifico = await prisma.supplier.create({
    data: { tenantId, name: "Frigorífico El Novillo SA", taxId: "30712345670", phone: "11-4000-0001" },
  });
  const distribuidora = await prisma.supplier.create({
    data: { tenantId, name: "Distribuidora Sur SRL", taxId: "30712345689", phone: "11-4000-0002" },
  });

  // 6) Compras (2) con sus ítems (costo) → alimentan la valuación de inventario.
  const compra1 = await prisma.stockPurchase.create({
    data: {
      tenantId, code: 1, kind: "COMPRA", supplier: frigorifico.name, supplierId: frigorifico.id,
      totalCost: 0, createdBy: ACTOR, createdAt: daysFromNow(-8),
      items: {
        create: [
          { tenantId, name: "Lomo", unit: "kg", quantity: 20, unitCost: 12000, lineTotal: 240000, productId: bySku.get("Lomo")!.id },
          { tenantId, name: "Ojo de bife", unit: "kg", quantity: 25, unitCost: 11000, lineTotal: 275000, productId: bySku.get("Ojo de bife")!.id },
          { tenantId, name: "Asado de tira", unit: "kg", quantity: 40, unitCost: 7500, lineTotal: 300000, productId: bySku.get("Asado de tira")!.id },
        ],
      },
    },
  });
  const compra2 = await prisma.stockPurchase.create({
    data: {
      tenantId, code: 2, kind: "COMPRA", supplier: distribuidora.name, supplierId: distribuidora.id,
      totalCost: 0, createdBy: ACTOR, createdAt: daysFromNow(-4),
      items: {
        create: [
          { tenantId, name: "Milanesas de nalga", unit: "kg", quantity: 30, unitCost: 8400, lineTotal: 252000, productId: bySku.get("Milanesas de nalga")!.id },
          { tenantId, name: "Pollo entero", unit: "kg", quantity: 25, unitCost: 2700, lineTotal: 67500, productId: bySku.get("Pollo entero")!.id },
        ],
      },
    },
  });

  // 7) Usuario OWNER para entrar al backoffice (credenciales de DEMO, solo dev branch).
  await prisma.user.create({
    data: {
      tenantId,
      name: "Dueña — Magra DEMO",
      email: OWNER_EMAIL,
      passwordHash: await hashPassword(OWNER_PASSWORD),
      role: "OWNER",
      active: true,
    },
  });

  // 8) Clientes (2).
  const cliente1 = await prisma.client.create({ data: { tenantId, name: "Rotisería La Esquina", phone: "11-5000-1111" } });
  const cliente2 = await prisma.client.create({ data: { tenantId, name: "Vecina — María G.", phone: "11-5000-2222" } });

  // 8) Ventas / pedidos (2), una pagada, una con cobro parcial.
  const pedido1 = await prisma.order.create({
    data: {
      tenantId, code: 1, status: "DELIVERED", channel: "COUNTER", fulfillment: "PICKUP",
      customerName: "Consumidor final", customerPhone: "-", subtotal: 34000, discount: 0, total: 34000,
      paymentMethod: "EFECTIVO", paid: true, createdAt: daysFromNow(-2),
      items: { create: [{ tenantId, name: "Ojo de bife", saleUnit: "WEIGHT", quantity: 2, unitPrice: 16900, lineTotal: 33800 }] },
    },
  });
  const pedido2 = await prisma.order.create({
    data: {
      tenantId, code: 2, status: "CONFIRMED", channel: "COUNTER", fulfillment: "DELIVERY",
      clientId: cliente1.id, customerName: cliente1.name, customerPhone: cliente1.phone,
      subtotal: 115000, discount: 0, total: 115000, paid: false, createdAt: daysFromNow(-1),
      items: { create: [{ tenantId, name: "Asado de tira", saleUnit: "WEIGHT", quantity: 10, unitPrice: 11500, lineTotal: 115000 }] },
    },
  });
  // Cobro PARCIAL del pedido2 vía Collection (deja saldo pendiente).
  await prisma.collection.create({
    data: { tenantId, originType: "ORDER", originId: pedido2.id, orderId: pedido2.id, amount: 50000, method: "TRANSFERENCIA", note: "Seña", collectedBy: ACTOR },
  });

  // 9) Cuentas a PAGAR (2): una con cheque diferido, una vencida.
  const payable1 = await prisma.accountPayable.create({
    data: {
      tenantId, supplierId: frigorifico.id, amount: 815000, concept: "Factura A 0001-00000123",
      issueDate: daysFromNow(-8), dueDate: daysFromNow(12), status: "OPEN", purchaseId: compra1.id, createdBy: ACTOR,
    },
  });
  // Cheque DIFERIDO entregado para cancelar parte de payable1 (vence en 20 días, aún no acredita).
  await prisma.payableCheque.create({
    data: {
      tenantId, payableId: payable1.id, chequeNumber: "00012345", bank: "Banco Nación",
      amount: 400000, issueDate: daysFromNow(-3), dueDate: daysFromNow(20), status: "DELIVERED",
    },
  });
  const payable2 = await prisma.accountPayable.create({
    data: {
      tenantId, supplierId: distribuidora.id, amount: 319500, concept: "Factura A 0002-00000045",
      issueDate: daysFromNow(-20), dueDate: daysFromNow(-3), status: "OPEN", purchaseId: compra2.id, createdBy: ACTOR, // ← VENCIDA
    },
  });
  // Pago parcial en efectivo de payable2.
  await prisma.collection.create({
    data: { tenantId, originType: "PAYABLE", originId: payable2.id, amount: 100000, method: "EFECTIVO", note: "Pago parcial", collectedBy: ACTOR },
  });

  // 10) Fiado / cuentas a COBRAR (2): una con cobro parcial, una nueva sin cobros.
  const fiado1 = await prisma.accountReceivable.create({
    data: {
      tenantId, clientId: cliente1.id, amount: 115000, concept: "Cuenta corriente — pedido #2",
      issueDate: daysFromNow(-1), dueDate: daysFromNow(14), status: "OPEN", orderId: pedido2.id, createdBy: ACTOR,
    },
  });
  await prisma.collection.create({
    data: { tenantId, originType: "RECEIVABLE", originId: fiado1.id, amount: 40000, method: "EFECTIVO", note: "Entrega a cuenta", collectedBy: ACTOR },
  });
  await prisma.accountReceivable.create({
    data: {
      tenantId, clientId: cliente2.id, amount: 8500, concept: "Fiado de la libreta",
      issueDate: daysFromNow(-5), dueDate: null, status: "OPEN", createdBy: ACTOR, // fiado light (sin vencimiento)
    },
  });

  console.log(
    `✔ Magra DEMO sembrada: slug="${tenant.slug}" profile="${tenant.profile}" (id=${tenantId})\n` +
      `  ${products.length} productos (2 con stock bajo) · 2 proveedores · 2 compras · 2 ventas ` +
      `· 2 cuentas a pagar (1 con cheque diferido, 1 vencida) · 2 fiados (1 con cobro parcial).\n` +
      `  👤 Login backoffice → email: ${OWNER_EMAIL} · contraseña: ${OWNER_PASSWORD} (rol OWNER, DEMO).\n` +
      `  Entrá por el slug "${SLUG}" en el preview. Perfil actual: ${PROFILE === "enterprise" ? "Empresa" : "Comercio"}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
