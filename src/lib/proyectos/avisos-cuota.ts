// Los textos que ve quien administra al marcar, facturar o chocar con el tope de cobro de una cuota. PURAS: sin base ni
// red, así se prueban (avisos-cuota.test.ts). La plata se cuenta en pesos (cobranza-core); un proyecto en otra
// moneda muestra además el equivalente en la suya, con el cambio de hoy que usa la propia cobranza.

import { pesos, redondear } from "./core";
import { nombreDelComprobante } from "@/lib/factura-de-prueba";
import type { Cobranza } from "./cobranza-core";

/** «$ 100.000» en un proyecto en pesos; «$ 100.000 (US$ 100)» en uno en dólares (con el cambio de su cobranza). */
export function pesosConEquivalente(enPesos: number, cob: Pick<Cobranza, "enMoneda"> | null | undefined): string {
  const m = cob?.enMoneda;
  if (!m || m.moneda === "ARS" || !(m.tc > 0)) return pesos(enPesos);
  return `${pesos(enPesos)} (${pesos(redondear(enPesos / m.tc), m.moneda)})`;
}

/** El cartel de éxito de «Marcar cobrado» / «Marcar pagado». */
/** Una cuota de pago enlazada a un comprobante se paga con una orden de pago, no a mano (CERT-4 y M4c). */
export const CUOTA_ENLAZADA = "Esta cuota está enlazada a un comprobante del proveedor: se paga con una orden de pago, en Proveedores › Órdenes de pago.";

export function listoMarcada(esCobro: boolean, importeEnPesos: number, cuota?: { monto: number; cobra: number; moneda: string }): string {
  const listo = `Listo: cuota marcada como ${esCobro ? "cobrada" : "pagada"} (${pesos(importeEnPesos)}).`;
  // P-06: una cuota de cobro que se marca por menos que su importe lo dice, con la diferencia y por qué no se cobra.
  const resto = cuota ? redondear(cuota.monto - cuota.cobra) : 0;
  if (!esCobro || !cuota || !(resto > 0.005)) return listo;
  return `${listo} La cuota era de ${pesos(cuota.monto, cuota.moneda)}: los ${pesos(resto, cuota.moneda)} restantes no se cobraron porque ya los cubren cobros registrados aparte o pasan lo que falta cobrar del presupuesto aprobado.`;
}

/** El cartel de éxito de «una parte» (cobro o pago a proveedor): lo que se asentó y lo que le sigue faltando a la cuota, en su moneda. */
export function listoParcial(importeEnPesos: number, falta: number, moneda: string, esCobro = true): string {
  return `Listo: se ${esCobro ? "cobró" : "pagó"} una parte (${pesos(importeEnPesos)}). A la cuota le faltan ${pesos(redondear(falta), moneda)}.`;
}

/** «Una parte» por más de lo que le falta a la cuota: nunca se cobra ni se paga de más. */
export function avisoMasQueLaCuota(falta: number, moneda: string, esCobro = true): string {
  const verbo = esCobro ? "cobrar" : "pagar";
  return `No se puede ${verbo} más de lo que le falta a la cuota (${pesos(redondear(falta), moneda)}). Para ${verbo} todo, dejá el monto vacío.`;
}

/**
 * Lo que le falta a la cuota cambió entre que se cargó la pantalla (o se leyó) y el clic: no se asentó nada. Dice cuánto
 * faltaba, cuánto falta ahora y por qué (entró otro cobro o pago, o se anuló uno), y cómo seguir.
 */
export function avisoSaldoCambio(antes: number, ahora: number, moneda: string, esCobro: boolean): string {
  const que = esCobro ? "cobro" : "pago";
  // La causa no se conoce: también la mueve un cambio del plan (otro anticipo, otro costo). Se nombra la probable y esa.
  const porque = `${ahora > antes ? `se anuló un ${que}` : `entró otro ${que}`} o cambió el plan de cuotas`;
  // Cubierta mientras tanto: «le faltan $ 0» no dice nada. Dice qué pasó y que ya no hay nada para asentar.
  if (redondear(ahora) <= 0) return `No se asentó nada: a esta cuota le faltaban ${pesos(redondear(antes), moneda)} y ya no le falta nada (${porque} mientras tanto). Recargá la página para verla al día.`;
  return `No se asentó nada: a esta cuota le faltaban ${pesos(redondear(antes), moneda)} y ahora le faltan ${pesos(redondear(ahora), moneda)} (${porque} mientras tanto). Si querés asentar lo que falta ahora, escribí el monto y confirmá, o recargá la página.`;
}

/** El cartel de éxito al anular un cobro o un pago: la plata vuelve y la cuota, si salió de una, recupera su saldo. */
export function listoAnulado(esCobro: boolean, enPesos: number): string {
  return `Listo: ${esCobro ? "cobro" : "pago"} de ${pesos(enPesos)} anulado. La caja y la cuenta quedaron como antes, y su cuota volvió a esperar ese importe.`;
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
