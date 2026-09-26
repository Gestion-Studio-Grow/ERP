// ============================================================================
// Una compra CON la factura del proveedor, como renglón del Libro IVA del negocio (PURO).
// ============================================================================
//
// Lo usa libro-iva-loader.ts. Una compra con factura (hoy: las importadas de «Mis Comprobantes
// Recibidos») va al mes de la FECHA DEL COMPROBANTE, no al del día en que se cargó; se muestra
// con su tipo y número; la nota de crédito resta; y su IVA es el crédito fiscal (0 en B y C, que
// ya se guardó así al importar). Los importes vienen de la factura, no de `totalCost`.

import type { CompraRow } from "@/lib/libros/libro-iva";
import { fiscalDateToIso } from "@/lib/libros/libro-iva";
import { esNotaDeCreditoRecibida, rotuloRecibido } from "./recibidos-formato";

export interface CompraConFacturaDelLibro {
  id: string;
  proveedor: string;
  facturaTipo: number;
  facturaPuntoVenta: number;
  facturaNumero: number;
  /** AAAAMMDD. */
  facturaFecha: string;
  facturaCuit: string;
  facturaIva: number;
  facturaTotal: number;
  /** El neto gravado de la factura (sin él, la hoja de compras no lo muestra). */
  facturaNeto?: number;
}

export function compraDelLibroDesdeFactura(c: CompraConFacturaDelLibro): CompraRow {
  const signo = esNotaDeCreditoRecibida(c.facturaTipo) ? -1 : 1;
  // `0 * -1` es -0: se normaliza para que una nota de crédito B no muestre «-0».
  const conSigno = (n: number) => (n === 0 ? 0 : signo * n);
  return {
    clave: `compra:${c.id}`,
    fecha: fiscalDateToIso(c.facturaFecha),
    proveedor: c.proveedor,
    doc: `CUIT ${c.facturaCuit}`,
    numero: rotuloRecibido({ tipo: c.facturaTipo, puntoVenta: c.facturaPuntoVenta, numero: c.facturaNumero }),
    total: conSigno(c.facturaTotal),
    creditoIva: conSigno(c.facturaIva),
    ...(c.facturaNeto !== undefined ? { netoGravado: conSigno(c.facturaNeto) } : {}),
  };
}
