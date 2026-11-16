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

/** Un dueño de arranque de la jornada real (la forma de `Usuario` del motor del club, sin PIN). */
export interface DuenioDeArranque {
  id: string;
  nombre: string;
  rol: "duenio";
  pin: "";
  activo: true;
}

/** Una cancha de arranque (la forma de `Cancha` del motor del club). */
export interface CanchaDeArranque {
  id: string;
  nombre: string;
  cubierta: boolean;
  panoramica: boolean;
  estado: "ok";
}

/**
 * Con qué arranca la jornada real de un negocio que NO es Break Point: su nombre, sus canchas, sus dueños y sin los
 * productos ni precios de lista de otro cliente (los carga el dueño). Lo que no se pisa queda como en el motor.
 */
export interface ArranqueDelClub {
  nombre: string;
  canchas: readonly CanchaDeArranque[];
  duenios: readonly DuenioDeArranque[];
}

// wpe-pruebas = «Gran Willy» (dato del dueño, 16/11/2026: «se llama gran willy», «7 canchas»). Las canchas se llaman
// C1…C7, como en el torneo de WPE («Gran Willy · C1»), para que torneo y club coincidan. Cubierta/panorámica y el
// dueño: provisionales a confirmar (no se inventan: van en falso y el dueño los corrige en Configuración).
const GRAN_WILLY: ArranqueDelClub = {
  nombre: "Gran Willy",
  canchas: Array.from({ length: 7 }, (_, i) => ({ id: `c${i + 1}`, nombre: `C${i + 1}`, cubierta: false, panoramica: false, estado: "ok" as const })),
  duenios: [{ id: "u-duenio", nombre: "Dueño de prueba", rol: "duenio", pin: "", activo: true }],
};

const ARRANQUES: Readonly<Record<string, ArranqueDelClub>> = { "wpe-pruebas": GRAN_WILLY };

/** El arranque del negocio; `undefined` = el de siempre (Break Point, el del motor). */
export function arranqueDelClub(slug: string): ArranqueDelClub | undefined {
  return Object.hasOwn(ARRANQUES, slug) ? ARRANQUES[slug] : undefined;
}

/**
 * `slug`: el negocio de la sesión (null si no se resolvió: demo). `sandbox`: el sandbox de preventa. `demo`: el
 * `?demo=` de la URL tal como llega (sólo "1" pide la demo).
 */
export function relojDelClub({ slug, sandbox, demo }: { slug: string | null; sandbox: boolean; demo: string | string[] | undefined }): RelojDelClub {
  if (sandbox || demo === "1") return "demo";
  // Un negocio con arranque propio (`arranqueDelClub`: wpe-pruebas, el ambiente de pruebas de WPE, GSG-PLAT-016) también
  // abre la jornada real, con SU foto en la base (entidad `ClubEstado` con su tenantId); no toca la de Break Point.
  return NEGOCIOS_CON_JORNADA_REAL.includes(slug ?? "") || arranqueDelClub(slug ?? "") !== undefined ? "real" : "demo";
}
