/**
 * FACTURITA — lógica pura del producto C (ADR-076): el emisor simple con tope
 * de 5 facturas por mes. Sin DB ni red: validación del receptor, reglas del
 * tope y armado del comprobante se testean solos; la persistencia vive en
 * `facturita-actions`.
 */

import { cuitValido, normalizarCuit } from "@/plugins/bancos/domain/cuit";

/** Tope del plan gratis: 5 facturas por mes (el gancho de upgrade a Comerciante). */
export const LIMITE_FACTURAS_FACTURITA = 5;

/** Aviso desde la 4ª factura ("te queda 1"). */
export const AVISO_DESDE = LIMITE_FACTURAS_FACTURITA - 1;

export interface EstadoLimite {
  usadas: number;
  limite: number;
  restantes: number;
  puedeEmitir: boolean;
  /** Mensaje de aviso/bloqueo en criollo (null si no corresponde mostrar nada). */
  mensaje: string | null;
}

/** Estado del tope mensual a partir de las facturas ya emitidas en el mes. */
export function estadoLimite(usadas: number): EstadoLimite {
  const restantes = Math.max(0, LIMITE_FACTURAS_FACTURITA - usadas);
  const puedeEmitir = usadas < LIMITE_FACTURAS_FACTURITA;
  let mensaje: string | null = null;
  if (!puedeEmitir) {
    mensaje =
      "Llegaste al tope de 5 facturas gratis de este mes. Para seguir emitiendo sin límite, pasate a Comerciante: mismo lugar, más músculo.";
  } else if (usadas >= AVISO_DESDE) {
    mensaje = `Te queda ${restantes === 1 ? "1 factura gratis" : `${restantes} facturas gratis`} este mes.`;
  }
  return { usadas, limite: LIMITE_FACTURAS_FACTURITA, restantes, puedeEmitir, mensaje };
}

// ---------------------------------------------------------------------------
// Receptor y datos de la emisión manual
// ---------------------------------------------------------------------------

export interface EmisionFacturita {
  /** Descripción de lo vendido ("qué se vendió o qué servicio se prestó"). */
  descripcion: string;
  /** Total de la factura en pesos (IVA incluido si corresponde). */
  total: number;
  /** Receptor: vacío = consumidor final. */
  docTipo?: 80 | 86 | 96; // CUIT | CUIL | DNI
  docNro?: string;
}

export type ValidacionEmision =
  | { ok: true; receptor: { docTipo: number; docNro: number } }
  | { ok: false; error: string };

const DOC_CONSUMIDOR_FINAL = 99;

/**
 * Valida la emisión manual. Receptor vacío → consumidor final (DocTipo 99).
 * CUIT/CUIL con dígito verificador real; DNI de 7 u 8 dígitos.
 */
export function validarEmision(datos: EmisionFacturita): ValidacionEmision {
  const descripcion = datos.descripcion?.trim() ?? "";
  if (!descripcion) {
    return { ok: false, error: "Contá qué vendiste: la descripción va en la factura." };
  }
  if (!(datos.total > 0)) {
    return { ok: false, error: "El total tiene que ser mayor a cero." };
  }

  // Sin documento → consumidor final.
  const docNroCrudo = datos.docNro?.trim() ?? "";
  if (!datos.docTipo || docNroCrudo === "") {
    return { ok: true, receptor: { docTipo: DOC_CONSUMIDOR_FINAL, docNro: 0 } };
  }

  if (datos.docTipo === 96) {
    const soloDigitos = docNroCrudo.replace(/\D/g, "");
    if (!/^\d{7,8}$/.test(soloDigitos)) {
      return { ok: false, error: "El DNI lleva 7 u 8 dígitos." };
    }
    return { ok: true, receptor: { docTipo: 96, docNro: Number(soloDigitos) } };
  }

  const cuit = normalizarCuit(docNroCrudo);
  if (!cuitValido(cuit)) {
    return { ok: false, error: "El CUIT no es válido: revisá los 11 números." };
  }
  return { ok: true, receptor: { docTipo: datos.docTipo, docNro: Number(cuit) } };
}
