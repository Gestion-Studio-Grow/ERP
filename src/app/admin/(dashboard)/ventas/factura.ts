// ============================================================================
// FACTURAR UNA VENTA — cuándo se llama al facturador y qué dice la fila. PURO.
// ============================================================================
//
// «Facturar» está en Vender (la venta recién cobrada) y en Ventas del día (cada fila). Llama a
// `facturarOrden` SÓLO si la facturación electrónica está encendida y el perfil fiscal del
// negocio está completo. Si no, no se emite nada: la fila dice «Sin factura», con el porqué, y
// ofrece reintentar. No emitir es reversible; emitir mal no (un comprobante con datos fiscales
// inventados no se borra: se anula con nota de crédito).
//
// Un Responsable Inscripto queda afuera a propósito: la factura de la venta de un RI necesita
// la alícuota de IVA por producto (la carne va al 10,5 %) y eso llega en la ola 9. Hasta
// entonces, calcular todo al 21 % emitiría un comprobante equivocado.
//
// Dato puro: lo importan la Server Action y las pantallas (FilaVenta, VenderForm).

export type EstadoFactura = "facturada" | "en-tramite" | "rechazada" | "sin-factura";

export type FacturaDeVenta = { estado: EstadoFactura; texto: string };

export const SIN_FACTURA: FacturaDeVenta = { estado: "sin-factura", texto: "Sin factura" };

/** Letra del comprobante según el tipo de ARCA (1 = A, 6 = B, 11 = C). */
function letra(tipo: number | null): string {
  if (tipo === 1) return "A";
  if (tipo === 6) return "B";
  if (tipo === 11) return "C";
  return "";
}

/** Lo que dice la fila de una venta según su comprobante (o la falta de él). PURA. */
export function estadoDeFactura(
  inv: {
    status: string;
    numero: number | null;
    puntoVenta: number;
    tipoComprobante: number | null;
    rechazoMotivo: string | null;
  } | null,
): FacturaDeVenta {
  if (!inv) return SIN_FACTURA;
  if (inv.status === "AUTHORIZED") {
    const l = letra(inv.tipoComprobante);
    const numero =
      inv.numero != null ? ` ${String(inv.puntoVenta).padStart(4, "0")}-${String(inv.numero).padStart(8, "0")}` : "";
    return { estado: "facturada", texto: `Factura${l ? ` ${l}` : ""}${numero}` };
  }
  if (inv.status === "REJECTED") {
    return {
      estado: "rechazada",
      texto: `ARCA rechazó la factura${inv.rechazoMotivo ? `: ${inv.rechazoMotivo}` : ""}. Revisalo en Facturación.`,
    };
  }
  return { estado: "en-tramite", texto: "Factura en trámite con ARCA" };
}

/** Qué dato fiscal falta, en palabras de la dueña (el campo viene de `PerfilFiscalIncompletoError`). */
export function faltanteFiscalEnPalabras(campo: string | null | undefined): string {
  if (campo === "arcaCuit") return "el CUIT";
  if (campo === "arcaPuntoVenta") return "el punto de venta";
  if (campo === "condicionIva") return "la condición frente al IVA";
  return "los datos fiscales del negocio";
}

export type PerfilParaFacturar = { ok: true; condicionIva: string } | { ok: false; falta: string };

/**
 * ¿Se llama al facturador para esta venta? PURA. Si no, el motivo es lo que la fila muestra
 * al lado de «Sin factura».
 */
export function puedeFacturarVenta(input: {
  facturacionEncendida: boolean;
  /** Se lee sólo con la facturación encendida: apagada, no hace falta ir a buscarlo. */
  perfil: PerfilParaFacturar | null;
  venta: { paid: boolean; anulada: boolean; total: number };
}): { ok: true } | { ok: false; motivo: string } {
  const { venta } = input;
  if (venta.anulada) return { ok: false, motivo: "Una venta anulada no se factura." };
  if (!venta.paid) return { ok: false, motivo: "Sólo se facturan las ventas cobradas o dejadas a cuenta." };
  if (!(venta.total > 0)) return { ok: false, motivo: "Una venta sin importe no se factura." };
  if (!input.facturacionEncendida) {
    return {
      ok: false,
      motivo: "La facturación electrónica no está encendida en este negocio: la venta queda sin factura. Reintentá cuando esté encendida.",
    };
  }
  const p = input.perfil;
  if (!p || !p.ok) {
    return {
      ok: false,
      motivo: `Falta ${p && !p.ok ? p.falta : "los datos fiscales del negocio"} en los datos fiscales. Cargalo y reintentá: no se emite con datos provisorios.`,
    };
  }
  if (p.condicionIva === "RESPONSABLE_INSCRIPTO") {
    return {
      ok: false,
      motivo: "Para un Responsable Inscripto la factura de la venta todavía no se emite desde acá (falta el IVA por producto).",
    };
  }
  return { ok: true };
}
