// ============================================================================
// ¿ESTA CLAVE ABRE ESTE NEGOCIO? — sólo lectura, para diagnosticar un ingreso rechazado.
// ============================================================================
//
//   DATABASE_URL=<base> INMO_SLUG=<slug> INMO_EMAIL=<mail> INMO_CLAVE=<clave> npx tsx scripts/inmobiliaria/verificar-ingreso.ts
//
// No imprime la clave ni el hash: dice si el usuario existe, si está activo y si la clave coincide
// con el hash guardado, con la misma función que usa el ingreso del panel.

import "dotenv/config";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { verifyPassword } from "../../src/lib/auth-password";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }) });

async function main() {
  const slug = process.env.INMO_SLUG ?? "pdcinmobiliaria";
  const email = (process.env.INMO_EMAIL ?? "").trim().toLowerCase();
  const clave = process.env.INMO_CLAVE ?? "";
  const t = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, subdomain: true, status: true, blueprintId: true, modules: true } });
  console.log("negocio:", t ? { subdominio: t.subdomain, estado: t.status, rubro: t.blueprintId, modulos: t.modules } : "NO EXISTE");
  if (!t) return;
  const usuarios = await prisma.user.findMany({ where: { tenantId: t.id }, select: { email: true, role: true, active: true, deletedAt: true, passwordHash: true } });
  for (const u of usuarios) {
    const coincide = u.email === email && clave ? await verifyPassword(clave, u.passwordHash) : null;
    console.log(`${u.email} · ${u.role} · activo: ${u.active} · borrado: ${u.deletedAt ? "sí" : "no"} · clave coincide: ${coincide === null ? "(no probada)" : coincide}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
