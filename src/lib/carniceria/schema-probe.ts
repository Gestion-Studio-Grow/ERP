// ============================================================================
// Probe de schema-ahead — ¿está aplicada la migración carnicería (Gate 2)?
// ============================================================================
//
// `main` auto-deploya. Las tablas/columnas del rubro cárnico (ProductBatch,
// ProcessingRun/Output, Product.category/cost) viven en prisma/pending-gate2/ y NO en
// schema.prisma, para no repetir el schema-ahead que tiró CH. El código las accede por
// SQL crudo (src/lib/carniceria/*-actions.ts); ANTES de mostrar cualquier pantalla nueva
// se pregunta acá si existen. Si no: "En preparación" y cero query → nada rompe en prod
// hasta que el dueño aplique la migración (mismo espíritu que getActiveProfile).
//
// Es una query sobre information_schema (no una tabla de tenant) → no la toca la RLS;
// cacheada por request (react.cache). Cualquier error → false (fail-safe: ocultar).

import { cache } from "react";
import { prisma } from "@/lib/prisma";

export const hasCarniceriaSchema = cache(async (): Promise<boolean> => {
  try {
    const rows = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'ProductBatch'`;
    return Number(rows?.[0]?.n ?? 0) > 0;
  } catch {
    return false;
  }
});
