// ============================================================================
// Opción B de CH · Lo que las facturas de pagos de Mercado Pago (`mp:<pago>`) cubren de los cobros
// del libro del turno. PURO, sin el Core de facturación: lo leen `facturacion/factura-por-cobro.ts`
// (para no facturar dos veces la misma seña) y `turnos/anulacion.ts` (para que anular un cobro
// cubierto por la factura del pago emita la nota de crédito de esa parte).
// ============================================================================
//
// La regla es UNA, la misma en los dos lados: lo facturado por pagos de MP del turno que no está
// atado a la factura de un cobro del libro («sin pareja») cubre, en orden de llegada, los cobros
// vivos con medio Mercado Pago que no tienen factura propia; las facturas de MP se consumen en el
// orden en que se anotaron.
//
// Cuando se anula un cobro cubierto así, la nota de crédito de esa parte queda anotada en
// `CobroFacturado` con la clave `turno:nc-mp:<cobro>:<factura de MP>` (empieza con `turno:` para
// entrar en el CHECK `^(mp|turno|banco):.+$` de la tabla) apuntando a la NOTA. Esa parte ya no
// cubre a nadie: se descuenta del saldo de la factura de MP mientras la nota no esté rechazada.

import { centavosDe } from "@/lib/dinero/redondeo";
import { cobroDeLaClave } from "./clave-cobro-del-libro";

const PREFIJO_NC_MP = "turno:nc-mp:";

/** La clave con que se anota la nota de crédito de la parte del cobro que cubría una factura de MP. */
export function claveNotaDeCobroMP(collectionId: string, facturaMP: string): string {
  if (!collectionId || !facturaMP) throw new Error("claveNotaDeCobroMP: falta el cobro o la factura.");
  return `${PREFIJO_NC_MP}${collectionId}:${facturaMP}`;
}

export const esPagoMP = (clave: string) => clave.startsWith("mp:") && !clave.startsWith("mp:refund:");

/** Una fila de `CobroFacturado` del turno, con el estado de su factura. */
export interface FilaDeCobroFacturado {
  clave: string;
  invoiceId: string;
  importe: number;
  status: string;
  createdAt?: Date;
  /** La factura a la que acredita, si `invoiceId` es una nota de crédito. */
  asociada?: string | null;
}

/** Lo que queda de cada factura de MP sin pareja (centavos), en el orden en que se anotaron. */
export function saldosMPSinPareja(filas: readonly FilaDeCobroFacturado[]): { invoiceId: string; centavos: number }[] {
  const deCobros = new Set(filas.filter((f) => cobroDeLaClave(f.clave) != null).map((f) => f.invoiceId));
  const mp = filas
    .filter((f) => esPagoMP(f.clave) && f.status !== "REJECTED" && !deCobros.has(f.invoiceId))
    .map((f, i) => ({ f, i }))
    .sort((a, b) => (a.f.createdAt?.getTime() ?? 0) - (b.f.createdAt?.getTime() ?? 0) || a.i - b.i);
  const saldo = new Map<string, number>();
  for (const { f } of mp) saldo.set(f.invoiceId, (saldo.get(f.invoiceId) ?? 0) + centavosDe(f.importe));
  for (const f of filas) {
    if (!f.clave.startsWith(PREFIJO_NC_MP) || f.status === "REJECTED" || !f.asociada) continue;
    if (saldo.has(f.asociada)) saldo.set(f.asociada, (saldo.get(f.asociada) ?? 0) - centavosDe(f.importe));
  }
  return [...saldo].map(([invoiceId, centavos]) => ({ invoiceId, centavos })).filter((s) => s.centavos > 0);
}

/** Un cobro vivo del libro (no anulado, positivo), en orden de llegada. */
export interface CobroVivo {
  id: string;
  method: string;
  centavos: number;
}

/**
 * Qué partes de qué facturas de MP cubren a CADA cobro vivo con medio Mercado Pago sin factura
 * propia (`conFila`). Es el mismo reparto que `planFacturasPorCobro`.
 */
export function coberturaMP(x: {
  vivos: readonly CobroVivo[];
  conFila: ReadonlySet<string>;
  saldos: readonly { invoiceId: string; centavos: number }[];
}): Map<string, { invoiceId: string; centavos: number }[]> {
  const saldos = x.saldos.map((s) => ({ ...s }));
  const out = new Map<string, { invoiceId: string; centavos: number }[]>();
  let k = 0;
  for (const c of x.vivos) {
    if (x.conFila.has(c.id) || c.method !== "MERCADOPAGO") continue;
    let falta = c.centavos;
    const partes: { invoiceId: string; centavos: number }[] = [];
    while (falta > 0 && k < saldos.length) {
      const s = saldos[k];
      const toma = Math.min(falta, s.centavos);
      if (toma > 0) partes.push({ invoiceId: s.invoiceId, centavos: toma });
      s.centavos -= toma;
      falta -= toma;
      if (s.centavos === 0) k++;
    }
    if (partes.length > 0) out.set(c.id, partes);
  }
  return out;
}
