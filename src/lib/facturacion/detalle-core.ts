// ============================================================================
// DETALLE DE UN COMPROBANTE — qué dice arriba según su estado ante ARCA.
// ============================================================================
//
// El detalle decía siempre «Lo que dice el comprobante autorizado por ARCA» y, en el modo de
// prueba, «ARCA autorizó este comprobante», también a los RECHAZADOS; abajo, «Revisá el motivo en
// Facturación», sin el motivo y con «Volver a Facturación» como única salida. Ahora cada estado
// dice lo que es; el rechazado muestra el motivo de ARCA y cómo seguir según de dónde salió.
// PURO. Lo prueba detalle-core.test.ts.

import type { AmbienteArca, EstadoComprobante } from "@/lib/comprobante-pdf";
import { MOTIVO_IVA_SIN_ALICUOTA_POR_PRODUCTO } from "@/plugins/arca/domain/iva-por-producto";

/** De dónde salió el comprobante: decide cómo se vuelve a facturar si ARCA lo rechazó. */
export type OrigenDelComprobante = { tipo: "venta"; orderId: string } | { tipo: "turno" } | { tipo: "banco" } | { tipo: "otro" };

export interface EstadoDelDetalle {
  descripcion: string;
  /** El aviso del modo de prueba: sólo en lo que ARCA autorizó. */
  prueba: string | null;
  rechazo: {
    motivo: string;
    comoSeguir: string;
    /** La venta se vuelve a facturar ahí mismo (botón); el resto, con este enlace. */
    reFacturarVenta: string | null;
    enlace: { href: string; etiqueta: string } | null;
  } | null;
}

const RECHAZADOS = "/admin/facturacion?estado=rechazada";

export function estadoDelDetalle(d: {
  estado: EstadoComprobante;
  ambiente: AmbienteArca | null;
  rechazoMotivo: string | null;
  origen: OrigenDelComprobante;
}): EstadoDelDetalle {
  if (d.estado === "AUTHORIZED") {
    return {
      descripcion: "Lo que dice el comprobante autorizado por ARCA. El PDF es el que le das al cliente.",
      prueba: d.ambiente === "prueba" ? "ARCA autorizó este comprobante en su modo de prueba: no tiene validez fiscal. El PDF lo dice arriba de todo." : null,
      rechazo: null,
    };
  }
  if (d.estado === "PENDING") {
    return {
      descripcion:
        "ARCA todavía no lo autorizó: no tiene número ni CAE y no se le puede dar al cliente. Mandalo desde Facturación con «Autorizar los pendientes».",
      prueba: null,
      rechazo: null,
    };
  }
  const motivo = d.rechazoMotivo?.trim() || "ARCA no mandó el motivo.";
  const base = { motivo, reFacturarVenta: null, enlace: { href: RECHAZADOS, etiqueta: "Ver los rechazados" } };
  const rechazo: NonNullable<EstadoDelDetalle["rechazo"]> =
    // ENG-024: al inscripto el sistema todavía no le emite (iva-por-producto.ts). Volver a
    // facturar, venga de donde venga, da el mismo rechazo: sin botón y con la salida real.
    motivo.includes(MOTIVO_IVA_SIN_ALICUOTA_POR_PRODUCTO)
      ? {
          ...base,
          comoSeguir:
            "Desde el sistema todavía no se puede emitir: volver a facturarla da el mismo rechazo. Emitila desde la página de ARCA (Comprobantes en línea) o consultá a tu contador.",
        }
      : d.origen.tipo === "venta"
      ? {
          ...base,
          comoSeguir:
            "Corregí lo que marca ARCA (por ejemplo, el CUIT o la condición frente al IVA del cliente, o el IVA de un producto) y volvé a facturar la venta con el botón de acá abajo.",
          reFacturarVenta: d.origen.orderId,
        }
      : d.origen.tipo === "banco"
        ? {
            ...base,
            comoSeguir: "Corregí los datos del comprador en Facturación automática y volvé a emitirlo desde ahí.",
            enlace: { href: "/admin/facturacion/bancos", etiqueta: "Ir a Facturación automática" },
          }
        : d.origen.tipo === "turno"
          ? { ...base, comoSeguir: "Corregí lo que marca ARCA en la ficha del cliente y avisale a soporte para volver a facturar el turno." }
          : { ...base, comoSeguir: "Corregí lo que marca ARCA y volvé a facturar la venta desde donde la cobraste." };
  return {
    descripcion: "ARCA rechazó este comprobante: no es una factura válida y no se le puede dar al cliente.",
    prueba: null,
    rechazo,
  };
}
