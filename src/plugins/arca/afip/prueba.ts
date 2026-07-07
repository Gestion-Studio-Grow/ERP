/**
 * BANCO DE PRUEBAS — ARCA: arma un comprobante de prueba (Factura C, monto
 * chico, consumidor final) y solicita su CAE contra el `AfipClient` que el
 * llamador ya resolvió (stub en memoria, o el adapter SOAP real apuntado a
 * homologación con el certificado de PRUEBA que carga el dueño).
 *
 * PURA/testeable: no decide el modo ni gatea roles — eso es del server action
 * (`src/lib/arca-pruebas-actions.ts`), que resuelve el tenant, bloquea el modo
 * `real` y registra el intento con el logger. Acá solo vive el armado del
 * comprobante y el mapeo del resultado (nunca lanza).
 */

import { AlicuotaIvaId, Concepto, TipoComprobante, TipoDocumento } from '../domain/catalogos';
import { ComprobanteArca } from '../domain/comprobante';
import { ArcaRechazoError, type AfipClient, type ObservacionArca } from './port';

/** CUIT de prueba (formato válido de 11 dígitos; no pertenece a ningún emisor real). */
export const CUIT_DE_PRUEBA = 20111111112;

/** Fecha en formato ARCA `AAAAMMDD`, a partir de un reloj inyectable (testeable). */
export function fechaDePrueba(ahora: Date = new Date()): string {
  const y = ahora.getFullYear();
  const m = String(ahora.getMonth() + 1).padStart(2, '0');
  const d = String(ahora.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * Arma un `ComprobanteArca` mínimo y válido para el banco de pruebas: Factura C
 * (Monotributo/Exento, no discrimina IVA) a consumidor final, con un monto
 * chico fijo — pasa `validarComprobante` sin depender de datos de un tenant real.
 */
export function comprobanteDePrueba(
  opts: { puntoVenta?: number; ahora?: Date; monto?: number } = {},
): ComprobanteArca {
  const monto = opts.monto ?? 100;
  const fecha = fechaDePrueba(opts.ahora);
  return {
    puntoVenta: opts.puntoVenta ?? 1,
    tipo: TipoComprobante.FacturaC,
    concepto: Concepto.Productos,
    docTipo: TipoDocumento.ConsumidorFinal,
    docNro: 0,
    fecha,
    neto: monto,
    // FacturaC no discrimina IVA: se informa el monto en la alícuota "0%" (no
    // gravado), coherente con cómo factura un monotributista.
    iva: [{ id: AlicuotaIvaId.Cero, baseImponible: monto, importe: 0 }],
    total: monto,
    invoiceId: `PRUEBA-${fecha}`,
    tenantId: 'banco-de-pruebas',
  };
}

export type ResultadoPruebaArca =
  | { ok: true; cae: string; caeVencimiento: string; numero: number; puntoVenta: number }
  | { ok: false; motivo: 'rechazo'; observaciones: ObservacionArca[] }
  | { ok: false; motivo: 'error'; mensaje: string };

/**
 * Emite el comprobante de prueba contra el `AfipClient` ya resuelto por el
 * llamador. Nunca lanza: todo rechazo/error vuelve mapeado en
 * `ResultadoPruebaArca` para que el caller lo loguee y lo muestre.
 */
export async function emitirFacturaDePrueba(
  client: AfipClient,
  opts: { puntoVenta?: number; ahora?: Date; monto?: number } = {},
): Promise<ResultadoPruebaArca> {
  const comp = comprobanteDePrueba(opts);
  try {
    const r = await client.solicitarCae(comp);
    return {
      ok: true,
      cae: r.cae,
      caeVencimiento: r.caeVencimiento,
      numero: r.numero,
      puntoVenta: r.puntoVenta,
    };
  } catch (e) {
    if (e instanceof ArcaRechazoError) {
      return { ok: false, motivo: 'rechazo', observaciones: e.observaciones };
    }
    return { ok: false, motivo: 'error', mensaje: e instanceof Error ? e.message : String(e) };
  }
}
