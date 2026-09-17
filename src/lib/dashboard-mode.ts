// ============================================================================
// MODO DEL HOME — ¿mostrador o agenda? Detección PURA, sin DB.
// ============================================================================
//
// El dashboard se adapta al negocio: un local de MOSTRADOR (carnicería, velas, pádel)
// ve ventas/caja/reposición; uno de SERVICIOS ve turnos/agenda.
//
// HAY DOS SEÑALES, y el orden entre ellas NO es prolijidad: es lo que decide si el
// único cliente vivo en producción conserva su menú.
//
//   1. RUBRO (`isRetail`, de `Tenant.blueprintId`/slug → src/blueprints/retail/rubros.ts).
//      Es el eje que HOY está encendido: ya gatea Inventario, Lotes y Despiece en el
//      AdminShell y ya elige el panel de cortes en /admin/catalogo.
//   2. MÓDULOS ACTIVOS (`getActiveModuleIds`, ADR-054/055). Sólo existen cuando el
//      registro de módulos está ENFORCED (`MODULE_REGISTRY_ENABLED`); con el flag OFF
//      —el estado de hoy, default en src/modules/flags.ts:16— vale `null`.
//
// POR QUÉ MANDA EL RUBRO CUANDO NO HAY MÓDULOS (y no al revés):
// el home de mostrador estuvo escrito y MUERTO. La única condición que lo encendía era
// el set de módulos, que es `null` mientras el registro esté apagado → todo tenant caía
// a "servicios" → una carnicería abría el sistema y veía la agenda de una estética. La
// salida obvia —prender `MODULE_REGISTRY_ENABLED`— es la que NO se puede tomar: el flag
// es GLOBAL, no por tenant, y `beauty-spa` (el único vivo en producción) tiene
// `modules = {}` en la base, así que con el registro enforced su navegación se resuelve
// contra un set vacío y la dueña se queda sin menú. El rubro, en cambio, ya distingue a
// los cuatro tenants sin tocar un flag ni una fila.
//
// PARA EL QUE VENGA A "ORDENAR" ESTO: si borrás el camino por rubro y dejás sólo el de
// módulos, magra vuelve a ver la agenda de un spa; y si prendés el flag para compensar,
// apagás el menú de beauty-spa. Las dos puntas están cubiertas por dashboard-mode.test.ts.
//
// El camino por módulos se conserva INTACTO y con prioridad: el día que el registro se
// encienda manda el dato explícito del tenant (qué contrató) por encima del rubro (a qué
// se dedica). Un tenant retail que apagó `pos` no debería ver el home de mostrador, y así
// se respeta.
//
// PURA y testeable sin DB. No decide DATOS (eso lo hacen los loaders), sólo el layout.

export type DashboardMode = "servicios" | "retail";

export interface DashboardModeInput {
  /** Ids de módulos activos del tenant, o `null` si el registro está apagado (flag OFF). */
  activeModules: ReadonlySet<string> | null;
  /**
   * ¿El tenant es de rubro mostrador/retail? Lo resuelve `getCurrentTenantRubro().isRetail`
   * (src/lib/carniceria/rubro.ts) — la MISMA lectura con la que el layout arma el menú, para
   * que el home y la barra no puedan discrepar.
   */
  isRetail: boolean;
}

/**
 * Modo del home del tenant. PURA.
 *
 * - Con módulos activos (registro ENFORCED): manda el set de módulos — el dato explícito
 *   de qué contrató el tenant gana sobre el rubro.
 * - Sin módulos (`null`, el estado de HOY): manda el RUBRO. Retail → "retail" (mostrador);
 *   servicios o rubro desconocido → "servicios" (el home legado).
 *
 * Fail-safe hacia "servicios": si no se puede saber el rubro, el llamador pasa
 * `isRetail: false` y el tenant ve el home de siempre. Perder el home de mostrador es un
 * mal día para magra; perder el de agenda es un mal día para el negocio que ya factura.
 */
export function dashboardMode({ activeModules, isRetail }: DashboardModeInput): DashboardMode {
  if (activeModules) return dashboardModeForModules(activeModules);
  return isRetail ? "retail" : "servicios";
}

/**
 * Modo a partir de los módulos activos del tenant. PURA.
 * Retail = mostrador (tiene `pos`, no tiene `agenda`). El resto cae a "servicios".
 *
 * `null` (registro apagado) sigue devolviendo "servicios": es el contrato legado de esta
 * función y NO es la respuesta del producto — esa la da `dashboardMode`, que en ese caso
 * consulta el rubro. Quien llame directo acá con `null` está preguntando "¿qué dicen los
 * módulos?", y la respuesta honesta es "nada".
 */
export function dashboardModeForModules(active: ReadonlySet<string> | null): DashboardMode {
  if (!active) return "servicios";
  if (active.has("pos") && !active.has("agenda")) return "retail";
  return "servicios";
}
