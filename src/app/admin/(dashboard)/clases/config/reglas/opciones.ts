// Las opciones de Reglas en chips (matias-DISENO.md §2.3: «Anticipación en chips», nunca
// «anticipación en minutos»). PURO.

import type { OpcionChip } from "../_campo";

export const ANTICIPACION: readonly OpcionChip[] = [
  { valor: 0, rotulo: "Sin mínimo" },
  { valor: 60, rotulo: "1 h" },
  { valor: 120, rotulo: "2 h" },
  { valor: 360, rotulo: "6 h" },
  { valor: 1440, rotulo: "1 día" },
];

export const DIAS_VISIBLES: readonly OpcionChip[] = [
  { valor: 7, rotulo: "1 semana" },
  { valor: 14, rotulo: "2 semanas" },
  { valor: 21, rotulo: "3 semanas" },
  { valor: 30, rotulo: "1 mes" },
];

export const PEDIDOS_SIN_RESPONDER: readonly OpcionChip[] = [
  { valor: 1, rotulo: "1" },
  { valor: 2, rotulo: "2" },
  { valor: 3, rotulo: "3" },
  { valor: 5, rotulo: "5" },
];

export const DURACIONES: readonly OpcionChip[] = [
  { valor: 60, rotulo: "60 min" },
  { valor: 90, rotulo: "90 min" },
  { valor: 120, rotulo: "120 min" },
];

/** «Te piden con 2 h de anticipación»: para la tarjeta de Ajustes. */
export function rotuloAnticipacion(min: number): string {
  if (min <= 0) return "Te piden hasta último momento";
  if (min % 1440 === 0) return `Te piden con ${min / 1440} día${min === 1440 ? "" : "s"} de anticipación`;
  if (min % 60 === 0) return `Te piden con ${min / 60} h de anticipación`;
  return `Te piden con ${Math.floor(min / 60) ? `${Math.floor(min / 60)} h ` : ""}${min % 60} min de anticipación`;
}

/** El rótulo de un valor que no está en los chips (venía del formulario viejo): «90 min», «3 h». */
export function rotuloMinutos(min: number): string {
  if (min % 1440 === 0 && min > 0) return `${min / 1440} día${min === 1440 ? "" : "s"}`;
  if (min % 60 === 0 && min > 0) return `${min / 60} h`;
  return `${min} min`;
}
