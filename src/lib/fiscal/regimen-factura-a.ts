// Qué Factura A le asignó ARCA a un Responsable Inscripto (RG 1575): las tres clases que ya modela la
// decisión del comprobante (decidir-comprobante.ts, `RegimenFacturaA`). Sin el dato, cada A pasa por
// revisión; con «A» la emite el sistema; con «A con leyenda» o «M» se deriva a ARCA.
//
// SIN COLUMNA hasta la ventana M1 (BACKLOG): el dato vive como fila del registro del propio negocio
// (ACCION_REGIMEN_FACTURA_A), la más nueva manda, y SÓLO cuenta si la escribió Soporte GSG (actor
// «operator:…»). Mismo patrón que la categoría del monotributo. PURO.
//
// La entidad es PROPIA («RegimenFacturaA») y está en PURGE_EXEMPT_ENTITIES (audit-retention.ts):
// refutador 26/09. Con «Tenant», la purga de los 18 meses la borraba y el inscripto volvía a «sin
// cargar» sin aviso: toda Factura A pasaba a revisión. Es un dato maestro fiscal, no un rastro.
import type { RegimenFacturaA } from "./decidir-comprobante";

export const REGIMENES_FACTURA_A: readonly RegimenFacturaA[] = ["A", "A_CON_LEYENDA", "M"];

export const NOMBRE_REGIMEN_FACTURA_A: Readonly<Record<RegimenFacturaA, string>> = {
  A: "A común",
  A_CON_LEYENDA: "A con leyenda (por ejemplo, «Operación sujeta a retención»)",
  M: "M",
};

/**
 * Las clases que el sistema todavía NO emite: `decidirComprobante` deriva esas facturas al sitio de ARCA
 * (decidir-comprobante.ts, motivos FACTURA_A_CON_LEYENDA y FACTURA_M). QA vuelta 7, bloqueante 1: Soporte
 * las elegía como si fueran «A común» y el negocio se enteraba al facturar. Emitirlas: BACKLOG.
 */
export const REGIMENES_FUERA_DEL_SISTEMA: readonly RegimenFacturaA[] = ["A_CON_LEYENDA", "M"];
export type RegimenFueraDelSistema = "A_CON_LEYENDA" | "M";

export function seEmiteFueraDelSistema(r: RegimenFacturaA | null | undefined): r is RegimenFueraDelSistema {
  return r === "A_CON_LEYENDA" || r === "M";
}

/** La casilla con que Soporte confirma que el cliente y la contadora lo saben (configurador y ficha). */
export const CAMPO_CONFIRMA_FACTURA_A_FUERA = "confirmaFacturaAFuera";
export const TEXTO_CONFIRMA_FACTURA_A_FUERA = "Se lo avisé al cliente y a la contadora";

const FACTURAS_FUERA: Readonly<Record<RegimenFueraDelSistema, string>> = {
  A_CON_LEYENDA: "Facturas A con leyenda",
  M: "Facturas M",
};

/** Lo que Soporte lee al elegir «A con leyenda» o «M» (configurador y ficha). PURA. */
export function avisoFacturaAFuera(r: RegimenFueraDelSistema): string {
  const suyas = r === "M" ? "sus Facturas M" : "sus Facturas A";
  return (
    `Con «${r === "M" ? "M" : "A con leyenda"}», el sistema todavía no emite ${suyas}: el cliente las hace en el sitio de ARCA ` +
    "(son las que van a un Responsable Inscripto o a un monotributista). No entran solas a su Libro IVA ni al paquete del estudio: " +
    "la contadora las suma desde «Mis Comprobantes» de ARCA. Las Facturas B sí salen del sistema."
  );
}

/** El renglón «A revisar» del Libro IVA (pantalla, CSV y paquete del estudio), o null. PURA. */
export function avisoDelLibroFacturaAFuera(r: RegimenFacturaA | null | undefined): string | null {
  if (!seEmiteFueraDelSistema(r)) return null;
  return (
    `A revisar: ARCA le asignó ${r === "M" ? "Factura M" : "Factura A con leyenda"} y el sistema todavía no la emite. ` +
    "Las que se hicieron en el sitio de ARCA no están acá: el débito fiscal de este libro no las incluye. " +
    "Sumalas desde «Mis Comprobantes › Emitidos» de ARCA."
  );
}

/** La línea de «Pasale esto» para el dueño, o null. PURA. */
export function lineaDelDuenioFacturaAFuera(r: RegimenFacturaA | null | undefined): string | null {
  if (!seEmiteFueraDelSistema(r)) return null;
  return `Por ahora, tus ${FACTURAS_FUERA[r]} hacelas en el sitio de ARCA: el sistema todavía no las emite. Las Facturas B, desde el sistema.`;
}

export const ACCION_REGIMEN_FACTURA_A = "fiscal.regimen_factura_a";
export const ENTIDAD_REGIMEN_FACTURA_A = "RegimenFacturaA";
const ACTOR_SOPORTE = "operator:";

export function esRegimenFacturaA(x: unknown): x is RegimenFacturaA {
  return typeof x === "string" && (REGIMENES_FACTURA_A as readonly string[]).includes(x);
}

/**
 * En el configurador y en la ficha: obligatorio para todo Responsable Inscripto; para el resto no
 * corresponde. «A con leyenda» y «M» piden además `confirmaFuera` (la casilla): el sistema no las emite.
 * PURA.
 */
export function validarRegimenFacturaA(
  condicionIva: string,
  x: unknown,
  confirmaFuera = false,
): { ok: true; regimen: RegimenFacturaA | null } | { ok: false; error: string } {
  if (condicionIva !== "RESPONSABLE_INSCRIPTO") return { ok: true, regimen: null };
  if (!esRegimenFacturaA(x)) {
    return {
      ok: false,
      error: "Elegí qué Factura A le asignó ARCA (A común, A con leyenda o M): sin ese dato no puede hacer Factura A. Si no lo sabés, consultalo con la contadora.",
    };
  }
  if (seEmiteFueraDelSistema(x) && !confirmaFuera) {
    return {
      ok: false,
      error: `${avisoFacturaAFuera(x)} Tildá «${TEXTO_CONFIRMA_FACTURA_A_FUERA}» para seguir, o elegí «A común» si es la que le asignó ARCA.`,
    };
  }
  return { ok: true, regimen: x };
}

/** La clase vigente: la fila más nueva que escribió Soporte GSG (las filas llegan de la más nueva a la más vieja). PURA. */
export function regimenVigente(filas: readonly { actor: string; changes: unknown }[]): RegimenFacturaA | null {
  for (const f of filas) {
    if (!f.actor.startsWith(ACTOR_SOPORTE)) continue;
    const r = (f.changes as { regimen?: unknown } | null)?.regimen;
    if (esRegimenFacturaA(r)) return r;
  }
  return null;
}
