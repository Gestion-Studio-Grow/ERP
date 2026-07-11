// Fábrica de tenants — MAPEO del formulario de la consola → `ProvisionTenantInput` (ADR-074 / RFC-003).
//
// PURO y CLIENT-SAFE: cero imports de Prisma/servidor/React. Lo comparten el wizard (cliente,
// arma el `RawWizardForm` paso a paso) y los Server Actions (`operator-provisioning-actions.ts`,
// que lo re-mapean y validan del lado servidor — nunca se confía en el cliente). Ese doble uso
// es a propósito: el mapeo vive en un solo lugar, testeable sin DB.

import type {
  ProvisionTenantInput,
  ProvisionMode,
  ProvisionEdition,
  ProvisionOutcome,
} from "./types";

/**
 * Resultado del commit para el cliente (lo devuelve `commitTenantAction`). Vive acá —módulo
 * client-safe— y no en el archivo `"use server"`, que sólo puede exportar funciones async.
 */
export interface CommitActionResult {
  ok: boolean;
  outcome?: ProvisionOutcome;
  tenantId?: string;
  /** Password de bootstrap del OWNER — se devuelve una vez para mostrarla fuera de la URL (P10). */
  generatedPassword?: string;
  /** Mensaje legible si el commit se bloqueó/falló (colisiones, gate RLS de ADR-018, etc.). */
  error?: string;
}

/** Campos planos que el wizard recolecta a lo largo de los 5 pasos (RFC-003 §3.1). */
export interface RawWizardForm {
  // Paso 1 · Negocio
  name?: string;
  slug?: string;
  ownerName?: string;
  ownerEmail?: string;
  // Paso 2 · Rubro + Edición
  rubro?: string;
  blueprint?: string;
  edicion?: string; // "comercio" | "empresa" (se normaliza)
  // Paso 4 · Marca + link + plan/estado + datos de empresa
  accentPreset?: string;
  frontTheme?: string; // "light" | "dark"
  monogram?: string;
  subdomain?: string;
  // Datos de empresa (BusinessSettings / Localización, ADR-019)
  timezone?: string;
  city?: string;
  addressLine?: string;
  whatsapp?: string;
  contactEmail?: string;
  instagram?: string;
  mapsUrl?: string;
  hoursLabel?: string;
  shortLabel?: string;
  contactNote?: string;
}

/** Normaliza la edición del form (default: comercio) — canal neutro, nunca lite/enterprise (C-004). */
export function normalizeEdition(value: string | undefined): ProvisionEdition {
  return value === "empresa" ? "empresa" : "comercio";
}

/**
 * Mapea la edición del negocio (canal neutro Comercio/Empresa) al `Tenant.profile` del schema
 * (`lite`/`enterprise`, ADR-058/059). Es la traducción que el committer persiste en el alta
 * (RFC-003 P1). Pura y client-safe (los valores son los del enum `TenantProfile`, no se muestran
 * al cliente — el cliente ve "Comercio"/"Empresa", C-004).
 */
export function editionToProfile(edicion: ProvisionEdition): "lite" | "enterprise" {
  return edicion === "empresa" ? "enterprise" : "lite";
}

/**
 * Clave de idempotencia de la ORQUESTACIÓN (ADR-074 §4). Determinística por slug: reintentar el
 * alta del MISMO slug (doble click, reintento tras timeout) devuelve el outcome cacheado en vez
 * de re-ejecutar la saga. Es coherente con la idempotencia por slug del core de ADR-019, y distinta
 * del slug a nivel de nombre (prefijo `console:`) para no confundir las dos capas.
 */
export function consoleIdempotencyKey(slug: string): string {
  return `console:${slug.trim()}`;
}

/** Sólo deja pasar strings no vacías (tras trim); undefined si quedó vacía. */
function clean(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

/**
 * Mapea el formulario plano del wizard al contrato único de la fábrica. NO valida (eso es del
 * motor `planProvision`): sólo arma el objeto, limpiando vacíos. `mode` e `idempotencyKey` los
 * fija el llamador (el dry-run del preview usa "dry-run"; el commit usa "commit").
 */
export function buildProvisionInput(
  raw: RawWizardForm,
  mode: ProvisionMode,
): ProvisionTenantInput {
  const slug = (raw.slug ?? "").trim();
  return {
    slug,
    name: (raw.name ?? "").trim(),
    rubro: clean(raw.rubro),
    blueprint: clean(raw.blueprint),
    edicion: normalizeEdition(raw.edicion),
    empresa: {
      timezone: clean(raw.timezone),
      city: clean(raw.city),
      addressLine: clean(raw.addressLine),
      whatsapp: clean(raw.whatsapp),
      email: clean(raw.contactEmail),
      instagram: clean(raw.instagram),
      mapsUrl: clean(raw.mapsUrl),
      hoursLabel: clean(raw.hoursLabel),
      shortLabel: clean(raw.shortLabel),
      contactNote: clean(raw.contactNote),
    },
    brandSheet: {
      accentPreset: clean(raw.accentPreset),
      frontTheme: raw.frontTheme === "dark" ? "dark" : raw.frontTheme === "light" ? "light" : undefined,
      monogram: clean(raw.monogram),
      subdomain: clean(raw.subdomain),
    },
    admin: {
      name: clean(raw.ownerName),
      email: (raw.ownerEmail ?? "").trim(),
    },
    mode,
    idempotencyKey: consoleIdempotencyKey(slug),
  };
}

/** Monograma sugerido a partir del nombre (para el preview de marca si el operador no lo escribe). */
export function suggestMonogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
