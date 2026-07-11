// ============================================================================
// CATÁLOGO DE MÓDULOS — la instancia curada del repositorio (ADR-054 §4).
// ============================================================================
//
// Acá se NUTRE el repo: sumar un módulo al producto = agregar su descriptor a esta
// lista y registrarlo. El catálogo se construye una vez, se VALIDA de forma estricta
// (fail-closed: si un descriptor está mal o hay una dependencia colgada / un ciclo, no
// arranca) y queda disponible para el resolver de asignación.
//
// Fuentes de los descriptores:
//   - Nativos (capabilities del Core): src/modules/descriptors/nativos.ts
//   - ARCA (plugin, migrado como ejemplo): su fuente de verdad vive junto al plugin
//     (src/plugins/arca/module.ts), como manda la convención.
//   - Mercado Pago (plugin): src/modules/descriptors/mercadopago.ts (hasta su
//     reingeniería a real, ahí se muda a su propio dir).
//   - Bancos (plugin): su fuente de verdad vive junto al plugin
//     (src/plugins/bancos/module.ts), misma convención que ARCA.
//   - Cartera (nativo, panel del contador): src/modules/descriptors/cartera.ts.

import { ModuleRegistry } from "./registry";
import { MODULOS_NATIVOS } from "./descriptors/nativos";
import { mercadopagoModule } from "./descriptors/mercadopago";
import { carteraModule } from "./descriptors/cartera";
import { arcaModule } from "@/plugins/arca/module";
import { bancosModule } from "@/plugins/bancos/module";

/** Todos los descriptores del catálogo del producto (el "qué hay disponible"). */
export const DESCRIPTORES_CATALOGO = [
  ...MODULOS_NATIVOS,
  arcaModule,
  mercadopagoModule,
  bancosModule,
  carteraModule,
];

/**
 * Construye el catálogo de módulos y lo valida estricto. Fail-closed: lanza
 * `CatalogoInvalidoError` si hay algún error de forma/consistencia. Se llama una vez
 * (el resultado es cacheable por el llamador). PURA respecto de la DB.
 */
export function construirCatalogo(): ModuleRegistry {
  return new ModuleRegistry().registrarTodos(DESCRIPTORES_CATALOGO).validarEstricto();
}

// Instancia compartida del catálogo (perezosa, single-flight por proceso). Se expone
// como función para que los tests puedan construir catálogos aislados sin este cache.
let cache: ModuleRegistry | null = null;
export function catalogo(): ModuleRegistry {
  if (!cache) cache = construirCatalogo();
  return cache;
}
