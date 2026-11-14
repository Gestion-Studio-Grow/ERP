// ============================================================================
// LA PUERTA DE «CAMBIAR MI PIN» A LA BASE (GSG-SEG-019) — la inyecta ClubCargador, como la de la foto (`BASE`).
// ============================================================================
//
// Las pantallas del club no importan acciones del servidor: sólo ClubCargador lo hace y las pasa (así la demo y los
// tests de pantalla, que arman el club sin Next, no arrastran la base). La acción de cambiar el PIN propio
// (`cambiarMiPinDelClub`, pin-del-club-actions.ts) llega por acá para no pasarla por cinco componentes.
// Sin puerta (la demo, los tests): null.
//
// — Elaborado por GSG

export type RespuestaCambiarMiPin = { ok: true; version: number } | { ok: false; error: string };
export type PuertaDelPin = (pedido: { usuarioId: string; pinActual: string; pinNuevo: string }) => Promise<RespuestaCambiarMiPin>;

let puerta: PuertaDelPin | null = null;

/** La fija ClubCargador al cargar (la jornada real contra la base). */
export function fijarPuertaDelPin(p: PuertaDelPin | null): void {
  puerta = p;
}

export const puertaDelPin = (): PuertaDelPin | null => puerta;
