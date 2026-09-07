// Conmutador del cliente Prisma según el flag RLS_ENFORCEMENT (ADR-018).
//
//   flag OFF → basePrisma (rol dueño de las tablas, EXENTO de RLS) + candado de tenant.
//   flag ON  → rlsPrisma (setea app.current_tenant_id por operación) + candado adentro.
//
// El flag no dice en qué estado está la app: el valor real vive en el entorno de
// Vercel. Para saberlo: `prisma/rls/check-rls-live.mjs` contra la base.
//
// EL CANDADO DE TENANT (src/lib/tenant-scope.ts) VA EN LAS DOS RAMAS, porque las dos
// murallas fallan distinto: RLS se cae si la conexión usa un rol exento o el flag está
// en off; el candado de la app se cae si alguien importa `basePrisma` a mano.
//
// Se enchufa asimétrico a propósito:
//   * Rama OFF: extensión por fuera del cliente crudo — funciona y es lo más simple.
//   * Rama ON: NO se envuelve acá. `rlsPrisma` re-despacha cada operación sobre el
//     cliente crudo dentro de su transacción, así que una extensión por fuera se
//     saltea en silencio (medido: 3 de 6 ataques cross-tenant volvían a pasar). El
//     candado vive adentro de `rls.ts`, sobre el `tx`.
// La prueba de las dos ramas es `prisma/rls/aislamiento-capa-app.ts`.
//
// El tipo público es el del cliente base, así los importadores de `@/lib/prisma` no
// ven ninguna diferencia de API (las dos ramas soportan las mismas operaciones de
// modelo; sólo las envuelven). El cast es seguro por eso.

import { basePrisma, RLS_ENFORCEMENT } from "@/lib/prisma-base";
import { rlsPrisma } from "@/lib/rls";
import { withTenantScope } from "@/lib/tenant-scope";

export const prisma: typeof basePrisma = RLS_ENFORCEMENT
  ? (rlsPrisma as unknown as typeof basePrisma)
  : (withTenantScope(basePrisma) as unknown as typeof basePrisma);
