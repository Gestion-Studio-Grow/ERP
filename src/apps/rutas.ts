// ============================================================================
// RUTA → APP. ¿Qué app es esta URL?
// ============================================================================
//
// Reemplaza a `navItemForPath` y `rutaPermitidaParaModulos` (src/lib/admin-nav-items.ts),
// que buscaban sobre ALL_ITEMS: con esa lista /admin/facturacion/bancos caía en
// Facturación (módulo arca) aunque es otra app con otro módulo (bancos).
//
// Match por SEGMENTO y el más específico primero: /admin/facturacion cubre
// /admin/facturacion/123 pero no /admin/facturacionX, y /admin/facturacion/bancos gana
// sobre /admin/facturacion porque es más larga. El Inicio (`exacta`) sólo matchea /admin
// exacto: si no, absorbería todo el panel.
//
// Puro: lo usan el servidor, el cliente (para marcar el ítem activo) y los tests.

import type { AppDescriptor } from "./contract";
import { REGISTRO_APPS } from "./registro";

/** Saca query y hash, y colapsa la barra final ("/admin/caja/" → "/admin/caja"). */
export function normalizarRuta(path: string): string {
  const sinQuery = path.split(/[?#]/, 1)[0];
  if (sinQuery.length > 1 && sinQuery.endsWith("/")) return sinQuery.slice(0, -1);
  return sinQuery;
}

function masLargaPrimero(apps: readonly AppDescriptor[]): AppDescriptor[] {
  return [...apps].sort((a, b) => b.ruta.length - a.ruta.length);
}

const REGISTRO_ORDENADO = masLargaPrimero(REGISTRO_APPS);

/** ¿La ruta de la app cubre `path`? `path` ya normalizado. */
function cubre(app: AppDescriptor, path: string): boolean {
  if (app.exacta) return path === app.ruta;
  return path === app.ruta || path.startsWith(app.ruta + "/");
}

/**
 * La app dueña de `path`, o `undefined` si ninguna la cubre (p.ej. /admin/modulos, que
 * salió del registro: nadie tiene `modules:manage`).
 */
export function appDeRuta(
  path: string,
  apps: readonly AppDescriptor[] = REGISTRO_APPS,
): AppDescriptor | undefined {
  const target = normalizarRuta(path);
  const ordenadas = apps === REGISTRO_APPS ? REGISTRO_ORDENADO : masLargaPrimero(apps);
  return ordenadas.find((a) => cubre(a, target));
}

/**
 * ¿`path` es de una app del registro cuyo módulo el negocio tiene ASIGNADO? PURA.
 *
 * Es lo que le falta al gate por URL de los productos con tienda (Comerciante, layout.tsx):
 * `rutaPermitidaParaModulos` busca en la barra de hoy (ALL_ITEMS), que no conoce las apps
 * nuevas del registro (Vender y Ventas del día, de `pos`; Mis locales, de `multilocal`), así
 * que un Comerciante con ese módulo rebotaba al Inicio. Con el módulo asignado, la ruta pasa;
 * la PÁGINA igual pasa por su guardia (`requireApp`, y en Mis locales `exigirCasa`). Las apps
 * del núcleo (`modulo: null`) no entran por acá: siguen la barra de hoy.
 */
export function rutaDeAppConModulo(
  path: string,
  modules: readonly string[],
  apps: readonly AppDescriptor[] = REGISTRO_APPS,
): boolean {
  const app = appDeRuta(path, apps);
  return !!app && app.modulo !== null && modules.includes(app.modulo);
}
