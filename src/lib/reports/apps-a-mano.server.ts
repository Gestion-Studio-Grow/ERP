// ============================================================================
// ¿Esta persona puede abrir esa otra app? — para que un botón nunca sea un callejón.
// ============================================================================
//
// Las pantallas de finanzas mandan a otras apps ("Registrá la compra en Recibir mercadería",
// "Mirá el libro de caja del mes"). Un botón a una app que el negocio no tiene activada, o que
// el rol no abre, termina en "App no disponible": un callejón. Antes de pintar el botón se
// pregunta con la MISMA regla que la barra y la guardia de cada página (`motivoNoDisponible`).

import "server-only";
import type { Role } from "@/lib/capabilities";
import { getNegocioApps } from "@/apps/contexto.server";
import { buscarApp } from "@/apps/registro";
import { motivoNoDisponible } from "@/apps/visibles";

/** Las apps de `ids` que la persona puede abrir en este negocio. */
export async function appsQuePuedeAbrir(role: Role, ids: readonly string[]): Promise<Set<string>> {
  const negocio = await getNegocioApps(role);
  const out = new Set<string>();
  for (const id of ids) {
    const app = buscarApp(id);
    if (app && motivoNoDisponible(app, negocio) === null) out.add(id);
  }
  return out;
}
