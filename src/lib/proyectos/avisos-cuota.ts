// Los textos que ve quien administra al marcar, facturar o chocar con el tope de cobro de una cuota. PURAS: sin base ni
// red, así se prueban (avisos-cuota.test.ts). La plata se cuenta en pesos (cobranza-core); un proyecto en otra
// moneda muestra además el equivalente en la suya, con el cambio de hoy que usa la propia cobranza.

import { pesos, redondear } from "./core";
import { plataEn } from "./gestion-core";
import { nombreDelComprobante } from "@/lib/factura-de-prueba";
import type { Cobranza } from "./cobranza-core";

/** «$ 100.000» en un proyecto en pesos; «$ 100.000 (US$ 100)» en uno en dólares (con el cambio de su cobranza). */
export function pesosConEquivalente(enPesos: number, cob: Pick<Cobranza, "enMoneda"> | null | undefined): string {
  const m = cob?.enMoneda;
  if (!m || m.moneda === "ARS" || !(m.tc > 0)) return pesos(enPesos);
  return `${pesos(enPesos)} (${plataEn(redondear(enPesos / m.tc), m.moneda)})`;
}

/** El cartel de éxito de «Marcar cobrado» / «Marcar pagado». */
export function listoMarcada(esCobro: boolean, importeEnPesos: number): string {
  return `Listo: cuota marcada como ${esCobro ? "cobrada" : "pagada"} (${pesos(importeEnPesos)}).`;
}

/** Lo que se sabe de la factura de una cuota, en el formato de facturar-cuota.server.ts (`FacturaDeCuotaVista`). */
export interface FacturaDeCuotaTexto {
  status: string;
  tipoComprobante: number | null;
  puntoVenta: number;
  numero: number | null;
  rechazoMotivo?: string | null;
}

/** El cartel de éxito de «Facturar»: con el número si ARCA ya la autorizó; si no, que quedó pedida. */
export function listoFacturada(f: FacturaDeCuotaTexto | null | undefined): string {
  if (f?.status === "AUTHORIZED") {
    const nombre = nombreDelComprobante(f.tipoComprobante, f.puntoVenta, f.numero);
    return nombre ? `Listo: emitida ${nombre}.` : "Listo: ARCA autorizó la factura.";
  }
  if (f?.status === "REJECTED") return `ARCA rechazó la factura${f.rechazoMotivo ? `: ${f.rechazoMotivo}` : "."} Corregí lo que indica y usá «Volver a facturar».`;
  return "Listo: la factura quedó pedida a ARCA. El número aparece apenas la autorice.";
}

/** Lo que se muestra en la columna «Factura» de Administración cuando la cuota se facturó con ARCA. */
export function textoFacturaDeCuota(f: FacturaDeCuotaTexto | null | undefined): string | null {
  if (!f) return null;
  if (f.status === "AUTHORIZED") return nombreDelComprobante(f.tipoComprobante, f.puntoVenta, f.numero) ?? "Factura autorizada";
  if (f.status === "PENDING") return "Factura en camino a ARCA";
  return null; // rechazada: la cuota queda como sin facturar (se vuelve a facturar desde la ficha)
}

/** Rechazo de «Marcar cobrado» porque el cobro pasa lo que falta cobrar del proyecto. */
export function avisoTopeMarcar(importeEnPesos: number, cob: Pick<Cobranza, "enMoneda"> | null | undefined): string {
  return `Pasa lo que falta cobrar del proyecto: ${pesosConEquivalente(importeEnPesos, cob)} es más de lo que se debe. Recargá la página y revisá los cobros.`;
}

/** Rechazo de un cobro registrado a mano que pasa lo que falta cobrar. */
export function avisoTopeCobro(porCobrar: number, monto: number, cob: Pick<Cobranza, "enMoneda"> | null | undefined): string {
  return `Pasa lo que falta cobrar: quedan ${pesosConEquivalente(porCobrar, cob)} y el cobro es de ${pesosConEquivalente(monto, cob)}.`;
}

/** Rechazo de una cuota de cobro cargada a mano que no entra en lo que falta cobrar. */
export function avisoTopeCuota(t: { porCobrar: number; esperado: number; lugar: number }, cob: Pick<Cobranza, "enMoneda"> | null | undefined): string {
  if (!(t.lugar > 0)) {
    return `No entra otra cuota: las cuotas pendientes (${pesosConEquivalente(t.esperado, cob)}) ya cubren todo lo que falta cobrar (${pesosConEquivalente(t.porCobrar, cob)}). Para hacer lugar, editá o quitá una de las cuotas que ya están.`;
  }
  return `Ese cobro pasa lo que falta cobrar: el cliente debe ${pesosConEquivalente(t.porCobrar, cob)} y las cuotas pendientes ya esperan ${pesosConEquivalente(t.esperado, cob)}. Como mucho podés cargar ${pesosConEquivalente(t.lugar, cob)}.`;
}

/**
 * Una cuota de cobro sin marcar a la que ya no le falta nada: lo cobrado aparte (cobros sueltos) la cubrió. Una cargada a
 * mano se puede quitar; una del plan no: se explica que no hay nada que hacer.
 */
export function textoCubierta(auto: boolean): string {
  return auto
    ? "Cubierta con cobros registrados: no queda nada por cobrar, no hace falta marcarla."
    : "Cubierta con cobros registrados: no queda nada por cobrar. Si ya no corre, quitala.";
}
