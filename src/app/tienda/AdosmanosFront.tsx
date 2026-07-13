"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { placeOnlineOrder } from "@/lib/order-actions";
import { WhatsAppCtaProvider, useWhatsAppCta } from "@/components/whatsapp-cta";
import { ADOSMANOS, ADM_SECTIONS, admSectionOf, admImageOf, type AdmContent } from "@/tenants/adosmanos-content";

// ── VIDRIERA A DOS MANOS PÁDEL — front público editorial "cancha de noche".
// Aplica la técnica scroll-reveal-composition (.claude/skills/), destilada de
// antigravity.google: tipografía grande y LIVIANA, lienzo ancho + vacío dosificado,
// revelado por scroll (opacity + translateY, IntersectionObserver), stagger corto,
// easing de desaceleración, y COLOR por la MATERIA (imágenes IA), no por decoración.
// Sobre un lienzo carbón cancha-de-noche con el acento verde-teal del tenant (#4fbe9b).
//
// Rompe el molde genérico: identidad propia de A Dos Manos + catálogo/carrito del ERP
// detrás (placeOnlineOrder → bandeja/POS/stock). Copy HONESTO (adosmanos-content.ts): el
// negocio real no tiene web/redes públicas, así que no se inventa historia ni reseñas.
//
// Calidad (NO negociable, umbrales de la skill): reveal no-JS-safe (sin JS el contenido
// existe) + prefers-reduced-motion respetado + AA + touch ≥44px + solo opacity/transform.
// El producto y el precio LIDERAN (lección Shine): el catálogo va arriba, la compra obvia.

type Product = {
  id: string;
  name: string;
  saleUnit: "UNIT" | "WEIGHT";
  price: number | null;
  pricePerKg: number | null;
  unit: string;
};

type Branding = { whatsapp: string | null } | null;

type Props = {
  products: Product[];
  branding: Branding;
  tenantKey: string;
  content?: AdmContent;
};

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const unitPrice = (p: Product) => (p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price) ?? 0;

// Reveal-on-scroll NO-JS-SAFE: el estado oculto SOLO aplica cuando el root tiene la clase
// `reveal-ready` (que agrega el JS al montar). Sin JS → nada oculto → contenido íntegro.
// Respeta prefers-reduced-motion (muestra directo, sin transición).
function Reveal({
  children,
  as: Tag = "div",
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  as?: "div" | "section" | "li" | "article";
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const T = Tag as "div";
  return (
    <T ref={ref} data-reveal={shown ? "in" : "out"} className={className} style={{ ["--d" as string]: `${delay}ms` }}>
      {children}
    </T>
  );
}

export default function AdosmanosFront({ products, branding, tenantKey, content = ADOSMANOS }: Props) {
  const configured = branding?.whatsapp ?? content.whatsapp;
  return (
    <WhatsAppCtaProvider tenantKey={tenantKey} configuredNumber={configured}>
      <AdmContentView products={products} content={content} />
    </WhatsAppCtaProvider>
  );
}

function AdmContentView({ products, content: c }: { products: Product[]; content: AdmContent }) {
  const { requestWhatsApp } = useWhatsAppCta();
  const [ready, setReady] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [fulfillment, setFulfillment] = useState<"PICKUP" | "DELIVERY">("DELIVERY");
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // Marca el root como "JS listo": recién entonces el CSS puede ocultar para revelar.
  useEffect(() => setReady(true), []);

  function bump(p: Product, dir: 1 | -1) {
    setCart((s) => {
      const q = Math.max(0, (s[p.id] ?? 0) + dir);
      const n = { ...s };
      if (q > 0) n[p.id] = q;
      else delete n[p.id];
      return n;
    });
  }

  const lines = Object.entries(cart)
    .map(([id, q]) => {
      const p = byId.get(id);
      return p ? { p, q, t: q * unitPrice(p) } : null;
    })
    .filter((l): l is { p: Product; q: number; t: number } => l !== null);
  const subtotal = lines.reduce((s, l) => s + l.t, 0);
  const count = lines.reduce((s, l) => s + l.q, 0);
  const hasItems = lines.length > 0;
  // 28% off pagando por transferencia (hecho real del negocio).
  const transferPrice = Math.round(subtotal * 0.72);

  // Catálogo agrupado por sección, respetando el orden de ADM_SECTIONS. Sólo se muestran
  // las secciones con stock real (no se anuncia un mundo sin góndola — lección QA m-1).
  const grouped = useMemo(() => {
    return ADM_SECTIONS.map((sec) => ({
      sec,
      items: products.filter((p) => admSectionOf(p.name) === sec.id),
    })).filter((g) => g.items.length > 0);
  }, [products]);

  const waCart =
    `¡Hola A Dos Manos! Quiero este pedido:\n` +
    lines.map((l) => `• ${l.q} × ${l.p.name}`).join("\n") +
    `\nEntrega: ${fulfillment === "PICKUP" ? "retiro" : "envío a domicilio"}` +
    `\nTotal estimado: ${money.format(subtotal)}`;

  return (
    <div className={`adm${ready ? " reveal-ready" : ""}`} id="top">
      <style>{CSS}</style>

      {/* ── TOP BAR ── */}
      <header className="adm-top">
        <a href="#top" className="adm-brand" aria-label={`${c.brandLead}${c.brandAccent}${c.brandTail} — ${c.brandSub}`}>
          <span className="adm-brand-mark" aria-hidden>AM</span>
          <span className="adm-brand-word">
            {c.brandLead}
            <span className="adm-accent">{c.brandAccent}</span>
            {c.brandTail}
          </span>
        </a>
        <nav className="adm-nav" aria-label="Secciones">
          <a href="#catalogo">Catálogo</a>
          <a href="#palas">Palas</a>
          <a href="#zapatillas">Zapatillas</a>
          <a href="#comprar">Cómo comprar</a>
        </nav>
        <a className="adm-btn adm-btn-accent adm-top-cta" href="#catalogo">Ver catálogo</a>
      </header>

      <main>
        {/* ── HERO (estático: visible sin JS y sin flash) ── */}
        <section className="adm-hero">
          <div className="adm-hero-media" aria-hidden>
            <Image src={c.heroImg} alt="" fill priority sizes="100vw" className="adm-hero-img" />
            <div className="adm-hero-veil" />
          </div>
          <div className="adm-hero-inner">
            <span className="adm-eyebrow">{c.heroEyebrow}</span>
            <h1 className="adm-display adm-hero-h1">
              {c.heroTitle}
              <span className="adm-accent"> {c.heroTitleAccent}</span>
            </h1>
            <p className="adm-lede">{c.heroLede}</p>
            <div className="adm-cta-row">
              <a className="adm-btn adm-btn-accent" href="#catalogo">Ver catálogo&nbsp;&nbsp;→</a>
              <button type="button" className="adm-btn adm-btn-ghost" onClick={() => requestWhatsApp("¡Hola A Dos Manos! Quería una recomendación de pala.")}>
                <WaIcon /> Pedí asesoramiento
              </button>
            </div>
          </div>
          <span className="adm-scroll-hint" aria-hidden>Scrolleá</span>
        </section>

        {/* ── MANIFIESTO (tesis de marca) ── */}
        <section className="adm-manifesto" id="manifiesto">
          <div className="adm-canvas">
            <Reveal className="adm-manifesto-inner">
              <span className="adm-eyebrow">{c.manifestoKicker}</span>
              <h2 className="adm-display adm-manifesto-h2">{c.manifestoTitle}</h2>
              <p className="adm-manifesto-body">{c.manifestoBody}</p>
            </Reveal>
          </div>
        </section>

        {/* ── PROPUESTAS DE VALOR (stagger) ── */}
        <section className="adm-values" aria-label="Por qué A Dos Manos">
          <div className="adm-canvas">
            <div className="adm-values-grid">
              {c.valueProps.map((v, i) => (
                <Reveal key={i} className="adm-value" delay={i * 70}>
                  <span className="adm-value-glyph adm-accent" aria-hidden>{v.glyph}</span>
                  <div className="adm-value-title">{v.title}</div>
                  <div className="adm-value-text">{v.text}</div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── CATÁLOGO (LIDERA: producto + precio arriba y comprable) ── */}
        <section className="adm-sec" id="catalogo">
          <div className="adm-canvas">
            <Reveal>
              <Kicker n="01" t="Palas y zapatillas · comprá online" />
            </Reveal>
            {products.length === 0 ? (
              <div className="adm-empty">
                <p className="adm-empty-t">Estamos armando la selección</p>
                <p className="adm-empty-s">En un rato vas a poder comprar online. Mientras tanto, escribinos y te tomamos el pedido.</p>
                <button type="button" className="adm-btn adm-btn-wa" onClick={() => requestWhatsApp("¡Hola A Dos Manos! Quiero hacer un pedido.")}>
                  <WaIcon /> Pedir por WhatsApp
                </button>
              </div>
            ) : (
              grouped.map(({ sec, items }) => (
                <div className="adm-group" id={sec.id} key={sec.id}>
                  <Reveal className="adm-group-head">
                    <h3 className="adm-display adm-group-h3">{sec.label}</h3>
                    <span className="adm-group-blurb">{sec.blurb}</span>
                  </Reveal>
                  <div className="adm-grid">
                    {items.map((p, i) => {
                      const q = cart[p.id] ?? 0;
                      return (
                        <Reveal key={p.id} as="article" className={`adm-pcard${q > 0 ? " on" : ""}`} delay={Math.min(i, 6) * 55}>
                          <div className="adm-pcard-visual">
                            <Image src={admImageOf(p.name)} alt={p.name} fill sizes="(max-width:680px) 50vw, (max-width:980px) 33vw, 280px" className="adm-pcard-img" />
                            {q > 0 && <span className="adm-pcard-badge" aria-hidden>{q}</span>}
                          </div>
                          <div className="adm-pcard-body">
                            <h4 className="adm-pcard-name">{p.name}</h4>
                            <div className="adm-pcard-row">
                              <span className="adm-pcard-price adm-num">{money.format(unitPrice(p))}</span>
                              <div className="adm-stepper" role="group" aria-label={`Cantidad de ${p.name}`}>
                                <button type="button" onClick={() => bump(p, -1)} disabled={q === 0} aria-label={`Quitar ${p.name}`}>−</button>
                                <span className="adm-q adm-num" aria-live="polite">{q}</span>
                                <button type="button" onClick={() => bump(p, 1)} aria-label={`Agregar ${p.name}`}>+</button>
                              </div>
                            </div>
                          </div>
                        </Reveal>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ── LAS DOS LÍNEAS (narrativa editorial — DESPUÉS del catálogo, no bloquea compra) ── */}
        <section className="adm-lines">
          <div className="adm-canvas">
            <Reveal>
              <Kicker n="02" t={c.linesTitle} />
            </Reveal>
            {c.lines.map((l, i) => (
              <Reveal key={i} className={`adm-line${i % 2 ? " adm-line-rev" : ""}`}>
                <div className="adm-line-media">
                  <Image src={l.img} alt={l.title} fill sizes="(max-width:820px) 100vw, 50vw" className="adm-line-img" />
                </div>
                <div className="adm-line-copy">
                  <span className="adm-line-tag adm-num">{l.tag}</span>
                  <h3 className="adm-display adm-line-h3">{l.title}</h3>
                  <p className="adm-line-text">{l.text}</p>
                  <a href={l.href} className="adm-linkcta">Ver {l.title.toLowerCase()} →</a>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── CÓMO COMPRAR (hechos reales de pago/envío) ── */}
        <section className="adm-sec adm-buy" id="comprar">
          <div className="adm-canvas">
            <Reveal>
              <Kicker n="03" t={c.buyTitle} />
            </Reveal>
            <div className="adm-buy-grid">
              {c.payments.map((pmt, i) => (
                <Reveal key={i} className="adm-buy-card" delay={Math.min(i, 6) * 55}>
                  <div className="adm-buy-label">{pmt.label}</div>
                  <div className="adm-buy-text">{pmt.text}</div>
                </Reveal>
              ))}
            </div>
            {/* Marcas */}
            <Reveal className="adm-providers">
              <span className="adm-eyebrow">{c.providersLabel}</span>
              <div className="adm-providers-list">
                {c.providers.map((pr, i) => (
                  <span key={i} className="adm-provider adm-display">{pr}</span>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── TU PEDIDO (checkout del ERP) ── */}
        <section className="adm-sec adm-order" id="pedido">
          <div className="adm-canvas adm-canvas-narrow">
            <Reveal>
              <Kicker n="04" t="Tu pedido" />
            </Reveal>
            <div className="adm-order-card">
              {!hasItems && (
                <p className="adm-order-empty">Elegí palas, zapatillas o accesorios de la selección con el botón <b>+</b> y armá tu pedido. También podés encargar por WhatsApp.</p>
              )}
              <form action={placeOnlineOrder} className="adm-order-form">
                {hasItems && (
                  <div className="adm-order-items">
                    {lines.map((l) => (
                      <div key={l.p.id} className="adm-oi">
                        <div className="adm-oi-info">
                          <span className="adm-oi-name">{l.p.name}</span>
                          <div className="adm-stepper adm-stepper-sm" role="group" aria-label={`Cantidad de ${l.p.name}`}>
                            <button type="button" onClick={() => bump(l.p, -1)} aria-label={`Quitar ${l.p.name}`}>−</button>
                            <span className="adm-q adm-num">{l.q}</span>
                            <button type="button" onClick={() => bump(l.p, 1)} aria-label={`Agregar ${l.p.name}`}>+</button>
                          </div>
                        </div>
                        <span className="adm-oi-amt adm-num">{money.format(l.t)}</span>
                        <input type="hidden" name="productId" value={l.p.id} />
                        <input type="hidden" name="quantity" value={l.q} />
                      </div>
                    ))}
                    <div className="adm-totrow">
                      <span className="adm-k">Total</span>
                      <span className="adm-v adm-num" aria-live="polite">{money.format(subtotal)}</span>
                    </div>
                    <div className="adm-totrow adm-totrow-sub">
                      <span className="adm-k">Pagando por transferencia (28% off)</span>
                      <span className="adm-v adm-accent adm-num">{money.format(transferPrice)}</span>
                    </div>

                    <div className="adm-checkout">
                      <label className="adm-field">
                        <span>Nombre y apellido *</span>
                        <input name="customerName" required autoComplete="name" placeholder="Tu nombre" />
                      </label>
                      <label className="adm-field">
                        <span>WhatsApp *</span>
                        <input name="customerPhone" required autoComplete="tel" inputMode="tel" placeholder="11 …" />
                      </label>
                      <label className="adm-field">
                        <span>Entrega</span>
                        <select name="fulfillment" value={fulfillment} onChange={(e) => setFulfillment(e.target.value as "PICKUP" | "DELIVERY")}>
                          <option value="DELIVERY">Envío a domicilio</option>
                          <option value="PICKUP">Retiro</option>
                        </select>
                      </label>
                      {fulfillment === "DELIVERY" && (
                        <label className="adm-field">
                          <span>Dirección *</span>
                          <input name="address" required autoComplete="street-address" placeholder="Calle, número, localidad" />
                        </label>
                      )}
                      <label className="adm-field adm-field-wide">
                        <span>Nota (opcional)</span>
                        <input name="notes" placeholder="Talle, color, nivel de juego…" />
                      </label>
                    </div>
                  </div>
                )}
                <p className="adm-order-muted">Te contactamos para confirmar. El pago se coordina al recibirlo: transferencia (28% off), tarjetas o Mercado Pago en cuotas.</p>
                <div className="adm-order-actions">
                  <button type="submit" className="adm-btn adm-btn-accent adm-order-submit" disabled={!hasItems}>Enviar pedido</button>
                  <button type="button" className="adm-btn adm-btn-wa" onClick={() => requestWhatsApp(hasItems ? waCart : "¡Hola A Dos Manos! Quiero hacer un pedido.")}>
                    <WaIcon /> Pedir por WhatsApp
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>

        {/* ── ABOUT (banda cancha de noche) ── */}
        <section className="adm-about">
          <div className="adm-about-media" aria-hidden>
            <Image src={c.courtImg} alt="" fill sizes="100vw" className="adm-about-img" />
            <div className="adm-about-veil" />
          </div>
          <div className="adm-canvas">
            <Reveal className="adm-about-inner">
              <span className="adm-accent-bar" aria-hidden />
              <h2 className="adm-display adm-about-h2">{c.aboutTitle}</h2>
              <p className="adm-about-p">{c.aboutBody}</p>
            </Reveal>
          </div>
        </section>

        {/* ── FOOTER (con acceso administrador) ── */}
        <footer className="adm-foot" id="contacto">
          <div className="adm-canvas">
            <div className="adm-foot-top">
              <div className="adm-display adm-foot-big">
                {c.brandLead}<span className="adm-accent">{c.brandAccent}</span>{c.brandTail}
                <span className="adm-foot-sub">{c.brandSub}</span>
              </div>
              <button type="button" className="adm-btn adm-btn-accent" onClick={() => requestWhatsApp("¡Hola A Dos Manos! Quería hacer una consulta.")}>
                <WaIcon /> Escribinos por WhatsApp →
              </button>
            </div>
            <div className="adm-foot-cols">
              <div>
                <h4>Dónde y cuándo</h4>
                <p>{c.hoursLabel}</p>
                <p>{c.deliveryZones}</p>
              </div>
              <div>
                <h4>Medios de pago</h4>
                <p>Transferencia (28% off) · Débito · Crédito</p>
                <p>Mercado Pago — 3 y 12 cuotas sin interés</p>
              </div>
              <div>
                <h4>Marcas</h4>
                <p>{c.providers.join(" · ")}</p>
              </div>
            </div>
            <div className="adm-foot-legal">
              <span>© {new Date().getFullYear()} {c.brandLead.trim()} {c.brandAccent} {c.brandTail.trim()} · Pádel</span>
              <Link href="/admin" className="adm-admin">Acceso administrador</Link>
            </div>
          </div>
        </footer>
      </main>

      {/* ── MINI-BAR (siempre visible con items: la compra nunca se pierde) ── */}
      {hasItems && (
        <a href="#pedido" className="adm-minibar">
          <span className="adm-minibar-cnt">{count} {count === 1 ? "producto" : "productos"}</span>
          <span className="adm-minibar-total adm-num">{money.format(subtotal)}</span>
          <span className="adm-minibar-go">Finalizar pedido →</span>
        </a>
      )}
    </div>
  );
}

function Kicker({ n, t }: { n: string; t: string }) {
  return (
    <div className="adm-kicker">
      <span className="adm-kicker-n adm-num">{n}</span>
      <span className="adm-kicker-line" aria-hidden />
      <span className="adm-kicker-t adm-display">{t}</span>
    </div>
  );
}

function WaIcon() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-4-4.7-4.2-.1-.2-1-1.4-1-2.6s.6-1.8.9-2.1c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.5c-.2.2-.3.4-.1.7.2.3.9 1.4 1.9 2 1.3.8 1.6.7 1.9.6.2-.1.6-.6.8-.9.2-.2.4-.2.6-.1l1.9.9c.2.1.4.2.5.3.1.2.1.9-.1 1.5Z" />
    </svg>
  );
}

// ── CSS scopeado a `.adm` — piel "cancha de noche" con la técnica scroll-reveal ──
const CSS = `
.adm{
  --court:#0d1215;--court-2:#111a1e;--raised:#16211f;--ink:#eef3f5;--muted:#9fb1b7;
  --faint:#869a9f;--line:rgba(255,255,255,.12);--line-2:rgba(255,255,255,.22);
  --accent:#4fbe9b;--accent-hi:#6fd3b3;--accent-ink:#052018;--wa:#25d366;
  --f-display:var(--font-hanken),'Hanken Grotesk',system-ui,sans-serif;
  --f-body:var(--font-geist-sans),system-ui,-apple-system,sans-serif;
  --maxw:1240px;
  background:var(--court);color:var(--ink);font-family:var(--f-body);font-weight:400;line-height:1.6;
  -webkit-font-smoothing:antialiased;position:relative;overflow-x:hidden}
.adm *{box-sizing:border-box}
.adm .adm-canvas{max-width:var(--maxw);margin:0 auto;padding-inline:clamp(20px,5vw,56px)}
.adm .adm-canvas-narrow{max-width:760px}
.adm .adm-display{font-family:var(--f-display);text-transform:uppercase;font-weight:600;letter-spacing:-.01em;line-height:1.02}
.adm .adm-num{font-variant-numeric:tabular-nums;font-feature-settings:"tnum"}
.adm .adm-accent{color:var(--accent)}
.adm a{color:inherit;text-decoration:none}

/* REVEAL — no-JS-safe (oculta solo con .reveal-ready) + reduced-motion-safe. Solo
   opacity/transform (barato). translateY chico (16px) y easing de desaceleración. */
.adm [data-reveal]{transition:opacity .64s cubic-bezier(.215,.61,.355,1),transform .64s cubic-bezier(.215,.61,.355,1);transition-delay:var(--d,0ms);will-change:opacity,transform}
.adm.reveal-ready [data-reveal="out"]{opacity:0;transform:translateY(16px)}
.adm [data-reveal="in"]{opacity:1;transform:none}
@media(prefers-reduced-motion:reduce){.adm [data-reveal]{opacity:1!important;transform:none!important;transition:none!important}}

/* EYEBROW / KICKER */
.adm .adm-eyebrow{display:inline-block;font-weight:600;font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:var(--accent)}
.adm .adm-kicker{display:flex;align-items:center;gap:16px;margin-bottom:clamp(28px,4vw,48px)}
.adm .adm-kicker-n{font-size:15px;color:var(--accent);font-weight:600;letter-spacing:.06em}
.adm .adm-kicker-line{height:1px;flex:0 0 44px;background:var(--line-2)}
.adm .adm-kicker-t{font-size:clamp(24px,3.6vw,40px);color:var(--ink);font-weight:600}

/* BOTONES (touch ≥48px) */
.adm .adm-btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;font-family:var(--f-body);font-weight:600;font-size:14px;letter-spacing:.02em;padding:14px 26px;min-height:50px;border-radius:12px;border:1px solid transparent;cursor:pointer;transition:transform .18s ease,background .18s ease,border-color .18s ease;text-align:center}
.adm .adm-btn-accent{background:var(--accent);color:var(--accent-ink)}
.adm .adm-btn-accent:hover{background:var(--accent-hi);transform:translateY(-2px)}
.adm .adm-btn-accent:disabled{opacity:.4;cursor:not-allowed;transform:none}
.adm .adm-btn-ghost{border-color:var(--line-2);color:var(--ink);background:rgba(255,255,255,.03)}
.adm .adm-btn-ghost:hover{border-color:var(--accent);color:var(--accent);transform:translateY(-2px)}
.adm .adm-btn-wa{background:transparent;border-color:var(--wa);color:var(--wa)}
.adm .adm-btn-wa:hover{background:rgba(37,211,102,.12);transform:translateY(-2px)}

/* TOP BAR */
.adm .adm-top{position:sticky;top:0;z-index:60;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px clamp(16px,5vw,56px);background:rgba(13,18,21,.72);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.adm .adm-brand{display:inline-flex;align-items:center;gap:11px;min-width:0}
.adm .adm-brand-mark{display:grid;place-items:center;width:38px;height:38px;border-radius:9px;background:var(--accent);color:var(--accent-ink);font-family:var(--f-display);font-weight:700;font-size:15px;letter-spacing:.02em}
.adm .adm-brand-word{font-family:var(--f-display);font-weight:700;font-size:19px;letter-spacing:.02em;text-transform:uppercase;white-space:nowrap}
.adm .adm-nav{display:flex;gap:26px;font-size:13.5px;font-weight:500;color:var(--muted);letter-spacing:.01em}
.adm .adm-nav a{display:inline-flex;align-items:center;min-height:30px;border-bottom:1px solid transparent;transition:color .18s,border-color .18s}
.adm .adm-nav a:hover{color:var(--ink);border-bottom-color:var(--accent)}
.adm .adm-top-cta{padding:10px 20px;min-height:42px;font-size:13px}
@media(max-width:920px){.adm .adm-nav{display:none}}
@media(max-width:520px){.adm .adm-top-cta{display:none}}

/* HERO */
.adm .adm-hero{position:relative;min-height:92vh;display:flex;align-items:flex-end;overflow:hidden}
.adm .adm-hero-media{position:absolute;inset:0;z-index:0}
.adm .adm-hero-img{object-fit:cover;object-position:center}
.adm .adm-hero-veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(13,18,21,.5) 0%,rgba(13,18,21,.3) 34%,rgba(13,18,21,.82) 82%,var(--court) 100%),linear-gradient(90deg,rgba(13,18,21,.72),transparent 62%)}
.adm .adm-hero-inner{position:relative;z-index:2;width:100%;max-width:var(--maxw);margin:0 auto;padding:0 clamp(20px,5vw,56px) clamp(56px,8vh,104px)}
.adm .adm-hero-h1{font-size:clamp(52px,10vw,116px);margin:18px 0 0;max-width:15ch;font-weight:600;letter-spacing:-.015em}
.adm .adm-lede{margin:22px 0 0;font-size:clamp(16px,2vw,19px);line-height:1.65;color:var(--muted);max-width:56ch}
.adm .adm-cta-row{display:flex;gap:13px;flex-wrap:wrap;margin-top:32px}
.adm .adm-scroll-hint{position:absolute;right:clamp(20px,5vw,56px);bottom:26px;z-index:2;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--faint);writing-mode:vertical-rl}
@media(max-width:520px){.adm .adm-scroll-hint{display:none}}

/* MANIFIESTO */
.adm .adm-manifesto{padding:clamp(72px,12vw,140px) 0;border-bottom:1px solid var(--line)}
.adm .adm-manifesto-inner{max-width:900px}
.adm .adm-manifesto-h2{font-size:clamp(30px,5.2vw,62px);margin:18px 0 0;font-weight:600;max-width:18ch}
.adm .adm-manifesto-body{margin:26px 0 0;font-size:clamp(16px,1.8vw,19px);line-height:1.7;color:var(--muted);max-width:60ch}

/* VALUES */
.adm .adm-values{padding:clamp(48px,7vw,88px) 0;border-bottom:1px solid var(--line);background:var(--court-2)}
.adm .adm-values-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:clamp(18px,2.4vw,34px)}
@media(max-width:900px){.adm .adm-values-grid{grid-template-columns:1fr 1fr}}
@media(max-width:480px){.adm .adm-values-grid{grid-template-columns:1fr}}
.adm .adm-value-glyph{font-size:22px;font-weight:700;display:block;margin-bottom:12px}
.adm .adm-value-title{font-weight:600;font-size:15.5px;margin-bottom:6px;color:var(--ink)}
.adm .adm-value-text{color:var(--muted);font-size:14px;line-height:1.55}

/* SECTIONS base */
.adm .adm-sec{padding:clamp(64px,10vw,120px) 0}

/* CATÁLOGO */
.adm .adm-group{margin-top:clamp(40px,5vw,64px)}
.adm .adm-group:first-of-type{margin-top:0}
.adm .adm-group-head{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:22px;padding-bottom:14px;border-bottom:1px solid var(--line)}
.adm .adm-group-h3{font-size:clamp(22px,3vw,32px);font-weight:600}
.adm .adm-group-blurb{color:var(--muted);font-size:14px}
.adm .adm-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:clamp(14px,1.8vw,22px)}
@media(max-width:980px){.adm .adm-grid{grid-template-columns:repeat(3,1fr)}}
@media(max-width:680px){.adm .adm-grid{grid-template-columns:1fr 1fr}}
@media(max-width:400px){.adm .adm-grid{grid-template-columns:1fr}}
.adm .adm-pcard{background:var(--raised);border:1px solid var(--line);border-radius:16px;overflow:hidden;display:flex;flex-direction:column;transition:transform .22s ease,border-color .22s ease,box-shadow .22s ease}
.adm .adm-pcard:hover{transform:translateY(-3px);border-color:var(--line-2);box-shadow:0 18px 40px -24px rgba(0,0,0,.9)}
.adm .adm-pcard.on{border-color:var(--accent);box-shadow:0 0 0 1.5px var(--accent)}
.adm .adm-pcard-visual{position:relative;aspect-ratio:1/1;overflow:hidden;background:var(--court-2)}
.adm .adm-pcard-img{object-fit:cover;transition:transform .5s cubic-bezier(.215,.61,.355,1)}
.adm .adm-pcard:hover .adm-pcard-img{transform:scale(1.05)}
.adm .adm-pcard-badge{position:absolute;top:10px;right:10px;z-index:2;min-width:26px;height:26px;padding:0 7px;border-radius:999px;background:var(--accent);color:var(--accent-ink);font-weight:700;font-size:13px;display:grid;place-items:center}
.adm .adm-pcard-body{padding:14px 16px 16px;display:flex;flex-direction:column;gap:12px;flex:1}
.adm .adm-pcard-name{font-size:15px;font-weight:600;line-height:1.32;color:var(--ink);margin:0;flex:1}
.adm .adm-pcard-row{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.adm .adm-pcard-price{font-size:18px;font-weight:700;color:var(--ink)}

/* STEPPER (touch ≥44px) */
.adm .adm-stepper{display:flex;align-items:center;gap:4px}
.adm .adm-stepper button{width:44px;height:44px;border-radius:11px;border:1px solid var(--line-2);background:rgba(255,255,255,.04);color:var(--ink);cursor:pointer;font-size:20px;line-height:1;display:grid;place-items:center;transition:.15s}
.adm .adm-stepper button:hover:not(:disabled){background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.adm .adm-stepper button:disabled{opacity:.35;cursor:not-allowed}
.adm .adm-stepper .adm-q{font-size:15px;min-width:26px;text-align:center;font-weight:600}
.adm .adm-stepper-sm button{width:40px;height:40px;font-size:18px}

/* EMPTY */
.adm .adm-empty{text-align:center;background:var(--raised);border:1px solid var(--line);border-radius:18px;padding:44px 24px;display:flex;flex-direction:column;align-items:center;gap:8px}
.adm .adm-empty-t{font-family:var(--f-display);text-transform:uppercase;font-size:22px;font-weight:600}
.adm .adm-empty-s{color:var(--muted);font-size:14.5px;max-width:46ch;line-height:1.55;margin-bottom:10px}

/* LÍNEAS (editorial split) */
.adm .adm-lines{padding:clamp(64px,10vw,120px) 0;border-top:1px solid var(--line);background:var(--court-2)}
.adm .adm-line{display:grid;grid-template-columns:1fr 1fr;gap:clamp(24px,4vw,64px);align-items:center;margin-top:clamp(40px,6vw,80px)}
.adm .adm-line-rev .adm-line-media{order:2}
@media(max-width:820px){.adm .adm-line,.adm .adm-line-rev{grid-template-columns:1fr}.adm .adm-line-rev .adm-line-media{order:0}}
.adm .adm-line-media{position:relative;aspect-ratio:4/5;border-radius:18px;overflow:hidden;background:var(--raised);border:1px solid var(--line)}
.adm .adm-line-img{object-fit:cover}
.adm .adm-line-tag{font-size:14px;font-weight:700;color:var(--accent);letter-spacing:.1em}
.adm .adm-line-h3{font-size:clamp(30px,5vw,58px);margin:10px 0 0;font-weight:600}
.adm .adm-line-text{margin:18px 0 0;font-size:16px;line-height:1.7;color:var(--muted);max-width:46ch}
.adm .adm-linkcta{display:inline-flex;align-items:center;min-height:44px;margin-top:16px;font-weight:600;color:var(--accent);letter-spacing:.01em}
.adm .adm-linkcta:hover{color:var(--accent-hi);text-decoration:underline;text-underline-offset:4px}

/* CÓMO COMPRAR */
.adm .adm-buy-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(14px,2vw,20px)}
@media(max-width:760px){.adm .adm-buy-grid{grid-template-columns:1fr 1fr}}
@media(max-width:440px){.adm .adm-buy-grid{grid-template-columns:1fr}}
.adm .adm-buy-card{background:var(--raised);border:1px solid var(--line);border-radius:14px;padding:22px 22px}
.adm .adm-buy-label{font-family:var(--f-display);text-transform:uppercase;font-weight:600;font-size:15px;letter-spacing:.01em;color:var(--ink);margin-bottom:6px}
.adm .adm-buy-text{color:var(--muted);font-size:14px;line-height:1.55}
.adm .adm-providers{margin-top:clamp(40px,5vw,64px);text-align:center}
.adm .adm-providers .adm-eyebrow{display:block;margin-bottom:18px;color:var(--faint)}
.adm .adm-providers-list{display:flex;flex-wrap:wrap;justify-content:center;gap:16px 34px}
.adm .adm-provider{font-size:clamp(20px,3vw,30px);font-weight:600;color:var(--muted);letter-spacing:.02em}

/* TU PEDIDO */
.adm .adm-order-card{background:var(--raised);border:1px solid var(--line);border-radius:20px;padding:clamp(22px,3vw,34px)}
.adm .adm-order-empty{color:var(--muted);font-size:15px;line-height:1.6}
.adm .adm-order-empty b{color:var(--accent)}
.adm .adm-order-items{display:grid;gap:2px}
.adm .adm-oi{display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid var(--line)}
.adm .adm-oi-info{flex:1;min-width:0;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.adm .adm-oi-name{font-size:15px;font-weight:600;color:var(--ink)}
.adm .adm-oi-amt{font-size:16px;font-weight:700;white-space:nowrap}
.adm .adm-totrow{display:flex;justify-content:space-between;align-items:baseline;margin-top:16px}
.adm .adm-totrow .adm-k{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.adm .adm-totrow .adm-v{font-size:24px;font-weight:700}
.adm .adm-totrow-sub{margin-top:6px}
.adm .adm-totrow-sub .adm-k{text-transform:none;letter-spacing:0;color:var(--faint);font-size:13px}
.adm .adm-totrow-sub .adm-v{font-size:18px}
.adm .adm-checkout{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:22px}
.adm .adm-field{display:grid;gap:5px;font-size:12.5px;color:var(--muted)}
.adm .adm-field-wide{grid-column:1/-1}
@media(max-width:560px){.adm .adm-checkout{grid-template-columns:1fr}}
.adm .adm-field input,.adm .adm-field select{border:1px solid var(--line-2);background:var(--court);color:var(--ink);border-radius:10px;padding:12px 13px;font-size:15px;font-family:var(--f-body);min-height:46px}
.adm .adm-field input::placeholder{color:var(--faint)}
.adm .adm-field input:focus,.adm .adm-field select:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:var(--accent)}
.adm .adm-order-muted{font-size:12.5px;color:var(--faint);margin:18px 0 16px;line-height:1.55}
.adm .adm-order-actions{display:flex;gap:12px;flex-wrap:wrap}
.adm .adm-order-submit{flex:1;min-width:180px}

/* ABOUT (banda cancha) */
.adm .adm-about{position:relative;padding:clamp(80px,13vw,170px) 0;overflow:hidden;border-top:1px solid var(--line)}
.adm .adm-about-media{position:absolute;inset:0;z-index:0}
.adm .adm-about-img{object-fit:cover}
.adm .adm-about-veil{position:absolute;inset:0;background:linear-gradient(90deg,rgba(13,18,21,.92),rgba(13,18,21,.62) 60%,rgba(13,18,21,.4)),linear-gradient(0deg,var(--court),transparent 60%)}
.adm .adm-about .adm-canvas{position:relative;z-index:1}
.adm .adm-about-inner{max-width:760px}
.adm .adm-accent-bar{display:block;width:52px;height:4px;background:var(--accent);border-radius:2px;margin-bottom:24px}
.adm .adm-about-h2{font-size:clamp(30px,5.4vw,64px);font-weight:600;line-height:1.05}
.adm .adm-about-p{margin-top:22px;font-size:clamp(16px,1.8vw,18.5px);line-height:1.75;color:var(--muted);max-width:62ch}

/* FOOTER */
.adm .adm-foot{background:var(--court-2);border-top:1px solid var(--line);padding:clamp(56px,8vw,110px) 0 32px}
.adm .adm-foot-top{display:flex;justify-content:space-between;align-items:flex-end;gap:28px;flex-wrap:wrap;margin-bottom:48px}
.adm .adm-foot-big{font-size:clamp(40px,8vw,96px);font-weight:600;line-height:.98;position:relative}
.adm .adm-foot-sub{display:block;font-family:var(--f-body);text-transform:none;font-weight:500;font-size:14px;letter-spacing:.02em;color:var(--muted);margin-top:12px}
.adm .adm-foot-cols{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;border-top:1px solid var(--line);padding-top:34px}
@media(max-width:640px){.adm .adm-foot-cols{grid-template-columns:1fr}}
.adm .adm-foot-cols h4{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);margin-bottom:12px}
.adm .adm-foot-cols p{font-size:14px;color:var(--muted);line-height:1.6;margin-bottom:4px}
.adm .adm-foot-legal{margin-top:44px;padding-top:22px;border-top:1px solid var(--line);display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;align-items:center;font-size:12.5px;color:var(--faint)}
.adm .adm-admin{color:var(--muted);text-decoration:underline;text-underline-offset:3px;min-height:28px;display:inline-flex;align-items:center}
.adm .adm-admin:hover{color:var(--accent)}

/* MINI-BAR */
.adm .adm-minibar{position:fixed;left:0;right:0;bottom:0;z-index:70;display:flex;align-items:center;gap:14px;padding:13px clamp(16px,5vw,40px);background:var(--accent);color:var(--accent-ink);box-shadow:0 -10px 30px rgba(0,0,0,.5)}
.adm .adm-minibar-cnt{font-size:14px;font-weight:600}
.adm .adm-minibar-total{font-size:20px;font-weight:700}
.adm .adm-minibar-go{margin-left:auto;font-size:14px;font-weight:700;letter-spacing:.02em}
@media(max-width:420px){.adm .adm-minibar-cnt{display:none}}

/* FOCO visible AA */
.adm a:focus-visible,.adm button:focus-visible,.adm input:focus-visible,.adm select:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:8px}
`;
