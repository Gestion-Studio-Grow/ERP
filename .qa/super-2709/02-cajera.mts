// QA · crea la cajera (RECEPTION) de «Supermercado La Esquina» en la copia del laboratorio, para
// probar que anular un renglón le pide la clave del encargado. Sólo contra erp_super_qa.
//   DATABASE_URL=<dueño de erp_super_qa> CLAVE_CAJERA=... npx tsx .qa/super-2709/02-cajera.mts
import { basePrisma as prisma } from "../../src/lib/prisma-base.ts";
import { hashPassword } from "../../src/lib/auth-password.ts";

if (!/erp_super_qa/.test(process.env.DATABASE_URL ?? "")) throw new Error("sólo contra erp_super_qa");
const clave = process.env.CLAVE_CAJERA;
if (!clave) throw new Error("falta CLAVE_CAJERA");
const t = await prisma.tenant.findUniqueOrThrow({ where: { slug: "super-la-esquina" } });
const email = "cajera@super-la-esquina.test";
await prisma.user.upsert({
  where: { tenantId_email: { tenantId: t.id, email } },
  update: { passwordHash: await hashPassword(clave), active: true, role: "RECEPTION" },
  create: { tenantId: t.id, email, name: "Carla Cajera", role: "RECEPTION", passwordHash: await hashPassword(clave) },
});
console.log("cajera lista");
await prisma.$disconnect();
