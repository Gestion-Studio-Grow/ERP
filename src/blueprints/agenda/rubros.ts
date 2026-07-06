// Rubros del blueprint "Agenda & Servicios" — CONFIGURACIÓN PURA por rubro.
//
// El archetipo Agenda&Servicios es UNO (turnos por profesional, boxes, catálogo de
// servicios); lo que cambia entre una estética, una peluquería, una veterinaria o un
// consultorio es SÓLO este archivo: catálogo, wording, branding y módulos. Cero
// código por rubro (ADR-002 / ADR-003). Comparte con todos: `Service`, `Professional`,
// `WorkingHours`, `ServiceCategory`, `Box`, la agenda del Core.
//
// DATOS PROVISIONALES: catálogos, precios (AR, mediados 2026) y branding son valores
// de referencia razonables para que el tenant nazca usable (nunca pantalla vacía,
// ADR-019 §2.b). NO son la lista real de ningún negocio: se editan en el panel.

import type { TenantBrandingDefaults } from "../types";

// Copy del rubro para la vidriera/panel: el nombre de las cosas cambia para que el
// cliente sienta que es su negocio ("Sacá tu turno" vs "Reservá tu consulta").
export interface AgendaWording {
  /** Título de la sección de servicios en la vidriera. */
  catalogHeading: string;
  /** Cómo se llama el que atiende ("profesional", "estilista", "veterinario/a", "cancha"). */
  providerNoun: string;
  /** Bajada del hero. */
  heroTagline: string;
  /** Texto del botón de reserva. */
  bookCta: string;
  // --- Copy del flujo de reserva público (opcionales). Si el rubro no los define,
  //     `agendaBookingCopy` cae al wording histórico ("profesional"/"servicio"/
  //     "turno") → los rubros existentes no cambian una coma. Los usa un rubro cuyo
  //     vocabulario NO es turno-por-profesional (ej. pádel: cancha + turno). ---
  /** Cómo se llama lo que se reserva ("servicio", "turno", "consulta"). */
  serviceNoun?: string;
  /** H1 de /reserva ("Reservá tu turno" / "Reservá tu cancha"). */
  bookingTitle?: string;
  /** Bajada de /reserva. */
  bookingSubtitle?: string;
  /** Texto del botón que confirma la reserva ("Confirmar turno" / "Confirmar reserva"). */
  confirmCta?: string;
}

// Un servicio semilla del catálogo. `cat` referencia una categoría por su nombre.
export interface AgendaService {
  name: string;
  cat: string;
  durationMin: number;
  price: number;
}

export interface AgendaRubro {
  id: string;
  label: string;
  keywords: string[];
  /** Categorías del catálogo, en orden de aparición. */
  categories: string[];
  services: AgendaService[];
  /** Nombre del profesional de ejemplo que se siembra (editable). */
  exampleProfessional: string;
  wording: AgendaWording;
  brandingDefaults: TenantBrandingDefaults;
  /** Preset de acento sugerido (src/lib/branding.ts) — lo aplica el alta si el operador no elige otro. */
  suggestedAccent: string;
  suggestedTheme: "light" | "dark";
}

const HORARIO_COMERCIAL = "Lun a sáb · 9 a 19 h";

export const AGENDA_RUBROS: AgendaRubro[] = [
  {
    id: "estetica",
    label: "Estética / Spa",
    keywords: ["estetica", "spa", "belleza", "cosmetologia", "depilacion", "unas", "manicura", "facial"],
    categories: ["Faciales", "Corporales", "Manos y pies"],
    services: [
      { name: "Limpieza facial profunda", cat: "Faciales", durationMin: 50, price: 18000 },
      { name: "Peeling químico", cat: "Faciales", durationMin: 40, price: 22000 },
      { name: "Masaje descontracturante", cat: "Corporales", durationMin: 60, price: 16000 },
      { name: "Radiofrecuencia corporal", cat: "Corporales", durationMin: 45, price: 25000 },
      { name: "Manicura semipermanente", cat: "Manos y pies", durationMin: 45, price: 9000 },
      { name: "Pedicura completa", cat: "Manos y pies", durationMin: 50, price: 11000 },
    ],
    exampleProfessional: "Profesional de ejemplo (editable)",
    wording: {
      catalogHeading: "Nuestros tratamientos",
      providerNoun: "profesional",
      heroTagline: "Cuidado y bienestar, a tu tiempo.",
      bookCta: "Reservar turno",
    },
    brandingDefaults: {
      shortLabel: "Tu estética",
      hoursLabel: HORARIO_COMERCIAL,
      contactNote: "Reservá tu turno online. Tratamientos faciales y corporales.",
    },
    suggestedAccent: "rosa",
    suggestedTheme: "light",
  },
  {
    id: "peluqueria",
    label: "Peluquería / Barbería",
    keywords: ["peluqueria", "barberia", "barber", "cabello", "corte", "color", "brushing", "salon"],
    categories: ["Corte y peinado", "Color", "Tratamientos"],
    services: [
      { name: "Corte de dama", cat: "Corte y peinado", durationMin: 45, price: 9000 },
      { name: "Corte de caballero", cat: "Corte y peinado", durationMin: 30, price: 6500 },
      { name: "Brushing", cat: "Corte y peinado", durationMin: 40, price: 7000 },
      { name: "Coloración completa", cat: "Color", durationMin: 90, price: 22000 },
      { name: "Mechas / balayage", cat: "Color", durationMin: 120, price: 35000 },
      { name: "Nutrición capilar", cat: "Tratamientos", durationMin: 40, price: 12000 },
    ],
    exampleProfessional: "Estilista de ejemplo (editable)",
    wording: {
      catalogHeading: "Nuestros servicios",
      providerNoun: "estilista",
      heroTagline: "Tu estilo, en las mejores manos.",
      bookCta: "Pedir turno",
    },
    brandingDefaults: {
      shortLabel: "Tu peluquería",
      hoursLabel: HORARIO_COMERCIAL,
      contactNote: "Corte, color y peinado con turno online.",
    },
    suggestedAccent: "ambar",
    suggestedTheme: "dark",
  },
  {
    id: "veterinaria",
    label: "Veterinaria",
    keywords: ["veterinaria", "veterinario", "mascotas", "perros", "gatos", "peluqueria canina", "vet"],
    categories: ["Consultas", "Vacunación", "Peluquería y baño"],
    services: [
      { name: "Consulta clínica general", cat: "Consultas", durationMin: 30, price: 12000 },
      { name: "Control y seguimiento", cat: "Consultas", durationMin: 20, price: 8000 },
      { name: "Vacuna antirrábica", cat: "Vacunación", durationMin: 15, price: 9000 },
      { name: "Vacuna séxtuple", cat: "Vacunación", durationMin: 15, price: 11000 },
      { name: "Baño y corte (perro chico)", cat: "Peluquería y baño", durationMin: 60, price: 14000 },
      { name: "Baño y corte (perro grande)", cat: "Peluquería y baño", durationMin: 90, price: 20000 },
    ],
    exampleProfessional: "Veterinario/a de ejemplo (editable)",
    wording: {
      catalogHeading: "Nuestros servicios",
      providerNoun: "veterinario/a",
      heroTagline: "El cuidado que tu mascota merece.",
      bookCta: "Reservar consulta",
    },
    brandingDefaults: {
      shortLabel: "Tu veterinaria",
      hoursLabel: "Lun a sáb · 9 a 20 h",
      contactNote: "Consultas, vacunación y peluquería canina con turno.",
    },
    suggestedAccent: "verde",
    suggestedTheme: "light",
  },
  {
    id: "consultorio",
    label: "Consultorio / Salud",
    keywords: ["consultorio", "medico", "salud", "kinesiologia", "nutricion", "psicologia", "odontologia", "fonoaudiologia"],
    categories: ["Consultas", "Sesiones", "Estudios"],
    services: [
      { name: "Primera consulta", cat: "Consultas", durationMin: 45, price: 15000 },
      { name: "Consulta de seguimiento", cat: "Consultas", durationMin: 30, price: 10000 },
      { name: "Sesión individual", cat: "Sesiones", durationMin: 50, price: 13000 },
      { name: "Sesión de control", cat: "Sesiones", durationMin: 30, price: 9000 },
      { name: "Informe / certificado", cat: "Estudios", durationMin: 20, price: 6000 },
    ],
    exampleProfessional: "Profesional de la salud (editable)",
    wording: {
      catalogHeading: "Prestaciones",
      providerNoun: "profesional",
      heroTagline: "Turnos claros, atención a tiempo.",
      bookCta: "Solicitar turno",
    },
    brandingDefaults: {
      shortLabel: "Tu consultorio",
      hoursLabel: "Lun a vie · 8 a 20 h",
      contactNote: "Turnos online para consultas y sesiones.",
    },
    suggestedAccent: "celeste",
    suggestedTheme: "light",
  },
];

export const AGENDA_RUBRO_IDS = AGENDA_RUBROS.map((r) => r.id);

export function getAgendaRubro(id: string): AgendaRubro | null {
  return AGENDA_RUBROS.find((r) => r.id === id) ?? null;
}

// Wording genérico de agenda si el rubro no matchea (fallback de la vidriera).
export const GENERIC_AGENDA_WORDING: AgendaWording = {
  catalogHeading: "Nuestros servicios",
  providerNoun: "profesional",
  heroTagline: "Reservá tu turno online.",
  bookCta: "Reservar turno",
};

// Mapa slug de tenant → rubro de agenda (mismo patrón que retail `RUBRO_BY_SLUG`).
// Sirve para que la vidriera resuelva el wording del rubro por el slug del tenant
// actual sin depender de la DB. Hoy sin mapeos (los rubros de agenda usan el wording
// histórico); infra lista para cuando un rubro de agenda quiera voz propia por slug.
const RUBRO_BY_SLUG: Record<string, string> = {};

export function resolveAgendaRubroIdBySlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return RUBRO_BY_SLUG[slug] ?? null;
}

// Copy YA RESUELTA del flujo de reserva público — strings listos para pintar. Cae
// al wording histórico (estética/CH) cuando el rubro no define su propia voz, así
// los tenants existentes no cambian nada. `capitalize` sólo la primera letra para
// derivar etiquetas ("cancha" → "Cancha") sin castellanizar de más.
export interface AgendaBookingCopy {
  title: string;
  subtitle: string;
  providerLabel: string;
  providerPlaceholder: string;
  serviceLabel: string;
  servicePlaceholder: string;
  confirmCta: string;
  summaryProviderLabel: string;
  summaryServiceLabel: string;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

export function agendaBookingCopyFor(rubroId: string | null | undefined): AgendaBookingCopy {
  const rubro = rubroId ? getAgendaRubro(rubroId) : null;
  const w = rubro?.wording ?? GENERIC_AGENDA_WORDING;
  const providerNoun = w.providerNoun; // "profesional" | "cancha" | …
  const serviceNoun = w.serviceNoun ?? "servicio";
  const providerCap = capitalize(providerNoun);
  const serviceCap = capitalize(serviceNoun);
  // Artículo para el placeholder: "cancha" es femenino → "una", el resto "un".
  const article = /a$/.test(providerNoun) ? "una" : "un";
  return {
    title: w.bookingTitle ?? "Reservá tu turno",
    subtitle: w.bookingSubtitle ?? "Elegí profesional, servicio y horario disponible. Te confirmamos por WhatsApp.",
    providerLabel: providerCap,
    providerPlaceholder: `Seleccioná ${article} ${providerNoun}`,
    serviceLabel: serviceCap,
    servicePlaceholder: `Seleccioná un ${serviceNoun}`,
    confirmCta: w.confirmCta ?? "Confirmar turno",
    summaryProviderLabel: providerCap,
    summaryServiceLabel: serviceCap,
  };
}

export function agendaBookingCopyForSlug(slug: string | null | undefined): AgendaBookingCopy {
  return agendaBookingCopyFor(resolveAgendaRubroIdBySlug(slug));
}
