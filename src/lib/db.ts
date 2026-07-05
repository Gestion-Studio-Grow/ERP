// Conmutador del cliente Prisma según el flag RLS_ENFORCEMENT (ADR-018).
//
//   flag OFF (hoy)  → basePrisma (crudo, rol owner, sin RLS): idéntico a siempre.
//   flag ON (go-live) → rlsPrisma (setea app.current_tenant_id por operación).
//
// El tipo público es el del cliente base, así los ~20 importadores de
// `@/lib/prisma` no ven ninguna diferencia de API (rlsPrisma soporta las mismas
// operaciones de modelo; solo las envuelve). El cast es seguro por eso.

import { basePrisma, RLS_ENFORCEMENT } from "@/lib/prisma-base";
import { rlsPrisma } from "@/lib/rls";

export const prisma: typeof basePrisma = RLS_ENFORCEMENT
  ? (rlsPrisma as unknown as typeof basePrisma)
  : basePrisma;
