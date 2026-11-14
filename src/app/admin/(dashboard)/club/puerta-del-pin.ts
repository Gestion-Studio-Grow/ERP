// ============================================================================
// LA PUERTA DE «CAMBIAR MI PIN» A LA BASE (GSG-SEG-019) — la inyecta ClubCargador, como la de la foto (`BASE`).
// ============================================================================
//
// Las pantallas del club no importan acciones del servidor: sólo ClubCargador lo hace y las pasa (así la demo y los
// tests de pantalla, que arman el club sin Next, no arrastran la base). La acción de cambiar el PIN propio
// (`cambiarMiPinDelClub`, pin-del-club-actions.ts) llega por acá para no pasarla por cinco componentes.
// Sin puerta (la demo, los tests): null.
//
// SEG-020: también la puerta de la FIRMA DEL DUEÑO (firma-del-duenio-actions.ts): el PIN de un dueño lo verifica sólo
// el servidor. La usa firma-del-duenio.ts; sin puerta, un dueño con el PIN en el servidor no firma en este equipo.
//
// — Elaborado por GSG

import type { RespuestaAprobarConCodigo, RespuestaCodigoParaAprobar, RespuestaFirmaDelDuenio } from "./firma-del-duenio-actions";

export type RespuestaCambiarMiPin = { ok: true; version: number } | { ok: false; error: string };
export type PuertaDelPin = (pedido: { usuarioId: string; pinActual: string; pinNuevo: string }) => Promise<RespuestaCambiarMiPin>;

let puerta: PuertaDelPin | null = null;

/** La fija ClubCargador al cargar (la jornada real contra la base). */
export function fijarPuertaDelPin(p: PuertaDelPin | null): void {
  puerta = p;
}

export const puertaDelPin = (): PuertaDelPin | null => puerta;

export interface PuertaDeLaFirma {
  firmar(pedido: { usuarioId?: string; pin: string }): Promise<RespuestaFirmaDelDuenio>;
  codigoParaAprobar(pedido: { novedadId: string; pin: string; monto: number; usuarioId?: string }): Promise<RespuestaCodigoParaAprobar>;
  aprobarConCodigo(pedido: { novedadId: string; codigo: string; monto: number }): Promise<RespuestaAprobarConCodigo>;
}

let puertaFirma: PuertaDeLaFirma | null = null;

/** La fija ClubCargador al cargar, con las acciones de firma-del-duenio-actions.ts. */
export function fijarPuertaDeLaFirma(p: PuertaDeLaFirma | null): void {
  puertaFirma = p;
}

export const puertaDeLaFirma = (): PuertaDeLaFirma | null => puertaFirma;
