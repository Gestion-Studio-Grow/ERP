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
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { isColumnMissing } from "@/lib/prisma-errors";
import { round2 } from "@/lib/round";

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

const SELECT_LOCALIZACION = {
  shortLabel: true,
  addressLine: true,
  city: true,
  hoursLabel: true,
  whatsapp: true,
  email: true,
  instagram: true,
  mapsUrl: true,
  contactNote: true,
} as const;

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
    // `select` explícito: sólo las columnas de la Localización. Así esta lectura no depende de
    // columnas de otros módulos (las reglas del mostrador de abajo pueden no estar migradas).
    const row = await prisma.businessSettings.findUnique({ where: { tenantId }, select: SELECT_LOCALIZACION });
    return resolveLocation(row);
  } catch {
    return resolveLocation(null);
  }
});

// ============================================================================
// REGLAS DEL MOSTRADOR — «Mi negocio» (reingeniería CH, Tanda 3 · M2)
// ============================================================================
//
// Alias/CBU de la seña, cuánto antes tiene que avisar la clienta, qué se propone hacer con la seña
// cuando avisa tarde o no viene, y hasta cuánto puede dar de baja un saldo la recepción. Viven en
// seis columnas de `BusinessSettings` que agrega la migración 20261024120100_ch_reglas_negocio,
// ESCRITA y SIN APLICAR en producción (Gate 2: la aplica el dueño).
//
// Contrato: el código anda con y sin esa migración.
//   · Sin la migración, `leerReglasDelNegocio` devuelve el placeholder D2/D5 del diseño
//     (`REGLAS_POR_DEFECTO`, provisional a confirmar) con `activas: false`, y la pantalla dice
//     «pendiente de activar» (CH-053). `guardarReglasDelNegocio` contesta
//     `{ ok: false, motivo: "pendiente-de-migracion" }` sin escribir nada.
//   · Con la migración, se leen y escriben por `tenantId` (único) — CH-068.
//   · El cliente de Prisma no pide estas columnas por defecto (src/lib/prisma-omit.ts): sólo
//     estas dos funciones las nombran, con `select`.

/** Qué se hace con la seña: se la queda el negocio, se devuelve, o queda a favor de la clienta. */
export type DestinoSenia = "retener" | "devolver" | "a-favor";
export const DESTINOS_SENIA: readonly DestinoSenia[] = ["retener", "devolver", "a-favor"];

export type ReglasDelNegocio = {
  aliasSenia: string | null;
  cbuSenia: string | null;
  /** Avisando con al menos estas horas, la seña se devuelve (o queda a favor). */
  cancelacionHoras: number;
  /** Qué se propone cuando la clienta avisa con menos de `cancelacionHoras`. */
  seniaCancelaTarde: DestinoSenia;
  /** Qué se propone cuando la clienta no viene. */
  seniaNoVino: DestinoSenia;
  /** Hasta cuánto (en pesos) puede dar de baja un saldo la recepción. 0 = nunca (sólo la dueña). */
  topeBajaSaldoRecepcion: number;
  /** false = la migración M2 no está en esta base: los valores son el placeholder y no se pueden guardar. */
  activas: boolean;
};

/** Placeholder D2/D5 del diseño (PROVISIONAL A CONFIRMAR con el dueño). Coincide con los defaults de la migración. */
export const REGLAS_POR_DEFECTO: Omit<ReglasDelNegocio, "activas"> = {
  aliasSenia: null,
  cbuSenia: null,
  cancelacionHoras: 24,
  seniaCancelaTarde: "retener",
  seniaNoVino: "retener",
  topeBajaSaldoRecepcion: 0,
};

/** Tope razonable para las horas de aviso: una semana. Más que eso no es una regla de turnos. */
export const MAX_CANCELACION_HORAS = 168;

const SELECT_REGLAS = {
  aliasSenia: true,
  cbuSenia: true,
  cancelacionHoras: true,
  seniaCancelaTarde: true,
  seniaNoVino: true,
  topeBajaSaldoRecepcion: true,
} as const;

/** La fila cruda de las reglas, tal como sale de la base (Decimal como algo convertible a número). */
export type ReglasRow = {
  aliasSenia: string | null;
  cbuSenia: string | null;
  cancelacionHoras: number | null;
  seniaCancelaTarde: string | null;
  seniaNoVino: string | null;
  topeBajaSaldoRecepcion: { toString(): string } | number | string | null;
};

function destino(raw: string | null | undefined, porDefecto: DestinoSenia): DestinoSenia {
  return (DESTINOS_SENIA as readonly string[]).includes(String(raw ?? "")) ? (raw as DestinoSenia) : porDefecto;
}

/**
 * Puro: de la fila (o su ausencia) a las reglas que usa el mostrador. Lo que falta o no se
 * entiende cae al placeholder, nunca a algo más permisivo: un tope ilegible es $0.
 */
export function resolverReglas(row: ReglasRow | null, activas: boolean): ReglasDelNegocio {
  const d = REGLAS_POR_DEFECTO;
  const horas = row?.cancelacionHoras;
  const tope = row?.topeBajaSaldoRecepcion == null ? NaN : Number(String(row.topeBajaSaldoRecepcion));
  return {
    aliasSenia: clean(row?.aliasSenia) || null,
    cbuSenia: clean(row?.cbuSenia).replace(/\s+/g, "") || null,
    cancelacionHoras:
      horas != null && Number.isInteger(horas) && horas >= 0 && horas <= MAX_CANCELACION_HORAS ? horas : d.cancelacionHoras,
    seniaCancelaTarde: destino(row?.seniaCancelaTarde, d.seniaCancelaTarde),
    seniaNoVino: destino(row?.seniaNoVino, d.seniaNoVino),
    topeBajaSaldoRecepcion: Number.isFinite(tope) && tope > 0 ? round2(tope) : 0,
    activas,
  };
}

/** Lo que necesitan estas funciones de un cliente de Prisma: el de la app, una `tx` o la consola. */
type ClienteDeReglas = Pick<Prisma.TransactionClient, "businessSettings">;

/**
 * Las reglas del mostrador de ESTE negocio. Tolera la base sin la migración M2 (P2022 → placeholder
 * con `activas: false`). Cualquier otro error sube: no se inventan reglas sobre una base que falla.
 * `db`: el cliente de la app por defecto; pasá la `tx` si leés dentro de una transacción.
 */
export async function leerReglasDelNegocio(tenantId: string, db: ClienteDeReglas = prisma): Promise<ReglasDelNegocio> {
  try {
    const row = await db.businessSettings.findUnique({ where: { tenantId }, select: SELECT_REGLAS });
    return resolverReglas(row, true);
  } catch (err) {
    if (!isColumnMissing(err)) throw err;
    return resolverReglas(null, false);
  }
}

export type ReglasAGuardar = Omit<ReglasDelNegocio, "activas">;

export type ValidacionReglas = { ok: true; reglas: ReglasAGuardar } | { ok: false; error: string };

/** Puro: valida lo que cargó la dueña. Mensajes en criollo, que dicen qué corregir. */
export function validarReglas(input: {
  aliasSenia?: string | null;
  cbuSenia?: string | null;
  cancelacionHoras: number;
  seniaCancelaTarde: string;
  seniaNoVino: string;
  topeBajaSaldoRecepcion: number;
}): ValidacionReglas {
  const alias = clean(input.aliasSenia);
  if (alias && !/^[A-Za-z0-9.\-]{6,20}$/.test(alias)) {
    return { ok: false, error: "El alias tiene entre 6 y 20 letras, números, puntos o guiones (por ejemplo, ch.estetica.mp)." };
  }
  const cbu = clean(input.cbuSenia).replace(/\s+/g, "");
  if (cbu && !/^\d{22}$/.test(cbu)) return { ok: false, error: "El CBU o CVU tiene 22 números, sin espacios ni guiones." };
  const h = input.cancelacionHoras;
  if (!Number.isInteger(h) || h < 0 || h > MAX_CANCELACION_HORAS) {
    return { ok: false, error: `Las horas de aviso van de 0 a ${MAX_CANCELACION_HORAS} (una semana).` };
  }
  if (!(DESTINOS_SENIA as readonly string[]).includes(input.seniaCancelaTarde) || !(DESTINOS_SENIA as readonly string[]).includes(input.seniaNoVino)) {
    return { ok: false, error: "Elegí qué pasa con la seña: se la queda el negocio, se devuelve o queda a favor." };
  }
  const tope = input.topeBajaSaldoRecepcion;
  if (!Number.isFinite(tope) || tope < 0) return { ok: false, error: "El tope de la recepción es un monto en pesos, desde $0." };
  return {
    ok: true,
    reglas: {
      aliasSenia: alias || null,
      cbuSenia: cbu || null,
      cancelacionHoras: h,
      seniaCancelaTarde: input.seniaCancelaTarde as DestinoSenia,
      seniaNoVino: input.seniaNoVino as DestinoSenia,
      topeBajaSaldoRecepcion: round2(tope),
    },
  };
}

/**
 * Graba las reglas de ESTE negocio (upsert por `tenantId` único, CH-068). No es una Server Action:
 * quien la llama ya validó el permiso (sólo la dueña) y las reglas (`validarReglas`). Sin la
 * migración M2 no escribe nada y contesta `pendiente-de-migracion`.
 */
export async function guardarReglasDelNegocio(
  tenantId: string,
  reglas: ReglasAGuardar,
  db: ClienteDeReglas = prisma,
): Promise<{ ok: true } | { ok: false; motivo: "pendiente-de-migracion" }> {
  const data = { ...reglas };
  try {
    await db.businessSettings.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data, select: { id: true } });
    return { ok: true };
  } catch (err) {
    if (!isColumnMissing(err)) throw err;
    return { ok: false, motivo: "pendiente-de-migracion" };
  }
}
