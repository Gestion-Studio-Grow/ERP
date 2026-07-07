/**
 * STUB de COBROS: `PasarelaCobros` en memoria, sin red ni credenciales. Es el modo
 * SANDBOX por defecto — permite probar el flujo de "generar cobro" de punta a punta
 * (UI incluida) sin tener el access token de Mercado Pago cargado.
 *
 * Devuelve un link determinístico (derivado de la solicitud) para que la UI y los
 * tests sean estables. El `initPoint` apunta a una URL de sandbox reconocible, NUNCA
 * a un cobro real. Valida igual que el adapter real, así el comportamiento coincide.
 */

import {
  type LinkDePago,
  type PasarelaCobros,
  type SolicitudCobro,
  SolicitudCobroInvalidaError,
  validarSolicitud,
} from "./port";

/** Hash estable y corto (djb2) de un string — para un id determinístico sin azar. */
function hashCorto(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** URL base del sandbox del stub (no es un cobro real; se ve claro que es de prueba). */
export const STUB_COBROS_BASE = "https://sandbox.local/checkout";

export class StubPasarelaCobros implements PasarelaCobros {
  async crearLinkDePago(solicitud: SolicitudCobro): Promise<LinkDePago> {
    const errores = validarSolicitud(solicitud);
    if (errores.length > 0) throw new SolicitudCobroInvalidaError(errores);

    const semilla = `${solicitud.referenciaExterna ?? ""}|${solicitud.concepto.trim()}|${solicitud.monto}|${solicitud.cantidad ?? 1}`;
    const preferenceId = `stub-${hashCorto(semilla)}`;
    const link: LinkDePago = {
      preferenceId,
      initPoint: `${STUB_COBROS_BASE}/${preferenceId}`,
      sandboxInitPoint: `${STUB_COBROS_BASE}/${preferenceId}?sandbox=1`,
      estado: "activa",
    };
    if (solicitud.referenciaExterna) link.referenciaExterna = solicitud.referenciaExterna;
    return link;
  }
}
