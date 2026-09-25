// ============================================================================
// PRECIOS DE LOS PLANES — PROVISIONALES A CONFIRMAR POR EL DUEÑO.
// ============================================================================
//
// Viven FUERA del código que decide: ni el catálogo (./catalogo.ts), ni los límites (./limites.ts),
// ni las apps del plan (./apps-del-plan.ts) importan este archivo, y un test lo verifica. Un precio
// nunca prende ni apaga nada: sólo se muestra.
//
// Fuente: propuesta de E2 §6.2 (lanzamiento/explore/E2-planes-vs-tango.md) y decisión 8 del
// INFORME-EXPLORE §3. Pesos argentinos por mes, IVA incluido. Antes de publicar hay que volver a
// relevar los precios de Tango (las dos fuentes de julio 2026 se contradicen) y el dueño decide
// precio, descuento al contador, bonificación de la mudanza y ajuste (trimestral por IPC, propuesto).
//
// CONTRADICE UNA DECISIÓN VIGENTE: ADR-078 (docs/adr/ADR-078-pricing-unit-economics-suite-facturacion.md,
// aceptada el 2026-07-11 y sin marca de obsoleta en docs/adr/INDEX.md) fija otra escalera: SOLO
// $14.900 / COMERCIO $39.900 / PYME $89.900 / CM $149.900 y packs de cartera ($249.000 por 10
// clientes). E2 (decisión D3) propone obsoletarla. Hasta que el dueño elija, NINGUNA de las dos
// listas se publica desde acá.

import type { PlanId } from "./catalogo";

export const ESTADO_DE_LOS_PRECIOS = "provisional a confirmar" as const;

export interface PrecioProvisional {
  /** Abono mensual, en pesos, IVA incluido. */
  mensual: number;
  /** Por mes, pagando el año. */
  anualPorMes: number;
  /** Lo que se cobra por cada unidad por encima de lo incluido (local, cliente de la cartera). */
  adicional?: { por: "local" | "cliente en la cartera"; precio: number };
  estado: typeof ESTADO_DE_LOS_PRECIOS;
}

export const PRECIOS_PROVISIONALES: Readonly<Record<PlanId, PrecioProvisional>> = {
  facturacion: { mensual: 19_900, anualPorMes: 15_900, estado: ESTADO_DE_LOS_PRECIOS },
  micro: { mensual: 34_900, anualPorMes: 27_900, estado: ESTADO_DE_LOS_PRECIOS },
  comerciante: { mensual: 69_900, anualPorMes: 55_900, estado: ESTADO_DE_LOS_PRECIOS },
  pyme: {
    mensual: 149_900,
    anualPorMes: 119_900,
    adicional: { por: "local", precio: 29_900 },
    estado: ESTADO_DE_LOS_PRECIOS,
  },
  estudio: {
    mensual: 59_900,
    anualPorMes: 47_900,
    adicional: { por: "cliente en la cartera", precio: 4_900 },
    estado: ESTADO_DE_LOS_PRECIOS,
  },
};
