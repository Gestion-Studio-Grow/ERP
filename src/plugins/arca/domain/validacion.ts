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

export interface ErrorValidacion {
  campo: string;
  mensaje: string;
}

export interface ResultadoValidacion {
  ok: boolean;
  errores: ErrorValidacion[];
}

const RE_FECHA = /^\d{8}$/; // AAAAMMDD
/** Tolerancia de redondeo al verificar los montos del Core. */
const TOLERANCIA = 0.01;

function esFechaValida(f: string | undefined): boolean {
  return !!f && RE_FECHA.test(f);
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

  if (!(comp.total > 0)) {
    push('total', 'Debe ser mayor a 0.');
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

  if (comp.numero !== undefined && (!Number.isInteger(comp.numero) || comp.numero <= 0)) {
    push('numero', 'Si se informa, debe ser un entero positivo.');
  }

  // Consistencia de los montos del Core: verificar, no recalcular.
  let netoAcum = 0;
  let ivaAcum = 0;
  comp.iva.forEach((sub, i) => {
    if (!(sub.baseImponible >= 0)) {
      push(`iva[${i}].baseImponible`, 'No puede ser negativa.');
    }
    const esperado = sub.baseImponible * (PORCENTAJE_IVA[sub.id] ?? NaN);
    if (Number.isNaN(esperado)) {
      push(`iva[${i}].id`, 'Alícuota de IVA desconocida.');
    } else if (Math.abs(esperado - sub.importe) > TOLERANCIA) {
      push(
        `iva[${i}].importe`,
        `IVA inconsistente: base ${sub.baseImponible} @ alícuota ${sub.id} ⇒ ~${esperado.toFixed(2)}, recibido ${sub.importe}.`,
      );
    }
    netoAcum += sub.baseImponible;
    ivaAcum += sub.importe;
  });

  if (Math.abs(netoAcum - comp.neto) > TOLERANCIA) {
    push('neto', `No coincide con la suma de bases (${netoAcum.toFixed(2)}).`);
  }
  if (Math.abs(netoAcum + ivaAcum - comp.total) > TOLERANCIA) {
    push('total', `No coincide con neto + IVA (${(netoAcum + ivaAcum).toFixed(2)}).`);
  }

  return { ok: errores.length === 0, errores };
}
