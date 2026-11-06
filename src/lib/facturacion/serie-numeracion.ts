/**
 * Motor de facturación · La SERIE de numeración de un envío a ARCA: `"<puntoVenta>:<CbteTipo>"`.
 *
 * ARCA numera «último autorizado + 1» por punto de venta y tipo de comprobante. Dos envíos de la
 * misma serie en vuelo a la vez piden el mismo número; de series distintas, no. La toma de envíos
 * (`tomarSiguienteEnvio`, src/lib/arca-reserva.ts) serializa por serie y no por negocio.
 *
 * El tipo sale de la decisión fiscal única del Core (`decidirComprobante`), con los MISMOS datos
 * que usa el plugin al despachar (`decidirDelEvento`, src/plugins/arca/domain/comprobante.ts,
 * con la fecha del comprobante): emisor, receptor, clase y comprobante asociado. El Core no
 * importa el plugin (ADR-022: la dependencia va plugin → Core).
 *
 * El régimen de la A (RG 1575) se supone "A" sólo para obtener el tipo: la A con leyenda es el
 * mismo tipo, y la M el sistema no la emite (la decisión del despacho la bloquea).
 *
 * Si la decisión no deja un comprobante (dato faltante, bloqueo), devuelve `null`: el envío viaja
 * SIN serie y la toma lo trata como comodín (choca con cualquier envío de su negocio). Es lo
 * seguro: nunca se separan dos envíos que pudieran compartir numeración.
 */

import { decidirComprobante, type Clase, type Naturaleza } from "@/lib/fiscal/decidir-comprobante";

const NATURALEZA: Readonly<Record<number, Naturaleza>> = {
  1: "productos",
  2: "servicios",
  3: "productos_y_servicios",
};

/** Lo que hace falta del envío para saber su serie. */
export interface DatosDeSerie {
  concepto: number;
  fecha: string;
  emisor: { cuit: number; condicionIva: string; puntoVenta: number };
  receptor: { docTipo: number; docNro: number; condicionIva: string };
  total: number;
  servicioDesde?: string;
  servicioHasta?: string;
  vencimientoPago?: string;
  clase?: Clase;
  asociado?: { cbteTipo: number; puntoVenta: number; numero: number; fecha: string };
}

export function serieDeNumeracion(d: DatosDeSerie): string | null {
  let cbteTipo: number | undefined;
  try {
    cbteTipo = decidirComprobante(
      { condicionIva: d.emisor.condicionIva, cuit: d.emisor.cuit, regimenFacturaA: "A" },
      { condicionIva: d.receptor.condicionIva, docTipo: d.receptor.docTipo, docNro: d.receptor.docNro },
      {
        clase: d.clase ?? "factura",
        fecha: d.fecha,
        fechaDeEnvio: d.fecha,
        importeTotal: d.total,
        naturaleza: NATURALEZA[d.concepto] ?? null,
        servicio: {
          desde: d.servicioDesde ?? null,
          hasta: d.servicioHasta ?? null,
          vencimientoPago: d.vencimientoPago ?? null,
        },
        asociado: d.asociado ?? null,
      },
    ).comprobante?.cbteTipo;
  } catch {
    cbteTipo = undefined;
  }
  if (!cbteTipo || !Number.isInteger(d.emisor.puntoVenta)) return null;
  return `${d.emisor.puntoVenta}:${cbteTipo}`;
}
