// Cálculo de importes y tipo de comprobante (ADR-006: el cálculo vive en el
// Core, NUNCA en el conector). Fase 1: B/C a consumidor final, que es lo que la
// estética y la mayoría de los clientes de un estudio necesitan.
import type {
  CondicionIva,
  TipoComprobante,
  TipoDocReceptor,
} from "@/generated/prisma/client";

const IVA_GENERAL = 0.21;

export interface ImportesComprobante {
  tipo: TipoComprobante;
  neto: number;
  iva: number;
  total: number;
  receptorCondicionIva: CondicionIva;
  receptorTipoDoc: TipoDocReceptor;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Deriva tipo de comprobante e importes desde la condición IVA del EMISOR y el
// total final cobrado (IVA incluido).
// - Responsable Inscripto -> Factura B a consumidor final, IVA 21% incluido y
//   discriminado en neto + iva.
// - Monotributo / Exento / otros -> Factura C, sin IVA discriminado (neto = total).
export function calcularImportes(
  condicionEmisor: CondicionIva,
  totalFinal: number,
): ImportesComprobante {
  const total = round2(totalFinal);
  if (condicionEmisor === "RESPONSABLE_INSCRIPTO") {
    const neto = round2(total / (1 + IVA_GENERAL));
    const iva = round2(total - neto);
    return {
      tipo: "FACTURA_B",
      neto,
      iva,
      total,
      receptorCondicionIva: "CONSUMIDOR_FINAL",
      receptorTipoDoc: "CONSUMIDOR_FINAL",
    };
  }
  return {
    tipo: "FACTURA_C",
    neto: total,
    iva: 0,
    total,
    receptorCondicionIva: "CONSUMIDOR_FINAL",
    receptorTipoDoc: "CONSUMIDOR_FINAL",
  };
}
