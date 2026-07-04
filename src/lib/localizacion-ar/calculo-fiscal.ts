// Motor de cálculo fiscal (ADR-006: el cálculo vive en el Core, NUNCA en el
// conector). Produce tipo de comprobante, el juego completo de importes de
// WSFEv1 (neto gravado + exento + no gravado + IVA + total) y el DESGLOSE DE IVA
// POR ALÍCUOTA (array Iva: Id + BaseImp + Importe), con aritmética en centavos
// enteros para no arrastrar error de float, y validación fail-closed: ante
// entrada inválida lanza, nunca devuelve un número silenciosamente mal.
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

// Concepto de una línea frente al IVA. GRAVADO usa la alícuota; EXENTO (op.
// exentas, ImpOpEx) y NO_GRAVADO (conceptos no gravados, ImpTotConc) no llevan IVA.
export type ConceptoIva = "GRAVADO" | "EXENTO" | "NO_GRAVADO";

// Una línea del comprobante: un importe con su concepto/alícuota. `incluyeIva` =
// true si el importe ya trae el IVA adentro (precio final, típico en B a
// consumidor final); false si es neto. Irrelevante para exento/no gravado.
export interface LineaComprobante {
  importe: number;
  alicuota: AlicuotaCodigo;
  incluyeIva: boolean;
  concepto?: ConceptoIva; // default GRAVADO
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
  neto: number; // ImpNeto — base gravada
  exento: number; // ImpOpEx — operaciones exentas
  noGravado: number; // ImpTotConc — conceptos no gravados
  iva: number; // ImpIVA
  total: number; // ImpTotal = neto + exento + noGravado + iva
  ivaDetalle: IvaDetalleItem[];
  receptorCondicionIva: CondicionIva;
  receptorTipoDoc: TipoDocReceptor;
}

// Aritmética en centavos: se opera en enteros y se vuelve a pesos solo al final.
const aCent = (n: number) => Math.round(n * 100);
const deCent = (c: number) => c / 100;

// Validación fail-closed. Un motor de plata que acepta basura produce
// comprobantes que ARCA rechaza o, peor, mal emitidos: mejor lanzar temprano.
function validarLineas(lineas: LineaComprobante[]): void {
  if (lineas.length === 0) {
    throw new Error("calculo-fiscal: el comprobante no tiene líneas.");
  }
  for (const [i, l] of lineas.entries()) {
    if (!Number.isFinite(l.importe)) {
      throw new Error(`calculo-fiscal: importe no numérico en la línea ${i}.`);
    }
    if (l.importe < 0) {
      throw new Error(`calculo-fiscal: importe negativo (${l.importe}) en la línea ${i}.`);
    }
    if (!(l.alicuota in ALICUOTAS_IVA)) {
      throw new Error(`calculo-fiscal: alícuota desconocida "${l.alicuota}" en la línea ${i}.`);
    }
  }
}

const centsEq = (a: number, b: number) => Math.round(a * 100) === Math.round(b * 100);

// Auto-chequeo de invariantes del resultado (defensa en profundidad). Verifica
// lo mismo que ARCA valida aritméticamente: total = suma de partes, y el
// desglose de IVA suma al neto y al IVA totales. Si un cambio futuro rompe una
// cuenta, esto lanza en vez de dejar emitir un comprobante mal.
export function assertConsistente(r: ResultadoCalculo): void {
  const suma = r.neto + r.exento + r.noGravado + r.iva;
  if (!centsEq(suma, r.total)) {
    throw new Error(`calculo-fiscal: total inconsistente (${r.total} != ${suma}).`);
  }
  for (const v of [r.neto, r.exento, r.noGravado, r.iva, r.total]) {
    if (v < 0) throw new Error("calculo-fiscal: importe negativo en el resultado.");
  }
  if (r.ivaDetalle.length > 0) {
    const baseSum = r.ivaDetalle.reduce((a, i) => a + i.baseImp, 0);
    const ivaSum = r.ivaDetalle.reduce((a, i) => a + i.importe, 0);
    if (!centsEq(baseSum, r.neto)) {
      throw new Error("calculo-fiscal: las bases del desglose no suman el neto.");
    }
    if (!centsEq(ivaSum, r.iva)) {
      throw new Error("calculo-fiscal: el IVA del desglose no suma el IVA total.");
    }
  }
}

// Núcleo del motor. Toma la condición IVA del EMISOR y las líneas, y devuelve el
// comprobante calculado con la invariante: neto + exento + noGravado + iva =
// total exactos, y por alícuota base + iva consistentes (el remanente del
// redondeo se absorbe en el IVA de cada línea para que gross = base + iva sea exacto).
export function calcularComprobante(
  condicionEmisor: CondicionIva,
  lineas: LineaComprobante[],
): ResultadoCalculo {
  validarLineas(lineas);

  const receptor = {
    receptorCondicionIva: "CONSUMIDOR_FINAL" as CondicionIva,
    receptorTipoDoc: "CONSUMIDOR_FINAL" as TipoDocReceptor,
  };

  // Monotributo / Exento / otros -> Factura C: sin IVA discriminado. ARCA no
  // separa conceptos en C, va todo como neto.
  if (condicionEmisor !== "RESPONSABLE_INSCRIPTO") {
    const totalCent = lineas.reduce((a, l) => a + aCent(l.importe), 0);
    if (totalCent <= 0) throw new Error("calculo-fiscal: total del comprobante <= 0.");
    const resultadoC: ResultadoCalculo = {
      tipo: "FACTURA_C",
      neto: deCent(totalCent),
      exento: 0,
      noGravado: 0,
      iva: 0,
      total: deCent(totalCent),
      ivaDetalle: [],
      ...receptor,
    };
    assertConsistente(resultadoC);
    return resultadoC;
  }

  // Responsable Inscripto -> Factura B, con desglose por alícuota + exento/no gravado.
  const porAlicuota = new Map<AlicuotaCodigo, { baseCent: number; ivaCent: number }>();
  let exentoCent = 0;
  let noGravadoCent = 0;

  for (const l of lineas) {
    const concepto = l.concepto ?? "GRAVADO";
    const importeCent = aCent(l.importe);

    if (concepto === "EXENTO") {
      exentoCent += importeCent;
      continue;
    }
    if (concepto === "NO_GRAVADO") {
      noGravadoCent += importeCent;
      continue;
    }

    const { pct } = ALICUOTAS_IVA[l.alicuota];
    let baseCent: number;
    let ivaCent: number;
    if (l.incluyeIva) {
      baseCent = Math.round(importeCent / (1 + pct / 100));
      ivaCent = importeCent - baseCent; // remanente -> base + iva = gross exacto
    } else {
      baseCent = importeCent;
      ivaCent = Math.round(importeCent * (pct / 100));
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

  const totalCent = netoCent + ivaTotalCent + exentoCent + noGravadoCent;
  if (totalCent <= 0) throw new Error("calculo-fiscal: total del comprobante <= 0.");

  const resultadoB: ResultadoCalculo = {
    tipo: "FACTURA_B",
    neto: deCent(netoCent),
    exento: deCent(exentoCent),
    noGravado: deCent(noGravadoCent),
    iva: deCent(ivaTotalCent),
    total: deCent(totalCent),
    ivaDetalle,
    ...receptor,
  };
  assertConsistente(resultadoB);
  return resultadoB;
}
