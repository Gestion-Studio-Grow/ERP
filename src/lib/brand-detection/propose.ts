// ============================================================================
// DETECCIÓN DE MARCA — propuesta de branding (v1). PURO, testeable.
// ============================================================================
//
// De las SEÑALES extraídas (extract.ts) arma una PROPUESTA de branding para pre-cargar el
// alta del tenant (RFC-004-B §3): color de acento + preset más cercano del ERP + logo +
// tipografías + un nivel de confianza y notas explicables. NO decide sola: el operador la
// confirma o corrige en el alta. Mapear al preset más cercano mantiene el sistema de
// contraste AA del ERP (branding.ts) aunque el color exacto del cliente varíe.

import { ACCENT_PRESETS, type AccentPreset } from "@/lib/branding";
import { hexToRgb, colorDistance, type Rgb } from "./color";
import type { BrandSignals } from "./extract";

export type Confidence = "low" | "medium" | "high";

export type BrandProposal = {
  /** Nombre sugerido (del título). */
  name: string | null;
  /** Color de marca detectado (hex), o null si no se halló uno confiable. */
  accentHex: string | null;
  /** Preset de acento del ERP más cercano al color detectado (siempre hay uno). */
  nearestPreset: AccentPreset;
  /** Distancia al preset (0 = idéntico; más alto = el match es más flojo). */
  presetDistance: number;
  /** URL del logo, si se detectó. */
  logoUrl: string | null;
  /** Tipografías declaradas (referencia; el ERP hoy no las adopta automáticamente). */
  fonts: string[];
  /** Confianza global de la propuesta. */
  confidence: Confidence;
  /** Notas explicables (por qué esta propuesta) para el revisor del alta. */
  notes: string[];
};

/** Preset de acento del ERP más cercano a un color, con su distancia. PURA. */
export function nearestPreset(hex: string): { preset: AccentPreset; distance: number } {
  const rgb = hexToRgb(hex);
  const keys = Object.keys(ACCENT_PRESETS) as AccentPreset[];
  if (!rgb) return { preset: "petroleo", distance: Number.POSITIVE_INFINITY };
  let best: AccentPreset = keys[0];
  let bestD = Number.POSITIVE_INFINITY;
  for (const k of keys) {
    const target = hexToRgb(ACCENT_PRESETS[k].light) as Rgb;
    const d = colorDistance(rgb, target);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return { preset: best, distance: Math.round(bestD) };
}

/** Arma la propuesta de branding a partir de las señales. PURA. */
export function proposeBranding(signals: BrandSignals): BrandProposal {
  const notes: string[] = [];

  // Color de marca: la meta theme-color pesa más que la frecuencia de estilos.
  let accentHex: string | null = null;
  if (signals.themeColor) {
    accentHex = signals.themeColor;
    notes.push(`Acento tomado de <meta name="theme-color"> (${signals.themeColor}).`);
  } else if (signals.colors.length > 0) {
    accentHex = signals.colors[0].hex;
    notes.push(`Acento inferido del color no-neutro más frecuente (${accentHex}, ${signals.colors[0].count}×).`);
  } else {
    notes.push("No se detectó color de marca; se usa el preset por defecto (petróleo). Revisar a mano.");
  }

  const near = accentHex ? nearestPreset(accentHex) : { preset: "petroleo" as AccentPreset, distance: Number.POSITIVE_INFINITY };
  if (accentHex) {
    notes.push(`Preset más cercano del ERP: "${near.preset}" (distancia ${near.distance}).`);
    if (near.distance > 120) notes.push("El match de preset es flojo: conviene confirmar el acento a mano o sumar un preset propio.");
  }

  if (signals.logo) notes.push(`Logo candidato: ${signals.logo}`);
  else notes.push("No se detectó logo (favicon/og:image/img). Cargar el asset a mano.");

  // Confianza: cuántas señales fuertes hay (nombre, color con theme-color, logo).
  let score = 0;
  if (signals.title) score++;
  if (signals.themeColor) score += 2;
  else if (signals.colors.length > 0) score++;
  if (signals.logo) score++;
  const confidence: Confidence = score >= 4 ? "high" : score >= 2 ? "medium" : "low";

  return {
    name: signals.title,
    accentHex,
    nearestPreset: near.preset,
    presetDistance: near.distance,
    logoUrl: signals.logo,
    fonts: signals.fonts,
    confidence,
    notes,
  };
}
