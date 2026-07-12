"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { placeOnlineOrder } from "@/lib/order-actions";
import type { RetailWording } from "@/blueprints/retail";
import type { StorefrontCopy } from "@/tenants/storefront";
import type { TenantLayout, SectionKey, StorefrontPalette } from "@/lib/tenant-layout";
import { FONT_VAR, resolveSectionOrder } from "@/lib/tenant-layout";
import { productGradient, productGlyph, groupBySection, linesWithStock } from "@/lib/storefront-visual";
import { shippingCost, amountToFreeShipping } from "@/lib/storefront-shipping";
import { WhatsAppCtaProvider, useWhatsAppCta } from "@/components/whatsapp-cta";

// Paleta cálida-minimalista (premium/boutique) — ahora sobre los DESIGN TOKENS del
// ERP (Nocturne, ver globals.css), no colores sueltos: así la vidriera comparte
// sistema con /admin y /operador y responde al tema. El COLOR de marca sigue siendo
// el acento del tenant (var(--accent), inyectado por la página): se usa con moderación
// —eyebrow, filetes, precios, CTAs—. Regla de contraste: secciones de contenido CLARAS
// (surface); about y footer OSCUROS (surface-inverted, el "back oscuro").
const T = {
  bg: "var(--surface)",
  surface: "var(--surface-raised)",
  line: "var(--line)",
  ink: "var(--text-strong)",
  inkDeep: "var(--surface-inverted)",
  muted: "var(--text-muted)",
  faint: "var(--text-faint)",
} as const;

type Product = {
  id: string;
  name: string;
  saleUnit: "UNIT" | "WEIGHT";
  price: number | null;
  pricePerKg: number | null;
  unit: string;
};

type Branding = {
  shortLabel: string | null;
  city: string | null;
  addressLine: string | null;
  hoursLabel: string | null;
  whatsapp: string | null;
  instagram: string | null;
  email: string | null;
  contactNote: string | null;
} | null;

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

function unitPriceOf(p: Product): number {
  return (p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price) ?? 0;
}

type StorefrontProps = {
  name: string;
  branding: Branding;
  wording: RetailWording;
  copy: StorefrontCopy | null;
  products: Product[];
  accent: string;
  /** Slug del tenant — namespacea el WhatsApp que complete el visitante (ver WhatsAppCtaProvider). */
  tenantKey: string;
  /**
   * FIDELIDAD DE LAYOUT (RFC-004-A §3), detrás de `TENANT_FIDELITY_ENABLED`. Con `fidelity`
   * ON y `layout` presente, la vidriera rompe el molde único: masthead con el logo real del
   * tenant (centrado o a la izquierda), banner de anuncio si el negocio lo usa, y hero
   * editorial/estándar. Con `fidelity` OFF (o sin `layout`) → molde de hoy, byte-idéntico.
   */
  layout?: TenantLayout;
  logoAsset?: string | null;
  fidelity?: boolean;
};

// El CTA de WhatsApp nunca abre a un número hardcodeado: si el tenant no tiene
// `branding.whatsapp` real, el Provider pide el número just-in-time al primer
// clic. El componente interno vive DENTRO del Provider para poder usar el hook.
export default function Storefront(props: StorefrontProps) {
  return (
    <WhatsAppCtaProvider tenantKey={props.tenantKey} configuredNumber={props.branding?.whatsapp}>
      <StorefrontContent {...props} />
    </WhatsAppCtaProvider>
  );
}

function StorefrontContent({
  name,
  branding,
  wording,
  copy,
  products,
  accent,
  layout,
  logoAsset,
  fidelity,
}: StorefrontProps) {
  const { requestWhatsApp } = useWhatsAppCta();
  // Fidelidad de layout: solo si el flag está ON y el tenant declaró estructura. Sin esto
  // → molde de hoy (sin masthead ni banner, hero a la izquierda). Ver RFC-004-A/C.
  const showFidelity = Boolean(fidelity && layout);
  const centered = showFidelity && layout?.logoPosition === "centered";
  // Identidad genuina (Ola 1): variante de hero + tipografía + paleta + orden de secciones.
  const heroVariant = showFidelity ? layout!.hero : "standard";
  // Fotografía de marca (config-driven, ADR-073 Nivel B): presente → la vidriera usa foto real;
  // ausente → cae al render sin foto (halo/gradiente). Sólo con fidelidad.
  const imagery = showFidelity ? layout?.imagery : undefined;
  const heroImage = imagery?.heroImage ?? null;
  // "photo" sólo aplica si además hay imagen; sin foto, un hero editorial centrado.
  const heroPhoto = heroVariant === "photo" && Boolean(heroImage);
  const heroCentered = heroVariant === "editorial" || heroVariant === "poster" || (heroVariant === "photo" && !heroImage);
  const typo = showFidelity ? layout?.typography : undefined;
  const palette = showFidelity ? layout?.palette : undefined;
  // Orden de secciones: reordena los ítems de la grilla vía CSS `order` (no mueve el DOM);
  // solo se aplica con fidelidad → con el flag OFF, orden y estilos idénticos a hoy.
  const sectionOrder = resolveSectionOrder(showFidelity ? layout?.sectionOrder : null);
  const secPos = (k: SectionKey) => sectionOrder.indexOf(k);
  const secStyle = (k: SectionKey, base?: CSSProperties): CSSProperties | undefined =>
    showFidelity ? { ...(base ?? {}), order: secPos(k) } : base;
  // Voz tipográfica de los títulos (display font + transform/weight/tracking del tenant).
  const headingStyle: CSSProperties = {};
  if (showFidelity) {
    headingStyle.fontFamily = "var(--font-display), Georgia, serif";
    if (typo?.headingTransform) headingStyle.textTransform = typo.headingTransform;
    if (typo?.headingWeight) headingStyle.fontWeight = typo.headingWeight;
    if (typo?.headingTracking) headingStyle.letterSpacing = typo.headingTracking;
  }
  const [cart, setCart] = useState<Record<string, number>>({});
  const [fulfillment, setFulfillment] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  // Filtra las "líneas" de marketing (copy.vacioLines) que declaran `section` para no
  // anunciar un mundo sin góndola (QA m-1, 2026-07-07) — ver linesWithStock (pura, testeada).
  const vacioLines = useMemo(() => linesWithStock(copy?.vacioLines ?? [], products), [copy, products]);

  function setQty(id: string, qty: number) {
    setCart((c) => {
      const next = { ...c };
      if (qty > 0) next[id] = qty;
      else delete next[id];
      return next;
    });
  }
  function bump(p: Product, dir: 1 | -1) {
    const step = p.saleUnit === "WEIGHT" ? 0.25 : 1;
    const cur = cart[p.id] ?? 0;
    setQty(p.id, Math.max(0, Math.round((cur + dir * step) * 100) / 100));
  }

  const lines = Object.entries(cart)
    .map(([id, qty]) => {
      const p = byId.get(id);
      if (!p) return null;
      return { p, qty, total: qty * unitPriceOf(p) };
    })
    .filter((l): l is { p: Product; qty: number; total: number } => l !== null);

  const total = lines.reduce((s, l) => s + l.total, 0);
  const hasItems = lines.length > 0;

  // Envío: si el tenant declara config (copy.shipping), la vidriera lo calcula y
  // muestra el desglose + el nudge de envío gratis. Sin config → 0 y sin línea.
  const shipCfg = copy?.shipping ?? null;
  const shipping = shippingCost(total, fulfillment, shipCfg);
  const grandTotal = total + shipping;
  const missingForFree = amountToFreeShipping(total, shipCfg);
  const freeShippingProgress = shipCfg ? Math.min(1, total / shipCfg.freeThreshold) : 0;

  const cartMessage =
    `¡Hola ${name}! Quiero hacer un pedido:\n` +
    lines.map((l) => `• ${l.qty} ${l.p.saleUnit === "WEIGHT" ? "kg" : "u"} · ${l.p.name}`).join("\n") +
    (shipCfg ? `\nEnvío (${fulfillment === "PICKUP" ? "retiro" : "a domicilio"}): ${shipping === 0 ? "gratis" : money2.format(shipping)}` : "") +
    `\nTotal estimado: ${money2.format(grandTotal)}`;

  // Copy: firma del tenant si existe; si no, cae al wording del rubro / branding.
  const eyebrow = copy?.eyebrow ?? branding?.shortLabel ?? name;
  const tagline = copy?.tagline ?? wording.heroTagline;
  const intro = copy?.intro ?? branding?.contactNote ?? "";

  const rootStyle = {
    background: T.bg,
    color: T.ink,
    minHeight: "100vh",
    fontFamily: "var(--font-body), system-ui, -apple-system, sans-serif",
    ["--accent" as string]: accent,
    // Tipografía + paleta del tenant (solo con fidelidad): reasignan las CSS vars que ya
    // usa toda la vidriera (--font-*, --surface*, --text*), sin fuentes nuevas.
    ...(typo ? { ["--font-display" as string]: FONT_VAR[typo.display], ["--font-body" as string]: FONT_VAR[typo.body] } : {}),
    ...(palette ? paletteVars(palette) : {}),
  } as CSSProperties;

  // Contenido del hero, compartido por las 4 variantes (centrado o alineado a la izquierda).
  const heroInner = (center: boolean) => (
    <>
      <div style={eyebrowStyle}>{eyebrow}</div>
      <h1 style={{ fontSize: "clamp(40px, 6.5vw, 68px)", lineHeight: 1.0, letterSpacing: -1.8, fontWeight: 800, margin: center ? "18px auto 0" : "18px 0 0", maxWidth: 760, ...headingStyle }}>
        {tagline}
      </h1>
      {copy?.pitch && (
        <div style={{ fontSize: "clamp(19px, 2.6vw, 26px)", fontWeight: 700, letterSpacing: -0.4, marginTop: 14, color: T.ink }}>
          {copy.pitch}
        </div>
      )}
      <div style={{ width: 48, height: 3, background: "var(--accent)", margin: center ? "24px auto 22px" : "24px 0 22px" }} />
      {intro && <p style={{ fontSize: 17, lineHeight: 1.6, color: T.muted, maxWidth: 620, marginLeft: center ? "auto" : undefined, marginRight: center ? "auto" : undefined }}>{intro}</p>}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28, justifyContent: center ? "center" : "flex-start" }}>
        <a href="#seleccion" style={cta("var(--accent)", "var(--text-on-accent)")}>{wording.orderCta}</a>
        <button type="button" onClick={() => requestWhatsApp(`¡Hola ${name}! Quiero hacer un pedido.`)} style={cta("#fff", "#118648", "1px solid #25D366")}>
          Pedir por WhatsApp
        </button>
      </div>
    </>
  );

  return (
    <div style={rootStyle}>
      {/* ── Banner de anuncio (solo si el tenant lo usa; fidelidad) ── */}
      {showFidelity && layout?.banner && (
        <div style={{ background: "var(--accent)", color: "var(--text-on-accent)", textAlign: "center", fontSize: 13, fontWeight: 600, letterSpacing: 0.2, padding: "8px 16px" }}>
          {layout.banner}
        </div>
      )}

      {/* ── Masthead (solo con fidelidad): logo REAL del tenant, centrado o a la izquierda ── */}
      {showFidelity && (
        <Masthead name={name} logoAsset={logoAsset} monogram={initials(name)} centered={centered} wording={wording} />
      )}

      {/* ── Hero ── 5 variantes: photo (fotografía full-bleed con velo cálido), standard
          (izq, molde), editorial (centrado), poster (banda con lavado del acento), split
          (titular + panel de acento a la derecha). */}
      {heroPhoto ? (
        <header style={{ position: "relative", borderBottom: `1px solid ${T.line}`, minHeight: "clamp(460px, 62vh, 660px)", display: "flex", alignItems: "flex-end", backgroundImage: `url(${heroImage})`, backgroundSize: "cover", backgroundPosition: "center 40%" }}>
          {/* Velo cálido: garantiza contraste AA del titular claro sobre la foto. */}
          <div aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(28,17,14,0.12) 0%, rgba(28,17,14,0.34) 46%, rgba(28,17,14,0.82) 100%)" }} />
          <div style={{ position: "relative", maxWidth: 1080, margin: "0 auto", width: "100%", padding: "0 24px 54px", color: "#fdf6ef" }}>
            <div style={{ ...eyebrowStyle, color: "rgba(253,246,239,0.90)", textShadow: "0 1px 10px rgba(0,0,0,0.4)" }}>{eyebrow}</div>
            <h1 style={{ fontSize: "clamp(44px, 7vw, 78px)", lineHeight: 1.02, letterSpacing: -1.8, fontWeight: 600, margin: "14px 0 0", maxWidth: 800, color: "#ffffff", textShadow: "0 2px 26px rgba(0,0,0,0.42)", ...headingStyle }}>
              {tagline}
            </h1>
            {copy?.pitch && (
              <div style={{ fontSize: "clamp(18px, 2.4vw, 24px)", fontWeight: 600, letterSpacing: -0.3, marginTop: 14, color: "#fdf6ef", textShadow: "0 1px 14px rgba(0,0,0,0.5)" }}>
                {copy.pitch}
              </div>
            )}
            {intro && <p style={{ fontSize: 16.5, lineHeight: 1.6, color: "rgba(253,246,239,0.94)", maxWidth: 560, marginTop: 16, textShadow: "0 1px 12px rgba(0,0,0,0.5)" }}>{intro}</p>}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 26 }}>
              <a href="#seleccion" style={cta("var(--accent)", "var(--text-on-accent)")}>{wording.orderCta}</a>
              <button type="button" onClick={() => requestWhatsApp(`¡Hola ${name}! Quiero hacer un pedido.`)} style={cta("#ffffff", "#118648", "1px solid #ffffff")}>
                Pedir por WhatsApp
              </button>
            </div>
          </div>
        </header>
      ) : (
        <header style={{ borderBottom: `1px solid ${T.line}`, ...(heroVariant === "poster" ? { background: "color-mix(in srgb, var(--accent) 12%, var(--surface))" } : {}) }}>
          {heroVariant === "split" ? (
            <div style={{ maxWidth: 1080, margin: "0 auto", padding: "64px 24px", display: "flex", gap: 44, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 380px", minWidth: 280 }}>{heroInner(false)}</div>
              <div aria-hidden style={{ flex: "1 1 300px", minWidth: 240, alignSelf: "stretch", minHeight: 260, borderRadius: 18, background: "linear-gradient(150deg, var(--accent), color-mix(in srgb, var(--accent) 45%, #101314))", boxShadow: "inset 0 0 0 1px var(--line)" }} />
            </div>
          ) : (
            <div style={{ maxWidth: 1080, margin: "0 auto", padding: "76px 24px 56px", textAlign: heroCentered ? "center" : "left" }}>
              {heroInner(heroCentered)}
            </div>
          )}
        </header>
      )}

      {/* ── Propuestas de valor ── */}
      {copy && copy.valueProps.length > 0 && (
        <section style={{ background: T.surface, borderBottom: `1px solid ${T.line}` }}>
          <div style={{ maxWidth: 1080, margin: "0 auto", padding: "36px 24px", display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
            {copy.valueProps.map((v, i) => (
              <div key={i}>
                <div style={{ color: "var(--accent)", fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{v.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{v.title}</div>
                <div style={{ color: T.muted, fontSize: 13.5, lineHeight: 1.5 }}>{v.text}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: 24, display: "grid", gap: 44 }}>
        {/* ── Envasados al vacío ── */}
        {copy && vacioLines.length > 0 && (
          <section style={secStyle("lines")}>
            <SectionHead kicker="Nuestras líneas" title={copy.vacioTitle} />
            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              {vacioLines.map((l, i) => {
                // Foto del "mundo" (config-driven): abre cada línea con su fotografía real.
                const lineImg = l.section ? imagery?.sectionImages?.[l.section] : undefined;
                return (
                  <div key={i} style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                    {lineImg && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={lineImg} alt={l.title} loading="lazy" style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", display: "block" }} />
                    )}
                    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: 17 }}>{l.title}</div>
                      <div style={{ color: T.muted, fontSize: 14, lineHeight: 1.55, flex: 1 }}>{l.text}</div>
                      <button type="button" onClick={() => requestWhatsApp(`¡Hola ${name}! Quiero hacer un pedido de ${l.title}.`)} style={{ ...linkCta, color: "var(--accent)", background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }}>
                        Hacer pedido →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── La selección (catálogo con carrito) — el salto de valor vs. WhatsApp manual ── */}
        <section id="seleccion" style={secStyle("catalog", { scrollMarginTop: 20 })}>
          <SectionHead kicker="Comprá online" title={wording.catalogHeading} />
          {products.length === 0 ? (
            <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, padding: "28px 22px", textAlign: "center" }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>Estamos preparando la selección</p>
              <p style={{ margin: "6px 0 0", color: T.muted, fontSize: 14 }}>
                En un rato vas a poder comprar online. Mientras tanto, escribinos por WhatsApp y te tomamos el pedido.
              </p>
              <button type="button" onClick={() => requestWhatsApp(`¡Hola ${name}! Quiero hacer un pedido.`)} style={{ ...cta("#fff", "#118648", "1px solid #25D366"), display: "inline-flex", marginTop: 16 }}>
                Pedir por WhatsApp
              </button>
            </div>
          ) : (
            // Catálogo agrupado en SECCIONES (Velas · Aromas · Decoración · Accesorios):
            // una tienda experiencial es un recorrido por mundos, no una grilla plana.
            <div style={{ display: "grid", gap: 34 }}>
              {groupBySection(products).map(({ section, items }) => (
                <div key={section.id}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                    <h3 style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.4 }}>{section.label}</h3>
                    {section.blurb && <span style={{ color: T.muted, fontSize: 13.5 }}>{section.blurb}</span>}
                  </div>
                  <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(230px,1fr))" }}>
                    {items.map((p) => {
                      const qty = cart[p.id] ?? 0;
                      const isWeight = p.saleUnit === "WEIGHT";
                      return (
                        <div key={p.id} style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", gap: 10, ...(qty > 0 ? { boxShadow: "0 0 0 1.5px var(--accent)" } : null) }}>
                          {/* Panel de marca (halo cálido teñido con el acento) mientras no haya foto real. */}
                          <div aria-hidden style={{ aspectRatio: "4 / 3", borderRadius: 12, background: productGradient(p.name), display: "grid", placeItems: "center", boxShadow: "inset 0 0 0 1px var(--line)" }}>
                            <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 30, color: "color-mix(in srgb, var(--accent) 78%, var(--text-strong))" }}>{productGlyph(p.name)}</span>
                          </div>
                          <div style={{ fontWeight: 700, fontSize: 15.5 }}>{p.name}</div>
                          <div style={{ color: "var(--accent)", fontWeight: 700, fontSize: 15 }}>
                            {money.format(unitPriceOf(p))}
                            <span style={{ color: T.faint, fontWeight: 500, fontSize: 13 }}>{isWeight ? " / kg" : " / unidad"}</span>
                          </div>
                          <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                            <button type="button" onClick={() => bump(p, -1)} disabled={qty === 0} aria-label={`Quitar ${p.name}`} style={{ ...qtyBtn(T.line, T.ink), ...(qty === 0 ? { opacity: 0.4, cursor: "not-allowed" } : null) }}>−</button>
                            <span aria-live="polite" style={{ minWidth: 60, textAlign: "center", fontVariantNumeric: "tabular-nums", fontSize: 14 }}>{qty > 0 ? `${qty} ${isWeight ? "kg" : "u"}` : "—"}</span>
                            <button type="button" onClick={() => bump(p, 1)} aria-label={`Agregar ${p.name}`} style={qtyBtn("var(--accent)", "var(--text-on-accent)")}>+</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Armá tu ritual (narrativa experiencial) ── */}
        {copy?.ritual && (
          <section style={secStyle("ritual")}>
            {/* Banda de ambiente (config-driven): fotografía editorial de la escena que
                arma la marca. Con velo cálido para el pie de foto. */}
            {imagery?.ambianceImage && (
              <div style={{ position: "relative", borderRadius: 18, overflow: "hidden", marginBottom: 22, height: "clamp(170px, 27vw, 320px)", backgroundImage: `url(${imagery.ambianceImage})`, backgroundSize: "cover", backgroundPosition: "center 55%" }}>
                <div aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(28,17,14,0.74) 0%, rgba(28,17,14,0.40) 52%, rgba(28,17,14,0.08) 100%)" }} />
                <div style={{ position: "relative", height: "100%", display: "flex", alignItems: "flex-end", padding: "22px 24px" }}>
                  <span style={{ color: "#fdf6ef", fontFamily: "var(--font-display), Georgia, serif", fontSize: "clamp(20px, 3.2vw, 30px)", fontWeight: 600, letterSpacing: -0.3, maxWidth: 520, lineHeight: 1.15, textShadow: "0 1px 16px rgba(0,0,0,0.55)" }}>
                    {copy.about.title}
                  </span>
                </div>
              </div>
            )}
            <SectionHead kicker="La experiencia" title={copy.ritual.title} />
            <p style={{ color: T.muted, fontSize: 15, lineHeight: 1.6, maxWidth: 620, marginTop: -6, marginBottom: 18 }}>{copy.ritual.intro}</p>
            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              {copy.ritual.steps.map((s, i) => (
                <div key={i} style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, padding: 20 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 999, background: "var(--accent)", color: "var(--text-on-accent)", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 16, marginBottom: 12 }}>{s.icon}</div>
                  <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>{s.title}</div>
                  <div style={{ color: T.muted, fontSize: 14, lineHeight: 1.55 }}>{s.text}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Sets de regalo (experiencias armadas) ── */}
        {copy?.giftSets && copy.giftSets.sets.length > 0 && (
          <section style={secStyle("gifts")}>
            {/* Banda de la sección con la foto del packaging de regalo (config-driven). */}
            {imagery?.giftImage ? (
              <div style={{ position: "relative", borderRadius: 18, overflow: "hidden", marginBottom: 20, height: "clamp(150px, 21vw, 260px)", backgroundImage: `url(${imagery.giftImage})`, backgroundSize: "cover", backgroundPosition: "center 60%" }}>
                <div aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(28,17,14,0.76) 0%, rgba(28,17,14,0.40) 55%, rgba(28,17,14,0.08) 100%)" }} />
                <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "20px 24px", gap: 4 }}>
                  <div style={{ ...eyebrowStyle, color: "rgba(253,246,239,0.92)", textShadow: "0 1px 10px rgba(0,0,0,0.5)" }}>Para regalar</div>
                  <div style={{ color: "#ffffff", fontFamily: "var(--font-display), Georgia, serif", fontSize: "clamp(22px, 3.4vw, 32px)", fontWeight: 600, letterSpacing: -0.4, textShadow: "0 1px 16px rgba(0,0,0,0.55)" }}>{copy.giftSets.title}</div>
                </div>
              </div>
            ) : (
              <SectionHead kicker="Para regalar" title={copy.giftSets.title} />
            )}
            {copy.giftSets.intro && <p style={{ color: T.muted, fontSize: 15, lineHeight: 1.6, maxWidth: 620, marginTop: -6, marginBottom: 18 }}>{copy.giftSets.intro}</p>}
            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              {copy.giftSets.sets.map((g, i) => (
                <div key={i} style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 8, position: "relative" }}>
                  {g.note && <span style={{ position: "absolute", top: 14, right: 14, background: "var(--accent)", color: "var(--text-on-accent)", borderRadius: 999, fontSize: 11, fontWeight: 700, padding: "3px 9px" }}>{g.note}</span>}
                  <div style={{ fontWeight: 800, fontSize: 17 }}>{g.name}</div>
                  <div style={{ color: T.muted, fontSize: 14, lineHeight: 1.55, flex: 1 }}>{g.items}</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ color: "var(--accent)", fontWeight: 800, fontSize: 16 }}>{typeof g.price === "number" ? money.format(g.price) : "A consultar"}</span>
                    <button type="button" onClick={() => requestWhatsApp(`¡Hola ${name}! Quiero el set "${g.name}".`)} style={{ ...linkCta, color: "var(--accent)", background: "none", border: "none", padding: 0, cursor: "pointer" }}>Lo quiero →</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Tu pedido (carrito + checkout) ── */}
        <section style={secStyle("cart", { background: T.surface, border: `1px solid ${T.line}`, borderRadius: 20, padding: 22 })}>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 14, ...headingStyle }}>Tu pedido</h2>
          {!hasItems && <p style={{ color: T.muted }}>Elegí lo que quieras de la selección con los botones + / −, o encargá por WhatsApp.</p>}
          {hasItems && (
            <form action={placeOnlineOrder} style={{ display: "grid", gap: 16 }}>
              <div style={{ display: "grid", gap: 6 }}>
                {lines.map((l) => (
                  <div key={l.p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                    <span>{l.qty} {l.p.saleUnit === "WEIGHT" ? "kg" : "u"} · {l.p.name}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{money2.format(l.total)}</span>
                    <input type="hidden" name="productId" value={l.p.id} />
                    <input type="hidden" name="quantity" value={l.qty} />
                  </div>
                ))}
                {shipCfg && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${T.line}`, paddingTop: 10, fontSize: 14, color: T.muted }}>
                      <span>Subtotal</span>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{money2.format(total)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: T.muted }}>
                      <span>Envío · {fulfillment === "PICKUP" ? "retiro en el local" : "a domicilio"}</span>
                      <span style={{ fontVariantNumeric: "tabular-nums", color: shipping === 0 ? "var(--accent)" : T.ink, fontWeight: shipping === 0 ? 700 : 400 }}>
                        {shipping === 0 ? "Gratis" : money2.format(shipping)}
                      </span>
                    </div>
                  </>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${T.line}`, paddingTop: 10, fontWeight: 800 }}>
                  <span>{shipCfg ? "Total" : "Total estimado"}</span>
                  <span aria-live="polite" style={{ color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}>{money2.format(grandTotal)}</span>
                </div>
                {/* Nudge de envío gratis (sólo en envío a domicilio, con carrito no vacío). */}
                {shipCfg && fulfillment === "DELIVERY" && hasItems && (
                  missingForFree > 0 ? (
                    <div style={{ display: "grid", gap: 6 }}>
                      <p style={{ margin: 0, fontSize: 12.5, color: T.muted }}>
                        Te faltan <strong style={{ color: "var(--accent)" }}>{money.format(missingForFree)}</strong> para el envío gratis.
                      </p>
                      <div aria-hidden style={{ height: 6, borderRadius: 999, background: T.line, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.round(freeShippingProgress * 100)}%`, background: "var(--accent)", borderRadius: 999, transition: "width .2s ease" }} />
                      </div>
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: 12.5, color: "var(--accent)", fontWeight: 700 }}>Tu pedido tiene envío gratis.</p>
                  )
                )}
                {wording.weightNote && <p style={{ fontSize: 11, color: T.faint }}>* {wording.weightNote}</p>}
              </div>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                <label style={lbl}><span style={lblT}>Nombre *</span><input name="customerName" required style={inp} placeholder="Nombre y apellido" /></label>
                <label style={lbl}><span style={lblT}>WhatsApp *</span><input name="customerPhone" required style={inp} placeholder="11…" /></label>
                <label style={lbl}>
                  <span style={lblT}>Entrega</span>
                  <select name="fulfillment" value={fulfillment} onChange={(e) => setFulfillment(e.target.value as "PICKUP" | "DELIVERY")} style={inp}>
                    <option value="PICKUP">Retiro en el local</option>
                    <option value="DELIVERY">Envío a domicilio</option>
                  </select>
                </label>
                {fulfillment === "DELIVERY" && (<label style={lbl}><span style={lblT}>Dirección *</span><input name="address" required style={inp} placeholder="Calle, número, barrio" /></label>)}
                <label style={{ ...lbl, gridColumn: "1 / -1" }}><span style={lblT}>Nota</span><input name="notes" style={inp} placeholder={wording.notesPlaceholder} /></label>
              </div>
              <button type="submit" style={{ ...cta("var(--accent)", "var(--text-on-accent)"), height: 48 }}>{wording.orderCta}</button>
              <button type="button" onClick={() => requestWhatsApp(cartMessage)} style={{ ...cta("#fff", "#118648", "1px solid #25D366"), height: 46 }}>Pedir por WhatsApp</button>
              <p style={{ fontSize: 11, color: T.faint, textAlign: "center" }}>Te contactamos para confirmar. El pago se coordina al recibirlo.</p>
            </form>
          )}
        </section>

        {/* ── Productos gourmet ── */}
        {copy && copy.gourmetItems.length > 0 && (
          <section style={secStyle("gourmet")}>
            <SectionHead kicker="Además" title={copy.gourmetTitle} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {copy.gourmetItems.map((g, i) => (
                <span key={i} style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 999, padding: "9px 16px", fontSize: 14, fontWeight: 600 }}>{g}</span>
              ))}
            </div>
          </section>
        )}

        {/* ── Proveedores ── */}
        {copy && copy.providers.length > 0 && (
          <section style={secStyle("providers", { borderTop: `1px solid ${T.line}`, paddingTop: 24 })}>
            <div style={{ ...eyebrowStyle, color: T.faint }}>Trabajamos con</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 24px", marginTop: 12 }}>
              {copy.providers.map((pr, i) => (<span key={i} style={{ fontSize: 15, fontWeight: 700, color: T.muted }}>{pr}</span>))}
            </div>
          </section>
        )}

        {/* ── Reviews ── */}
        {copy && copy.reviews.length > 0 && (
          <section style={secStyle("reviews")}>
            <SectionHead kicker="Lo que dicen" title="Clientes que ya probaron" />
            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              {copy.reviews.map((r, i) => (
                <div key={i} style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, padding: 20 }}>
                  <div style={{ color: "var(--accent)", letterSpacing: 2, fontSize: 14 }}>{"★".repeat(Math.max(0, Math.min(5, r.rating)))}</div>
                  <p style={{ margin: "10px 0 12px", fontSize: 14.5, lineHeight: 1.6 }}>“{r.text}”</p>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.muted }}>{r.name}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ── About (oscuro — contraste) ── */}
      {copy && (
        <section style={{ background: T.ink, color: T.bg }}>
          <div style={{ maxWidth: 1080, margin: "0 auto", padding: "64px 24px" }}>
            <div style={{ width: 48, height: 3, background: "var(--accent)", marginBottom: 22 }} />
            <h2 style={{ fontSize: "clamp(26px, 4.5vw, 40px)", fontWeight: 800, letterSpacing: -0.8, maxWidth: 720, lineHeight: 1.12, ...headingStyle }}>{copy.about.title}</h2>
            <p style={{ marginTop: 16, fontSize: 16.5, lineHeight: 1.75, opacity: 0.82, maxWidth: 660 }}>{copy.about.body}</p>
          </div>
        </section>
      )}

      {/* ── Footer (oscuro) ── */}
      <footer style={{ background: T.inkDeep, color: T.bg }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "48px 24px", display: "grid", gap: 32, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: -0.3 }}>{name}</div>
            {branding?.contactNote && <p style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6, opacity: 0.66, maxWidth: 280 }}>{branding.contactNote}</p>}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.9, opacity: 0.82 }}>
            <div style={foothead}>Dónde estamos</div>
            {branding?.addressLine && <div>{branding.addressLine}</div>}
            {branding?.city && <div>{branding.city}</div>}
            {branding?.hoursLabel && <div style={{ opacity: 0.7, marginTop: 4 }}>{branding.hoursLabel}</div>}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.9, opacity: 0.82 }}>
            <div style={foothead}>Contacto</div>
            <div><button type="button" onClick={() => requestWhatsApp(`¡Hola ${name}! Quiero hacer una consulta.`)} style={{ ...footlink, background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer" }}>WhatsApp</button></div>
            {branding?.instagram && <div><a href={igUrl(branding.instagram)} target="_blank" rel="noopener noreferrer" style={footlink}>{igHandle(branding.instagram)}</a></div>}
            {branding?.email && <div><a href={`mailto:${branding.email}`} style={footlink}>{branding.email}</a></div>}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.9, opacity: 0.82 }}>
            {copy && copy.deliveryZones.length > 0 && (<><div style={foothead}>Envíos</div><div style={{ opacity: 0.85 }}>{copy.deliveryZones.join(" · ")}</div></>)}
            {copy && copy.paymentMethods.length > 0 && (<><div style={{ ...foothead, marginTop: 14 }}>Pagos</div><div style={{ opacity: 0.85 }}>{copy.paymentMethods.join(" · ")}</div></>)}
          </div>
        </div>
      </footer>
    </div>
  );
}

// Paleta del tenant → CSS vars locales (Ola 1). Sobrescribe los tokens neutros SOLO en la
// vidriera (inline en el root) para dar a cada negocio su "papel" propio; el acento no se toca.
function paletteVars(p: StorefrontPalette): CSSProperties {
  const v: Record<string, string> = {};
  if (p.surface) v["--surface"] = p.surface;
  if (p.surfaceRaised) v["--surface-raised"] = p.surfaceRaised;
  if (p.surfaceSunken) v["--surface-sunken"] = p.surfaceSunken;
  if (p.textStrong) v["--text-strong"] = p.textStrong;
  if (p.textMuted) v["--text-muted"] = p.textMuted;
  if (p.line) v["--line"] = p.line;
  return v as CSSProperties;
}

// --- Masthead (fidelidad de layout, RFC-004-A §3) ---
// El logo REAL del tenant (asset si existe; si no, un crest con las iniciales sobre el
// acento) + el wordmark. CENTRADO (boutique: Magra, Shine) o a la IZQUIERDA con nav
// (retail: A Dos Manos, CH). Es lo que hace que dos tenants NO se vean iguales.
function Masthead({
  name,
  logoAsset,
  monogram,
  centered,
  wording,
}: {
  name: string;
  logoAsset?: string | null;
  monogram: string;
  centered: boolean;
  wording: RetailWording;
}) {
  const mark = logoAsset ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoAsset} alt={name} style={{ height: centered ? 52 : 34, width: "auto", objectFit: "contain" }} />
  ) : (
    <span
      aria-hidden
      style={{
        display: "grid",
        placeItems: "center",
        width: centered ? 52 : 34,
        height: centered ? 52 : 34,
        borderRadius: centered ? 999 : 9,
        border: centered ? "1.5px solid var(--accent)" : "none",
        background: centered ? "transparent" : "var(--accent)",
        color: centered ? "var(--accent)" : "var(--text-on-accent)",
        fontFamily: "var(--font-display), Georgia, serif",
        fontWeight: 700,
        fontSize: centered ? 22 : 15,
        letterSpacing: 0.5,
      }}
    >
      {monogram}
    </span>
  );

  const wordmark = (
    <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontWeight: 700, fontSize: centered ? 20 : 18, letterSpacing: centered ? 4 : 0.2, textTransform: centered ? "uppercase" : "none", color: T.ink }}>
      {name}
    </span>
  );

  if (centered) {
    return (
      <div style={{ borderBottom: `1px solid ${T.line}`, background: T.surface }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "22px 24px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          {mark}
          {wordmark}
        </div>
      </div>
    );
  }
  // Izquierda + nav (retail clásico).
  return (
    <div style={{ borderBottom: `1px solid ${T.line}`, background: T.surface }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", gap: 12 }}>
        {mark}
        {wordmark}
        <nav style={{ marginLeft: "auto", display: "flex", gap: 20, fontSize: 13.5, color: T.muted, fontWeight: 600 }}>
          <a href="#seleccion" style={{ color: "inherit", textDecoration: "none" }}>{wording.catalogHeading}</a>
        </nav>
      </div>
    </div>
  );
}

// Iniciales de respaldo cuando no hay logo asset ("A Dos Manos" → "AM", "Magra" → "M").
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "•";
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return words.map((w) => w[0]).join("").slice(0, 3).toUpperCase();
}

// --- subcomponentes / estilos ---
function SectionHead({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={eyebrowStyle}>{kicker}</div>
      <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, marginTop: 8 }}>{title}</h2>
    </div>
  );
}
// Acento OSCURECIDO para el eyebrow/kicker (12px, texto chico → AA 4.5): el acento
// crudo del tenant sobre el hueso da 4.26:1; color-mix con negro lo sube a ≥4.5 sin
// perder el color de marca (gate contraste).
const eyebrowStyle: CSSProperties = { fontSize: 12, letterSpacing: 3, textTransform: "uppercase", color: "color-mix(in srgb, var(--accent) 78%, #000)", fontWeight: 600 };
function cta(bg: string, color: string, border?: string): CSSProperties {
  return { display: "grid", placeItems: "center", padding: "0 22px", borderRadius: 12, border: border ?? "none", background: bg, color, fontWeight: 700, fontSize: 15, cursor: "pointer", textDecoration: "none", height: 46 };
}
// display:inline-flex + minHeight 24 = área táctil AA (WCAG 2.5.8) sin cambiar el look
// del CTA de texto ("Hacer pedido →" / "Lo quiero →"). Antes medían ~21px de alto.
const linkCta: CSSProperties = { fontSize: 14, fontWeight: 700, textDecoration: "none", marginTop: 2, display: "inline-flex", alignItems: "center", minHeight: 24 };
function qtyBtn(bg: string, color: string): CSSProperties {
  return { height: 34, minWidth: 34, borderRadius: 10, border: "none", background: bg, color, fontWeight: 700, fontSize: 16, cursor: "pointer" };
}
const lbl: CSSProperties = { display: "grid", gap: 4, fontSize: 13 };
const lblT: CSSProperties = { color: "var(--text-muted)" };
const inp: CSSProperties = { border: "1px solid var(--line-strong)", borderRadius: 10, padding: "10px 12px", fontSize: 14, background: "var(--surface-raised)", color: "var(--text-strong)" };
const foothead: CSSProperties = { fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.55, marginBottom: 8, fontWeight: 600 };
const footlink: CSSProperties = { color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 };

function igHandle(ig: string): string {
  const h = ig.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/+$/, "").replace(/^@/, "");
  return `@${h}`;
}
function igUrl(ig: string): string {
  return `https://www.instagram.com/${igHandle(ig).slice(1)}`;
}
