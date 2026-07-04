// Motor de cálculo fiscal (ADR-006: el cálculo vive en el Core, NUNCA en el
// conector). Produce tipo de comprobante, totales y el DESGLOSE DE IVA POR
// ALÍCUOTA que exige WSFEv1 (array Iva: Id + BaseImp + Importe), con aritmética
// en centavos enteros para no arrastrar error de float — regla número uno de un
// motor de cálculo de plata.
import type {
  CondicionIva,
  TipoComprobante,
  TipoDocReceptor,
} from "@/generated/prisma/client";

// Catálogo de alícuotas de IVA de ARCA (WSFEv1, campo Iva[].Id). La fuente
// autoritativa en runtime es el método FEParamGetTiposIva; estos son los códigos
// estables que usa toda la plaza (pyafipws / afipjs). Si ARCA suma una alícuota,
// se agrega acá y el motor la soporta sin más cambios.
export const ALICUOTAS_IVA = {
  "0": { id: 3, pct: 0 },
  "2.5": { id: 9, pct: 2.5 },
  "5": { id: 8, pct: 5 },
  "10.5": { id: 4, pct: 10.5 },
  "21": { id: 5, pct: 21 },
  "27": { id: 6, pct: 27 },
} as const;

export type AlicuotaCodigo = keyof typeof ALICUOTAS_IVA;

export const IVA_GENERAL: AlicuotaCodigo = "21";

// Una línea del comprobante: un importe a una alícuota. `incluyeIva` = true si el
// importe ya trae el IVA adentro (precio final, típico en B a consumidor final);
// false si es neto (base sin IVA).
export interface LineaComprobante {
  importe: number;
  alicuota: AlicuotaCodigo;
  incluyeIva: boolean;
}

// Ítem del desglose por alícuota — mapea 1:1 al array Iva de WSFEv1.
export interface IvaDetalleItem {
  alicuotaId: number; // Id de ARCA
  alicuotaPct: number;
  baseImp: number; // base imponible (neto) de esa alícuota
  importe: number; // IVA de esa alícuota
}

export interface ResultadoCalculo {
  tipo: TipoComprobante;
  neto: number;
  iva: number;
  total: number;
  ivaDetalle: IvaDetalleItem[];
  receptorCondicionIva: CondicionIva;
  receptorTipoDoc: TipoDocReceptor;
}

// Aritmética en centavos: se opera en enteros y se vuelve a pesos solo al final.
const aCent = (n: number) => Math.round(n * 100);
const deCent = (c: number) => c / 100;

// Núcleo del motor. Toma la condición IVA del EMISOR y las líneas, y devuelve el
// comprobante calculado con la invariante: neto + iva = total exactos, y por
// alícuota base + iva consistentes (el remanente del redondeo se absorbe en el
// IVA de cada línea para que gross = base + iva sea exacto).
export function calcularComprobante(
  condicionEmisor: CondicionIva,
  lineas: LineaComprobante[],
): ResultadoCalculo {
  const receptor = {
    receptorCondicionIva: "CONSUMIDOR_FINAL" as CondicionIva,
    receptorTipoDoc: "CONSUMIDOR_FINAL" as TipoDocReceptor,
  };

  // Monotributo / Exento / otros -> Factura C: sin IVA discriminado.
  if (condicionEmisor !== "RESPONSABLE_INSCRIPTO") {
    const totalCent = lineas.reduce((a, l) => a + aCent(l.importe), 0);
    return {
      tipo: "FACTURA_C",
      neto: deCent(totalCent),
      iva: 0,
      total: deCent(totalCent),
      ivaDetalle: [],
      ...receptor,
    };
  }

  // Responsable Inscripto -> Factura B, con desglose por alícuota.
  const porAlicuota = new Map<AlicuotaCodigo, { baseCent: number; ivaCent: number }>();
  for (const l of lineas) {
    const { pct } = ALICUOTAS_IVA[l.alicuota];
    const grossCent = aCent(l.importe);
    let baseCent: number;
    let ivaCent: number;
    if (l.incluyeIva) {
      baseCent = Math.round(grossCent / (1 + pct / 100));
      ivaCent = grossCent - baseCent; // remanente -> base + iva = gross exacto
    } else {
      baseCent = grossCent;
      ivaCent = Math.round(grossCent * (pct / 100));
    }
    const acc = porAlicuota.get(l.alicuota) ?? { baseCent: 0, ivaCent: 0 };
    acc.baseCent += baseCent;
    acc.ivaCent += ivaCent;
    porAlicuota.set(l.alicuota, acc);
  }

  const ivaDetalle: IvaDetalleItem[] = [];
  let netoCent = 0;
  let ivaTotalCent = 0;
  for (const [cod, { baseCent, ivaCent }] of porAlicuota) {
    const { id, pct } = ALICUOTAS_IVA[cod];
    ivaDetalle.push({
      alicuotaId: id,
      alicuotaPct: pct,
      baseImp: deCent(baseCent),
      importe: deCent(ivaCent),
    });
    netoCent += baseCent;
    ivaTotalCent += ivaCent;
  }

  return {
    tipo: "FACTURA_B",
    neto: deCent(netoCent),
    iva: deCent(ivaTotalCent),
    total: deCent(netoCent + ivaTotalCent),
    ivaDetalle,
    ...receptor,
  };
}
