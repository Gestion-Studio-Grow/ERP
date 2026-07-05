"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { placeOnlineOrder } from "@/lib/order-actions";
import type { RetailWording } from "@/blueprints/retail";
import type { StorefrontCopy } from "@/tenants/storefront";

// Paleta cálida-minimalista compartida (premium/boutique). El COLOR de marca es el
// acento del tenant (var(--accent), inyectado por la página): se usa con moderación
// —eyebrow, filetes, precios, CTAs—, sobre una base cálida neutra. Nada estridente.
const T = {
  bg: "#faf7f2", // crema cálido
  surface: "#ffffff",
  line: "#ece4d8",
  ink: "#221c19", // casi negro cálido
  muted: "#7a6c60",
  faint: "#a89a8c",
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

export default function Storefront({
  name,
  branding,
  wording,
  copy,
  products,
  accent,
}: {
  name: string;
  branding: Branding;
  wording: RetailWording;
  copy: StorefrontCopy | null;
  products: Product[];
  accent: string;
}) {
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

  // Pedido por WhatsApp con el carrito ya cargado (canal real de venta).
  const waText = encodeURIComponent(
    `¡Hola ${name}! Quiero hacer un pedido:\n` +
      lines.map((l) => `• ${l.qty} ${l.p.saleUnit === "WEIGHT" ? "kg" : "u"} · ${l.p.name}`).join("\n") +
      `\nTotal estimado: ${money2.format(total)}`,
  );
  const waHref = branding?.whatsapp ? `https://wa.me/${branding.whatsapp}?text=${waText}` : null;

  // Copy: firma del tenant si existe; si no, cae al wording del rubro / branding.
  const eyebrow = copy?.eyebrow ?? branding?.shortLabel ?? name;
  const tagline = copy?.tagline ?? wording.heroTagline;
  const intro = copy?.intro ?? branding?.contactNote ?? "";
  const highlights = copy?.highlights ?? [];
  const about = copy?.about ?? null;
  const zones = copy?.deliveryZones ?? [];
  const payments = copy?.paymentMethods ?? [];

  const rootStyle = {
    background: T.bg,
    color: T.ink,
    minHeight: "100vh",
    fontFamily: "system-ui, -apple-system, sans-serif",
    ["--accent" as string]: accent,
  } as CSSProperties;

  return (
    <div style={rootStyle}>
      {/* ── Hero minimalista cálido ── */}
      <header style={{ borderBottom: `1px solid ${T.line}` }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "72px 24px 56px" }}>
          <div style={{ fontSize: 12, letterSpacing: 3, textTransform: "uppercase", color: "var(--accent)", fontWeight: 600 }}>
            {eyebrow}
          </div>
          <h1 style={{ fontSize: "clamp(38px, 6vw, 64px)", lineHeight: 1.02, letterSpacing: -1.5, fontWeight: 800, margin: "18px 0 0", maxWidth: 720 }}>
            {tagline}
          </h1>
          <div style={{ width: 48, height: 3, background: "var(--accent)", margin: "26px 0 22px" }} />
          {intro && <p style={{ fontSize: 17, lineHeight: 1.6, color: T.muted, maxWidth: 620 }}>{intro}</p>}
          <a href="#seleccion" style={{ ...cta("var(--accent)", "#fff"), marginTop: 28, display: "inline-block" }}>
            {wording.orderCta}
          </a>
        </div>
      </header>

      {/* ── Destacados (propuesta de valor) ── */}
      {highlights.length > 0 && (
        <section style={{ borderBottom: `1px solid ${T.line}` }}>
          <div style={{ maxWidth: 1080, margin: "0 auto", padding: "40px 24px", display: "grid", gap: 28, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            {highlights.map((h, i) => (
              <div key={i}>
                <div style={{ color: "var(--accent)", fontSize: 20, marginBottom: 8 }}>{h.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{h.title}</div>
                <div style={{ color: T.muted, fontSize: 14, lineHeight: 1.5 }}>{h.text}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: 24, display: "grid", gap: 40 }}>
        {/* ── La selección (catálogo) ── */}
        <section id="seleccion" style={{ scrollMarginTop: 20 }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, margin: "16px 0 20px" }}>{wording.catalogHeading}</h2>
          {products.length === 0 ? (
            <p style={{ color: T.muted }}>
              Todavía no hay productos con precio cargado. Se cargan en el catálogo del backoffice o al
              provisionar el tenant con su rubro.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))" }}>
              {products.map((p) => {
                const qty = cart[p.id] ?? 0;
                const isWeight = p.saleUnit === "WEIGHT";
                return (
                  <div key={p.id} style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</div>
                    <div style={{ color: "var(--accent)", fontWeight: 700, fontSize: 15 }}>
                      {money.format(unitPriceOf(p))}
                      <span style={{ color: T.faint, fontWeight: 500, fontSize: 13 }}>{isWeight ? " / kg" : " / unidad"}</span>
                    </div>
                    <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                      <button type="button" onClick={() => bump(p, -1)} aria-label="Quitar" style={qtyBtn(T.line, T.ink)}>−</button>
                      <span style={{ minWidth: 62, textAlign: "center", fontVariantNumeric: "tabular-nums", fontSize: 14 }}>
                        {qty > 0 ? `${qty} ${isWeight ? "kg" : "u"}` : "—"}
                      </span>
                      <button type="button" onClick={() => bump(p, 1)} aria-label="Agregar" style={qtyBtn("var(--accent)", "#fff")}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Tu pedido (carrito + checkout) ── */}
        <section style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 20, padding: 22 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 14 }}>Tu pedido</h2>
          {!hasItems && <p style={{ color: T.muted }}>Elegí lo que quieras de la selección con los botones + / −.</p>}
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
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${T.line}`, paddingTop: 10, fontWeight: 800 }}>
                  <span>Total estimado</span>
                  <span style={{ color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}>{money2.format(total)}</span>
                </div>
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
                {fulfillment === "DELIVERY" && (
                  <label style={lbl}><span style={lblT}>Dirección *</span><input name="address" required style={inp} placeholder="Calle, número, barrio" /></label>
                )}
                <label style={{ ...lbl, gridColumn: "1 / -1" }}><span style={lblT}>Nota</span><input name="notes" style={inp} placeholder="ej: cómo lo querés preparado / aclaraciones" /></label>
              </div>

              <button type="submit" style={{ ...cta("var(--accent)", "#fff"), height: 48 }}>{wording.orderCta}</button>
              {waHref && (
                <a href={waHref} target="_blank" rel="noopener noreferrer" style={{ ...cta("#fff", "#128C4B"), height: 46, border: "1px solid #25D366" }}>
                  Pedir por WhatsApp
                </a>
              )}
              <p style={{ fontSize: 11, color: T.faint, textAlign: "center" }}>Te contactamos para confirmar. El pago se coordina al recibirlo.</p>
            </form>
          )}
        </section>

        {/* ── Sobre nosotros ── */}
        {about && (
          <section style={{ padding: "8px 0 4px" }}>
            <h2 style={{ fontSize: "clamp(24px, 4vw, 34px)", fontWeight: 800, letterSpacing: -0.8, maxWidth: 680, lineHeight: 1.15 }}>{about.title}</h2>
            <p style={{ marginTop: 14, fontSize: 16, lineHeight: 1.7, color: T.muted, maxWidth: 660 }}>{about.body}</p>
          </section>
        )}
      </div>

      {/* ── Footer ── */}
      <footer style={{ background: T.ink, color: T.bg, marginTop: 16 }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "48px 24px", display: "grid", gap: 32, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: -0.3 }}>{name}</div>
            {branding?.contactNote && <p style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6, opacity: 0.72, maxWidth: 280 }}>{branding.contactNote}</p>}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.9, opacity: 0.82 }}>
            <div style={foothead}>Dónde estamos</div>
            {branding?.addressLine && <div>{branding.addressLine}</div>}
            {branding?.city && <div>{branding.city}</div>}
            {branding?.hoursLabel && <div style={{ opacity: 0.7, marginTop: 4 }}>{branding.hoursLabel}</div>}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.9, opacity: 0.82 }}>
            <div style={foothead}>Contacto</div>
            {branding?.whatsapp && <div><a href={`https://wa.me/${branding.whatsapp}`} target="_blank" rel="noopener noreferrer" style={footlink}>WhatsApp</a></div>}
            {branding?.instagram && <div><a href={igUrl(branding.instagram)} target="_blank" rel="noopener noreferrer" style={footlink}>{igHandle(branding.instagram)}</a></div>}
            {branding?.email && <div><a href={`mailto:${branding.email}`} style={footlink}>{branding.email}</a></div>}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.9, opacity: 0.82 }}>
            {zones.length > 0 && (<><div style={foothead}>Envíos</div><div style={{ opacity: 0.85 }}>{zones.join(" · ")}</div></>)}
            {payments.length > 0 && (<><div style={{ ...foothead, marginTop: 14 }}>Pagos</div><div style={{ opacity: 0.85 }}>{payments.join(" · ")}</div></>)}
          </div>
        </div>
      </footer>
    </div>
  );
}

// --- estilos inline ---
function cta(bg: string, color: string): CSSProperties {
  return { display: "grid", placeItems: "center", padding: "0 22px", borderRadius: 12, border: "none", background: bg, color, fontWeight: 700, fontSize: 15, cursor: "pointer", textDecoration: "none", height: 46 };
}
function qtyBtn(bg: string, color: string): CSSProperties {
  return { height: 34, minWidth: 34, borderRadius: 10, border: "none", background: bg, color, fontWeight: 700, fontSize: 16, cursor: "pointer" };
}
const lbl: CSSProperties = { display: "grid", gap: 4, fontSize: 13 };
const lblT: CSSProperties = { color: "#7a6c60" };
const inp: CSSProperties = { border: "1px solid #ece4d8", borderRadius: 10, padding: "10px 12px", fontSize: 14, background: "#fff", color: "#221c19" };
const foothead: CSSProperties = { fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.55, marginBottom: 8, fontWeight: 600 };
const footlink: CSSProperties = { color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 };

// Normaliza el instagram guardado ("@handle" o URL) a handle y a URL de perfil.
function igHandle(ig: string): string {
  const h = ig.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/+$/, "").replace(/^@/, "");
  return `@${h}`;
}
function igUrl(ig: string): string {
  return `https://www.instagram.com/${igHandle(ig).slice(1)}`;
}
