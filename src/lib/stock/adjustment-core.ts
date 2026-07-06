// Núcleo PURO de AJUSTES / MERMAS de stock (F2) — el tercer flujo que mueve
// inventario, además de la venta (order-core) y la compra/reposición (purchase-core).
//
// Un ajuste corrige el stock por fuera del ciclo venta/compra: recuento físico,
// merma, rotura, vencimiento u otra corrección manual. A diferencia de la compra
// (que siempre SUMA) y la venta (que siempre RESTA), el ajuste lleva un delta
// FIRMADO: puede subir o bajar el stock. Se asienta como StockMovement tipo AJUSTE
// (ver src/lib/stock/ledger.ts) con `reason` OBLIGATORIO — un ajuste sin motivo no
// es auditable, y esa trazabilidad es justamente para qué existe el ledger.
//
// Este archivo es PURO (sin DB, sin tenant): toda la aritmética de signo vive acá
// para poder unit-testearla Y reusarla en el formulario (preview del delta en vivo)
// sin arrastrar Prisma al bundle del cliente. La persistencia está en
// `adjustment-insert.ts`, que se apoya en estos helpers.

import { round3 } from "@/lib/stock/ledger";

// Motivo del ajuste (categoría). Es lo que hace `reason` obligatorio: siempre hay
// uno. Cada motivo fija CÓMO se interpreta el número que carga el operador:
//   RECUENTO    → cuenta física: carga el stock REAL contado (absoluto) y el delta
//                 sale de la diferencia contra el stock del sistema.
//   MERMA/ROTURA/VENCIMIENTO → baja: carga la cantidad PERDIDA (magnitud) y siempre resta.
//   OTRO        → corrección libre: carga el delta FIRMADO (+ suma / − resta); exige nota.
export type AdjustmentMotivo = "RECUENTO" | "MERMA" | "ROTURA" | "VENCIMIENTO" | "OTRO";

export const ADJUSTMENT_MOTIVOS: readonly AdjustmentMotivo[] = [
  "RECUENTO",
  "MERMA",
  "ROTURA",
  "VENCIMIENTO",
  "OTRO",
];

// Etiqueta legible del motivo, para el `reason` persistido y la UI.
export function motivoLabel(m: AdjustmentMotivo): string {
  switch (m) {
    case "RECUENTO":
      return "Recuento";
    case "MERMA":
      return "Merma";
    case "ROTURA":
      return "Rotura";
    case "VENCIMIENTO":
      return "Vencimiento";
    case "OTRO":
      return "Otro";
  }
}

// Cómo se interpreta el valor que carga el operador para cada motivo.
//   COUNT  → valor = stock real contado (absoluto). Delta = contado − actual.
//   LOSS   → valor = cantidad perdida (magnitud). Delta = −|valor| (siempre baja).
//   SIGNED → valor = delta firmado tal cual (+ suma / − resta).
export type AdjustmentMode = "COUNT" | "LOSS" | "SIGNED";

export function motivoMode(m: AdjustmentMotivo): AdjustmentMode {
  switch (m) {
    case "RECUENTO":
      return "COUNT";
    case "MERMA":
    case "ROTURA":
    case "VENCIMIENTO":
      return "LOSS";
    case "OTRO":
      return "SIGNED";
  }
}

// ¿El motivo OTRO exige nota? Sí: es el único sin categoría descriptiva, así que la
// nota es lo que da el "por qué". Para el resto la nota es opcional (el motivo ya
// describe). Espeja la validación de la UI y la de la acción.
export function requiresNote(m: AdjustmentMotivo): boolean {
  return m === "OTRO";
}

// Delta FIRMADO que aplica una línea de ajuste, dado el modo, el valor cargado y el
// stock actual del producto. Puro y testeable. `current` sólo se usa en COUNT
// (recuento); en LOSS/SIGNED se ignora. Redondeado a 3 decimales (stock fraccional).
export function adjustmentDelta(
  mode: AdjustmentMode,
  value: number,
  current: number,
): number {
  if (!Number.isFinite(value)) return 0;
  switch (mode) {
    case "COUNT":
      return round3(value - current);
    case "LOSS":
      return round3(-Math.abs(value));
    case "SIGNED":
      return round3(value);
  }
}

// El `reason` que se persiste en cada movimiento: etiqueta del motivo + nota opcional.
// Nunca vacío (el motivo siempre está) → cumple "reason obligatorio".
export function buildReason(motivo: AdjustmentMotivo, note: string | null): string {
  const n = note?.trim();
  return n ? `${motivoLabel(motivo)} — ${n}` : motivoLabel(motivo);
}
