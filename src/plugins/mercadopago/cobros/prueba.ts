/**
 * BANCO DE PRUEBAS — Cobros MP: arma una solicitud de cobro de prueba (monto
 * chico, concepto identificable) y genera el link contra la `PasarelaCobros` que
 * el llamador ya resolvió (stub en memoria, o el adapter HTTP real con el access
 * token de PRUEBA que carga el dueño — `MP_MODO=test`).
 *
 * PURA/testeable: no decide el modo ni gatea roles — eso es del server action
 * (`src/lib/mercadopago-pruebas-actions.ts`), que resuelve el tenant, bloquea el
 * modo `real` y registra el intento con el logger.
 */

import type { LinkDePago, PasarelaCobros, SolicitudCobro } from "./port";
import { SolicitudCobroInvalidaError } from "./port";
import { MercadoPagoApiError } from "../http";

/** Solicitud de cobro de prueba: monto chico, concepto identificable como test. */
export function solicitudDePrueba(monto = 100): SolicitudCobro {
  return {
    concepto: "Cobro de prueba — banco de pruebas GSG",
    monto,
    referenciaExterna: `PRUEBA-${Date.now()}`,
  };
}

export type ResultadoPruebaCobro =
  | { ok: true; link: LinkDePago }
  | { ok: false; motivo: "invalida" | "error"; mensaje: string };

/**
 * Genera el link de cobro de prueba contra la `PasarelaCobros` ya resuelta.
 * Nunca lanza: todo error vuelve mapeado en `ResultadoPruebaCobro`.
 */
export async function generarCobroDePrueba(
  pasarela: PasarelaCobros,
  monto = 100,
): Promise<ResultadoPruebaCobro> {
  const solicitud = solicitudDePrueba(monto);
  try {
    const link = await pasarela.crearLinkDePago(solicitud);
    return { ok: true, link };
  } catch (e) {
    if (e instanceof SolicitudCobroInvalidaError) {
      return { ok: false, motivo: "invalida", mensaje: e.message };
    }
    if (e instanceof MercadoPagoApiError) {
      return {
        ok: false,
        motivo: "error",
        mensaje: `Mercado Pago rechazó la prueba (HTTP ${e.status}). Revisá el access token de prueba.`,
      };
    }
    return { ok: false, motivo: "error", mensaje: e instanceof Error ? e.message : String(e) };
  }
}
