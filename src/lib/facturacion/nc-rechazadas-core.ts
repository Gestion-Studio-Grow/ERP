/**
 * #T7 · Notas de crédito que ARCA RECHAZÓ (ver #38). PURO: sin base, se prueba en unidad.
 *
 * Cuando ARCA rechaza una nota de crédito, la nota queda REJECTED, el cobro ya está anulado y la
 * factura sigue AUTORIZADA sin nada que la anule: plata que el sistema da por devuelta y el fisco
 * no. Este módulo decide cuáles de esas notas siguen pidiendo atención del dueño:
 *   · las que nadie volvió a emitir ni dio por resueltas (marca en la auditoría), y
 *   · cuya factura todavía tiene saldo por anular (si otra nota ya la cubrió, no hay nada que hacer).
 */
import { saldoPorAnular } from "@/lib/facturacion/nota-credito-core";
import { sumarAlCentavo } from "@/lib/dinero/redondeo";

/** La marca de «se volvió a emitir»: AuditLog con entity "Invoice" y entityId = la nota rechazada. */
export const ACCION_NC_REEMITIDA = "nota_credito.reemitida";
/** La marca de «el dueño la resolvió fuera del sistema» (p. ej. la hizo a mano en ARCA). */
export const ACCION_NC_RECHAZO_RESUELTO = "nota_credito.rechazo_resuelto";
/** El texto de la alerta del Inicio (lo reconoce la bandeja para decir qué hacer). */
export const TEXTO_NC_RECHAZADA = {
  uno: "nota de crédito rechazada por ARCA",
  varias: "notas de crédito rechazadas por ARCA",
} as const;
export const ACCIONES_QUE_CIERRAN_EL_RECHAZO = [ACCION_NC_REEMITIDA, ACCION_NC_RECHAZO_RESUELTO] as const;

export interface NotaRechazadaFila {
  id: string;
  total: number;
  rechazoMotivo: string | null;
  createdAt: Date;
  factura: { id: string; puntoVenta: number; numero: number | null; total: number; notasVivas: number[] } | null;
}

export interface NotaRechazadaPendiente {
  notaId: string;
  facturaId: string;
  /** «0002-00000123», o «sin número» si la factura no lo tiene (no debería: sólo se anula una autorizada). */
  factura: string;
  importe: number;
  saldoDeLaFactura: number;
  motivoArca: string;
  creada: Date;
}

const numeroDeFactura = (pv: number, n: number | null) =>
  n == null ? "sin número" : `${String(pv).padStart(4, "0")}-${String(n).padStart(8, "0")}`;

/** Las que siguen pidiendo atención, de la más vieja a la más nueva. */
export function notasRechazadasPendientes(filas: NotaRechazadaFila[], cerradas: ReadonlySet<string>): NotaRechazadaPendiente[] {
  const out: NotaRechazadaPendiente[] = [];
  for (const f of filas) {
    if (!f.factura || cerradas.has(f.id)) continue;
    const saldo = saldoPorAnular(f.factura.total, sumarAlCentavo(f.factura.notasVivas));
    if (saldo <= 0) continue;
    out.push({
      notaId: f.id,
      facturaId: f.factura.id,
      factura: numeroDeFactura(f.factura.puntoVenta, f.factura.numero),
      importe: f.total,
      saldoDeLaFactura: saldo,
      motivoArca: f.rechazoMotivo?.trim() || "ARCA no dio el motivo",
      creada: f.createdAt,
    });
  }
  return out.sort((a, b) => a.creada.getTime() - b.creada.getTime());
}

/**
 * El importe de la nota nueva: el de la rechazada, salvo que la factura ya tenga menos saldo (otra
 * nota anuló una parte entretanto): nunca más que el saldo. El tope real lo vuelve a poner
 * `crearNotaDeCreditoInTx` con la factura tomada FOR UPDATE.
 */
export function importeDeLaReemision(importeRechazado: number, saldo: number): number {
  return Math.min(importeRechazado, saldo);
}
