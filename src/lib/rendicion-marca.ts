// La marca del INGRESO de una rendición del box «Nail Artist» en el libro (NAIL-ARTIST.md §5). PURO.
//
// Vive aparte (sin dependencias) para que el libro de caja la reconozca sin importar la rendición
// entera: `CashMovement.createdBy = rendicion:<settlementId>`.

export const RENDICION_ACTOR_PREFIX = "rendicion:";

/** ¿Este asiento lo dejó el registro de una rendición? */
export function esIngresoDeRendicion(m: { createdBy?: string | null }): boolean {
  return String(m.createdBy ?? "").startsWith(RENDICION_ACTOR_PREFIX);
}
