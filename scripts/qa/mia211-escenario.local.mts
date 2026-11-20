// MIA-211 · escenario de capturas en la DEMO LOCAL (PGlite de scripts/proyectos/demo-local.mjs). Datos inventados; jamás
// corre contra Neon (guarda de base local). Deja, en el negocio «mia-producciones», lo que producen los arreglos:
//   S1 · una cuota de empresa pagada por la orden «OP 00000099» (Cuentas no ofrece «Anular»).
//   H1 · un cobro de las 11:00 y la orden pagada hoy a la hora real (11:30), en el libro de caja.
//   H2 · un comprobante imputado al proyecto #2, sin pagar, que sale en el cashflow del evento.
//   H4 · la anulación de un cobro del proyecto #2 (con `proyectoPagoId`) en Caja del día.
//   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54338/postgres npx tsx scripts/qa/mia211-escenario.local.mts
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { baseLocalParaSeed } from "../../src/lib/seed/guarda-base";

const guarda = baseLocalParaSeed(process.env.DATABASE_URL);
if (!guarda.ok) throw new Error(`Sólo base local: ${guarda.motivo}`);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }) });
const hoyA = (hhmm: string) => {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  return new Date(`${dia}T${hhmm}:00-03:00`);
};

const t = await prisma.tenant.findFirstOrThrow({ where: { slug: "mia-producciones" }, select: { id: true } });
const tenantId = t.id;
const admin = await prisma.user.findFirstOrThrow({ where: { tenantId, email: "admin@mia-producciones.demo" }, select: { id: true, name: true } });
const proyecto = await prisma.proyecto.findFirstOrThrow({ where: { tenantId, numero: 2 }, select: { id: true, nombre: true } });
// Reentrante: si ya corrió la primera parte (S1 y H1), no la repite.
const previo = await prisma.supplier.findFirst({ where: { tenantId, name: "Sonido Patagonia (ficticio)" }, select: { id: true } });
const proveedor = previo ?? (await prisma.supplier.create({ data: { tenantId, name: "Sonido Patagonia (ficticio)" }, select: { id: true } }));

if (!previo) {
// S1
await prisma.proyectoCuota.create({ data: { tenantId, proyectoId: null, tipo: "PAGO", concepto: "Alquiler del depósito · noviembre", monto: 100_000, moneda: "ARS", venceEl: hoyA("12:00"), auto: false, supplierId: proveedor.id, pagadoEl: hoyA("11:30"), pagadoPor: "OP 00000099", medio: "TRANSFERENCIA" } });

// H1
await prisma.cashMovement.create({ data: { tenantId, type: "INGRESO", method: "TRANSFERENCIA", amount: 1_808_950, reason: `Proyecto #2 · ${proyecto.nombre} · cobro del saldo`, occurredAt: hoyA("11:00"), createdAt: hoyA("11:00"), createdBy: `user:${admin.id}` } });
await prisma.cashMovement.create({ data: { tenantId, type: "EGRESO", method: "TRANSFERENCIA", amount: 350_000, reason: "OP 00000099 · Sonido Patagonia (ficticio)", occurredAt: hoyA("11:30"), createdAt: hoyA("11:30"), createdBy: "sistema:proyecto-gasto:orden-mia211" } });

}

// H2
const comp = await prisma.proyectoComprobante.create({
  data: {
    tenantId, supplierId: proveedor.id, tipo: "A", numero: "0003-00000777", fecha: hoyA("12:00"), moneda: "ARS",
    netoCentavos: 100_000_000n, ivaCentavos: 21_000_000n, totalCentavos: 121_000_000n, cargadoPorId: admin.id, cargadoNombre: admin.name,
  },
  select: { id: true },
});
await prisma.proyectoComprobanteLinea.create({ data: { tenantId, comprobanteId: comp.id, destino: "PROYECTO", proyectoId: proyecto.id, categoria: "Sonido", netoCentavos: 100_000_000n, ivaCentavos: 21_000_000n, ivaTratamiento: "CREDITO", costoCentavos: 100_000_000n } });

// H4
const pago = await prisma.proyectoPago.create({ data: { tenantId, proyectoId: proyecto.id, medio: "TRANSFERENCIA", monto: 500_000 }, select: { id: true } });
await prisma.cashMovement.create({ data: { tenantId, type: "INGRESO", method: "TRANSFERENCIA", amount: 500_000, reason: `Proyecto #2 · ${proyecto.nombre} · seña`, proyectoPagoId: pago.id, occurredAt: hoyA("09:00"), createdBy: `user:${admin.id}` } });
await prisma.cashMovement.create({ data: { tenantId, type: "EGRESO", method: "TRANSFERENCIA", amount: 500_000, reason: `Anulación · Proyecto #2 · ${proyecto.nombre} · seña`, proyectoPagoId: pago.id, occurredAt: hoyA("09:15"), createdBy: `user:${admin.id}` } });

console.log(`listo · ficha: /admin/proyectos/${proyecto.id}?tab=finanzas`);
await prisma.$disconnect();
