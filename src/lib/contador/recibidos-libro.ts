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
import { aRevisarDeNotas, creditoFiscalDelRecibido, esNotaDeCreditoRecibida, rotuloRecibido } from "./recibidos-formato";

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
  /** Percepciones y otros tributos de la factura, ya sumados (sin signo). */
  facturaOtrosTributos?: number;
  /** Las notas de la compra: traen la marca «A revisar:» del importador (recibidos-formato.ts). */
  notas: string | null;
}

export function compraDelLibroDesdeFactura(c: CompraConFacturaDelLibro): CompraRow {
  const signo = esNotaDeCreditoRecibida(c.facturaTipo) ? -1 : 1;
  const aRevisar = aRevisarDeNotas(c.notas);
  // `0 * -1` es -0: se normaliza para que una nota de crédito B no muestre «-0».
  const conSigno = (n: number) => (n === 0 ? 0 : signo * n);
  return {
    ...(c.facturaOtrosTributos !== undefined ? { otrosTributos: conSigno(c.facturaOtrosTributos) } : {}),
    clave: `compra:${c.id}`,
    fecha: fiscalDateToIso(c.facturaFecha),
    proveedor: c.proveedor,
    doc: `CUIT ${c.facturaCuit}`,
    numero: rotuloRecibido({ tipo: c.facturaTipo, puntoVenta: c.facturaPuntoVenta, numero: c.facturaNumero }),
    total: conSigno(c.facturaTotal),
    // «A revisar» (por ejemplo, un IVA que no es de ninguna alícuota vigente): NO suma al crédito ni al
    // neto gravado hasta que se revise (QA 26/09, vuelta 4: el 15 % de FERRETERIA NORTE sumaba). El
    // crédito sale de la regla única (creditoFiscalDelRecibido), la misma del archivo de la contadora.
    ...(aRevisar
      ? { creditoIva: 0, netoGravado: 0, aRevisar }
      : {
          creditoIva: creditoFiscalDelRecibido({ tipo: c.facturaTipo, iva: c.facturaIva, aRevisar: null }),
          ...(c.facturaNeto !== undefined ? { netoGravado: conSigno(c.facturaNeto) } : {}),
        }),
  };
}
