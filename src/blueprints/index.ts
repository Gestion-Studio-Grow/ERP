// Registro de Blueprints (ADR-002 / ADR-019). Punto de entrada único: el
// provisioning y la UI resuelven el vertical desde acá por su `id`.

import type { Blueprint } from "./types";
import { serviciosBlueprint } from "./servicios";
import { carniceriaBlueprint } from "./carniceria";
import { genericoBlueprint } from "./generico";
import { RETAIL_BLUEPRINTS, RETAIL_RUBRO_HINTS } from "./retail";
import { FAMILY_BLUEPRINTS, FAMILY_RUBRO_HINTS } from "./families";

export type { Blueprint, PrismaTx, TenantBrandingDefaults } from "./types";

// Vertical por defecto: el ERP nació como "servicios" (spa), así que un alta sin
// --blueprint ni --rubro mantiene el comportamiento histórico.
export const DEFAULT_BLUEPRINT_ID = "servicios";

// Vertical COMODÍN: cuando el rubro del cliente no matchea ningún blueprint modelado,
// el selector cae acá en vez de fallar. Es el guardrail de negocio: "si tu negocio no
// está acá, lo acomodamos sobre lo existente (genérico + config)", NO un fork a medida.
export const FALLBACK_BLUEPRINT_ID = "generico";

const REGISTRY: Record<string, Blueprint> = {
  // Familia Retail/Mostrador: un blueprint por rubro (verdulería, dietética, kiosco,
  // fiambrería, indumentaria, carnicería) — config pura, ver src/blueprints/retail.
  // Va primero para que los ids de abajo (incl. la carnicería standalone) tengan
  // precedencia y no cambie el comportamiento ya existente.
  ...RETAIL_BLUEPRINTS,
  // Familias de presets por rubro (Agenda&Servicios, Servicios&Oficios, Gastronomía)
  // — config pura, ver src/blueprints/{agenda,oficios,gastronomia} y families.ts.
  ...FAMILY_BLUEPRINTS,
  [serviciosBlueprint.id]: serviciosBlueprint,
  [carniceriaBlueprint.id]: carniceriaBlueprint,
  [genericoBlueprint.id]: genericoBlueprint,
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

// Pistas de rubro → blueprint. Datos, no código: sumar un vertical nuevo es agregar
// su fila acá (o un blueprint nuevo al REGISTRY), sin tocar el selector. Las claves se
// comparan normalizadas (minúsculas, sin acentos) contra el texto de rubro que trae el
// descubrimiento (ONBOARDING-TENANT §3.2).
const RUBRO_HINTS: { id: string; keywords: string[] }[] = [
  {
    id: "servicios",
    keywords: [
      "estetica", "spa", "salon", "peluqueria", "belleza", "unas", "barberia",
      "masajes", "cosmetologia", "turnos", "manicura", "depilacion",
    ],
  },
  {
    id: "carniceria",
    keywords: [
      "carniceria", "carne", "carnes", "pollo", "cerdo", "fiambre", "fiambreria",
      "frigorifico", "achuras", "granja",
    ],
  },
];

export interface BlueprintMatch {
  blueprint: Blueprint;
  blueprintId: string;
  /** true si el rubro matcheó un vertical modelado; false si cayó al comodín. */
  matched: boolean;
  /** El texto de rubro normalizado que se evaluó (para mensajes/telemetría). */
  normalizedHint: string;
}

// Normaliza para el match: minúsculas + saca acentos, así "carnicería" == "carniceria".
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9 ]/g, "") // saca acentos (marcas combinantes) y simbolos
    .trim();
}

/**
 * Selector de blueprint a partir del rubro libre que capta el descubrimiento.
 * Núcleo del onboarding hiper-personalizado: si el rubro matchea un vertical modelado,
 * el tenant nace con ESE blueprint (se siente hecho para su negocio); si no matchea
 * nada, cae al COMODÍN genérico — nunca falla, nunca fuerza un desarrollo a medida.
 * `provisionTenant` sigue recibiendo el id resuelto; esto solo decide cuál.
 */
// Orden de evaluación: primero los rubros ESPECÍFICOS (retail + familias), después las
// pistas genéricas de abajo — así "peluquería" cae en su preset y no en "servicios".
const ALL_RUBRO_HINTS: { id: string; keywords: string[] }[] = [
  ...RETAIL_RUBRO_HINTS,
  ...FAMILY_RUBRO_HINTS,
  ...RUBRO_HINTS,
];

export function resolveBlueprint(rubro?: string): BlueprintMatch {
  const normalizedHint = rubro ? normalize(rubro) : "";
  if (normalizedHint) {
    for (const entry of ALL_RUBRO_HINTS) {
      if (entry.keywords.some((k) => normalizedHint.includes(k))) {
        return { blueprint: REGISTRY[entry.id], blueprintId: entry.id, matched: true, normalizedHint };
      }
    }
  }
  return {
    blueprint: REGISTRY[FALLBACK_BLUEPRINT_ID],
    blueprintId: FALLBACK_BLUEPRINT_ID,
    matched: false,
    normalizedHint,
  };
}
