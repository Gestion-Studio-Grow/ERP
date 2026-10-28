// ============================================================================
// «RINDIÓ TODO COMO SALIÓ» — lo que se va a hacer y lo que se hizo, en palabras (Magra, tanda práctica).
// ============================================================================
//
// Una salida entera se rinde en un toque (más la confirmación) cuando el cadete volvió con todo
// como estaba en la hoja: lo que salió pago queda entregado («ya pagó», o «cobrado» con los pagos
// del LIBRO si se cobró mientras estaba en la calle) y lo que salió a cobrar queda entregado «a
// cobrar». Nunca se inventa un cobro: si el cadete cobró alguno, ése se rinde uno por uno antes.
// Este archivo es PURO: lo usan la pantalla (el aviso de la confirmación) y la acción (el mensaje).

import { textoPlata } from "@/lib/cobro/pie-de-cobro-core";
import { redondearAlCentavo, sumarAlCentavo } from "@/lib/dinero/redondeo";
import type { ResultadoDeRendicion } from "../reparto-core";

export type PlanDeRendirTodo = { envios: number; yaPagos: number; aCobrar: { cantidad: number; monto: number } };

/** Qué va a pasar con cada envío de la salida, según cómo salió (pago o a cobrar). PURA. */
export function planDeRendirTodo(envios: readonly { cobrado: boolean; total: number }[]): PlanDeRendirTodo {
  const aCobrar = { cantidad: 0, monto: 0 };
  let yaPagos = 0;
  for (const e of envios) {
    if (e.cobrado) yaPagos += 1;
    else {
      aCobrar.cantidad += 1;
      aCobrar.monto = redondearAlCentavo(aCobrar.monto + (Number.isFinite(e.total) ? e.total : 0));
    }
  }
  return { envios: envios.length, yaPagos, aCobrar };
}

const envios = (n: number) => (n === 1 ? "1 envío" : `${n} envíos`);

/** «2 ya pagos quedan entregados · 3 quedan a cobrar por $27.000». PURA. */
export function textoDelPlan(p: PlanDeRendirTodo): string {
  const partes: string[] = [];
  if (p.yaPagos) partes.push(p.yaPagos === 1 ? "1 pago queda entregado" : `${p.yaPagos} pagos quedan entregados`);
  if (p.aCobrar.cantidad) {
    partes.push(`${p.aCobrar.cantidad === 1 ? "1 queda" : `${p.aCobrar.cantidad} quedan`} a cobrar por ${textoPlata(p.aCobrar.monto)}`);
  }
  return partes.join(" · ") || "No hay envíos en esta salida";
}

/** La etiqueta del botón de confirmar: «Sí, rendir los 5 envíos». PURA. */
export function etiquetaDeConfirmar(n: number): string {
  return n === 1 ? "Sí, rendir el envío" : `Sí, rendir los ${n} envíos`;
}

export type EnvioRendidoDeUnaVez = { code: number; como: ResultadoDeRendicion; total: number; aCuenta: boolean };

/** Lo que contesta la acción: lo rendido, lo que ya estaba y lo que no se pudo, con su porqué. PURA. */
export function mensajeDeRendirTodo(p: {
  rendidos: readonly EnvioRendidoDeUnaVez[];
  yaEstaban: readonly number[];
  fallaron: readonly { code: number; error: string }[];
}): string {
  const partes: string[] = [];
  if (p.rendidos.length) {
    const cobrados = p.rendidos.filter((r) => r.como === "cobrado").length;
    const pagos = p.rendidos.filter((r) => r.como === "ya-pago").length;
    const aCuenta = p.rendidos.filter((r) => r.como === "a-cobrar" && r.aCuenta);
    const aCobrar = p.rendidos.filter((r) => r.como === "a-cobrar" && !r.aCuenta);
    const detalle: string[] = [];
    if (pagos) detalle.push(pagos === 1 ? "1 ya pagaba" : `${pagos} ya pagaban`);
    if (cobrados) detalle.push(cobrados === 1 ? "1 cobrado en la calle (lo del libro)" : `${cobrados} cobrados en la calle (lo del libro)`);
    if (aCobrar.length) detalle.push(`${aCobrar.length} a cobrar por ${textoPlata(sumarAlCentavo(aCobrar.map((r) => r.total)))}`);
    if (aCuenta.length) detalle.push(`${aCuenta.length} a la cuenta del cliente`);
    partes.push(`${p.rendidos.length === 1 ? "Rendido 1 envío" : `Rendidos ${p.rendidos.length} envíos`}: ${detalle.join(", ")}.`);
  }
  if (p.yaEstaban.length) partes.push(`Ya estaban rendidos: ${p.yaEstaban.map((c) => `#${c}`).join(", ")}.`);
  if (p.fallaron.length) {
    partes.push(`${p.fallaron.length === 1 ? "No se rindió 1 envío" : `No se rindieron ${envios(p.fallaron.length)}`}: ${p.fallaron.map((f) => `#${f.code} (${f.error})`).join(" ")}`);
  }
  return partes.join(" ") || "No había nada para rendir en esta salida.";
}
