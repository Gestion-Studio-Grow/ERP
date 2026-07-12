// ============================================================================
// NÚCLEO POR PRODUCTO — el set instalado de fábrica, derivado del catálogo (ADR-089).
// ============================================================================
//
// El "núcleo" de un producto de facturación (los módulos que vienen instalados para que
// el comercio opere desde el día uno) NO se hardcodea: se DERIVA del catálogo, del campo
// `nucleoPara` de cada descriptor (ADR-055: el núcleo es del PRODUCTO, no del módulo). Así
// hay una sola fuente de verdad y el alta + el badge "Núcleo" de la tienda leen de ahí.
//
// Reemplaza la deuda que marcó ADR-089: hasta ahora el núcleo del Comerciante lo fijaba de
// hecho `defaultModulesForBlueprint("generico")` = [catalog,clients,pos,agenda,reports] —
// que traía el "Agregar turno" ajeno al producto. Ahora el núcleo del Comerciante sale de
// los descriptores con `nucleoPara.includes("comerciante")` (bancos/arca/mercadopago/clients/
// reports), sin tocar el default de `generico` (que sigue sirviendo al comodín de rubro).

import { catalogo } from "./catalog";
import type { ModuleRegistry } from "./registry";

/**
 * Ids de los módulos que son NÚCLEO del `producto` dado (vienen instalados de fábrica).
 * Deriva del campo `nucleoPara` de cada descriptor — única fuente de verdad. Devuelve `[]`
 * para productos sin núcleo declarado (p.ej. "vertical"): el llamador debe caer entonces al
 * default legado por blueprint, dejando a los verticales byte-idénticos.
 */
export function nucleoParaProducto(
  producto: string,
  registry: ModuleRegistry = catalogo(),
): string[] {
  return registry
    .listar()
    .filter((d) => (d.nucleoPara ?? []).includes(producto))
    .map((d) => d.id);
}
