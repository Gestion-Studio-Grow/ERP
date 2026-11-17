// ============================================================================
// PROYECTOS · cobros — las columnas que se leen de "ProyectoPago" y la clave de envío del formulario «Registrar cobro».
// PURO (sin base): lo usan la acción, las lecturas de la ficha y sus tests.
// ============================================================================

import type { Prisma } from "@/generated/prisma/client";

/**
 * Las columnas de un cobro que muestran las pantallas, nombradas una por una. Sin `select`, Prisma pide TODAS las del
 * modelo: mientras la migración de `claveEnvio` no esté aplicada (Gate 2), esa lectura fallaría con P2022.
 */
export const COLUMNAS_PAGO = {
  id: true,
  tenantId: true,
  proyectoId: true,
  medio: true,
  monto: true,
  nota: true,
  cobradoPor: true,
  anuladoEl: true,
  anuladoPor: true,
  createdAt: true,
} as const satisfies Prisma.ProyectoPagoSelect;

/**
 * La clave del envío: la genera el navegador una vez por cobro y la repite si reenvía el mismo formulario. Se acepta
 * sólo con forma de clave aleatoria (16 a 64 caracteres URL-safe); cualquier otra cosa es «sin clave» (el cobro se graba
 * como siempre, sin reconocer repetidos).
 */
export function claveDeEnvio(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return /^[A-Za-z0-9_-]{16,64}$/.test(s) ? s : null;
}
