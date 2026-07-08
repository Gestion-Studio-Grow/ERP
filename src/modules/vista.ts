// ============================================================================
// VISTA DE MÓDULOS PARA EL BACKOFFICE — activar/desactivar por tenant (ADR-054/055).
// ============================================================================
//
// La lógica PURA detrás de la pantalla "Módulos de tu negocio" (/admin/modulos): la
// vidriera estilo SAP/GSG donde el OWNER de un tenant prende y apaga las apps de su
// negocio. Es el primer consumidor real de la fundación de módulos por parte del
// backoffice del propio tenant (hasta ahora la asignación módulo↔tenant solo se
// tocaba desde la consola de operador).
//
// Todo PURO (sin Prisma, sin React, sin env): recibe el estado del tenant + el
// catálogo como dato y devuelve la vista y los "planes" de toggle. Así se testea sin
// DB, no toca RLS (el llamador ya resolvió el tenant) y el server action (modulos-
// actions.ts) queda como una cáscara fina.
//
// Respeta la VARIANTE (ADR-055) y el guardarraíl DX-6 ("nunca todos con todo"):
//   - solo se listan/activan módulos COMPATIBLES con el rubro del tenant,
//   - activar uno arrastra sus DEPENDENCIAS (deliberado, en cascada), y
//   - desactivar uno se BLOQUEA si otro módulo activo lo necesita.

import type { ModuleDescriptor } from "./contract";
import { ModuleRegistry, rubroCompatible } from "./registry";
import type { TenantModuleState } from "./activation";

/** Una fila de la vidriera de módulos, lista para pintar. */
export interface FilaModulo {
  id: string;
  nombre: string;
  descripcion: string;
  /** "capability" (nativo del Core) o "plugin" (integración externa). */
  kind: ModuleDescriptor["kind"];
  /** Capability RBAC que habilita, si tiene pantalla propia. */
  capability?: string;
  /** ¿Está en la asignación del tenant (`Tenant.modules[]`)? */
  activo: boolean;
  /** Ids de los módulos que éste necesita para funcionar. */
  dependeDe: string[];
  /** Ids de módulos ACTIVOS que dependen de éste (bloquean su desactivación). */
  requeridoPor: string[];
}

/**
 * La vidriera: los módulos COMPATIBLES con el rubro del tenant, marcando cuáles
 * están activos y sus relaciones de dependencia. No inventa la asignación —la lee de
 * `state.modules`— solo la presenta filtrada por la variante.
 */
export function vistaModulos(
  state: TenantModuleState,
  registry: ModuleRegistry,
): FilaModulo[] {
  const activos = new Set(state.modules);
  const compatibles = registry.compatiblesConRubro(state.blueprintId);
  const activosCompat = compatibles.filter((d) => activos.has(d.id));

  return compatibles.map((d) => ({
    id: d.id,
    nombre: d.nombre,
    descripcion: d.descripcion,
    kind: d.kind,
    capability: d.capability,
    activo: activos.has(d.id),
    dependeDe: (d.dependencias ?? []).map((dep) => dep.id),
    // Quién, entre los ACTIVOS, depende de este módulo → no se puede apagar
    // sin apagar antes a esos.
    requeridoPor: activosCompat
      .filter((o) => (o.dependencias ?? []).some((dep) => dep.id === d.id))
      .map((o) => o.id),
  }));
}

/** El resultado de planear un toggle: la nueva asignación + qué se arrastró / por qué no. */
export interface PlanToggle {
  /** La nueva lista `modules[]` a persistir (sin cambios si hay `error`). */
  modules: string[];
  /** Dependencias que se agregaron en cascada al activar (para avisar al usuario). */
  incluidos: string[];
  /** Motivo por el que NO se pudo aplicar (en criollo, listo para mostrar). */
  error?: string;
}

/**
 * Plan de ACTIVAR un módulo: lo agrega y arrastra, en cascada, sus dependencias
 * compatibles con el rubro. Falla (sin tocar nada) si el módulo no existe, no aplica
 * al rubro, o una dependencia suya no aplica al rubro (catálogo mal armado).
 */
export function planActivar(
  modules: string[],
  id: string,
  registry: ModuleRegistry,
  blueprintId: string | null | undefined,
): PlanToggle {
  const d = registry.buscar(id);
  if (!d) return { modules, incluidos: [], error: `El módulo "${id}" no existe en el catálogo.` };
  if (!rubroCompatible(d.rubros, blueprintId)) {
    return { modules, incluidos: [], error: `"${d.nombre}" no está disponible para tu rubro.` };
  }

  const set = new Set(modules);
  const incluidos: string[] = [];
  const pila = [id];
  while (pila.length > 0) {
    const cur = pila.pop() as string;
    if (set.has(cur)) continue;
    const cd = registry.buscar(cur);
    if (!cd) {
      return {
        modules,
        incluidos: [],
        error: `"${d.nombre}" necesita "${cur}", que no está en el catálogo.`,
      };
    }
    if (!rubroCompatible(cd.rubros, blueprintId)) {
      return {
        modules,
        incluidos: [],
        error: `"${d.nombre}" necesita "${cd.nombre}", que no aplica a tu rubro.`,
      };
    }
    set.add(cur);
    if (cur !== id) incluidos.push(cur);
    for (const dep of cd.dependencias ?? []) pila.push(dep.id);
  }

  return { modules: [...set], incluidos };
}

/**
 * Plan de DESACTIVAR un módulo: lo saca, salvo que algún módulo ACTIVO dependa de él
 * (en ese caso se BLOQUEA con el motivo, para no dejar dependencias colgadas). Sacar
 * uno que no estaba activo es un no-op silencioso.
 */
export function planDesactivar(
  modules: string[],
  id: string,
  registry: ModuleRegistry,
): PlanToggle {
  const set = new Set(modules);
  if (!set.has(id)) return { modules, incluidos: [] };

  const dependientes = [...set]
    .filter((m) => m !== id)
    .map((m) => registry.buscar(m))
    .filter((md): md is ModuleDescriptor => !!md)
    .filter((md) => (md.dependencias ?? []).some((dep) => dep.id === id));

  if (dependientes.length > 0) {
    const d = registry.buscar(id);
    const nombres = dependientes.map((md) => `"${md.nombre}"`).join(", ");
    return {
      modules,
      incluidos: [],
      error: `No podés apagar "${d?.nombre ?? id}" porque lo usan: ${nombres}. Apagá esos primero.`,
    };
  }

  set.delete(id);
  return { modules: [...set], incluidos: [] };
}
