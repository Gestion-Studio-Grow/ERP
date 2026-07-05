// Registro de Blueprints (ADR-002 / ADR-019). Punto de entrada único: el
// provisioning y la UI resuelven el vertical desde acá por su `id`.

import type { Blueprint } from "./types";
import { serviciosBlueprint } from "./servicios";
import { carniceriaBlueprint } from "./carniceria";

export type { Blueprint, PrismaTx, TenantBrandingDefaults } from "./types";

// Vertical por defecto: el ERP nació como "servicios" (spa), así que un alta sin
// --blueprint mantiene el comportamiento histórico.
export const DEFAULT_BLUEPRINT_ID = "servicios";

const REGISTRY: Record<string, Blueprint> = {
  [serviciosBlueprint.id]: serviciosBlueprint,
  [carniceriaBlueprint.id]: carniceriaBlueprint,
};

export const BLUEPRINT_IDS = Object.keys(REGISTRY);

/** Devuelve el blueprint o lanza con la lista válida (falla explícito, no silencioso). */
export function getBlueprint(id: string): Blueprint {
  const bp = REGISTRY[id];
  if (!bp) {
    throw new Error(
      `Blueprint desconocido: "${id}". Válidos: ${BLUEPRINT_IDS.join(", ")}.`,
    );
  }
  return bp;
}

export function listBlueprints(): Blueprint[] {
  return Object.values(REGISTRY);
}
