// Módulo Localización — datos de ubicación y contacto del negocio.
//
// Server-only (importa Prisma) pero NO es un módulo "use server": expone un
// lector para los Server Components del sitio público (layout/home) y los
// helpers puros de resolución. Las Server Actions del admin viven aparte, en
// `settings-actions.ts` (ese sí "use server").
//
// Antes estos datos estaban hardcodeados en el sitio y en business-config.ts.
// Ahora viven en la tabla BusinessSettings (una fila por tenant) y se editan
// desde /admin/localizacion. Los campos vacíos caen a estos DEFAULTS, así el
// sitio nunca queda roto por falta de configuración.

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";

// Copy por defecto = exactamente lo que mostraba el sitio hardcodeado, para que
// el comportamiento no cambie hasta que la dueña edite algo. `whatsapp` NO
// tiene default hardcodeado — regla dura: nunca un número falso. Vacío hasta
// que la dueña cargue el real en /admin/localizacion; mientras tanto el CTA
// de WhatsApp lo pide just-in-time (ver src/components/whatsapp-cta.tsx).
export const LOCATION_DEFAULTS = {
  shortLabel: "La Alameda · Canning",
  addressLine: "Barrio La Alameda, Canning",
  city: "Buenos Aires",
  hoursLabel: "Lun a sáb · 9 a 19 h",
  whatsapp: "",
  contactNote: "Reservas por la web · WhatsApp con turno confirmado",
} as const;

// Forma cruda de la fila (los campos nullable tal cual salen de la base).
export type BusinessSettingsRow = {
  shortLabel: string | null;
  addressLine: string | null;
  city: string | null;
  hoursLabel: string | null;
  whatsapp: string | null;
  email: string | null;
  instagram: string | null;
  mapsUrl: string | null;
  contactNote: string | null;
};

// Localización ya resuelta (defaults aplicados, URLs derivadas): lo que consume
// la UI sin tener que volver a decidir fallbacks.
export type ResolvedLocation = {
  shortLabel: string;
  addressLine: string;
  city: string;
  hoursLabel: string;
  whatsapp: string; // solo dígitos, "" si no hay
  email: string | null;
  instagramUrl: string | null;
  instagramLabel: string | null;
  mapsUrl: string;
  contactNote: string;
};

const clean = (v: string | null | undefined): string => (v ?? "").trim();

// Normaliza un handle o URL de Instagram a { url, label }. Acepta "@ch.estetica",
// "ch.estetica" o "https://instagram.com/ch.estetica".
function resolveInstagram(raw: string): { url: string; label: string } | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) {
    const handle = v.replace(/\/+$/, "").split("/").pop() || v;
    return { url: v, label: `@${handle.replace(/^@/, "")}` };
  }
  const handle = v.replace(/^@/, "");
  return { url: `https://instagram.com/${handle}`, label: `@${handle}` };
}

// Aplica defaults y deriva URLs. Puro (testeable, sin I/O).
export function resolveLocation(row: BusinessSettingsRow | null): ResolvedLocation {
  const shortLabel = clean(row?.shortLabel) || LOCATION_DEFAULTS.shortLabel;
  const addressLine = clean(row?.addressLine) || LOCATION_DEFAULTS.addressLine;
  const city = clean(row?.city) || LOCATION_DEFAULTS.city;
  const hoursLabel = clean(row?.hoursLabel) || LOCATION_DEFAULTS.hoursLabel;
  const contactNote = clean(row?.contactNote) || LOCATION_DEFAULTS.contactNote;
  const whatsapp = (clean(row?.whatsapp) || LOCATION_DEFAULTS.whatsapp).replace(/\D/g, "");
  const email = clean(row?.email) || null;
  const ig = resolveInstagram(clean(row?.instagram));

  // El mapa: si hay URL cargada se usa; si no, se arma una búsqueda de Google
  // Maps con la dirección + ciudad (lo que ya hacía el botón "Cómo llegar").
  const mapsOverride = clean(row?.mapsUrl);
  const mapsUrl =
    mapsOverride ||
    "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent(`${addressLine}, ${city}`);

  return {
    shortLabel,
    addressLine,
    city,
    hoursLabel,
    whatsapp,
    email,
    instagramUrl: ig?.url ?? null,
    instagramLabel: ig?.label ?? null,
    mapsUrl,
    contactNote,
  };
}

// Lector público de la localización resuelta. Tenant-scoped (ADR-015) pero sin
// requerir capacidad: son datos públicos del sitio. Cacheado por request para
// deduplicar entre layout y home.
export const getLocation = cache(async (): Promise<ResolvedLocation> => {
  // DEFENSIVO (corre en el layout público): si falla la lectura de BusinessSettings —p.ej.
  // el tenant tiene un schema viejo sin alguna columna del módulo Localización— NO tumba el
  // sitio: cae a la localización por defecto (`resolveLocation(null)`, ya null-safe). Inerte
  // con la DB sana (schema migrado → mismo comportamiento).
  try {
    const tenantId = await getCurrentTenantId();
    const row = await prisma.businessSettings.findUnique({ where: { tenantId } });
    return resolveLocation(row);
  } catch {
    return resolveLocation(null);
  }
});
