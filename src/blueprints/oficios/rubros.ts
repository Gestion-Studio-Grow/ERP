// Rubros del blueprint "Servicios & Oficios" — CONFIGURACIÓN PURA por rubro.
//
// Archetipo para oficios a domicilio (plomería, electricidad, gas, cerrajería,
// refrigeración, fletes): catálogo de TRABAJOS con precio de referencia + agenda de
// VISITAS, sin mostrador ni stock. Config pura sobre el Core (`Service`, `Professional`,
// `WorkingHours`, agenda); cero código por rubro (ADR-002).
//
// DATOS PROVISIONALES: trabajos y precios (AR, mediados 2026) son de referencia para
// que el tenant nazca usable; el oficio los edita. Los precios de oficio suelen ser
// "desde" (presupuesto en visita), lo aclara el wording.

import type { TenantBrandingDefaults } from "../types";

export interface OficiosWording {
  catalogHeading: string;
  providerNoun: string;
  heroTagline: string;
  bookCta: string;
  /** Aclaración de precios (los oficios cotizan en visita). */
  priceNote: string;
}

export interface OficiosService {
  name: string;
  cat: string;
  /** Duración estimada de la visita (min). */
  durationMin: number;
  /** Precio "desde" de referencia. */
  price: number;
}

export interface OficiosRubro {
  id: string;
  label: string;
  keywords: string[];
  categories: string[];
  services: OficiosService[];
  exampleProfessional: string;
  wording: OficiosWording;
  brandingDefaults: TenantBrandingDefaults;
  suggestedAccent: string;
  suggestedTheme: "light" | "dark";
}

const HORARIO_OFICIO = "Lun a sáb · 8 a 18 h";

export const OFICIOS_RUBROS: OficiosRubro[] = [
  {
    id: "plomeria",
    label: "Plomería",
    keywords: ["plomeria", "plomero", "gasista", "destapaciones", "cloacas", "agua", "canerias"],
    categories: ["Reparaciones", "Instalaciones", "Destapaciones"],
    services: [
      { name: "Visita y diagnóstico", cat: "Reparaciones", durationMin: 30, price: 8000 },
      { name: "Reparación de pérdida", cat: "Reparaciones", durationMin: 60, price: 18000 },
      { name: "Cambio de grifería", cat: "Instalaciones", durationMin: 60, price: 20000 },
      { name: "Instalación de termotanque", cat: "Instalaciones", durationMin: 120, price: 45000 },
      { name: "Destapación de cañería", cat: "Destapaciones", durationMin: 60, price: 25000 },
    ],
    exampleProfessional: "Técnico de ejemplo (editable)",
    wording: {
      catalogHeading: "Nuestros trabajos",
      providerNoun: "técnico",
      heroTagline: "Plomería a domicilio, rápido y prolijo.",
      bookCta: "Pedir visita",
      priceNote: "Precios desde; se confirma presupuesto en la visita.",
    },
    brandingDefaults: {
      shortLabel: "Tu plomero de confianza",
      hoursLabel: HORARIO_OFICIO,
      contactNote: "Reparaciones e instalaciones a domicilio. Presupuesto sin cargo.",
    },
    suggestedAccent: "celeste",
    suggestedTheme: "dark",
  },
  {
    id: "electricista",
    label: "Electricidad",
    keywords: ["electricista", "electricidad", "instalacion electrica", "tablero", "cableado", "iluminacion"],
    categories: ["Reparaciones", "Instalaciones", "Tableros"],
    services: [
      { name: "Visita y diagnóstico", cat: "Reparaciones", durationMin: 30, price: 8000 },
      { name: "Reparación de cortocircuito", cat: "Reparaciones", durationMin: 60, price: 16000 },
      { name: "Instalación de artefactos", cat: "Instalaciones", durationMin: 60, price: 15000 },
      { name: "Cableado de ambiente", cat: "Instalaciones", durationMin: 120, price: 38000 },
      { name: "Cambio de tablero", cat: "Tableros", durationMin: 120, price: 42000 },
    ],
    exampleProfessional: "Electricista de ejemplo (editable)",
    wording: {
      catalogHeading: "Nuestros trabajos",
      providerNoun: "electricista",
      heroTagline: "Instalaciones seguras, trabajo garantizado.",
      bookCta: "Pedir visita",
      priceNote: "Precios desde; se confirma presupuesto en la visita.",
    },
    brandingDefaults: {
      shortLabel: "Tu electricista",
      hoursLabel: HORARIO_OFICIO,
      contactNote: "Instalaciones y reparaciones eléctricas con garantía.",
    },
    suggestedAccent: "ambar",
    suggestedTheme: "dark",
  },
  {
    id: "cerrajeria",
    label: "Cerrajería",
    keywords: ["cerrajeria", "cerrajero", "cerraduras", "llaves", "aperturas", "trabas"],
    categories: ["Aperturas", "Cerraduras", "Llaves"],
    services: [
      { name: "Apertura de puerta", cat: "Aperturas", durationMin: 30, price: 12000 },
      { name: "Cambio de cerradura", cat: "Cerraduras", durationMin: 45, price: 20000 },
      { name: "Colocación de traba de seguridad", cat: "Cerraduras", durationMin: 60, price: 28000 },
      { name: "Copia de llave", cat: "Llaves", durationMin: 15, price: 3000 },
    ],
    exampleProfessional: "Cerrajero de ejemplo (editable)",
    wording: {
      catalogHeading: "Nuestros servicios",
      providerNoun: "cerrajero",
      heroTagline: "Cerrajería a domicilio, urgencias 24 h.",
      bookCta: "Pedir servicio",
      priceNote: "Precios desde; urgencias con recargo.",
    },
    brandingDefaults: {
      shortLabel: "Tu cerrajero",
      hoursLabel: "Todos los días · urgencias 24 h",
      contactNote: "Aperturas, cambios de cerradura y llaves. Urgencias 24 h.",
    },
    suggestedAccent: "petroleo",
    suggestedTheme: "dark",
  },
  {
    id: "refrigeracion",
    label: "Refrigeración / Climatización",
    keywords: ["refrigeracion", "aire acondicionado", "climatizacion", "split", "heladeras", "frio"],
    categories: ["Instalación", "Service", "Reparación"],
    services: [
      { name: "Instalación de split", cat: "Instalación", durationMin: 120, price: 40000 },
      { name: "Carga de gas", cat: "Service", durationMin: 60, price: 22000 },
      { name: "Limpieza y mantenimiento", cat: "Service", durationMin: 60, price: 15000 },
      { name: "Reparación de equipo", cat: "Reparación", durationMin: 90, price: 28000 },
    ],
    exampleProfessional: "Técnico de ejemplo (editable)",
    wording: {
      catalogHeading: "Nuestros servicios",
      providerNoun: "técnico",
      heroTagline: "Frío y calor, todo el año.",
      bookCta: "Pedir visita",
      priceNote: "Precios desde; se confirma presupuesto en la visita.",
    },
    brandingDefaults: {
      shortLabel: "Tu técnico de climatización",
      hoursLabel: HORARIO_OFICIO,
      contactNote: "Instalación, service y reparación de aires y equipos de frío.",
    },
    suggestedAccent: "celeste",
    suggestedTheme: "light",
  },
  {
    id: "fletes",
    label: "Fletes / Mudanzas",
    keywords: ["fletes", "flete", "mudanzas", "mudanza", "transporte", "acarreos"],
    categories: ["Fletes", "Mudanzas"],
    services: [
      { name: "Flete corto (dentro de la ciudad)", cat: "Fletes", durationMin: 90, price: 25000 },
      { name: "Flete con ayudante", cat: "Fletes", durationMin: 120, price: 38000 },
      { name: "Mudanza chica (monoambiente)", cat: "Mudanzas", durationMin: 180, price: 60000 },
      { name: "Mudanza casa/depto", cat: "Mudanzas", durationMin: 300, price: 120000 },
    ],
    exampleProfessional: "Fletero de ejemplo (editable)",
    wording: {
      catalogHeading: "Nuestros servicios",
      providerNoun: "fletero",
      heroTagline: "Tu mudanza, sin dolores de cabeza.",
      bookCta: "Pedir presupuesto",
      priceNote: "Precios desde; según distancia y volumen.",
    },
    brandingDefaults: {
      shortLabel: "Tu flete de confianza",
      hoursLabel: "Lun a sáb · 8 a 20 h",
      contactNote: "Fletes y mudanzas con o sin ayudante. Presupuesto rápido.",
    },
    suggestedAccent: "ambar",
    suggestedTheme: "light",
  },
  {
    // Taller mecánico: a diferencia del resto de la familia, el cliente TRAE el auto y el
    // taller sí maneja repuestos. El circuito propio (orden de trabajo, presupuesto, seguimiento)
    // es el módulo `taller`; acá va sólo la config del rubro.
    id: "taller",
    label: "Taller mecánico",
    keywords: ["taller", "mecanico", "mecanica", "automotor", "frenos", "tren delantero", "inyeccion", "lubricentro"],
    categories: ["Service y mantenimiento", "Frenos y suspensión", "Motor e inyección", "Diagnóstico"],
    services: [
      { name: "Diagnóstico computarizado (escáner)", cat: "Diagnóstico", durationMin: 45, price: 25000 },
      { name: "Revisión general pre-VTV", cat: "Diagnóstico", durationMin: 60, price: 30000 },
      { name: "Service completo (aceite y filtros)", cat: "Service y mantenimiento", durationMin: 90, price: 95000 },
      { name: "Cambio de aceite y filtro", cat: "Service y mantenimiento", durationMin: 45, price: 60000 },
      { name: "Cambio de correa de distribución", cat: "Service y mantenimiento", durationMin: 240, price: 180000 },
      { name: "Cambio de pastillas de freno (eje)", cat: "Frenos y suspensión", durationMin: 60, price: 45000 },
      { name: "Tren delantero: revisión y ajuste", cat: "Frenos y suspensión", durationMin: 120, price: 70000 },
      { name: "Cambio de amortiguadores (par)", cat: "Frenos y suspensión", durationMin: 120, price: 80000 },
      { name: "Limpieza de inyectores", cat: "Motor e inyección", durationMin: 90, price: 65000 },
      { name: "Cambio de embrague", cat: "Motor e inyección", durationMin: 300, price: 220000 },
    ],
    exampleProfessional: "Mecánico de ejemplo (editable)",
    wording: {
      catalogHeading: "Qué hacemos",
      providerNoun: "mecánico",
      heroTagline: "Tu auto en buenas manos. Diagnóstico preciso y presupuesto claro.",
      bookCta: "Sacar turno",
      priceNote: "Mano de obra de referencia; el presupuesto final se confirma al revisar el auto.",
    },
    brandingDefaults: {
      shortLabel: "Tu taller de confianza",
      hoursLabel: "Lun a vie · 8:30 a 12 y 14:30 a 19 h",
      contactNote: "Motores, frenos, suspensión e inyección. Turnos por mensaje.",
    },
    suggestedAccent: "oxblood",
    suggestedTheme: "dark",
  },
];

export const OFICIOS_RUBRO_IDS = OFICIOS_RUBROS.map((r) => r.id);

export function getOficiosRubro(id: string): OficiosRubro | null {
  return OFICIOS_RUBROS.find((r) => r.id === id) ?? null;
}

export const GENERIC_OFICIOS_WORDING: OficiosWording = {
  catalogHeading: "Nuestros servicios",
  providerNoun: "técnico",
  heroTagline: "Servicio a domicilio, presupuesto sin cargo.",
  bookCta: "Pedir visita",
  priceNote: "Precios desde; se confirma presupuesto en la visita.",
};
