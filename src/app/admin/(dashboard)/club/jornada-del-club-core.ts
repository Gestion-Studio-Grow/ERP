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

// «wpe-pruebas» (nombre provisional a confirmar): el ambiente de pruebas de WPE con la administración del club guardada
// en la base, como un cliente real (orden del dueño, 16/11/2026, GSG-PLAT-016). Su jornada es SUYA (la foto va por
// negocio: entidad `ClubEstado` con su tenantId); no toca la de Break Point.
export const NEGOCIOS_CON_JORNADA_REAL: readonly string[] = ["breakpoint", "wpe-pruebas"];

export type RelojDelClub = "real" | "demo";

/** Un dueño de arranque de la jornada real (la forma de `Usuario` del motor del club, sin PIN). */
export interface DuenioDeArranque {
  id: string;
  nombre: string;
  rol: "duenio";
  pin: "";
  activo: true;
}

// Los dueños con que arranca la jornada real de cada negocio, si no son los de Break Point (los del motor;
// los cambia `clubRealEnBlanco` en almacen.ts, porque el motor es una copia sellada).
// wpe-pruebas: un dueño de prueba (nombre provisional a confirmar); nunca los nombres de otro cliente.
const DUENIOS_DE_ARRANQUE: Readonly<Record<string, readonly DuenioDeArranque[]>> = {
  "wpe-pruebas": [{ id: "u-duenio", nombre: "Dueño de prueba", rol: "duenio", pin: "", activo: true }],
};

/** Los dueños de arranque del negocio; `undefined` = los de siempre (Break Point). */
export function dueniosDelClub(slug: string): readonly DuenioDeArranque[] | undefined {
  return Object.hasOwn(DUENIOS_DE_ARRANQUE, slug) ? DUENIOS_DE_ARRANQUE[slug] : undefined;
}

/**
 * `slug`: el negocio de la sesión (null si no se resolvió: demo). `sandbox`: el sandbox de preventa. `demo`: el
 * `?demo=` de la URL tal como llega (sólo "1" pide la demo).
 */
export function relojDelClub({ slug, sandbox, demo }: { slug: string | null; sandbox: boolean; demo: string | string[] | undefined }): RelojDelClub {
  if (sandbox || demo === "1") return "demo";
  return NEGOCIOS_CON_JORNADA_REAL.includes(slug ?? "") ? "real" : "demo";
}
