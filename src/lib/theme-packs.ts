// ============================================================================
// THEME PACKS — la PIEL curada por tenant (RFC-004-D, frente B). PURO, testeable.
// ============================================================================
//
// Un theme pack es un BUNDLE de tokens de diseño (neutros/superficies + tipografía +
// densidad + radios) que define el "look" de un tenant MÁS ALLÁ del acento. Es lo que hace
// que estética y velas NO parezcan el mismo producto: cambian el papel, la tinta, la fuente
// y el aire, no solo el color de resalte.
//
// CURADO POR DISEÑO (config-sobre-código): la ficha del tenant ELIGE un pack por `themeId`;
// el pack no es dato editable por tenant. Hoy el `themeId` se DERIVA de `blueprintId` (sin
// migración); mañana una columna `Tenant.themeId` permite override fino (follow-up, ver RFC).
//
// NINGUN pack copia la paleta Nocturne de CH (hueso #f6f3ec + petróleo). CH (beauty-spa)
// queda en su look actual (globals.css :root) y NO usa este mecanismo.
//
// Cada pack define neutros para LIGHT y DARK: el front del tenant va en su `frontTheme` y el
// back en el OPUESTO (regla front/back). Para los 4 demos el front es claro → el BACKOFFICE
// va OSCURO, así que los neutros DARK son los que se ven en el panel (los más importantes).

import type { FontKey } from "@/lib/branding";

export type ThemeNeutrals = {
  surfaceSunken: string;
  surface: string;
  surfaceRaised: string;
  surfaceInverted: string;
  textStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  line: string;
  lineStrong: string;
};

export type ThemePack = {
  id: string;
  label: string;
  /** Familias (ya cargadas por el layout raíz) para títulos y cuerpo. */
  display: FontKey;
  body: FontKey;
  /** `--density` (1 = denso; >1 = más aire). Espeja globals.css. */
  density: number;
  /** Radio base (rem) — redondez del pack. */
  radius: string;
  light: ThemeNeutrals;
  dark: ThemeNeutrals;
};

// ── SERVICIOS / ESTÉTICA — femenino, cálido, sereno. Blush-rosé + serif Playfair, aire.
const serviciosSpa: ThemePack = {
  id: "servicios-spa",
  label: "Servicios · estética",
  display: "playfair",
  body: "geist",
  density: 1.14,
  radius: "0.875rem",
  light: {
    surfaceSunken: "#efe2e5", surface: "#f8f1f2", surfaceRaised: "#fffdfd", surfaceInverted: "#241a1d",
    textStrong: "#2a1e22", text: "#4c3b41", textMuted: "#8a727a", textFaint: "#b6a1a8",
    line: "#ecdde1", lineStrong: "#dcc6cc",
  },
  dark: {
    surfaceSunken: "#150e10", surface: "#1d1418", surfaceRaised: "#271b20", surfaceInverted: "#f8f1f2",
    textStrong: "#f6ecef", text: "#dcc9d0", textMuted: "#a98f98", textFaint: "#7a626b",
    line: "rgba(255,225,235,0.10)", lineStrong: "rgba(255,225,235,0.18)",
  },
};

// ── VELAS — boutique aromático, artesanal, cálido-dorado. Cream + serif Fraunces, aire.
const boutiqueVelas: ThemePack = {
  id: "boutique-velas",
  label: "Boutique · velas & deco",
  display: "fraunces",
  body: "hanken",
  density: 1.2,
  radius: "1rem",
  light: {
    surfaceSunken: "#eee6d6", surface: "#f7f2e9", surfaceRaised: "#fffdf7", surfaceInverted: "#221d14",
    textStrong: "#241f16", text: "#4c4433", textMuted: "#8b7f66", textFaint: "#b8ac92",
    line: "#e9dfcd", lineStrong: "#d8cab0",
  },
  dark: {
    surfaceSunken: "#14100a", surface: "#1c1710", surfaceRaised: "#272117", surfaceInverted: "#f7f2e9",
    textStrong: "#f7f0e2", text: "#ddd0b8", textMuted: "#a99a7c", textFaint: "#7a6d54",
    line: "rgba(255,240,210,0.10)", lineStrong: "rgba(255,240,210,0.18)",
  },
};

// ── PÁDEL — retail deportivo, técnico, frío. Slate + grotesca Hanken MAYÚS, denso.
const retailDeporte: ThemePack = {
  id: "retail-deporte",
  label: "Retail · deportivo",
  display: "hanken",
  body: "geist",
  density: 1.0,
  radius: "0.375rem",
  light: {
    surfaceSunken: "#e1e6ea", surface: "#eef1f3", surfaceRaised: "#ffffff", surfaceInverted: "#10161a",
    textStrong: "#101619", text: "#333d44", textMuted: "#5f6a72", textFaint: "#93a0a7",
    line: "#d6dee2", lineStrong: "#bdc8ce",
  },
  dark: {
    surfaceSunken: "#0b0f12", surface: "#111820", surfaceRaised: "#1a232b", surfaceInverted: "#eef1f3",
    textStrong: "#eef4f7", text: "#c3ced4", textMuted: "#85939c", textFaint: "#5c6a73",
    line: "rgba(200,225,240,0.10)", lineStrong: "rgba(200,225,240,0.18)",
  },
};

// ── CARNICERÍA / MAGRA — boutique de carne premium, cálido-profundo. Bone + Playfair, sobrio.
const boutiqueCarne: ThemePack = {
  id: "boutique-carne",
  label: "Boutique · carne premium",
  display: "playfair",
  body: "geist",
  density: 1.08,
  radius: "0.5rem",
  light: {
    surfaceSunken: "#eae0d4", surface: "#f4efe8", surfaceRaised: "#fffdf9", surfaceInverted: "#1c1613",
    textStrong: "#1d1611", text: "#42352d", textMuted: "#7f6f62", textFaint: "#b0a292",
    line: "#e5d9cb", lineStrong: "#d5c5b1",
  },
  dark: {
    surfaceSunken: "#120d0a", surface: "#1a1410", surfaceRaised: "#241c16", surfaceInverted: "#f4efe8",
    textStrong: "#f6efe6", text: "#dccabb", textMuted: "#a89283", textFaint: "#79655a",
    line: "rgba(255,235,215,0.10)", lineStrong: "rgba(255,235,215,0.18)",
  },
};

// ── DEFAULT NEUTRO (no-CH) — papel técnico frío-tibio para tenants sin ficha. Reemplaza el
// default hueso-CH: un tenant sin marca NUNCA más se ve como CH. Grotesca neutra, densidad 1.
const gsgBase: ThemePack = {
  id: "gsg-base",
  label: "Base neutra GSG",
  display: "geist",
  body: "geist",
  density: 1.0,
  radius: "0.5rem",
  light: {
    surfaceSunken: "#e2e3e2", surface: "#f4f5f4", surfaceRaised: "#ffffff", surfaceInverted: "#17181a",
    textStrong: "#191b1c", text: "#35363a", textMuted: "#6a6b70", textFaint: "#9c9da3",
    line: "#e2e2df", lineStrong: "#c8c8c4",
  },
  dark: {
    surfaceSunken: "#101113", surface: "#17181a", surfaceRaised: "#212327", surfaceInverted: "#f2f3f4",
    textStrong: "#f2f3f4", text: "#cbccd0", textMuted: "#8d8e94", textFaint: "#616268",
    line: "rgba(255,255,255,0.09)", lineStrong: "rgba(255,255,255,0.16)",
  },
};

export const THEME_PACKS = {
  "servicios-spa": serviciosSpa,
  "boutique-velas": boutiqueVelas,
  "retail-deporte": retailDeporte,
  "boutique-carne": boutiqueCarne,
  "gsg-base": gsgBase,
} satisfies Record<string, ThemePack>;

export type ThemeId = keyof typeof THEME_PACKS;

// Deriva el `themeId` del `blueprintId` del tenant (sin migración — RFC-004-D §decisión 1).
// Los rubros retail conocidos mapean a su boutique; servicios → spa; el resto → base neutra.
const THEME_BY_BLUEPRINT: Record<string, ThemeId> = {
  servicios: "servicios-spa",
  carniceria: "boutique-carne",
  velas: "boutique-velas",
  padel: "retail-deporte",
};

/** themeId para un blueprintId (o el default neutro si no matchea / es null). PURA. */
export function themeIdForBlueprint(blueprintId: string | null | undefined): ThemeId {
  if (!blueprintId) return "gsg-base";
  return THEME_BY_BLUEPRINT[blueprintId] ?? "gsg-base";
}

/** El pack para un themeId (siempre devuelve uno; default neutro). PURA. */
export function themePack(id: string | null | undefined): ThemePack {
  return THEME_PACKS[(id as ThemeId)] ?? THEME_PACKS["gsg-base"];
}
