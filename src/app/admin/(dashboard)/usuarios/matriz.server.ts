// Lo que la matriz de permisos necesita leer además de `getUsers`: las excepciones grabadas de cada
// persona (las 8 casillas, la 1 incluida: `booking:online`). SERVIDOR, sólo con `users:manage`.
//
// Las excepciones viven en `UserPermissionOverride` (Bloque A, migración SIN aplicar: Gate 2). Se
// leen con SQL crudo dentro de `tenantTransaction` (RLS) y con `"tenantId"` explícito, para no
// depender del modelo de Prisma que trae el Bloque A; al integrar puede pasar a
// `tx.userPermissionOverride.findMany`. Si la tabla no existe todavía (prod sin migrar), se lee
// vacío: vale el rol, igual que en la sesión. Cualquier otro error sube.

import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { tenantTransaction } from "@/lib/rls";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { logger } from "@/lib/logger";
import type { PermisoOverride } from "@/lib/capabilities";

function faltaLaTabla(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (e.code === "P2021") return true;
  // En SQL crudo, la tabla ausente llega como P2010 con el código de Postgres 42P01.
  return e.code === "P2010" && /42P01|does not exist/.test(`${JSON.stringify(e.meta ?? {})} ${e.message}`);
}

export type DatosDeLaMatriz = {
  overrides: Map<string, PermisoOverride[]>;
  /** `false` = la tabla de excepciones todavía no está en la base: la matriz se ve, pero no graba. */
  conTabla: boolean;
};

export async function cargarDatosDeLaMatriz(): Promise<DatosDeLaMatriz> {
  await requireCapability("users:manage");
  const tenantId = await getCurrentTenantId();

  const overrides = new Map<string, PermisoOverride[]>();
  try {
    const filas = await tenantTransaction(
      (tx) =>
        tx.$queryRaw<{ userId: string; capability: string; allowed: boolean }[]>(Prisma.sql`
          SELECT "userId", "capability", "allowed" FROM "UserPermissionOverride"
          WHERE "tenantId" = ${tenantId}`),
      { tenantId },
    );
    for (const f of filas) {
      const lista = overrides.get(f.userId) ?? [];
      lista.push({ capability: f.capability, allowed: f.allowed });
      overrides.set(f.userId, lista);
    }
    return { overrides, conTabla: true };
  } catch (e) {
    if (!faltaLaTabla(e)) throw e;
    logger.warn("permisos", "la tabla UserPermissionOverride no está en la base: rige el rol");
    return { overrides, conTabla: false };
  }
}
