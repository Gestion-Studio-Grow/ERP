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
// Un Responsable Inscripto factura con la letra que decide el sistema (R1-F5): A a otro inscripto
// o a un monotributista, B a un consumidor final, según la ficha fiscal del cliente de la venta
// (`decidirFacturaDeVenta`, la misma decisión que usa el despacho a ARCA). Sólo si el IVA sale de
// la alícuota de cada producto (la carne va al 10,5 %): calcular todo al 21 % emitiría un
// comprobante equivocado, y el despacho tampoco lo deja salir (plugins/arca/domain/iva-por-producto.ts).
// Monotributo y exento siguen como siempre: Factura C, sin mirar al comprador.
//
// Dato puro: lo importan la Server Action y las pantallas (FilaVenta, VenderForm).

import {
  decidirFacturaDeVenta,
  motivoDeLaDecision,
  queImpideEntregarLaFactura,
  type FichaFiscal,
} from "@/lib/fiscal/ficha-fiscal";
import type { Letra } from "@/lib/fiscal/decidir-comprobante";
import { calcularImpuestosPorAlicuota, type RenglonConAlicuota } from "@/lib/fiscal/impuestos-por-alicuota";

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

export type PerfilParaFacturar =
  | {
      ok: true;
      condicionIva: string;
      /** CUIT del negocio: la decisión no deja que se facture a sí mismo. */
      cuit?: string | number | null;
      /** Clase A que ARCA le asignó al inscripto (RG 1575). Sin dato, la A no sale sola. */
      regimenFacturaA?: string | null;
    }
  | { ok: false; falta: string };

/** Lo que dice la fila cuando un inscripto vende sin la alícuota de cada producto. */
export { MOTIVO_INSCRIPTO_SIN_ALICUOTA } from "@/lib/fiscal/impuestos-por-alicuota";

/**
 * ¿Se llama al facturador para esta venta? PURA. Si no, el motivo es lo que la fila muestra
 * al lado de «Sin factura». Para un inscripto dice además con qué letra sale.
 */
export function puedeFacturarVenta(input: {
  facturacionEncendida: boolean;
  /** Se lee sólo con la facturación encendida: apagada, no hace falta ir a buscarlo. */
  perfil: PerfilParaFacturar | null;
  venta: { paid: boolean; anulada: boolean; total: number };
  /** Sólo inscripto: ficha fiscal del cliente de la venta (`null`: consumidor final sin identificar). */
  receptor?: FichaFiscal | null;
  /**
   * Sólo inscripto: lo cobrado por cada producto de la venta con su alícuota de IVA
   * (`Product.alicuotaIva`). Se calcula con lo mismo que usa la emisión
   * (`calcularImpuestosPorAlicuota`): si así no sale la factura, no se promete.
   */
  renglones?: readonly RenglonConAlicuota[];
  /** Sólo inscripto: día del negocio en que se pide el CAE (AAAAMMDD). */
  hoy?: string;
}): { ok: true; letra?: Letra } | { ok: false; motivo: string } {
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
    const impuestos = calcularImpuestosPorAlicuota("RESPONSABLE_INSCRIPTO", {
      total: venta.total,
      renglones: input.renglones ?? [],
    });
    if (!impuestos.ok) return { ok: false, motivo: impuestos.motivo };
    if (!input.hoy) {
      return { ok: false, motivo: "No se pudo decidir la letra de la factura porque falta la fecha del día. Reintentá." };
    }
    const d = decidirFacturaDeVenta(
      { condicionIva: p.condicionIva, cuit: p.cuit ?? null, regimenFacturaA: p.regimenFacturaA ?? null },
      input.receptor ?? null,
      { hoy: input.hoy, total: venta.total },
    );
    if (d.estado !== "lista" || !d.comprobante) return { ok: false, motivo: motivoDeLaDecision(d) };
    // ARCA autoriza A que el impreso no puede entregar (sin domicilio, con varias alícuotas, sin
    // la leyenda de la RG 5003): esas no se prometen, y no se pide un CAE sin papel.
    const impide = queImpideEntregarLaFactura(d, input.receptor, impuestos.impuestos.iva.length);
    if (impide) return { ok: false, motivo: impide };
    return { ok: true, letra: d.comprobante.letra };
  }
  return { ok: true };
}
