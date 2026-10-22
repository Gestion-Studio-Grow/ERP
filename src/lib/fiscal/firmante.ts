/**
 * Motor de facturación · QUIÉN FIRMA el pedido a ARCA de un negocio (ADR-066 + ADR-077 §6).
 *
 * El comprobante sale SIEMPRE a nombre del emisor (su CUIT va en `<Auth><Cuit>`). Lo que puede
 * cambiar es el certificado con el que se autentica en WSAA:
 *
 *   · PROPIO (ADR-066): el negocio tiene su certificado cargado (cifrado, por negocio). Manda.
 *   · DELEGADO (ADR-077 §6): el negocio no tiene certificado propio, pero autorizó el servicio
 *     `wsfe` al CUIT de un representante (el estudio contable / GSG) desde el Administrador de
 *     Relaciones de ARCA, y esa relación está VERIFICADA (`DelegacionFiscal.estado = verificada`).
 *     Firma el certificado del representante, guardado en el negocio del estudio.
 *
 * Una delegación declarada, fallida o revocada NO firma: un pedido firmado por alguien a quien ARCA
 * no le reconoce la relación vuelve con error de autorización, y el negocio cree que factura.
 * Sin certificado propio ni delegación verificada → error de CONFIGURACIÓN (el envío se detiene).
 *
 * PURO: recibe lo leído, devuelve la decisión. La lectura vive en `arca-dispatch.ts`.
 */

import { cuitValido, normalizarCuit } from "@/lib/cuit";

export interface DelegacionLeida {
  estado: string;
  servicio: string;
  cuitRepresentado: string;
  cuitRepresentante: string;
  estudioTenantId: string;
}

export type Firmante =
  | { tipo: "propio" }
  | { tipo: "delegado"; estudioTenantId: string; cuitRepresentante: string };

export type DecisionFirmante = { ok: true; firmante: Firmante } | { ok: false; motivo: string };

export function elegirFirmante(datos: {
  tieneCredencialPropia: boolean;
  cuitEmisor: string | null;
  delegacion: DelegacionLeida | null;
}): DecisionFirmante {
  if (datos.tieneCredencialPropia) return { ok: true, firmante: { tipo: "propio" } };
  const d = datos.delegacion;
  if (!d) {
    return {
      ok: false,
      motivo:
        "El negocio no tiene certificado de ARCA cargado ni una delegación verificada en el estudio. " +
        "Cargá el certificado o verificá la delegación del servicio de facturación (wsfe) antes de emitir.",
    };
  }
  if (d.servicio !== "wsfe") {
    return { ok: false, motivo: `La delegación cargada es del servicio «${d.servicio}», no del de facturación (wsfe).` };
  }
  if (d.estado !== "verificada") {
    return {
      ok: false,
      motivo:
        `La delegación en el estudio está «${d.estado}», no verificada: hasta que ARCA confirme la relación ` +
        "no se firma con el certificado del estudio.",
    };
  }
  const emisor = datos.cuitEmisor ? normalizarCuit(datos.cuitEmisor) : "";
  if (!emisor || !cuitValido(Number(emisor))) {
    return { ok: false, motivo: "El negocio no tiene un CUIT válido cargado: sin él no se puede usar la delegación." };
  }
  if (normalizarCuit(d.cuitRepresentado) !== emisor) {
    return {
      ok: false,
      motivo: "La delegación es de otro CUIT que el del negocio: no se usa. Revisá los datos de la delegación.",
    };
  }
  const representante = normalizarCuit(d.cuitRepresentante);
  if (!cuitValido(Number(representante))) {
    return { ok: false, motivo: "El CUIT del representante de la delegación no es válido." };
  }
  return { ok: true, firmante: { tipo: "delegado", estudioTenantId: d.estudioTenantId, cuitRepresentante: representante } };
}
