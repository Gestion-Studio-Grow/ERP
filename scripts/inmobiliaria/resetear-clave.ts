// ============================================================================
// NUEVA CLAVE PARA UN USUARIO DE UN NEGOCIO — por orden del dueño.
// ============================================================================
//
//   DATABASE_URL=<base> INMO_SLUG=<slug> INMO_EMAIL=<mail> npx tsx scripts/inmobiliaria/resetear-clave.ts
//
// Sortea una clave fuerte con la misma función del alta, la guarda hasheada con la misma función
// del ingreso, la verifica contra lo guardado y la muestra UNA sola vez. No queda en claro en
// ningún lado. El usuario debería cambiarla al entrar.

import "dotenv/config";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { generateStrongPassword, hashPassword, verifyPassword } from "../../src/lib/auth-password";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }) });

async function main() {
  const slug = process.env.INMO_SLUG ?? "pdcinmobiliaria";
  const email = (process.env.INMO_EMAIL ?? "").trim().toLowerCase();
  if (!email) throw new Error("Falta INMO_EMAIL.");
  const t = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!t) throw new Error(`No existe el negocio "${slug}".`);
  const u = await prisma.user.findUnique({ where: { tenantId_email: { tenantId: t.id, email } }, select: { id: true, role: true } });
  if (!u) throw new Error(`No existe ${email} en ${slug}.`);
  const clave = generateStrongPassword();
  const passwordHash = await hashPassword(clave);
  await prisma.user.updateMany({ where: { id: u.id, tenantId: t.id }, data: { passwordHash } });
  const guardado = await prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { passwordHash: true } });
  if (!(await verifyPassword(clave, guardado.passwordHash))) throw new Error("La clave guardada no verifica: no se entrega.");
  console.log(`✅ ${email} (${u.role}) en ${slug} · clave nueva (se muestra UNA vez): ${clave}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
