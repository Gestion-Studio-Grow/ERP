// ============================================================================
// ¿JORNADA REAL O DEMO? — qué reloj abre /admin/club para este negocio. PURO.
// ============================================================================
//
// Para los negocios de `NEGOCIOS_CON_JORNADA_REAL`, /admin/club abre la jornada real (hora de este equipo, una pestaña
// por equipo, guardada en la base del ERP); la demo queda en `?demo=1`, como en el club vanilla. Break Point entra el
// 18/10/2026 como prueba gratis en el plan actual (decisión del dueño, G12 en docs/tenants/breakpoint/PARIDAD-REACT.md).
// En el sandbox de preventa (`isDemoSandbox`) nunca se abre la jornada real. Es la llave del corte, no una opción para
// el usuario. Vive aparte de page.tsx para probarla sin servidor (jornada-del-club-core.test.ts).
//
// — Elaborado por GSG

export const NEGOCIOS_CON_JORNADA_REAL: readonly string[] = ["breakpoint"];

export type RelojDelClub = "real" | "demo";

/**
 * `slug`: el negocio de la sesión (null si no se resolvió: demo). `sandbox`: el sandbox de preventa. `demo`: el
 * `?demo=` de la URL tal como llega (sólo "1" pide la demo).
 */
export function relojDelClub({ slug, sandbox, demo }: { slug: string | null; sandbox: boolean; demo: string | string[] | undefined }): RelojDelClub {
  if (sandbox || demo === "1") return "demo";
  return NEGOCIOS_CON_JORNADA_REAL.includes(slug ?? "") ? "real" : "demo";
}
