// El rebote por PRODUCTO del layout de (dashboard), en una función PURA que comparten `motivoDeLaPantalla`
// (src/lib/require-app.ts) y su test. Vive aparte porque require-app carga `server-only` (MIA-141, hueco 3).
import { permisoEfectivo, type UsuarioConPermisos } from "@/lib/capabilities";
import { derivarProducto } from "@/lib/producto-identidad";
import type { NegocioApps } from "@/apps/visibles";

/**
 * ¿El layout manda a esta persona fuera de /admin por el PRODUCTO del negocio? La misma condición que layout.tsx:146-151:
 * Contador → /contador si tiene `cartera:manage`; Factoque (`blueprintId: "facturita"`) → /facturita/app si tiene
 * `billing:manage`. Sin la capacidad el layout no la saca (evita el loop), así que acá tampoco cuenta. PURA.
 */
export function fueraPorProducto(negocio: Pick<NegocioApps, "blueprintId" | "modulosAsignados">, usuario: UsuarioConPermisos): boolean {
  const producto = derivarProducto({ blueprintId: negocio.blueprintId ?? null, modules: negocio.modulosAsignados });
  if (producto === "contador") return permisoEfectivo(usuario, "cartera:manage");
  if (producto === "facturita") return permisoEfectivo(usuario, "billing:manage");
  return false;
}
