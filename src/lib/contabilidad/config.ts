/**
 * Configuración del módulo de Contabilidad + Control de gestión por negocio (T0, GSG-CTRL-001).
 *
 * Dos cosas distintas, a propósito:
 *   · El INTERRUPTOR «contabilidad» (src/cambios/interruptores.ts): ¿el negocio ve el módulo?
 *     Apagado por defecto. Vive en AuditLog, así que se puede prender aunque la migración de la
 *     ola 2 todavía no esté aplicada: en ese caso la pantalla dice «migración pendiente».
 *   · `ConfigContable` (tabla de la ola 2): el NIVEL del módulo — «Control de gestión · Pyme» o
 *     «Control de gestión · Corporativo» (nombre aprobado por el dueño) — y las capacidades que se
 *     encienden una a una. No es `TenantProfile` (Comercio/Empresa del ERP): no se toca.
 *
 * PURO: sin base.
 */

import type { RubroContable } from "./plan-modelo";

export const NIVELES_CONTABLES = ["PYME", "CORPORATIVO"] as const;
export type NivelContable = (typeof NIVELES_CONTABLES)[number];

export const ETIQUETA_NIVEL: Record<NivelContable, string> = {
  PYME: "Control de gestión · Pyme",
  CORPORATIVO: "Control de gestión · Corporativo",
};

/** Capacidades del nivel Corporativo que se prenden de a una (control-de-gestion-EMPRESAS.md §2.1). */
export const CAPACIDADES_CONTABLES = ["multiempresa", "multimoneda", "jerarquia", "aprobaciones", "segmentos", "api"] as const;
export type CapacidadContable = (typeof CAPACIDADES_CONTABLES)[number];
export type Capacidades = Readonly<Record<CapacidadContable, boolean>>;

export function esNivelContable(x: unknown): x is NivelContable {
  return typeof x === "string" && (NIVELES_CONTABLES as readonly string[]).includes(x);
}

/** Un nivel desconocido o ausente es PYME: lo grande nunca se prende por un hueco. */
export function nivelDesde(x: unknown): NivelContable {
  return esNivelContable(x) ? x : "PYME";
}

/**
 * Lee el JSON de capacidades sin confiar en él: sólo las claves conocidas y sólo `true` literal
 * prende. Cualquier otra cosa (string "true", 1, clave inventada, null) cuenta como apagada.
 */
export function capacidadesDesde(json: unknown): Capacidades {
  const fuente = json !== null && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
  return Object.fromEntries(CAPACIDADES_CONTABLES.map((c) => [c, fuente[c] === true])) as Record<CapacidadContable, boolean>;
}

/**
 * Rubro contable sugerido para sembrar el plan modelo. Lo decide el contador; esto sólo propone.
 * `adosmanos` es comercio (FINAL §1, revisión del contador) aunque su blueprint no lo diga.
 */
const RUBRO_POR_SLUG: Readonly<Record<string, RubroContable>> = { adosmanos: "comercio" };
const RUBRO_POR_BLUEPRINT: Readonly<Record<string, RubroContable>> = { servicios: "servicios", carniceria: "comercio" };

export function rubroContableSugerido(t: { slug: string; blueprintId?: string | null }): RubroContable | null {
  return RUBRO_POR_SLUG[t.slug.trim().toLowerCase()] ?? (t.blueprintId ? (RUBRO_POR_BLUEPRINT[t.blueprintId] ?? null) : null);
}

/** Qué ve el negocio del módulo (QA de T0). */
export type EstadoModuloContable = "OCULTO" | "MIGRACION_PENDIENTE" | "LISTO";

/**
 * Apagado → OCULTO (cero rastro, ni se mira la base). Prendido sin la migración → aviso de
 * migración pendiente, nunca un error. Prendido y migrado → LISTO.
 */
export function estadoModuloContable(p: { prendido: boolean; migracionAplicada: boolean }): EstadoModuloContable {
  if (!p.prendido) return "OCULTO";
  return p.migracionAplicada ? "LISTO" : "MIGRACION_PENDIENTE";
}
