// LA PESTAÑA DEL NAVEGADOR POR NEGOCIO (E1, fuga de marca, 29/10/2026). Título e ícono salen del negocio que
// resuelve el host, en TODAS las rutas que no declaran los suyos (antes: «Panel de gestión» para toda la app con
// `TENANT_BRAND_SHEET_ENABLED` apagado). Una dirección sin negocio se presenta como Gestión Studio Grow, nunca como
// un cliente. PURO: el layout raíz junta los datos y esto decide.

import type { TenantBrand } from "@/lib/branding";
import { faviconGsgDataUri } from "@/lib/gsg/marca-svg";

export const NOMBRE_GSG = "GSG — Gestión Studio Grow";

/** Iniciales de respaldo para el ícono ("Velas DEMO" → "VD", "Magra" → "M"). PURA. */
export function inicialesDe(nombre: string): string {
  const w = nombre.trim().split(/\s+/).filter(Boolean);
  if (w.length === 0) return "•";
  if (w.length === 1) return w[0].slice(0, 1).toUpperCase();
  return w.map((x) => x[0]).join("").slice(0, 2).toUpperCase();
}

export type Pestana =
  | { tipo: "gsg"; titulo: string }
  | { tipo: "negocio"; titulo: string; glifo: string };

/**
 * Qué muestra la pestaña. `nombreDelTenant` es el nombre de la fila `Tenant` (o null si no se pudo leer); sólo se
 * usa cuando el negocio no tiene ficha propia en branding.ts (los 7 con ficha ya traen nombre y monograma).
 */
export function pestanaDelPedido(input: {
  sinNegocio: boolean;
  brand: TenantBrand;
  nombreDelTenant: string | null;
}): Pestana {
  if (input.sinNegocio) return { tipo: "gsg", titulo: NOMBRE_GSG };
  if (input.brand.propia) return { tipo: "negocio", titulo: input.brand.name, glifo: input.brand.monogram };
  const nombre = (input.nombreDelTenant ?? "").trim();
  // Sin nombre legible (base caída, fila sin nombre): neutro, nunca el de otro negocio.
  if (!nombre || nombre === "Mi negocio") return { tipo: "negocio", titulo: "Panel de gestión", glifo: "•" };
  return { tipo: "negocio", titulo: nombre, glifo: inicialesDe(nombre) };
}

/** Ícono de Gestión Studio Grow para la pestaña (src/lib/gsg/marca-svg.ts). */
export function faviconGsg(): string {
  return faviconGsgDataUri();
}
