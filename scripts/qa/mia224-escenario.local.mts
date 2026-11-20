// MIA-224 · escenario de capturas en la DEMO LOCAL (PGlite de scripts/proyectos/demo-local.mjs). Datos inventados; jamás
// corre contra Neon (guarda de base local). El proyecto #2 cobra una seña y se pierde: D1 (Rentabilidad sin el perdido)
// y D3 («Avance de cobro» contra la venta original).
//   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54338/postgres npx tsx scripts/qa/mia224-escenario.local.mts
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { baseLocalParaSeed } from "../../src/lib/seed/guarda-base";

const guarda = baseLocalParaSeed(process.env.DATABASE_URL);
if (!guarda.ok) throw new Error(`Sólo base local: ${guarda.motivo}`);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }) });
const t = await prisma.tenant.findFirstOrThrow({ where: { slug: "mia-producciones" }, select: { id: true } });
const tenantId = t.id;
const p = await prisma.proyecto.findFirstOrThrow({ where: { tenantId, numero: 2 }, select: { id: true, nombre: true } });
await prisma.proyectoPago.create({ data: { tenantId, proyectoId: p.id, medio: "TRANSFERENCIA", monto: 500_000, nota: "Seña (escenario MIA-224)", cobradoPor: "Demo" } });
// Perder como lo deja `regenerarCuotasTx` (D2): se anulan los cobros pendientes; las cuotas al proveedor siguen.
await prisma.proyecto.update({ where: { id: p.id }, data: { perdidoEl: new Date(), motivoPerdida: "Eligió otro proveedor (escenario)" } });
await prisma.proyectoCuota.updateMany({ where: { tenantId, proyectoId: p.id, tipo: "COBRO", pagadoEl: null, anuladoEl: null }, data: { anuladoEl: new Date() } });
console.log(`#2 ${p.nombre}: seña cobrada y perdido → /admin/proyectos/${p.id}`);
await prisma.$disconnect();
