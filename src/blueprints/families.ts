// Agregador de FAMILIAS de blueprints por rubro (ADR-002 / ADR-019).
//
// Junta las familias de presets por rubro —Agenda&Servicios, Servicios&Oficios,
// Gastronomía— en dos exports que el registro central (`./index.ts`) spreadea con una
// sola línea, para no tocar el archivo compartido por cada familia. La familia
// Retail/Mostrador vive aparte (`./retail`) y el registro la suma directo.
//
// Sumar una familia nueva = agregar su import acá; el registro no cambia.

import type { Blueprint } from "./types";
import { AGENDA_BLUEPRINTS, AGENDA_RUBRO_HINTS } from "./agenda";
import { OFICIOS_BLUEPRINTS, OFICIOS_RUBRO_HINTS } from "./oficios";
import { GASTRO_BLUEPRINTS, GASTRO_RUBRO_HINTS } from "./gastronomia";

// Todos los blueprints de las familias, listos para spread en el REGISTRY central.
export const FAMILY_BLUEPRINTS: Record<string, Blueprint> = {
  ...AGENDA_BLUEPRINTS,
  ...OFICIOS_BLUEPRINTS,
  ...GASTRO_BLUEPRINTS,
};

// Pistas rubro→blueprint de las familias, para el selector del onboarding. Van ANTES
// de las pistas genéricas del registro, para que un rubro específico (p. ej.
// "peluquería") matchee su preset y no el "servicios" genérico.
export const FAMILY_RUBRO_HINTS: { id: string; keywords: string[] }[] = [
  ...AGENDA_RUBRO_HINTS,
  ...OFICIOS_RUBRO_HINTS,
  ...GASTRO_RUBRO_HINTS,
];
