"use server";

// Superficie de Server Actions de la auditoría: SÓLO lectura, y con guarda.
//
// Las funciones que escriben (`audit`, `auditAdmin`, `auditPublic`, `requestIp`) viven en
// `@/lib/audit-core`, que a propósito no lleva `"use server"` — ver el comentario de ese
// archivo. Se re-exportan desde acá NO por conveniencia: `"use server"` obliga a que todo
// export sea una función async, y re-exportarlas las volvería a publicar como endpoint.
// Por eso NO se re-exportan. Quien audite, importa de `@/lib/audit-core`.

import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";

export async function getAuditLog(limit = 100) {
  await requireCapability("audit:read");
  return prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
