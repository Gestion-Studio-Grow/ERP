// ============================================================================
// LA FACTURA DE PRUEBA DE VERDAD (ARCA en modo prueba, simulado). PURO.
// ============================================================================
//
// QA 26/09, bloqueante 3: el botón «Modo prueba: emitir factura de prueba» contestaba siempre
// «CAE STUB00000001, número 1», sin letra ni receptor, y no guardaba nada: no probaba la
// facturación del negocio. Ésta sí es una factura: sale por el MISMO motor que una venta
// (createInvoice → envío → despacho a ARCA simulado), con la letra que decide el sistema según
// quién emite y a quién (A, B o C), numeración correlativa, y queda en la lista, en la cartera
// del estudio y en el Libro IVA. Sólo con ARCA en modo prueba: su CAE empieza con «STUB» y no
// vale ante ARCA.
//
// Acá sólo se ARMA (qué importes y qué receptor). La acción está en arca-pruebas-actions.ts.

import type { CondicionIva } from "@/lib/fiscal";
import type { SubtotalIva } from "@/lib/invoice-core";
import { calcularImpuestos, calcularImpuestosPorAlicuota } from "@/lib/fiscal/impuestos-por-alicuota";
import {
  decidirFacturaDeVenta,
  motivoDeLaDecision,
  queImpideEntregarLaFactura,
  receptorParaComprobante,
  type FichaFiscal,
  type ReceptorDeComprobante,
} from "@/lib/fiscal/ficha-fiscal";

export const RECEPTORES_DE_PRUEBA = ["consumidor-final", "responsable-inscripto"] as const;
export type ReceptorDePrueba = (typeof RECEPTORES_DE_PRUEBA)[number];

export function esReceptorDePrueba(x: unknown): x is ReceptorDePrueba {
  return typeof x === "string" && (RECEPTORES_DE_PRUEBA as readonly string[]).includes(x);
}

/** $ 1.210 con IVA incluido: un inscripto la discrimina en $ 1.000 de neto y $ 210 de IVA al 21 %. */
export const TOTAL_DE_PRUEBA = 1210;
/** Código de ARCA de la alícuota del 21 %. */
const ALICUOTA_21 = 5;
/** CUIT de prueba que publica ARCA para homologación: no es de nadie. */
export const CUIT_RECEPTOR_DE_PRUEBA = 20111111112;

const CONSUMIDOR_FINAL: ReceptorDeComprobante = { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" };
const FICHA_INSCRIPTO: FichaFiscal = {
  docTipo: 80,
  docNro: String(CUIT_RECEPTOR_DE_PRUEBA),
  razonSocial: "Cliente de prueba",
  condicionIva: "RESPONSABLE_INSCRIPTO",
  domicilio: "Domicilio de prueba 123, CABA",
};

export type FacturaDePruebaArmada =
  | { ok: true; neto: number; iva: SubtotalIva[]; total: number; ivaPorProducto: boolean; receptor: ReceptorDeComprobante }
  | { ok: false; error: string };

/**
 * Importes y receptor de la factura de prueba. El inscripto factura con la MISMA decisión que una
 * venta (`decidirFacturaDeVenta`: A a otro inscripto, B a un consumidor final) y con el IVA por
 * alícuota; monotributo y exento, Factura C por el total. Si la decisión no deja emitir, se
 * devuelve su motivo tal cual (no se emite a medias). PURA.
 */
export function armarFacturaDePrueba(
  emisor: { condicionIva: CondicionIva; cuit: number; regimenFacturaA?: string | null },
  receptor: ReceptorDePrueba,
  hoy: string,
): FacturaDePruebaArmada {
  if (emisor.condicionIva !== "RESPONSABLE_INSCRIPTO") {
    const imp = calcularImpuestos(emisor.condicionIva, TOTAL_DE_PRUEBA);
    const r =
      receptor === "consumidor-final"
        ? CONSUMIDOR_FINAL
        : { docTipo: 80, docNro: CUIT_RECEPTOR_DE_PRUEBA, condicionIva: "RESPONSABLE_INSCRIPTO" };
    return { ok: true, neto: imp.neto, iva: imp.iva, total: imp.total, ivaPorProducto: false, receptor: r };
  }
  const calculo = calcularImpuestosPorAlicuota(emisor.condicionIva, {
    total: TOTAL_DE_PRUEBA,
    renglones: [{ total: TOTAL_DE_PRUEBA, alicuotaIva: ALICUOTA_21 }],
  });
  if (!calculo.ok) return { ok: false, error: "No se pudo calcular el IVA de la factura de prueba." };
  const ficha = receptor === "consumidor-final" ? null : FICHA_INSCRIPTO;
  const d = decidirFacturaDeVenta(
    { condicionIva: emisor.condicionIva, cuit: emisor.cuit, regimenFacturaA: emisor.regimenFacturaA ?? null },
    ficha,
    { hoy, total: TOTAL_DE_PRUEBA },
  );
  const r = receptorParaComprobante(d);
  if (!r) return { ok: false, error: motivoDeLaDecision(d) };
  const impide = queImpideEntregarLaFactura(d, ficha, calculo.impuestos.iva.length);
  if (impide) return { ok: false, error: impide };
  const { neto, iva, total } = calculo.impuestos;
  return { ok: true, neto, iva, total, ivaPorProducto: calculo.ivaPorProducto, receptor: r };
}

/** Letra del comprobante según el tipo de ARCA (1 = A, 6 = B, 11 = C). PURA. */
export function letraDelTipo(tipo: number | null | undefined): "A" | "B" | "C" | null {
  if (tipo === 1) return "A";
  if (tipo === 6) return "B";
  if (tipo === 11) return "C";
  return null;
}

/** «Factura B 0002-00000003»: como se lee en el comprobante impreso. PURA. */
export function nombreDelComprobante(tipo: number | null | undefined, puntoVenta: number | null, numero: number | null): string | null {
  const letra = letraDelTipo(tipo);
  if (!letra || !puntoVenta || !numero) return null;
  return `Factura ${letra} ${String(puntoVenta).padStart(4, "0")}-${String(numero).padStart(8, "0")}`;
}

/** A quién va, dicho para la dueña: «Consumidor final» o «CUIT 20-11111111-2». PURA. */
export function textoDelReceptor(docTipo: number | null | undefined, docNro: string | number | null | undefined): string {
  const nro = String(docNro ?? "").replace(/\D/g, "");
  if (docTipo === 80 && nro.length === 11) return `CUIT ${nro.slice(0, 2)}-${nro.slice(2, 10)}-${nro.slice(10)}`;
  if (docTipo === 96 && nro) return `DNI ${nro}`;
  return "Consumidor final";
}
