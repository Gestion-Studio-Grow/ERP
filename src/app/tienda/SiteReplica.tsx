"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { placeOnlineOrder } from "@/lib/order-actions";
import type { SiteReplicaData } from "@/tenants/site-replica";
import { WhatsAppCtaProvider, useWhatsAppCta } from "@/components/whatsapp-cta";

// Réplica del sitio de un tenant (config por tenant, resuelta por slug — NO un clon
// suelto) con NUESTRO backoffice detrás. Contenido/imágenes vienen en `site`; el look
// usa el acento de marca del tenant. La sección "Comprá online" conecta el carrito a
// placeOnlineOrder → bandeja/POS/stock/facturación.

// Sobre los DESIGN TOKENS del ERP (Nocturne) — la vidriera comparte sistema con el
// resto del producto y responde al tema; el acento sigue siendo el del tenant.
const T = {
  bg: "var(--surface-raised)",
  soft: "var(--surface)",
  line: "var(--line)",
  ink: "var(--text-strong)",
  muted: "var(--text-muted)",
  faint: "var(--text-faint)",
} as const;

type Product = { id: string; name: string; saleUnit: "UNIT" | "WEIGHT"; price: number | null; pricePerKg: number | null; unit: string };
type Branding = { whatsapp: string | null; instagram: string | null; email: string | null; addressLine: string | null; city: string | null; hoursLabel: string | null; contactNote: string | null } | null;

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const price = (p: Product) => (p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price) ?? 0;

type SiteReplicaProps = {
  site: SiteReplicaData;
  name: string;
  branding: Branding;
  products: Product[];
  accent: string;
  /** Slug del tenant — namespacea el WhatsApp que complete el visitante (ver WhatsAppCtaProvider). */
  tenantKey: string;
};

// Mismo contrato que Storefront.tsx: nunca un número hardcodeado — sin
// `branding.whatsapp` real, el Provider pide el número just-in-time al clic.
export default function SiteReplica(props: SiteReplicaProps) {
  return (
    <WhatsAppCtaProvider tenantKey={props.tenantKey} configuredNumber={props.branding?.whatsapp}>
      <SiteReplicaContent {...props} />
    </WhatsAppCtaProvider>
  );
}

function SiteReplicaContent({
  site,
  name,
  branding,
  products,
  accent,
}: SiteReplicaProps) {
  const { requestWhatsApp } = useWhatsAppCta();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [fulfillment, setFulfillment] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  function bump(p: Product, d: 1 | -1) {
    const step = p.saleUnit === "WEIGHT" ? 0.25 : 1;
    setCart((c) => {
      const q = Math.max(0, Math.round(((c[p.id] ?? 0) + d * step) * 100) / 100);
      const n = { ...c };
      if (q > 0) n[p.id] = q; else delete n[p.id];
      return n;
    });
  }
  const lines = Object.entries(cart).map(([id, q]) => { const p = byId.get(id); return p ? { p, q, t: q * price(p) } : null; }).filter((l): l is { p: Product; q: number; t: number } => !!l);
  const total = lines.reduce((s, l) => s + l.t, 0);

  const root = { background: T.bg, color: T.ink, fontFamily: "var(--font-body), system-ui, -apple-system, sans-serif", ["--accent" as string]: accent } as CSSProperties;

  return (
    <div style={root}>
      {/* Header */}
      <header style={{ borderBottom: `1px solid ${T.line}`, position: "sticky", top: 0, background: "color-mix(in srgb, var(--surface-raised) 92%, transparent)", backdropFilter: "blur(6px)", zIndex: 10 }}>
        <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 24px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={site.logo} alt={name} style={{ height: 40, width: "auto" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 13 }}>
            {branding?.instagram && <a href={`https://instagram.com/${branding.instagram.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" style={navlink}>Instagram</a>}
            {site.facebookUrl && <a href={site.facebookUrl} target="_blank" rel="noopener noreferrer" style={navlink}>Facebook</a>}
            <a href="#comprar" style={{ ...btn(accent, "var(--text-on-accent)"), height: 38 }}>{site.ctaSecondary}</a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section style={{ background: T.soft, borderBottom: `1px solid ${T.line}` }}>
        <div style={{ ...wrap, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 32, alignItems: "center", padding: "56px 24px" }}>
          <div>
            <div style={kicker}>{site.heroKicker}</div>
            <h1 style={{ fontSize: "clamp(34px, 5vw, 56px)", lineHeight: 1.02, letterSpacing: -1.4, fontWeight: 800, margin: "14px 0 0" }}>{site.heroTitle}</h1>
            <p style={{ fontSize: 17, lineHeight: 1.6, color: T.muted, maxWidth: 520, marginTop: 16 }}>{site.heroText}</p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 26 }}>
              <a href="#comprar" style={btn(accent, "var(--text-on-accent)")}>{site.ctaPrimary}</a>
              <button type="button" onClick={() => requestWhatsApp(`¡Hola ${name}! Quiero hacer un pedido.`)} style={btn("#fff", "#128C4B", "1px solid #25D366")}>{site.ctaSecondary}</button>
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={site.heroImg} alt="Cortes premium envasados al vacío" style={{ width: "100%", height: "auto", borderRadius: 18, border: `1px solid ${T.line}` }} loading="lazy" />
        </div>
      </section>

      {/* Beneficios */}
      <section style={{ borderBottom: `1px solid ${T.line}` }}>
        <div style={{ ...wrap, display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fit, minmax(210px,1fr))", padding: "32px 24px" }}>
          {site.benefits.map((b, i) => (
            <div key={i}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, color: accent }}>{b.title}</div>
              <div style={{ color: T.muted, fontSize: 13.5, lineHeight: 1.5 }}>{b.text}</div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ ...wrap, padding: 24, display: "grid", gap: 48 }}>
        {/* Productos gourmet */}
        <section>
          <Head title={site.gourmetTitle} />
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))" }}>
            {site.gourmet.map((g, i) => (
              <div key={i} style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${T.line}`, background: T.bg }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.img} alt={g.name} style={{ width: "100%", height: 170, objectFit: "cover", display: "block" }} loading="lazy" />
                <div style={{ padding: "14px 16px", fontWeight: 700, fontSize: 15 }}>{g.name}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Envasados al vacío */}
        <section>
          <Head title={site.vacioTitle} />
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px,1fr))" }}>
            {site.vacio.map((v, i) => (
              <div key={i} style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{v.name}</div>
                <div style={{ color: T.muted, fontSize: 14, lineHeight: 1.55, flex: 1 }}>{v.text}</div>
                <button type="button" onClick={() => requestWhatsApp(`¡Hola ${name}! Quiero hacer un pedido de ${v.name}.`)} style={{ fontSize: 14, fontWeight: 700, color: accent, textDecoration: "none", background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }}>Hacer pedido →</button>
              </div>
            ))}
          </div>
        </section>

        {/* Comprá online — NUESTRO backoffice detrás */}
        <section id="comprar" style={{ scrollMarginTop: 70 }}>
          <Head title="Comprá online" sub="Elegí, sumá al carrito y hacé tu pedido. Cae directo a la cocina/mostrador." />
          {products.length === 0 ? (
            <p style={{ color: T.muted }}>Catálogo en preparación.</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
              <div style={{ flex: "3 1 320px", display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))" }}>
                {products.map((p) => {
                  const q = cart[p.id] ?? 0; const kg = p.saleUnit === "WEIGHT";
                  return (
                    <div key={p.id} style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</div>
                      <div style={{ color: accent, fontWeight: 700, fontSize: 14.5 }}>{money.format(price(p))}<span style={{ color: T.faint, fontWeight: 500, fontSize: 12.5 }}>{kg ? " / kg" : " / u"}</span></div>
                      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                        <button type="button" onClick={() => bump(p, -1)} aria-label="Quitar" style={qbtn(T.line, T.ink)}>−</button>
                        <span style={{ minWidth: 56, textAlign: "center", fontSize: 13.5 }}>{q > 0 ? `${q} ${kg ? "kg" : "u"}` : "—"}</span>
                        <button type="button" onClick={() => bump(p, 1)} aria-label="Agregar" style={qbtn(accent, "var(--text-on-accent)")}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Carrito → placeOnlineOrder (nuestro back) */}
              <form action={placeOnlineOrder} style={{ ...card, flex: "1 1 280px", position: "sticky", top: 82, display: "grid", gap: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>Tu pedido</div>
                {lines.length === 0 && <div style={{ color: T.muted, fontSize: 13.5 }}>Sumá productos con +.</div>}
                {lines.map((l) => (
                  <div key={l.p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                    <span>{l.q} {l.p.saleUnit === "WEIGHT" ? "kg" : "u"} · {l.p.name}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{money2.format(l.t)}</span>
                    <input type="hidden" name="productId" value={l.p.id} />
                    <input type="hidden" name="quantity" value={l.q} />
                  </div>
                ))}
                {lines.length > 0 && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${T.line}`, paddingTop: 8, fontWeight: 800 }}>
                      <span>Total</span><span style={{ color: accent }}>{money2.format(total)}</span>
                    </div>
                    <input name="customerName" required placeholder="Nombre *" style={inp} />
                    <input name="customerPhone" required placeholder="WhatsApp *" style={inp} />
                    <select name="fulfillment" value={fulfillment} onChange={(e) => setFulfillment(e.target.value as "PICKUP" | "DELIVERY")} style={inp}>
                      <option value="PICKUP">Retiro en el local</option>
                      <option value="DELIVERY">Envío a domicilio</option>
                    </select>
                    {fulfillment === "DELIVERY" && <input name="address" required placeholder="Dirección *" style={inp} />}
                    <button type="submit" style={{ ...btn(accent, "var(--text-on-accent)"), height: 44 }}>Enviar pedido</button>
                    <div style={{ fontSize: 10.5, color: T.faint, textAlign: "center" }}>El pedido entra a nuestro sistema (bandeja + stock + facturación).</div>
                  </>
                )}
              </form>
            </div>
          )}
        </section>

        {/* Proveedores */}
        <section>
          <Head title={site.providersTitle} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 28, alignItems: "center" }}>
            {site.providers.map((pr, i) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img key={i} src={pr.logo} alt={pr.name} title={pr.name} style={{ height: 46, width: "auto", objectFit: "contain", filter: "grayscale(1)", opacity: 0.8 }} loading="lazy" />
            ))}
          </div>
        </section>

        {/* Reviews */}
        <section>
          <Head title={site.reviewsTitle} />
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(260px,1fr))" }}>
            {site.reviews.map((r, i) => (
              <div key={i} style={card}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.avatar} alt={r.name} style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover" }} loading="lazy" />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</div>
                    <div style={{ color: accent, letterSpacing: 1, fontSize: 12 }}>{"★".repeat(r.rating)}</div>
                  </div>
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: T.muted }}>“{r.text}”</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer style={{ background: T.ink, color: "var(--surface)" }}>
        {site.aboutText && (
          <div style={{ borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
            <div style={{ ...wrap, padding: "32px 24px 28px" }}>
              <div style={{ ...foothead, marginBottom: 10 }}>{site.aboutTitle}</div>
              <p style={{ fontSize: 14, lineHeight: 1.7, opacity: 0.82, maxWidth: 640 }}>{site.aboutText}</p>
            </div>
          </div>
        )}
        <div style={{ ...wrap, display: "grid", gap: 32, gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", padding: "44px 24px" }}>
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={site.logoFooter} alt={name} style={{ height: 44, width: "auto", marginBottom: 10 }} />
            {branding?.contactNote && <p style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.66, maxWidth: 280 }}>{branding.contactNote}</p>}
          </div>
          <div style={foot}><div style={foothead}>Dónde estamos</div>{branding?.addressLine && <div>{branding.addressLine}</div>}{branding?.city && <div>{branding.city}</div>}<div style={{ opacity: 0.7, marginTop: 4 }}>{branding?.hoursLabel ?? site.hoursLabel}</div></div>
          <div style={foot}><div style={foothead}>Contacto</div>{site.phone && <div>Tel: {site.phone}</div>}<div><button type="button" onClick={() => requestWhatsApp(`¡Hola ${name}! Quiero hacer una consulta.`)} style={{ ...flink, background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer" }}>WhatsApp</button></div>{branding?.instagram && <div><a href={`https://instagram.com/${branding.instagram.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" style={flink}>{branding.instagram}</a></div>}{site.facebookUrl && <div><a href={site.facebookUrl} target="_blank" rel="noopener noreferrer" style={flink}>Facebook</a></div>}{branding?.email && <div><a href={`mailto:${branding.email}`} style={flink}>{branding.email}</a></div>}</div>
          <div style={foot}><div style={foothead}>Sistema</div><div style={{ opacity: 0.7 }}>Vidriera + pedidos + POS integrados.</div></div>
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }}>
          <div style={{ ...wrap, padding: "16px 24px", display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", fontSize: 11.5, opacity: 0.6 }}>
            {site.socialNote && <span>{site.socialNote}</span>}
            {site.copyright && <span>{site.copyright}</span>}
          </div>
        </div>
      </footer>
    </div>
  );
}

function Head({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>{title}</h2>
      {sub && <p style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 6 }}>{sub}</p>}
    </div>
  );
}
const wrap: CSSProperties = { maxWidth: 1120, margin: "0 auto" };
const kicker: CSSProperties = { fontSize: 12, letterSpacing: 3, textTransform: "uppercase", color: "var(--accent)", fontWeight: 600 };
const card: CSSProperties = { background: "var(--surface-raised)", border: "1px solid var(--line)", borderRadius: 16, padding: 18 };
function btn(bg: string, color: string, border?: string): CSSProperties {
  return { display: "grid", placeItems: "center", padding: "0 20px", height: 46, borderRadius: 11, border: border ?? "none", background: bg, color, fontWeight: 700, fontSize: 14.5, textDecoration: "none", cursor: "pointer" };
}
function qbtn(bg: string, color: string): CSSProperties {
  return { height: 32, minWidth: 32, borderRadius: 9, border: "none", background: bg, color, fontWeight: 700, fontSize: 15, cursor: "pointer" };
}
const inp: CSSProperties = { border: "1px solid var(--line-strong)", borderRadius: 9, padding: "9px 11px", fontSize: 13.5, background: "var(--surface-raised)", color: "var(--text-strong)" };
const navlink: CSSProperties = { color: "var(--text-strong)", textDecoration: "none", fontWeight: 600 };
const foot: CSSProperties = { fontSize: 13, lineHeight: 1.9, opacity: 0.82 };
const foothead: CSSProperties = { fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.55, marginBottom: 8, fontWeight: 600 };
const flink: CSSProperties = { color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 };
