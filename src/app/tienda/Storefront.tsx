"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { placeOnlineOrder } from "@/lib/order-actions";
import type { RetailWording } from "@/blueprints/retail";
import type { StorefrontCopy } from "@/tenants/storefront";
import { productGradient, productGlyph, groupBySection } from "@/lib/storefront-visual";
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
}: StorefrontProps) {
  const { requestWhatsApp } = useWhatsAppCta();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [fulfillment, setFulfillment] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

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
  } as CSSProperties;

  return (
    <div style={rootStyle}>
      {/* ── Hero ── */}
      <header style={{ borderBottom: `1px solid ${T.line}` }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "76px 24px 56px" }}>
          <div style={eyebrowStyle}>{eyebrow}</div>
          <h1 style={{ fontSize: "clamp(40px, 6.5vw, 68px)", lineHeight: 1.0, letterSpacing: -1.8, fontWeight: 800, margin: "18px 0 0", maxWidth: 760 }}>
            {tagline}
          </h1>
          {copy?.pitch && (
            <div style={{ fontSize: "clamp(19px, 2.6vw, 26px)", fontWeight: 700, letterSpacing: -0.4, marginTop: 14, color: T.ink }}>
              {copy.pitch}
            </div>
          )}
          <div style={{ width: 48, height: 3, background: "var(--accent)", margin: "24px 0 22px" }} />
          {intro && <p style={{ fontSize: 17, lineHeight: 1.6, color: T.muted, maxWidth: 620 }}>{intro}</p>}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
            <a href="#seleccion" style={cta("var(--accent)", "var(--text-on-accent)")}>{wording.orderCta}</a>
            <button type="button" onClick={() => requestWhatsApp(`¡Hola ${name}! Quiero hacer un pedido.`)} style={cta("#fff", "#128C4B", "1px solid #25D366")}>
              Pedir por WhatsApp
            </button>
          </div>
        </div>
      </header>

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
        {copy && (
          <section>
            <SectionHead kicker="Nuestras líneas" title={copy.vacioTitle} />
            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              {copy.vacioLines.map((l, i) => (
                <div key={i} style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 17 }}>{l.title}</div>
                  <div style={{ color: T.muted, fontSize: 14, lineHeight: 1.55, flex: 1 }}>{l.text}</div>
                  <button type="button" onClick={() => requestWhatsApp(`¡Hola ${name}! Quiero hacer un pedido de ${l.title}.`)} style={{ ...linkCta, color: "var(--accent)", background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }}>
                    Hacer pedido →
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── La selección (catálogo con carrito) — el salto de valor vs. WhatsApp manual ── */}
        <section id="seleccion" style={{ scrollMarginTop: 20 }}>
          <SectionHead kicker="Comprá online" title={wording.catalogHeading} />
          {products.length === 0 ? (
            <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, padding: "28px 22px", textAlign: "center" }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>Estamos preparando la selección</p>
              <p style={{ margin: "6px 0 0", color: T.muted, fontSize: 14 }}>
                En un rato vas a poder comprar online. Mientras tanto, escribinos por WhatsApp y te tomamos el pedido.
              </p>
              <button type="button" onClick={() => requestWhatsApp(`¡Hola ${name}! Quiero hacer un pedido.`)} style={{ ...cta("#fff", "#128C4B", "1px solid #25D366"), display: "inline-flex", marginTop: 16 }}>
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
          <section>
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
          <section>
            <SectionHead kicker="Para regalar" title={copy.giftSets.title} />
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
        <section style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 20, padding: 22 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 14 }}>Tu pedido</h2>
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
                <label style={{ ...lbl, gridColumn: "1 / -1" }}><span style={lblT}>Nota</span><input name="notes" style={inp} placeholder="ej: cómo lo querés preparado / aclaraciones" /></label>
              </div>
              <button type="submit" style={{ ...cta("var(--accent)", "var(--text-on-accent)"), height: 48 }}>{wording.orderCta}</button>
              <button type="button" onClick={() => requestWhatsApp(cartMessage)} style={{ ...cta("#fff", "#128C4B", "1px solid #25D366"), height: 46 }}>Pedir por WhatsApp</button>
              <p style={{ fontSize: 11, color: T.faint, textAlign: "center" }}>Te contactamos para confirmar. El pago se coordina al recibirlo.</p>
            </form>
          )}
        </section>

        {/* ── Productos gourmet ── */}
        {copy && copy.gourmetItems.length > 0 && (
          <section>
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
          <section style={{ borderTop: `1px solid ${T.line}`, paddingTop: 24 }}>
            <div style={{ ...eyebrowStyle, color: T.faint }}>Trabajamos con</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 24px", marginTop: 12 }}>
              {copy.providers.map((pr, i) => (<span key={i} style={{ fontSize: 15, fontWeight: 700, color: T.muted }}>{pr}</span>))}
            </div>
          </section>
        )}

        {/* ── Reviews ── */}
        {copy && copy.reviews.length > 0 && (
          <section>
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
            <h2 style={{ fontSize: "clamp(26px, 4.5vw, 40px)", fontWeight: 800, letterSpacing: -0.8, maxWidth: 720, lineHeight: 1.12 }}>{copy.about.title}</h2>
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

// --- subcomponentes / estilos ---
function SectionHead({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={eyebrowStyle}>{kicker}</div>
      <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, marginTop: 8 }}>{title}</h2>
    </div>
  );
}
const eyebrowStyle: CSSProperties = { fontSize: 12, letterSpacing: 3, textTransform: "uppercase", color: "var(--accent)", fontWeight: 600 };
function cta(bg: string, color: string, border?: string): CSSProperties {
  return { display: "grid", placeItems: "center", padding: "0 22px", borderRadius: 12, border: border ?? "none", background: bg, color, fontWeight: 700, fontSize: 15, cursor: "pointer", textDecoration: "none", height: 46 };
}
const linkCta: CSSProperties = { fontSize: 14, fontWeight: 700, textDecoration: "none", marginTop: 2 };
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
