import { prisma } from "@/lib/prisma";

// Resolución del tenant actual — G1 (ADR-010 / ADR-001).
//
// HOY: hay un único tenant (Beauty & Spa). El aislamiento es a nivel de
// aplicación: cada create escribe `tenantId` y (a futuro) cada read filtra por
// él. Con un solo tenant no hay leak cross-tenant posible, así que RLS de
// Postgres se difiere hasta el 2º tenant (ver nota en schema.prisma / ADR-010).
//
// MAÑANA (2º tenant): este es el único punto que cambia. Acá se leerá el tenant
// de la sesión / subdominio, y se activará RLS envolviendo cada operación en una
// transacción con `SET LOCAL app.current_tenant_id = ...` (seguro con pooling).
// El resto del código ya pasa por getCurrentTenantId(), así que no se toca.

let cachedTenantId: string | null = null;

export async function getCurrentTenantId(): Promise<string> {
  if (cachedTenantId) return cachedTenantId;
  const tenant = await prisma.tenant.findFirstOrThrow({
    orderBy: { createdAt: "asc" },
  });
  cachedTenantId = tenant.id;
  return tenant.id;
}
