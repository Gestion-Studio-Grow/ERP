// Quién tiene cargado un CUIT, y si lo verificó (alta web de Factoque, ver alta-web-core.ts:
// «CUIT sin verificar»). Se lee DENTRO de una transacción, parándose en cada negocio (RLS): la
// credencial, la auditoría y los usuarios son filas del negocio. Al terminar deja el negocio vacío:
// quien llama vuelve a pararse donde necesite.

import type { PrismaClient } from "@/generated/prisma/client";
import type { TenedorDelCuit } from "./alta-web-core";

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** Lo que usa `cargarCredencialTenant` y el alta web para ponerse en fila por un CUIT. */
export async function bloquearCuit(tx: Tx, cuit: string): Promise<void> {
  // La MISMA llave que `bloquearCuit` de src/lib/operator-actions.ts y del alta.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`arca-punto-venta:${cuit}`}))`;
}

export async function tenedoresDelCuit(tx: Tx, cuit: string, excluir?: string): Promise<TenedorDelCuit[]> {
  const negocios = await tx.tenant.findMany({
    where: { arcaCuit: cuit, ...(excluir ? { id: { not: excluir } } : {}) },
    select: { id: true, subdomain: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const out: TenedorDelCuit[] = [];
  for (const n of negocios) {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${n.id}, true)`;
    const [credencial, web, titulares] = await Promise.all([
      tx.tenantFiscalCredential.findFirst({ where: { tenantId: n.id, certCuit: cuit }, select: { id: true } }),
      tx.auditLog.findFirst({ where: { tenantId: n.id, action: "factoque.alta", actor: { startsWith: "web:" } }, select: { id: true } }),
      tx.user.findMany({
        where: { tenantId: n.id, role: "OWNER", active: true, deletedAt: null },
        select: { id: true, email: true, lastLoginAt: true },
      }),
    ]);
    out.push({ tenantId: n.id, subdomain: n.subdomain, creado: n.createdAt, verificado: credencial !== null, web: web !== null, titulares });
  }
  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', '', true)`;
  return out;
}
