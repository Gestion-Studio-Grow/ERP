/**
 * Validación local del comprobante ANTES de mandarlo a ARCA.
 * Objetivo: fallar barato y con mensaje claro, no contra el WS.
 * Incluye chequeo de CONSISTENCIA de los montos que mandó el Core (verificar,
 * no recalcular): el plugin no confía a ciegas, pero tampoco calcula IVA.
 * Dominio puro.
 */

import {
  Concepto,
  PORCENTAJE_IVA,
  TipoDocumento,
  conceptoRequiereFechasServicio,
  discriminaIva,
} from './catalogos';
import { ComprobanteArca } from './comprobante';
// Qué CondicionIVAReceptorId admite cada letra: la tabla de la decisión fiscal única (RG 5616).
import { CBTE_TIPO, RECEPTORES_ADMITIDOS, type Letra } from '@/lib/fiscal/decidir-comprobante';
// La regla única de redondeo de la plata (ADR-100 §3): la misma con la que soap.ts escribe.
import {
  admiteCentavos,
  centavosDe,
  redondearAlCentavo,
  sumarAlCentavo,
  textoAlCentavo,
} from '@/lib/dinero/redondeo';

export interface ErrorValidacion {
  campo: string;
  mensaje: string;
}

export interface ResultadoValidacion {
  ok: boolean;
  errores: ErrorValidacion[];
}

const RE_FECHA = /^\d{8}$/; // AAAAMMDD
/**
 * Tolerancia, en centavos, entre el IVA de un renglón y base × alícuota: el Core redondea
 * cada renglón al centavo. Las sumas (neto y total) no tienen tolerancia: ARCA exige que
 * cierren exactas con los importes tal como viajan.
 */
const TOLERANCIA_IVA_EN_CENTAVOS = 1;

/**
 * El importe ya viene al centavo: es exactamente el que se escribe en WSFEv1. Así la
 * decisión del comprobante (que usa este mismo número) y el pedido a ARCA no pueden
 * contar centavos distintos (ENG-109).
 */
const esAlCentavo = (n: number): boolean => admiteCentavos(n) && redondearAlCentavo(n) === n;
const MAS_DE_DOS_DECIMALES = 'Tiene más de dos decimales: el Core manda cada importe al centavo.';

/** Un importe para un mensaje: con la regla de redondeo si se puede; si no, tal cual. */
const enMensaje = (n: number): string => (admiteCentavos(n) ? textoAlCentavo(n) : String(n));

function esFechaValida(f: string | undefined): boolean {
  return !!f && RE_FECHA.test(f);
}

/** Letra y si es nota (crédito o débito) de un CbteTipo común; `null` si no es uno de esos. */
function letraDelTipo(tipo: number): { letra: Letra; esNota: boolean } | null {
  for (const letra of ['A', 'B', 'C'] as const) {
    const t = CBTE_TIPO[letra];
    if (t.factura === tipo) return { letra, esNota: false };
    if (t.nota_credito === tipo || t.nota_debito === tipo) return { letra, esNota: true };
  }
  return null;
}

export function validarComprobante(comp: ComprobanteArca): ResultadoValidacion {
  const errores: ErrorValidacion[] = [];
  const push = (campo: string, mensaje: string) => errores.push({ campo, mensaje });

  if (!Number.isInteger(comp.puntoVenta) || comp.puntoVenta <= 0) {
    push('puntoVenta', 'Debe ser un entero positivo.');
  }

  if (!esFechaValida(comp.fecha)) {
    push('fecha', 'Formato requerido AAAAMMDD.');
  }

  if (comp.iva.length === 0) {
    push('iva', 'El comprobante necesita al menos un subtotal de IVA.');
  }

  // Un monto que no se puede escribir con centavos (NaN, infinito) no llega al armado
  // del pedido a ARCA: acá es un rechazo con mensaje, allá sería un error sin salida.
  if (!admiteCentavos(comp.total)) {
    push('total', 'No es un importe.');
  } else if (!(comp.total > 0)) {
    push('total', 'Debe ser mayor a 0.');
  } else if (!esAlCentavo(comp.total)) {
    push('total', MAS_DE_DOS_DECIMALES);
  }
  if (!admiteCentavos(comp.neto)) {
    push('neto', 'No es un importe.');
  } else if (!esAlCentavo(comp.neto)) {
    push('neto', MAS_DE_DOS_DECIMALES);
  }

  // Fechas de servicio obligatorias si hay servicios.
  if (conceptoRequiereFechasServicio(comp.concepto)) {
    for (const campo of ['servicioDesde', 'servicioHasta', 'vencimientoPago'] as const) {
      if (!esFechaValida(comp[campo])) {
        push(campo, `Requerida (AAAAMMDD) para concepto ${Concepto[comp.concepto]}.`);
      }
    }
  }

  // Factura A: el receptor DEBE estar identificado con CUIT.
  if (discriminaIva(comp.tipo)) {
    if (comp.docTipo !== TipoDocumento.CUIT) {
      push('docTipo', 'Comprobante A exige receptor identificado con CUIT.');
    }
    if (!(comp.docNro > 0)) {
      push('docNro', 'Comprobante A exige número de CUIT válido.');
    }
  }

  // RG 5616: la condición del receptor es obligatoria y tiene que ser una que la letra admite.
  const letra = letraDelTipo(comp.tipo);
  if (comp.condicionIvaReceptorId == null) {
    push('condicionIvaReceptorId', 'Falta la condición frente al IVA del receptor (RG 5616).');
  } else if (letra && !RECEPTORES_ADMITIDOS[letra.letra].has(comp.condicionIvaReceptorId)) {
    push(
      'condicionIvaReceptorId',
      `El comprobante ${letra.letra} no admite un receptor con condición ${comp.condicionIvaReceptorId} frente al IVA.`,
    );
  }

  // Nota de crédito o débito: la factura que corrige O el período, nunca los dos.
  if (comp.asociado && comp.periodoAsociado) {
    push('asociado', 'Va la factura asociada o el período asociado, nunca los dos.');
  } else if (letra?.esNota && !comp.asociado && !comp.periodoAsociado) {
    push('asociado', 'Una nota de crédito o débito necesita la factura que corrige o el período.');
  }

  // Exento (ImpOpEx) y no gravado (ImpTotConc): al centavo, no negativos, y en C en 0.
  const exento = comp.importeExento ?? 0;
  const noGravado = comp.importeNoGravado ?? 0;
  let extrasEscribibles = true;
  for (const [campo, valor] of [
    ['importeExento', exento],
    ['importeNoGravado', noGravado],
  ] as const) {
    if (!admiteCentavos(valor)) {
      push(campo, 'No es un importe.');
      extrasEscribibles = false;
    } else if (!esAlCentavo(valor)) {
      push(campo, MAS_DE_DOS_DECIMALES);
      extrasEscribibles = false;
    } else if (valor < 0) {
      push(campo, 'No puede ser negativo.');
    } else if (letra?.letra === 'C' && valor !== 0) {
      push(campo, 'En un comprobante C va en 0: el importe entero se informa como neto.');
    }
  }

  if (comp.numero !== undefined && (!Number.isInteger(comp.numero) || comp.numero <= 0)) {
    push('numero', 'Si se informa, debe ser un entero positivo.');
  }

  // Consistencia de los montos del Core: verificar, no recalcular.
  let montosEscribibles = esAlCentavo(comp.total) && esAlCentavo(comp.neto) && extrasEscribibles;
  comp.iva.forEach((sub, i) => {
    if (!admiteCentavos(sub.baseImponible) || !admiteCentavos(sub.importe)) {
      push(`iva[${i}]`, 'La base y el importe tienen que ser importes.');
      montosEscribibles = false;
      return;
    }
    if (!esAlCentavo(sub.baseImponible)) {
      push(`iva[${i}].baseImponible`, MAS_DE_DOS_DECIMALES);
      montosEscribibles = false;
    }
    if (!esAlCentavo(sub.importe)) {
      push(`iva[${i}].importe`, MAS_DE_DOS_DECIMALES);
      montosEscribibles = false;
    }
    if (!(sub.baseImponible >= 0)) {
      push(`iva[${i}].baseImponible`, 'No puede ser negativa.');
    }
    const esperado = sub.baseImponible * (PORCENTAJE_IVA[sub.id] ?? NaN);
    if (Number.isNaN(esperado)) {
      push(`iva[${i}].id`, 'Alícuota de IVA desconocida.');
    } else if (
      admiteCentavos(esperado) &&
      Math.abs(centavosDe(esperado) - centavosDe(sub.importe)) > TOLERANCIA_IVA_EN_CENTAVOS
    ) {
      push(
        `iva[${i}].importe`,
        `IVA inconsistente: base ${sub.baseImponible} @ alícuota ${sub.id} ⇒ ~${enMensaje(esperado)}, recibido ${sub.importe}.`,
      );
    }
  });
  if (!montosEscribibles) return { ok: false, errores };

  // Las sumas, en centavos enteros y sin tolerancia: todo ya viene al centavo.
  const netoAcum = sumarAlCentavo(comp.iva.map((sub) => sub.baseImponible));
  const ivaAcum = sumarAlCentavo(comp.iva.map((sub) => sub.importe));
  const netoMasIva = sumarAlCentavo([netoAcum, ivaAcum, exento, noGravado]);
  if (centavosDe(netoAcum) !== centavosDe(comp.neto)) {
    push('neto', `No coincide con la suma de bases (${enMensaje(netoAcum)}).`);
  }
  if (centavosDe(netoMasIva) !== centavosDe(comp.total)) {
    push('total', `No coincide con neto + IVA + exento + no gravado (${enMensaje(netoMasIva)}).`);
  }

  return { ok: errores.length === 0, errores };
}
