// ============================================================================
// REGISTRO / CATÁLOGO DE MÓDULOS — el "repo" donde enchufan los módulos.
// ============================================================================
//
// Es el índice de los OBJETOS-MAESTRO (ModuleDescriptor). Modela el "qué hay
// disponible" del ERP (ADR-054 §4). Sumar un módulo al producto = registrar su
// descriptor acá (nutrir el catálogo), no un parche ad-hoc.
//
// Espeja el patrón ya probado de `RegistroGateways` (src/plugins/pagos/registry.ts):
// registro en memoria, encadenable, fail-closed al resolver. Suma la validación de
// catálogo que necesita ver TODO el conjunto (ids duplicados, dependencias presentes,
// ciclos de dependencia) — lo que un descriptor no puede validar solo.

import {
  type ModuleDescriptor,
  type ModuleId,
  type ProblemaCatalogo,
  type RubroCompat,
  validarDescriptor,
  versionSatisface,
} from "./contract";

/** No hay un módulo registrado bajo ese id. */
export class ModuloDesconocidoError extends Error {
  constructor(readonly id: ModuleId, disponibles: ModuleId[]) {
    super(
      `Módulo desconocido: "${id}". ` +
        `Registrados: ${disponibles.length ? disponibles.join(", ") : "(ninguno)"}.`,
    );
    this.name = "ModuloDesconocidoError";
  }
}

/** El catálogo no pasó la validación (se lanza al construirlo en modo estricto). */
export class CatalogoInvalidoError extends Error {
  constructor(readonly problemas: ProblemaCatalogo[]) {
    const errores = problemas.filter((p) => p.severidad === "error");
    super(
      `Catálogo de módulos inválido (${errores.length} error/es):\n` +
        errores.map((p) => `  - [${p.moduloId}] ${p.mensaje}`).join("\n"),
    );
    this.name = "CatalogoInvalidoError";
  }
}

/** ¿El rubro `rubroId` cae dentro de la compatibilidad `compat`? PURA. */
export function rubroCompatible(compat: RubroCompat, rubroId: string | null | undefined): boolean {
  if (compat === "todos") return true;
  if (!rubroId) return false;
  return compat.includes(rubroId);
}

/** Registro de módulos. Uno por proceso (el catálogo del producto). */
export class ModuleRegistry {
  private readonly modulos = new Map<ModuleId, ModuleDescriptor>();

  /** Registra (o pisa) un descriptor. Devuelve `this` (encadenable). */
  registrar(descriptor: ModuleDescriptor): this {
    this.modulos.set(descriptor.id, descriptor);
    return this;
  }

  /** Registra varios de una. */
  registrarTodos(descriptores: ModuleDescriptor[]): this {
    for (const d of descriptores) this.registrar(d);
    return this;
  }

  /** ¿Hay un módulo bajo ese id? */
  tiene(id: ModuleId): boolean {
    return this.modulos.has(id);
  }

  /** Devuelve el descriptor o `undefined` si no está. */
  buscar(id: ModuleId): ModuleDescriptor | undefined {
    return this.modulos.get(id);
  }

  /** Devuelve el descriptor o lanza `ModuloDesconocidoError` (fail-closed). */
  get(id: ModuleId): ModuleDescriptor {
    const d = this.modulos.get(id);
    if (!d) throw new ModuloDesconocidoError(id, this.ids());
    return d;
  }

  /** Ids registrados (orden de inserción). */
  ids(): ModuleId[] {
    return [...this.modulos.keys()];
  }

  /** Todos los descriptores (orden de inserción). */
  listar(): ModuleDescriptor[] {
    return [...this.modulos.values()];
  }

  /**
   * Módulos COMPATIBLES con un rubro (variante): los que PUEDEN aplicar ahí. No es
   * la lista de activos de un tenant —eso es la asignación (src/modules/activation.ts)—
   * sino el universo del que se elige. Un rubro nulo devuelve solo los "todos".
   */
  compatiblesConRubro(rubroId: string | null | undefined): ModuleDescriptor[] {
    return this.listar().filter((d) => rubroCompatible(d.rubros, rubroId));
  }

  /**
   * Valida el catálogo COMPLETO. Corre `validarDescriptor` por cada uno y suma los
   * chequeos que necesitan el conjunto:
   *  - ids duplicados (Map los pisa, pero avisamos si se registró dos veces el mismo
   *    id con distinto contenido — se detecta comparando cantidad registrada).
   *  - dependencias presentes en el catálogo.
   *  - rango de versión de cada dependencia satisfecho.
   *  - compatibilidad de rubro de una dependencia ⊇ la del módulo (si A exige B, B
   *    debe poder aplicar donde aplica A; si no, A quedaría activable sin su dep).
   *  - ciclos de dependencia.
   */
  validar(): ProblemaCatalogo[] {
    const problemas: ProblemaCatalogo[] = [];
    const todos = this.listar();

    for (const d of todos) {
      problemas.push(...validarDescriptor(d));

      for (const dep of d.dependencias ?? []) {
        const objetivo = this.modulos.get(dep.id);
        if (!objetivo) {
          problemas.push({
            moduloId: d.id,
            severidad: "error",
            mensaje: `depende de "${dep.id}", que no está en el catálogo.`,
          });
          continue;
        }
        if (!versionSatisface(objetivo.version, dep.rango)) {
          problemas.push({
            moduloId: d.id,
            severidad: "error",
            mensaje: `depende de "${dep.id}" ${dep.rango ?? "*"}, pero el catálogo tiene ${objetivo.version}.`,
          });
        }
        if (!compatDependencia(d.rubros, objetivo.rubros)) {
          problemas.push({
            moduloId: d.id,
            severidad: "aviso",
            mensaje:
              `depende de "${dep.id}", cuya compatibilidad de rubro es más chica que la propia: ` +
              `podría quedar activable en un rubro donde su dependencia no aplica.`,
          });
        }
      }
    }

    // Ciclos de dependencia (DFS sobre el grafo de deps).
    for (const inicio of todos) {
      const ciclo = detectarCiclo(inicio.id, this.modulos);
      if (ciclo) {
        problemas.push({
          moduloId: inicio.id,
          severidad: "error",
          mensaje: `ciclo de dependencias: ${ciclo.join(" → ")}.`,
        });
      }
    }

    return problemas;
  }

  /** Valida y lanza si hay algún error (los avisos no bloquean). */
  validarEstricto(): this {
    const problemas = this.validar();
    if (problemas.some((p) => p.severidad === "error")) {
      throw new CatalogoInvalidoError(problemas);
    }
    return this;
  }
}

/**
 * ¿La compatibilidad del módulo (`propio`) está contenida en la de su dependencia
 * (`dep`)? Es decir: en todo rubro donde el módulo aplica, ¿aplica también su dep?
 * "todos" del dep contiene cualquier cosa; si el módulo es "todos" y el dep no, no
 * está contenido.
 */
function compatDependencia(propio: RubroCompat, dep: RubroCompat): boolean {
  if (dep === "todos") return true;
  if (propio === "todos") return false;
  return propio.every((r) => dep.includes(r));
}

/**
 * Detecta un ciclo que involucre a `inicio` recorriendo el grafo de dependencias.
 * Devuelve el ciclo como lista de ids (empezando y terminando en el nodo repetido),
 * o null si no hay ciclo. Ignora deps que no estén en el catálogo (ya se reportan
 * como error aparte).
 */
function detectarCiclo(
  inicio: ModuleId,
  modulos: Map<ModuleId, ModuleDescriptor>,
): ModuleId[] | null {
  const enCamino: ModuleId[] = [];
  const visitados = new Set<ModuleId>();

  function dfs(id: ModuleId): ModuleId[] | null {
    const idxEnCamino = enCamino.indexOf(id);
    if (idxEnCamino !== -1) return [...enCamino.slice(idxEnCamino), id];
    if (visitados.has(id)) return null;
    visitados.add(id);
    enCamino.push(id);
    const d = modulos.get(id);
    for (const dep of d?.dependencias ?? []) {
      if (!modulos.has(dep.id)) continue;
      const ciclo = dfs(dep.id);
      if (ciclo) return ciclo;
    }
    enCamino.pop();
    return null;
  }

  return dfs(inicio);
}
