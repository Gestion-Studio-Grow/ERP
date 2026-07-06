// ─────────────────────────────────────────────────────────────────────────────
// Instrumentación del funnel de /demo (Célula 1 — GTM/contenido).
//
// Cierra el gap señalado en la estrategia de lanzamiento (§2, "Instrumentación"): sin
// esto la pauta vuela a ciegas. Empuja los eventos a `window.dataLayer` (estándar GTM,
// lo consume tanto GA4 como el Pixel de Meta vía tag) y, si existe, a `window.fbq`
// directo. Si la página no tiene GTM/Pixel cargado (dev, o antes de que GTM lo agregue
// al publicar), ambas llamadas son no-op: cero red, cero dependencia nueva.
//
// Mantiene el aislamiento de /demo (docs/demo/README.md): solo se importa a sí mismo,
// nada de @/lib, prisma, tenant ni process.env.
// ─────────────────────────────────────────────────────────────────────────────

export type DemoEventName =
  | "demo_start"
  | "demo_step_completado"
  | "demo_complete"
  | "cta_whatsapp_click"
  | "cta_email_click";

type WindowWithTrackers = typeof window & {
  dataLayer?: unknown[];
  fbq?: (...args: unknown[]) => void;
};

export function trackDemoEvent(
  name: DemoEventName,
  params: Record<string, string | number> = {},
): void {
  if (typeof window === "undefined") return;
  const w = window as WindowWithTrackers;
  if (Array.isArray(w.dataLayer)) w.dataLayer.push({ event: name, ...params });
  if (typeof w.fbq === "function") w.fbq("trackCustom", name, params);
}

/** Rubro del ad de origen, vía `utm_content` (contrato de la campaña, ver go-to-market). */
export function demoRubroFromUrl(fallback = "generico"): string {
  if (typeof window === "undefined") return fallback;
  return new URLSearchParams(window.location.search).get("utm_content") || fallback;
}
