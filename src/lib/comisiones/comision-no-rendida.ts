// ============================================================================
// COMISIÓN DE UN COBRO QUE LA PROFESIONAL TODAVÍA NO RINDIÓ — la regla, en UN solo lugar. PURA.
// ============================================================================
//
// El agujero (F1, ALTA): la profesional que cobra aparte (`cobraEnMostrador = false`) cobra un turno
// de $37.000; la plata queda en su bolsillo como `CobroARendir` pendiente (rendicion-repo.ts). Sin
// esta regla, Comisiones ofrecía «Pagar $14.800» sobre ese turno: se le pagaba la comisión con plata
// del cajón que nunca había entrado, y el cajón quedaba en −$14.800.
//
// POLÍTICA (provisional a confirmar por el dueño):
//   · "esperar" (A, VIGENTE): sólo se paga la comisión de los turnos cuyos cobros a rendir están
//     TODOS rendidos. Un turno con algo pendiente de rendir no entra al pago ni a ningún total «a
//     liquidar» (Inicio, Comisiones, Reportes, «Mi liquidación»); la vista previa lo muestra como
//     «Pendiente de rendir» con su monto y su comisión, sin botón. Al rendir, entra solo.
//   · "descontar" (B, NO IMPLEMENTADA): pagar todo y descontar del pago lo que falta rendir. Punto de
//     cambio: esta constante + `seLiquidaSegunRendicion` (que pasaría a dejar entrar el turno) + el
//     descuento en `settleCommissions` (commission-actions.ts) y en `comisionesPendientes`
//     (reports/comisiones.ts), que hoy no existe. Hasta implementarla, elegirla corta con error:
//     cambiar la constante sin el descuento pagaría de nuevo comisión sobre plata que no entró.
//
// Quién la usa (y por eso todas las sumas coinciden): `comisionesPendientes` (Inicio, Comisiones,
// Reportes), `armarVistaPrevia` (vista previa y «Mi liquidación») y `settleCommissions` (lo que se
// paga). Sin las tablas de rendición (`hayRendicionesInTx` falso) nada está pendiente de rendir y
// todo sigue como antes.

export type PoliticaComisionNoRendida = "esperar" | "descontar";

/** La política vigente. Ver el encabezado antes de cambiarla. */
export const POLITICA_COMISION_NO_RENDIDA: PoliticaComisionNoRendida = "esperar";

/**
 * ¿La comisión de este turno se paga ya, según lo que falta rendir de sus cobros? `pendienteDeRendir`
 * es la suma de sus `CobroARendir` sin rendir y sin anular (0 o ausente: nada pendiente).
 */
export function seLiquidaSegunRendicion(
  pendienteDeRendir: number | null | undefined,
  politica: PoliticaComisionNoRendida = POLITICA_COMISION_NO_RENDIDA,
): boolean {
  if (politica === "descontar") {
    throw new Error("Política «descontar» (B) sin implementar: ver src/lib/comisiones/comision-no-rendida.ts.");
  }
  const p = Number(pendienteDeRendir ?? 0);
  // Un monto ilegible no habilita un pago: ante la duda, espera.
  return Number.isFinite(p) && p <= 0;
}
