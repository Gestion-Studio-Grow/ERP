// ============================================================================
// RETENCIONES Y PERCEPCIONES SUFRIDAS — los pagos a cuenta que el banco ya descontó. PURO.
// ============================================================================
//
// Cada mes el banco le descuenta al negocio impuestos que después pueden tomarse A CUENTA en la
// declaración: la retención de Ingresos Brutos sobre los créditos (SIRCREB), las percepciones
// de IVA y las retenciones de Ganancias. Si nadie los junta, se pierden: se paga dos veces el
// mismo impuesto.
//
// El impuesto a los débitos y créditos (el "impuesto al cheque", ley 25.413) va APARTE y no se
// suma al total: qué parte se puede computar a cuenta (y contra qué) depende de la condición
// del negocio (inscripto, pyme con certificado, monotributo) y la define el contador. Sumarlo
// entero como "pago a cuenta" le prometía a un monotributista una plata que no recupera.
//
// El dato ya existe: los movimientos del extracto que se sube en Facturación automática
// (`MovimientoImportado`). El clasificador del banco los reconoce para NO facturarlos
// (plugins/bancos/domain/clasificador.ts, regla "comision-impuesto") y ahí terminaban. Acá se
// los junta por tipo con leyendas PROPIAS, más finas que las de esa regla: a la regla le basta
// saber que no es una venta; acá hay que saber de qué impuesto es, y separar el IVA de una
// comisión (gasto) de una percepción de IVA.
//
// Lo que NO es un pago a cuenta y se deja afuera: la comisión del banco, el mantenimiento de
// cuenta y el IVA de esas comisiones (es IVA de un gasto, no una percepción). Un crédito con
// la misma leyenda (la devolución de una retención) resta.
//
// Sin Prisma: recibe filas ya leídas.

import { round2 } from "@/lib/round";
import { normalizarTexto } from "@/plugins/bancos/domain/valores";
import { bordesDelMes, type MesKey } from "@/lib/libros/fecha-fiscal";

export type TipoPagoACuenta = "iibb" | "iva" | "cheque" | "ganancias";

/** Orden en pantalla: las retenciones y percepciones primero, el impuesto al cheque al final. */
export const TIPOS_PAGO_A_CUENTA: readonly TipoPagoACuenta[] = ["iibb", "iva", "ganancias", "cheque"];

/** Las que suman al total: retenciones y percepciones. El impuesto al cheque va aparte. */
export const RETENCIONES_Y_PERCEPCIONES: readonly TipoPagoACuenta[] = ["iibb", "iva", "ganancias"];

export const ETIQUETA_PAGO_A_CUENTA: Readonly<Record<TipoPagoACuenta, string>> = {
  iibb: "Ingresos Brutos",
  iva: "IVA",
  cheque: "Impuesto al cheque",
  ganancias: "Ganancias",
};

/**
 * Qué pago a cuenta es un movimiento del extracto, por su leyenda, o `null` si no es uno.
 * El orden importa: "percepción IVA" es IVA aunque diga "percepción", y el IVA suelto (sin
 * "percepción" ni "retención") es el IVA de una comisión: no es pago a cuenta. PURA.
 */
export function tipoDePagoACuenta(descripcion: string): TipoPagoACuenta | null {
  const d = normalizarTexto(descripcion);
  const esRetencion = /retenc|\bret\b|percep|\bperc\b|sircreb|\brg\s*\d/.test(d);

  if (/ley\s*25\.?413|\bimp(uesto)?\.?\s*(s\/\s*)?(a los\s*)?(deb|cred)|debitos? y creditos?/.test(d)) return "cheque";
  if (/sircreb|\biibb\b|ingresos? brutos|\bing\.?\s*brutos|\bib\b/.test(d)) return esRetencion ? "iibb" : null;
  if (/ganancias|\bgcias\b/.test(d)) return esRetencion ? "ganancias" : null;
  if (/\biva\b|rg\s*(2408|3337)/.test(d)) return esRetencion ? "iva" : null;
  return null;
}

/** Los movimientos del extracto con fecha fiscal (AAAAMMDD) en el mes. El mismo para la pantalla y el botón. */
export function whereExtractoDelMes(tenantId: string, mes: MesKey) {
  const { fiscal } = bordesDelMes(mes);
  return { tenantId, fecha: { gte: fiscal.gte, lt: fiscal.lt } };
}

export interface MovimientoDeExtracto {
  id: string;
  /** AAAAMMDD. */
  fecha: string;
  descripcion: string;
  /** Con signo: − débito (lo que el banco descontó), + crédito. */
  monto: number;
}

export interface PagoACuenta extends MovimientoDeExtracto {
  tipo: TipoPagoACuenta;
  /** Lo que suma al pago a cuenta: un débito suma, un crédito (devolución) resta. */
  importe: number;
}

export interface ResumenPagosACuenta {
  /** Retenciones y percepciones (IIBB, IVA, Ganancias). SIN el impuesto al cheque. */
  total: number;
  /** El impuesto al cheque del mes, aparte (lo que se computa lo define el contador). */
  impuestoAlCheque: number;
  porTipo: Record<TipoPagoACuenta, number>;
  movimientos: PagoACuenta[];
  /** Movimientos del extracto que se leyeron en el mes (para decir "no hay" con fundamento). */
  leidos: number;
}

/** Lo descontado en el mes, por tipo, del más viejo al más nuevo. PURA. */
export function resumirPagosACuenta(movs: readonly MovimientoDeExtracto[]): ResumenPagosACuenta {
  const porTipo: Record<TipoPagoACuenta, number> = { iibb: 0, iva: 0, cheque: 0, ganancias: 0 };
  const movimientos: PagoACuenta[] = [];
  for (const m of movs) {
    if (!Number.isFinite(m.monto) || m.monto === 0) continue;
    const tipo = tipoDePagoACuenta(m.descripcion);
    if (!tipo) continue;
    const importe = round2(-m.monto);
    porTipo[tipo] = round2(porTipo[tipo] + importe);
    movimientos.push({ ...m, tipo, importe });
  }
  movimientos.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
  const total = round2(RETENCIONES_Y_PERCEPCIONES.reduce((s, t) => s + porTipo[t], 0));
  return { total, impuestoAlCheque: porTipo.cheque, porTipo, movimientos, leidos: movs.length };
}
