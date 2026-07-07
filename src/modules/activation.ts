// ============================================================================
// ASIGNACIÓN DE MÓDULOS POR TENANT — la "variante" en acción (ADR-055).
// ============================================================================
//
// La ASIGNACIÓN es la segunda mitad del principio de variante: dado un tenant (su
// rubro + su lista `Tenant.modules[]`) y el catálogo (los objetos-maestro), resuelve
// QUÉ módulos quedan efectivamente activos, validando la variante:
//   - solo se activan módulos que existen en el catálogo,
//   - que son COMPATIBLES con el rubro del tenant (variante), y
//   - cuyas DEPENDENCIAS también están activas.
//
// GUARDARRAÍL DX-6 (no "todos con todo"): este resolver NUNCA "prende todo". Parte
// SIEMPRE de lo que el tenant asignó explícitamente (`modules[]`). Una asignación
// uniforme (todos los tenants con todo) es exactamente el antipatrón que hizo que el
// front "mintiera" (lección DX-6). La asignación es deliberada y diferenciada; este
// módulo la valida, no la infla.
//
// Todo PURO: recibe el estado del tenant como dato (no consulta Prisma), así es
// testeable sin DB y no viola el aislamiento RLS (el llamador ya resolvió el tenant).

import type { ModuleDescriptor } from "./contract";
import { ModuleRegistry, rubroCompatible } from "./registry";

/**
 * Estado del tenant relevante para la asignación. Es un subconjunto de `Tenant`
 * (id, blueprintId, modules) — se pasa como dato para no acoplar a Prisma.
 */
export interface TenantModuleState {
  tenantId: string;
  /** Rubro del tenant = su blueprintId (servicios/carniceria/…), o null. */
  blueprintId: string | null;
  /** La ASIGNACIÓN cruda: ids de módulos que el tenant tiene marcados como activos. */
  modules: string[];
}

/** Un módulo pedido que no se pudo activar, con el motivo. */
export interface Rechazo {
  id: string;
  motivo: string;
}

/** Resultado de resolver la asignación de un tenant. */
export interface ResolucionActivacion {
  /** Módulos efectivamente activos (existen, compatibles con el rubro, deps OK). */
  activos: ModuleDescriptor[];
  /** Pedidos pero incompatibles con el rubro del tenant (variante). */
  incompatibles: Rechazo[];
  /** Activos cuya(s) dependencia(s) no están en la asignación del tenant. */
  dependenciasFaltantes: Rechazo[];
  /** Ids en `modules[]` que no existen en el catálogo. */
  desconocidos: string[];
  /**
   * true si la fundación de módulos está ENFORCED por flag. Si es false, el llamador
   * debería seguir usando el comportamiento legado (`Tenant.modules[]` a secas) y
   * tomar esta resolución como informativa, no autoritativa.
   */
  enforced: boolean;
}

/**
 * Resuelve la asignación de módulos de un tenant contra el catálogo.
 *
 * @param state  estado del tenant (rubro + modules[]).
 * @param registry catálogo de módulos.
 * @param opts.enforced  si la fundación está enforced por flag (default true en tests;
 *                       en runtime lo pasa el llamador desde `moduleRegistryEnabled()`).
 *
 * Regla de oro (DX-6): parte de `state.modules` y solo RESTA (rechaza lo que no
 * corresponde). Nunca agrega módulos que el tenant no pidió.
 */
export function resolverActivacion(
  state: TenantModuleState,
  registry: ModuleRegistry,
  opts: { enforced?: boolean } = {},
): ResolucionActivacion {
  const enforced = opts.enforced ?? true;
  const pedidos = dedupe(state.modules);

  const activos: ModuleDescriptor[] = [];
  const incompatibles: Rechazo[] = [];
  const desconocidos: string[] = [];

  // Paso 1: existencia + compatibilidad de rubro (variante).
  const compatibles: ModuleDescriptor[] = [];
  for (const id of pedidos) {
    const d = registry.buscar(id);
    if (!d) {
      desconocidos.push(id);
      continue;
    }
    if (!rubroCompatible(d.rubros, state.blueprintId)) {
      incompatibles.push({
        id,
        motivo:
          `no es compatible con el rubro "${state.blueprintId ?? "(sin rubro)"}". ` +
          `Compatibilidad: ${d.rubros === "todos" ? "todos" : d.rubros.join(", ")}.`,
      });
      continue;
    }
    compatibles.push(d);
  }

  // Paso 2: dependencias, a PUNTO FIJO (maneja cadenas transitivas). Un módulo solo
  // se activa si TODAS sus dependencias también quedaron activas. Si una dep se cae
  // (porque es incompatible, desconocida, o porque a su vez le falta una dep), el que
  // la necesita también se cae — en cascada. Se itera quitando hasta estabilizar; el
  // catálogo está validado acíclico (ModuleRegistry.validar), así que converge.
  const dependenciasFaltantes: Rechazo[] = [];
  let sobrevivientes = compatibles;
  for (;;) {
    const vivos = new Set(sobrevivientes.map((d) => d.id));
    const quedan: ModuleDescriptor[] = [];
    const caen: Rechazo[] = [];
    for (const d of sobrevivientes) {
      const faltan = (d.dependencias ?? [])
        .map((dep) => dep.id)
        .filter((depId) => !vivos.has(depId));
      if (faltan.length > 0) {
        caen.push({ id: d.id, motivo: `requiere módulo(s) no activo(s): ${faltan.join(", ")}.` });
      } else {
        quedan.push(d);
      }
    }
    if (caen.length === 0) break;
    dependenciasFaltantes.push(...caen);
    sobrevivientes = quedan;
  }
  activos.push(...sobrevivientes);

  return {
    activos,
    incompatibles,
    dependenciasFaltantes,
    desconocidos,
    enforced,
  };
}

/**
 * ASIGNACIÓN SUGERIDA para un rubro — el default DIFERENCIADO del alta (variante).
 * Devuelve los ids de módulos que un `preferidos[]` propone Y que son compatibles con
 * el rubro. Es el reemplazo rubro-consciente del `defaultModulesForBlueprint` legado:
 * NO devuelve "todo el catálogo", sino el set curado y filtrado por compatibilidad.
 *
 * El catálogo NO inventa el set por rubro (eso lo saben los blueprints/presets); esta
 * función solo GARANTIZA que la sugerencia respete la variante (descarta lo que no
 * aplica al rubro), evitando el "todos con todo" desde el alta.
 */
export function asignacionSugerida(
  rubroId: string | null | undefined,
  preferidos: string[],
  registry: ModuleRegistry,
): string[] {
  return dedupe(preferidos).filter((id) => {
    const d = registry.buscar(id);
    return !!d && rubroCompatible(d.rubros, rubroId);
  });
}

/** Quita duplicados preservando el orden de primera aparición. */
function dedupe<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
