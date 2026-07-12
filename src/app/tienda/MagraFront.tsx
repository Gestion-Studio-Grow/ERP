"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { placeOnlineOrder } from "@/lib/order-actions";
import { WhatsAppCtaProvider, useWhatsAppCta } from "@/components/whatsapp-cta";
import { MAGRA, MAGRA_HERO_IMG, cutImage, type MagraContent } from "@/tenants/magra-content";

// ── VIDRIERA MAGRA — front público editorial (ADR-072 §8 · mockup aprobado
// mockup-magra-vidriera.html). "Esto no es una carnicería": boutique de carnes envasadas
// al vacío. Piel Apple×SAP en clave MAGRA — carbón #1D1D1B + hueso #F2E6D7 + oro #C5AE86,
// Bebas Neue (display) + Open Sans (cuerpo) + Fraunces (reseñas). NO es el molde genérico
// de los otros tenants: es la identidad real de MAGRA, con el catálogo y el carrito del
// ERP detrás (placeOnlineOrder → bandeja/POS/stock). El copy es TEXTUAL del sitio
// autorizado (src/tenants/magra-content.ts); las imágenes son generadas por IA (no las
// del sitio real, con derechos).
//
// UX de compra (pedido del dueño): la TIENDA PROPIA es el camino principal (riel de
// pedido permanente + catálogo comprable); WhatsApp queda como atención personalizada.

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
  content?: MagraContent;
};

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const unitPrice = (p: Product) => (p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price) ?? 0;
const unitLabel = (p: Product) => (p.saleUnit === "WEIGHT" ? "/ kg" : "/ u");

export default function MagraFront({ products, branding, tenantKey, content = MAGRA }: Props) {
  // El WhatsApp real de MAGRA (copia autorizada) queda como número configurado del CTA;
  // si el branding del tenant trae uno propio (DB), gana ese. Nunca hardcodeado en el click.
  const configured = branding?.whatsapp ?? content.whatsapp;
  return (
    <WhatsAppCtaProvider tenantKey={tenantKey} configuredNumber={configured}>
      <MagraFrontContent products={products} content={content} />
    </WhatsAppCtaProvider>
  );
}

function MagraFrontContent({ products, content: c }: { products: Product[]; content: MagraContent }) {
  const { requestWhatsApp } = useWhatsAppCta();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [fulfillment, setFulfillment] = useState<"PICKUP" | "DELIVERY">("DELIVERY");
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  function bump(p: Product, dir: 1 | -1) {
    const step = p.saleUnit === "WEIGHT" ? 0.25 : 1;
    setCart((s) => {
      const q = Math.max(0, Math.round(((s[p.id] ?? 0) + dir * step) * 100) / 100);
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
  const hasItems = lines.length > 0;
  const count = lines.reduce((s, l) => s + (l.p.saleUnit === "WEIGHT" ? 1 : l.q), 0);

  // Featured editorial: los 2 primeros cortes reales, en bloques grandes; el resto va a la
  // grilla comprable. Sin productos → sección "en preparación" + WhatsApp (nunca vacía cruda).
  const featured = products.slice(0, 2);
  const grid = products.slice(2);

  const waCart =
    `¡Hola MAGRA! Quiero hacer este pedido:\n` +
    lines.map((l) => `• ${l.q} ${l.p.saleUnit === "WEIGHT" ? "kg" : "u"} · ${l.p.name}`).join("\n") +
    `\nEntrega: ${fulfillment === "PICKUP" ? "retiro en el local" : "envío a domicilio"}` +
    `\nTotal estimado: ${money2.format(subtotal)}`;

  return (
    <div className="magra">
      <style>{CSS}</style>

      {/* ── TOP BAR ── */}
      <header className="mf-top">
        <a href="#top" className="mf-brand" aria-label={`${c.brandLead}${c.brandAccent}${c.brandTail}`}>
          <span className="mf-logo">
            {c.brandLead}
            <b>{c.brandAccent}</b>
            {c.brandTail}
          </span>
          <small>{c.brandSub}</small>
        </a>
        <nav className="mf-nav" aria-label="Secciones">
          <a href="#cortes">Cortes</a>
          <a href="#gourmet">Gourmet</a>
          <a href="#nosotros">La casa</a>
          <a href="#contacto">Cómo llegar</a>
        </nav>
        <a className="mf-btn mf-btn-ghost mf-top-cta" href="#cortes">
          Lista de precios
        </a>
      </header>

      <div className="mf-shell" id="top">
        <main className="mf-main">
          {/* ── HERO ── */}
          <section className="mf-hero">
            <div className="mf-hero-copy">
              <span className="mf-eyebrow mf-hero-eyebrow">{c.heroEyebrow}</span>
              <h1 className="mf-display mf-hero-h1">{c.heroTitle}</h1>
              <p className="mf-lede">{c.heroLede}</p>
              <div className="mf-cta-row">
                <a className="mf-btn mf-btn-oro" href="#cortes">
                  Armar mi pedido&nbsp;&nbsp;→
                </a>
                <button
                  type="button"
                  className="mf-btn mf-btn-ghost"
                  onClick={() => requestWhatsApp("¡Hola MAGRA! Quería hacer una consulta.")}
                >
                  Pedir por WhatsApp
                </button>
              </div>
              <p className="mf-hero-zone">{c.heroZone}</p>
            </div>
            <div className="mf-hero-visual">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={MAGRA_HERO_IMG} alt="Corte premium madurado, envasado al vacío" className="mf-hero-img" />
              <div aria-hidden className="mf-vig" />
              <span className="mf-tag-vac">● Envasado al vacío</span>
            </div>
            <div aria-hidden className="mf-scrollcue">Distribuidor oficial · Estancia Don Ramón</div>
          </section>

          {/* ── MARQUEE ── */}
          <div className="mf-marquee" aria-hidden>
            <div className="mf-track">
              {[...c.marquee, ...c.marquee].map((m, i) => (
                <span key={i} className="mf-track-item">
                  <b>{m}</b>
                  <span className="mf-dot">·</span>
                </span>
              ))}
            </div>
          </div>

          {/* ── PROPUESTAS DE VALOR ── */}
          <section className="mf-values">
            {c.valueProps.map((v, i) => (
              <div key={i} className="mf-value">
                <span aria-hidden className="mf-value-glyph">{v.glyph}</span>
                <div className="mf-value-title">{v.title}</div>
                <div className="mf-value-text">{v.text}</div>
              </div>
            ))}
          </section>

          {/* ── CORTES (catálogo comprable = tienda propia, camino principal) ── */}
          <section className="mf-ed" id="cortes">
            <Kicker n="01" t="La vidriera · comprá online" />
            {products.length === 0 ? (
              <div className="mf-empty">
                <p className="mf-empty-t">Estamos preparando la vidriera</p>
                <p className="mf-empty-s">
                  En un rato vas a poder comprar online. Mientras tanto, escribinos por WhatsApp y te tomamos el
                  pedido.
                </p>
                <button
                  type="button"
                  className="mf-btn mf-btn-wa"
                  onClick={() => requestWhatsApp("¡Hola MAGRA! Quiero hacer un pedido.")}
                >
                  <WaIcon /> Pedir por WhatsApp
                </button>
              </div>
            ) : (
              <>
                {/* Featured editorial (2) */}
                {featured.map((p, i) => {
                  const img = cutImage(p.name);
                  const q = cart[p.id] ?? 0;
                  return (
                    <div key={p.id} className={`mf-featured${i % 2 === 1 ? " rev" : ""}`}>
                      <div className="mf-fe-copy">
                        <span className="mf-eyebrow">
                          {/pollo/i.test(p.name) ? "Pollo orgánico · Envasado al vacío" : "Vacuno · Envasado al vacío"}
                        </span>
                        <h2 className="mf-display mf-fe-h2">{p.name}</h2>
                        <p className="mf-fe-p">
                          Seleccionado de los mejores proveedores y envasado al vacío para que llegue a tu casa
                          como recién cortado. Vos solo ponés el fuego.
                        </p>
                        <div className="mf-meta">
                          <div>
                            <div className="mf-meta-k">Presentación</div>
                            <div className="mf-meta-v mf-display">Al vacío</div>
                          </div>
                          <div>
                            <div className="mf-meta-k">Venta</div>
                            <div className="mf-meta-v mf-display">Por {p.saleUnit === "WEIGHT" ? "kg" : "unidad"}</div>
                          </div>
                          <div>
                            <div className="mf-meta-k">Envío</div>
                            <div className="mf-meta-v mf-display">Gratis · Canning</div>
                          </div>
                        </div>
                        <div className="mf-price-add">
                          <div className="mf-price mf-display mf-num">
                            {money.format(unitPrice(p))} <small>{unitLabel(p)}</small>
                          </div>
                          <div className="mf-stepper" role="group" aria-label={`Cantidad de ${p.name}`}>
                            <button type="button" onClick={() => bump(p, -1)} disabled={q === 0} aria-label={`Quitar ${p.name}`}>−</button>
                            <span className="mf-q mf-display" aria-live="polite">{q > 0 ? `${q} ${p.saleUnit === "WEIGHT" ? "kg" : "u"}` : "0"}</span>
                            <button type="button" onClick={() => bump(p, 1)} aria-label={`Agregar ${p.name}`}>+</button>
                          </div>
                        </div>
                      </div>
                      <div className="mf-fe-visual">
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={img} alt={p.name} className="mf-fe-img" loading="lazy" />
                        ) : (
                          <div aria-hidden className="mf-fe-fallback" />
                        )}
                        <div className="mf-price-tag mf-display mf-num">{money.format(unitPrice(p))}</div>
                        <div className="mf-fe-lbl mf-display">{p.name}</div>
                      </div>
                    </div>
                  );
                })}

                {/* Grilla comprable (resto) */}
                {grid.length > 0 && (
                  <div className="mf-grid">
                    {grid.map((p) => {
                      const img = cutImage(p.name);
                      const q = cart[p.id] ?? 0;
                      return (
                        <div key={p.id} className={`mf-pcard${q > 0 ? " on" : ""}`}>
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={img} alt={p.name} className="mf-pcard-img" loading="lazy" />
                          ) : (
                            <div aria-hidden className="mf-pcard-fallback" />
                          )}
                          <div className="mf-pcard-body">
                            <h3 className="mf-display mf-pcard-h3">{p.name}</h3>
                            <div className="mf-pcard-row">
                              <span className="mf-pcard-pr mf-display mf-num">
                                {money.format(unitPrice(p))}
                                <small>{unitLabel(p)}</small>
                              </span>
                              <div className="mf-stepper mf-stepper-sm" role="group" aria-label={`Cantidad de ${p.name}`}>
                                <button type="button" onClick={() => bump(p, -1)} disabled={q === 0} aria-label={`Quitar ${p.name}`}>−</button>
                                <span className="mf-q mf-display" aria-live="polite">{q > 0 ? q : "0"}</span>
                                <button type="button" onClick={() => bump(p, 1)} aria-label={`Agregar ${p.name}`}>+</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>

          {/* ── ENVASADOS AL VACÍO ── */}
          <section className="mf-ed" id="envasados">
            <Kicker n="02" t={c.vacioTitle} />
            <div className="mf-vacio">
              {c.vacio.map((v, i) => (
                <div key={i} className="mf-vcard">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={v.img} alt={v.title} className="mf-vcard-img" loading="lazy" />
                  <div className="mf-vcard-body">
                    <h3 className="mf-display mf-vcard-h3">{v.title}</h3>
                    <p className="mf-vcard-p">{v.text}</p>
                    <button
                      type="button"
                      className="mf-linkcta"
                      onClick={() => requestWhatsApp(`¡Hola MAGRA! Quiero hacer un pedido de ${v.title}.`)}
                    >
                      Hacer pedido →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── PRODUCTOS GOURMET ── */}
          <section className="mf-ed" id="gourmet">
            <Kicker n="03" t={c.gourmetTitle} />
            <div className="mf-gourmet">
              {c.gourmet.map((g, i) => (
                <div key={i} className="mf-gcard">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.img} alt={g.name} className="mf-gcard-img" loading="lazy" />
                  <div className="mf-gcard-name">{g.name}</div>
                </div>
              ))}
            </div>
          </section>

          {/* ── PROVEEDORES ── */}
          <section className="mf-ed mf-providers-sec">
            <div className="mf-eyebrow mf-providers-lead">{c.providersTitle}</div>
            <div className="mf-providers">
              {c.providers.map((p, i) => (
                <span key={i} className="mf-provider mf-display">{p}</span>
              ))}
            </div>
          </section>

          {/* ── RESEÑAS ── */}
          <section className="mf-quotes" id="nosotros">
            <Kicker n="04" t="Reviews de nuestros clientes" center />
            <div className="mf-reviews">
              {c.reviews.map((r, i) => (
                <figure key={i} className="mf-review">
                  <div aria-hidden className="mf-stars">{"★".repeat(Math.max(0, Math.min(5, r.rating)))}</div>
                  <blockquote className="mf-serif mf-review-t">“{r.text}”</blockquote>
                  <figcaption className="mf-review-who">{r.name} · Cliente MAGRA</figcaption>
                </figure>
              ))}
            </div>
          </section>

          {/* ── ABOUT ── */}
          <section className="mf-about">
            <div className="mf-oro-rule" aria-hidden />
            <h2 className="mf-display mf-about-h2">{c.aboutTitle}</h2>
            <p className="mf-about-p">{c.aboutBody}</p>
          </section>

          {/* ── FOOTER ── */}
          <footer className="mf-foot" id="contacto">
            <div className="mf-foot-top">
              <div className="mf-display mf-foot-big">
                Probadas por<br />nosotros,<br /><span>elegidas para vos.</span>
              </div>
              <button type="button" className="mf-btn mf-btn-oro" onClick={() => requestWhatsApp("¡Hola MAGRA! Quería hacer un pedido.")}>
                Pedir por WhatsApp →
              </button>
            </div>
            <div className="mf-foot-cols">
              <div>
                <h4>Dónde estamos</h4>
                <p>{c.address}</p>
                <p>Buenos Aires</p>
              </div>
              <div>
                <h4>Horarios</h4>
                <p>{c.hours}</p>
              </div>
              <div>
                <h4>Llegamos a</h4>
                <p>{c.deliveryZones.join(" · ")}</p>
              </div>
              <div>
                <h4>Contacto</h4>
                <a href={`https://wa.me/${c.whatsapp}`} target="_blank" rel="noopener noreferrer">WhatsApp {c.phone}</a>
                <a href={c.instagramUrl} target="_blank" rel="noopener noreferrer">Instagram {c.instagram}</a>
                <a href={`mailto:${c.email}`}>{c.email}</a>
              </div>
            </div>
            <div className="mf-foot-legal">
              <span>{c.copyright}</span>
              <Link href="/admin" className="mf-admin">Acceso administrador</Link>
            </div>
          </footer>
        </main>

        {/* ── RIEL DE PEDIDO PERSISTENTE ── */}
        <aside className="mf-rail" id="pedido" aria-label="Tu pedido">
          <div className="mf-rail-head">
            <span className="mf-eyebrow">Tu pedido</span>
            <div className="mf-rail-t mf-display">
              Mi bolsa <span className="mf-cnt" aria-live="polite">{count}</span>
            </div>
          </div>

          <form action={placeOnlineOrder} className="mf-rail-form">
            <div className="mf-rail-items">
              {!hasItems && <p className="mf-rail-empty">Sumá cortes con el botón + y armá tu pedido.</p>}
              {lines.map((l) => (
                <div key={l.p.id} className="mf-ri">
                  <div className="mf-ri-info">
                    <div className="mf-ri-nm">{l.p.name}</div>
                    <div className="mf-ri-qt mf-num">{money.format(unitPrice(l.p))} {unitLabel(l.p)}</div>
                    <div className="mf-stepper mf-stepper-sm" role="group" aria-label={`Cantidad de ${l.p.name}`}>
                      <button type="button" onClick={() => bump(l.p, -1)} aria-label={`Quitar ${l.p.name}`}>−</button>
                      <span className="mf-q mf-display">{l.q}{l.p.saleUnit === "WEIGHT" ? " kg" : ""}</span>
                      <button type="button" onClick={() => bump(l.p, 1)} aria-label={`Agregar ${l.p.name}`}>+</button>
                    </div>
                  </div>
                  <div className="mf-ri-amt mf-display mf-num">{money.format(l.t)}</div>
                  <input type="hidden" name="productId" value={l.p.id} />
                  <input type="hidden" name="quantity" value={l.q} />
                </div>
              ))}
            </div>

            <div className="mf-rail-foot">
              <div className="mf-totrow">
                <span className="mf-k">Subtotal</span>
                <span className="mf-v mf-display mf-num">{money2.format(subtotal)}</span>
              </div>
              <div className="mf-totrow">
                <span className="mf-k">Envío · Canning</span>
                <span className="mf-v mf-display mf-free">Gratis</span>
              </div>
              <div className="mf-totrow mf-big">
                <span className="mf-k">Total</span>
                <span className="mf-v mf-display mf-num" aria-live="polite">{money2.format(subtotal)}</span>
              </div>

              {hasItems && (
                <div className="mf-checkout">
                  <label className="mf-field">
                    <span>Nombre y apellido *</span>
                    <input name="customerName" required autoComplete="name" placeholder="Tu nombre" />
                  </label>
                  <label className="mf-field">
                    <span>WhatsApp *</span>
                    <input name="customerPhone" required autoComplete="tel" inputMode="tel" placeholder="11 …" />
                  </label>
                  <label className="mf-field">
                    <span>Entrega</span>
                    <select name="fulfillment" value={fulfillment} onChange={(e) => setFulfillment(e.target.value as "PICKUP" | "DELIVERY")}>
                      <option value="DELIVERY">Envío a domicilio</option>
                      <option value="PICKUP">Retiro en el local</option>
                    </select>
                  </label>
                  {fulfillment === "DELIVERY" && (
                    <label className="mf-field">
                      <span>Dirección *</span>
                      <input name="address" required autoComplete="street-address" placeholder="Calle, número, barrio" />
                    </label>
                  )}
                  <label className="mf-field">
                    <span>Nota (opcional)</span>
                    <input name="notes" placeholder="Punto de cocción, horario…" />
                  </label>
                </div>
              )}

              <p className="mf-rail-muted">Pagás al recibir: efectivo, débito, crédito, transferencia o Mercado Pago.</p>

              <button type="submit" className="mf-btn mf-btn-oro mf-rail-submit" disabled={!hasItems}>
                Enviar pedido
              </button>
              <button
                type="button"
                className="mf-btn mf-btn-wa mf-rail-wa"
                onClick={() => requestWhatsApp(hasItems ? waCart : "¡Hola MAGRA! Quiero hacer un pedido.")}
              >
                <WaIcon /> Pedir por WhatsApp
              </button>
            </div>
          </form>
        </aside>
      </div>

      {/* ── MINI-BAR MÓVIL (salto al pedido) ── */}
      {hasItems && (
        <a href="#pedido" className="mf-minibar">
          <span className="mf-minibar-cnt">{count} {count === 1 ? "corte" : "cortes"}</span>
          <span className="mf-minibar-total mf-display mf-num">{money2.format(subtotal)}</span>
          <span className="mf-minibar-go">Finalizar pedido →</span>
        </a>
      )}
    </div>
  );
}

function Kicker({ n, t, center }: { n: string; t: string; center?: boolean }) {
  return (
    <div className={`mf-kicker${center ? " center" : ""}`}>
      <span className="mf-kicker-n mf-display">{n}</span>
      <span className="mf-kicker-l" />
      <span className="mf-kicker-t">{t}</span>
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

// ── CSS scopeado a `.magra` (portado del mockup aprobado + fixes AA/táctiles) ──
const CSS = `
.magra{--carbon:#1D1D1B;--negro:#000;--crema:#F2E6D7;--oro:#C5AE86;--oro-hi:#D8C39C;--acero:#CCD6DF;--gris:#9BA2AA;--sangre:#7A1F19;--wa:#0B7A3B;--rail:380px;
  --f-display:var(--font-bebas),'Bebas Neue',Impact,sans-serif;--f-body:var(--font-open-sans),'Open Sans',system-ui,sans-serif;--f-serif:var(--font-fraunces),Georgia,serif;
  background:var(--carbon);color:var(--crema);font-family:var(--f-body);font-weight:400;line-height:1.5;-webkit-font-smoothing:antialiased;position:relative;overflow-x:hidden}
.magra *{box-sizing:border-box}
.magra .mf-display{font-family:var(--f-display);font-weight:400;letter-spacing:.01em;line-height:.9}
.magra .mf-serif{font-family:var(--f-serif)}
.magra .mf-num{font-variant-numeric:tabular-nums;font-feature-settings:"tnum"}
.magra .mf-eyebrow{font-family:var(--f-body);font-weight:700;font-size:11px;letter-spacing:.32em;text-transform:uppercase;color:var(--oro)}

.magra a{color:inherit;text-decoration:none}
.magra .mf-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;font-family:var(--f-body);font-weight:700;font-size:13px;letter-spacing:.12em;text-transform:uppercase;padding:15px 26px;min-height:48px;border-radius:5px;border:1px solid transparent;cursor:pointer;transition:.18s;text-align:center}
.magra .mf-btn-oro{background:var(--oro);color:var(--carbon)}
.magra .mf-btn-oro:hover{background:var(--oro-hi);transform:translateY(-2px)}
.magra .mf-btn-oro:disabled{opacity:.45;cursor:not-allowed;transform:none}
.magra .mf-btn-ghost{border-color:rgba(242,230,215,.3);color:var(--crema);background:transparent}
.magra .mf-btn-ghost:hover{border-color:var(--oro);color:var(--oro)}
.magra .mf-btn-wa{background:var(--wa);color:#fff}
.magra .mf-btn-wa:hover{background:#0a6935;transform:translateY(-2px)}

/* TOP BAR */
.magra .mf-top{position:fixed;top:0;left:0;right:0;z-index:60;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px clamp(18px,4vw,56px);background:linear-gradient(180deg,rgba(29,29,27,.94),rgba(29,29,27,.55) 70%,rgba(29,29,27,0));backdrop-filter:blur(7px)}
.magra .mf-brand{display:flex;align-items:baseline;gap:12px;min-width:0}
.magra .mf-logo{font-family:var(--f-display);font-size:30px;letter-spacing:.16em;color:var(--crema);line-height:1}
.magra .mf-logo b{color:var(--oro)}
.magra .mf-brand small{font-size:9px;letter-spacing:.28em;color:var(--acero);text-transform:uppercase;white-space:nowrap}
.magra .mf-nav{display:flex;gap:26px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;font-weight:600}
.magra .mf-nav a{opacity:.82;transition:.2s;display:inline-flex;align-items:center;min-height:24px}
.magra .mf-nav a:hover{opacity:1;color:var(--oro)}
.magra .mf-top-cta{padding:11px 20px;min-height:42px;font-size:12px}
@media(max-width:940px){.magra .mf-nav{display:none}}
@media(max-width:560px){.magra .mf-top-cta{display:none}.magra .mf-brand small{display:none}}

/* SHELL + RAIL GRID */
.magra .mf-shell{display:grid;grid-template-columns:minmax(0,1fr) var(--rail)}
@media(max-width:1080px){.magra .mf-shell{grid-template-columns:1fr}}
.magra .mf-main{min-width:0}

/* HERO */
.magra .mf-hero{position:relative;min-height:100vh;display:grid;grid-template-columns:1.1fr .9fr;align-items:end;overflow:hidden}
@media(max-width:820px){.magra .mf-hero{grid-template-columns:1fr;min-height:auto;padding-top:96px}}
.magra .mf-hero-copy{padding:0 0 9vh clamp(18px,4vw,56px);position:relative;z-index:3}
@media(max-width:820px){.magra .mf-hero-copy{padding:8px 20px 40px;order:2}}
.magra .mf-hero-eyebrow{display:block;margin-bottom:24px}
.magra .mf-hero-h1{color:var(--crema);font-size:clamp(56px,11vw,150px);text-transform:uppercase;margin:0 0 6px;max-width:12ch}
.magra .mf-lede{max-width:40ch;margin:24px 0 8px;font-size:17px;font-weight:400;color:var(--acero);line-height:1.62}
.magra .mf-hero-zone{margin-top:22px;font-size:13.5px;font-weight:600;color:var(--oro);max-width:44ch;line-height:1.5}
.magra .mf-cta-row{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:26px}
.magra .mf-hero-visual{position:relative;align-self:stretch;min-height:64vh;background:var(--negro)}
@media(max-width:820px){.magra .mf-hero-visual{order:1;min-height:52vh;aspect-ratio:4/3}}
.magra .mf-hero-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.magra .mf-vig{position:absolute;inset:0;background:linear-gradient(90deg,var(--carbon),rgba(29,29,27,0) 34%),linear-gradient(0deg,rgba(29,29,27,.5),transparent 40%),radial-gradient(70% 60% at 60% 40%,rgba(122,31,25,.22),transparent 70%)}
.magra .mf-tag-vac{position:absolute;top:14%;right:8%;border:1px solid rgba(242,230,215,.34);color:var(--crema);font-size:10px;letter-spacing:.26em;text-transform:uppercase;padding:8px 14px;border-radius:2px;background:rgba(0,0,0,.42);backdrop-filter:blur(2px);z-index:4;white-space:nowrap}
@media(max-width:560px){.magra .mf-tag-vac{display:none}}
.magra .mf-scrollcue{position:absolute;left:clamp(18px,4vw,56px);bottom:22px;font-size:10px;letter-spacing:.28em;color:var(--acero);text-transform:uppercase;display:flex;align-items:center;gap:10px;z-index:3}
.magra .mf-scrollcue::before{content:"";width:34px;height:1px;background:var(--oro)}
@media(max-width:820px){.magra .mf-scrollcue{display:none}}

/* MARQUEE */
.magra .mf-marquee{border-top:1px solid rgba(242,230,215,.12);border-bottom:1px solid rgba(242,230,215,.12);overflow:hidden;padding:13px 0;background:var(--negro)}
.magra .mf-track{display:flex;gap:0;white-space:nowrap;animation:mf-slide 30s linear infinite;width:max-content;font-family:var(--f-display);font-size:23px;letter-spacing:.12em;color:var(--oro)}
.magra .mf-track-item{display:inline-flex;gap:34px;padding-right:34px}
.magra .mf-track-item b{color:var(--crema);font-weight:400}
.magra .mf-dot{opacity:.5}
@keyframes mf-slide{to{transform:translateX(-50%)}}
@media(prefers-reduced-motion:reduce){.magra .mf-track{animation:none}}

/* VALUE PROPS */
.magra .mf-values{display:grid;grid-template-columns:repeat(4,1fr);gap:clamp(20px,3vw,44px);padding:clamp(36px,6vh,64px) clamp(18px,4vw,56px);border-bottom:1px solid rgba(242,230,215,.1)}
@media(max-width:820px){.magra .mf-values{grid-template-columns:1fr 1fr;gap:26px}}
@media(max-width:460px){.magra .mf-values{grid-template-columns:1fr}}
.magra .mf-value-glyph{color:var(--oro);font-size:22px;line-height:1;display:block;margin-bottom:12px}
.magra .mf-value-title{font-weight:700;font-size:15.5px;margin-bottom:6px;color:var(--crema)}
.magra .mf-value-text{color:var(--acero);font-size:13.5px;line-height:1.55}

/* EDITORIAL SECTIONS */
.magra .mf-ed{padding:clamp(56px,9vh,120px) clamp(18px,4vw,56px);position:relative}
.magra .mf-kicker{display:flex;align-items:center;gap:16px;margin-bottom:38px}
.magra .mf-kicker.center{justify-content:center;text-align:center}
.magra .mf-kicker-n{font-size:16px;color:var(--oro);letter-spacing:.08em}
.magra .mf-kicker-l{height:1px;flex:1;background:rgba(242,230,215,.16)}
.magra .mf-kicker.center .mf-kicker-l{max-width:80px}
.magra .mf-kicker-t{font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:var(--acero);font-weight:600}

/* FEATURED */
.magra .mf-featured{display:grid;grid-template-columns:1fr 1fr;gap:clamp(24px,4vw,64px);align-items:center;margin-bottom:clamp(48px,8vh,96px)}
@media(max-width:820px){.magra .mf-featured{grid-template-columns:1fr;gap:26px}}
.magra .mf-featured.rev .mf-fe-copy{order:2}
@media(max-width:820px){.magra .mf-featured.rev .mf-fe-copy{order:0}}
.magra .mf-fe-h2{font-size:clamp(46px,7vw,104px);text-transform:uppercase;color:var(--crema);margin:6px 0 8px}
.magra .mf-fe-p{max-width:40ch;color:var(--acero);margin:16px 0 26px;font-size:15.5px;line-height:1.65}
.magra .mf-meta{display:flex;gap:24px;margin-bottom:28px;flex-wrap:wrap}
.magra .mf-meta div{border-left:2px solid var(--oro);padding-left:12px}
.magra .mf-meta-k{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--gris)}
.magra .mf-meta-v{font-size:24px;color:var(--crema);margin-top:2px}
.magra .mf-price-add{display:flex;align-items:center;gap:20px;flex-wrap:wrap}
.magra .mf-price{font-size:38px;color:var(--crema)}
.magra .mf-price small{font-size:14px;color:var(--gris);font-family:var(--f-body)}
.magra .mf-fe-visual{position:relative;aspect-ratio:4/5;border-radius:6px;overflow:hidden;background:var(--negro)}
.magra .mf-fe-img{width:100%;height:100%;object-fit:cover}
.magra .mf-fe-fallback{width:100%;height:100%;background:radial-gradient(70% 60% at 50% 40%,var(--sangre),#2a1210 70%,var(--negro))}
.magra .mf-fe-lbl{position:absolute;left:16px;bottom:16px;z-index:3;font-size:34px;color:var(--crema);letter-spacing:.04em;text-shadow:0 2px 20px #000;text-transform:uppercase}
.magra .mf-price-tag{position:absolute;top:16px;right:16px;background:var(--carbon);color:var(--oro);font-size:22px;padding:6px 14px;border-radius:3px;z-index:3;border:1px solid rgba(197,174,134,.4)}

/* STEPPER */
.magra .mf-stepper{display:flex;align-items:center;gap:8px}
.magra .mf-stepper button{width:44px;height:44px;border-radius:8px;border:1px solid rgba(242,230,215,.24);background:transparent;color:var(--crema);cursor:pointer;font-size:20px;line-height:1;display:grid;place-items:center;transition:.15s}
.magra .mf-stepper button:hover:not(:disabled){border-color:var(--oro);color:var(--oro)}
.magra .mf-stepper button:disabled{opacity:.4;cursor:not-allowed}
.magra .mf-stepper .mf-q{font-size:19px;min-width:44px;text-align:center;color:var(--crema)}
.magra .mf-stepper-sm button{width:40px;height:40px;font-size:18px}
.magra .mf-stepper-sm .mf-q{font-size:17px;min-width:36px}

/* GRID */
.magra .mf-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(14px,2vw,26px)}
@media(max-width:820px){.magra .mf-grid{grid-template-columns:1fr 1fr}}
@media(max-width:520px){.magra .mf-grid{grid-template-columns:1fr}}
.magra .mf-pcard{position:relative;border-radius:8px;overflow:hidden;background:var(--negro);border:1px solid rgba(242,230,215,.08);display:flex;flex-direction:column}
.magra .mf-pcard.on{box-shadow:0 0 0 1.5px var(--oro)}
.magra .mf-pcard-img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block}
.magra .mf-pcard-fallback{width:100%;aspect-ratio:4/3;background:radial-gradient(70% 60% at 50% 40%,var(--sangre),#2a1210 70%,var(--negro))}
.magra .mf-pcard-body{padding:16px 18px 18px;display:flex;flex-direction:column;gap:12px}
.magra .mf-pcard-h3{font-size:26px;color:var(--crema);letter-spacing:.02em;line-height:.94;text-transform:uppercase}
.magra .mf-pcard-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.magra .mf-pcard-pr{font-size:23px;color:var(--oro)}
.magra .mf-pcard-pr small{font-size:12px;color:var(--gris);font-family:var(--f-body);margin-left:3px}

/* VACIO */
.magra .mf-vacio{display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(16px,2.5vw,28px)}
@media(max-width:820px){.magra .mf-vacio{grid-template-columns:1fr}}
.magra .mf-vcard{border-radius:8px;overflow:hidden;background:var(--negro);border:1px solid rgba(242,230,215,.08)}
.magra .mf-vcard-img{width:100%;aspect-ratio:16/11;object-fit:cover;display:block}
.magra .mf-vcard-body{padding:22px}
.magra .mf-vcard-h3{font-size:26px;color:var(--crema);text-transform:uppercase;margin-bottom:8px}
.magra .mf-vcard-p{color:var(--acero);font-size:14.5px;line-height:1.55;margin-bottom:14px}
.magra .mf-linkcta{background:none;border:none;padding:0;color:var(--oro);font-family:var(--f-body);font-weight:700;font-size:14px;cursor:pointer;display:inline-flex;align-items:center;min-height:28px}
.magra .mf-linkcta:hover{color:var(--oro-hi)}

/* GOURMET */
.magra .mf-gourmet{display:grid;grid-template-columns:repeat(4,1fr);gap:clamp(14px,2vw,22px)}
@media(max-width:820px){.magra .mf-gourmet{grid-template-columns:1fr 1fr}}
.magra .mf-gcard{border-radius:8px;overflow:hidden;background:var(--negro);border:1px solid rgba(242,230,215,.08)}
.magra .mf-gcard-img{width:100%;aspect-ratio:1/1;object-fit:cover;display:block}
.magra .mf-gcard-name{padding:14px 16px;font-weight:700;font-size:14.5px;color:var(--crema);line-height:1.35}

/* PROVIDERS */
.magra .mf-providers-sec{padding-top:0}
.magra .mf-providers-lead{color:var(--acero);margin-bottom:16px}
.magra .mf-providers{display:flex;flex-wrap:wrap;gap:14px 32px;align-items:center}
.magra .mf-provider{font-size:24px;letter-spacing:.04em;color:var(--acero);text-transform:uppercase;opacity:.9}

/* QUOTES */
.magra .mf-quotes{padding:clamp(56px,9vh,120px) clamp(18px,4vw,56px);border-top:1px solid rgba(242,230,215,.1)}
.magra .mf-reviews{display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(20px,3vw,40px)}
@media(max-width:820px){.magra .mf-reviews{grid-template-columns:1fr}}
.magra .mf-review{margin:0;background:linear-gradient(180deg,#211f1c,#171613);border:1px solid rgba(242,230,215,.09);border-radius:10px;padding:26px 24px}
.magra .mf-stars{color:var(--oro);letter-spacing:3px;font-size:15px;margin-bottom:14px}
.magra .mf-review-t{font-weight:500;font-size:17px;line-height:1.5;color:var(--crema);margin:0 0 16px}
.magra .mf-review-t em{color:var(--oro);font-style:italic}
.magra .mf-review-who{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--gris)}

/* ABOUT */
.magra .mf-about{background:var(--negro);padding:clamp(56px,10vh,130px) clamp(18px,4vw,56px)}
.magra .mf-oro-rule{width:48px;height:3px;background:var(--oro);margin-bottom:22px}
.magra .mf-about-h2{font-size:clamp(30px,5vw,58px);text-transform:uppercase;color:var(--crema);max-width:18ch;line-height:.98}
.magra .mf-about-p{margin-top:18px;font-size:16.5px;line-height:1.75;color:var(--acero);max-width:62ch}

/* FOOTER */
.magra .mf-foot{background:var(--negro);padding:clamp(48px,8vh,110px) clamp(18px,4vw,56px) 36px;border-top:1px solid rgba(242,230,215,.1)}
.magra .mf-foot-top{display:flex;justify-content:space-between;gap:34px;flex-wrap:wrap;align-items:flex-end;margin-bottom:52px}
.magra .mf-foot-big{font-size:clamp(42px,8vw,120px);color:var(--crema);text-transform:uppercase;line-height:.84}
.magra .mf-foot-big span{color:var(--oro)}
.magra .mf-foot-cols{display:grid;grid-template-columns:repeat(4,1fr);gap:30px;border-top:1px solid rgba(242,230,215,.1);padding-top:32px}
@media(max-width:760px){.magra .mf-foot-cols{grid-template-columns:1fr 1fr}}
@media(max-width:440px){.magra .mf-foot-cols{grid-template-columns:1fr}}
.magra .mf-foot-cols h4{font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--oro);margin-bottom:14px}
.magra .mf-foot-cols p,.magra .mf-foot-cols a{font-size:13.5px;color:var(--acero);display:block;margin-bottom:6px;line-height:1.5}
.magra .mf-foot-cols a{text-decoration:underline;text-underline-offset:3px;padding:5px 0;min-height:24px}
.magra .mf-foot-cols a:hover{color:var(--oro)}
.magra .mf-foot-legal{margin-top:40px;padding-top:20px;border-top:1px solid rgba(242,230,215,.08);font-size:12px;color:var(--gris);display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;align-items:center}
.magra .mf-admin{color:var(--acero);opacity:.85;text-decoration:underline;text-underline-offset:3px;font-size:12px;display:inline-flex;align-items:center;min-height:24px;padding:3px 0}
.magra .mf-admin:hover{color:var(--oro);opacity:1}

/* EMPTY */
.magra .mf-empty{background:var(--negro);border:1px solid rgba(242,230,215,.1);border-radius:12px;padding:34px 24px;text-align:center}
.magra .mf-empty-t{font-weight:700;font-size:17px;color:var(--crema)}
.magra .mf-empty-s{margin:8px auto 18px;color:var(--acero);font-size:14px;max-width:46ch;line-height:1.55}

/* RAIL */
.magra .mf-rail{position:sticky;top:0;height:100vh;overflow-y:auto;background:linear-gradient(180deg,#141412,#0b0b0a);border-left:1px solid rgba(197,174,134,.22);display:flex;flex-direction:column;z-index:40}
.magra .mf-rail-form{display:flex;flex-direction:column;flex:1}
.magra .mf-rail-head{padding:24px 22px 16px;border-bottom:1px solid rgba(242,230,215,.08)}
/* En desktop el riel es sticky top:0 bajo el top-bar fijo → despejar su altura para que
   "Mi bolsa" y el primer ítem no queden tapados por el header. */
@media(min-width:1081px){.magra .mf-rail-head{padding-top:88px}}
.magra .mf-rail-head .mf-eyebrow{display:block;margin-bottom:8px}
.magra .mf-rail-t{font-size:32px;color:var(--crema);letter-spacing:.03em;display:flex;align-items:center;justify-content:space-between}
.magra .mf-cnt{font-size:14px;font-family:var(--f-body);font-weight:700;background:var(--oro);color:var(--carbon);border-radius:20px;padding:3px 11px;min-width:28px;text-align:center}
.magra .mf-rail-items{padding:6px 0}
.magra .mf-rail-empty{padding:26px 22px;color:var(--acero);font-size:13.5px;line-height:1.5}
.magra .mf-ri{display:flex;align-items:flex-start;gap:12px;padding:14px 22px;border-bottom:1px solid rgba(242,230,215,.06)}
.magra .mf-ri-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:7px}
.magra .mf-ri-nm{font-size:14px;color:var(--crema);font-weight:600}
.magra .mf-ri-qt{font-size:12px;color:var(--acero)}
.magra .mf-ri-amt{font-size:19px;color:var(--oro);white-space:nowrap}
.magra .mf-rail-foot{padding:18px 22px 22px;border-top:1px solid rgba(242,230,215,.1);background:rgba(0,0,0,.32)}
.magra .mf-totrow{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px}
.magra .mf-totrow .mf-k{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--acero)}
.magra .mf-totrow.mf-big .mf-k{color:var(--crema);font-weight:700}
.magra .mf-totrow .mf-v{font-size:20px;color:var(--crema)}
.magra .mf-totrow.mf-big .mf-v{font-size:34px;color:var(--oro)}
.magra .mf-free{color:var(--oro)}
.magra .mf-checkout{display:grid;gap:10px;margin:16px 0 4px}
.magra .mf-field{display:grid;gap:5px;font-size:12px;color:var(--acero)}
.magra .mf-field span{letter-spacing:.02em}
.magra .mf-field input,.magra .mf-field select{border:1px solid rgba(242,230,215,.22);background:#0e0e0c;color:var(--crema);border-radius:7px;padding:11px 12px;font-size:14px;font-family:var(--f-body);min-height:44px}
.magra .mf-field input::placeholder{color:#7d8288}
.magra .mf-field input:focus,.magra .mf-field select:focus{outline:2px solid var(--oro);outline-offset:1px;border-color:var(--oro)}
.magra .mf-rail-muted{font-size:11.5px;color:var(--gris);margin:12px 0 14px;line-height:1.5}
.magra .mf-rail-submit{width:100%;margin-bottom:10px}
.magra .mf-rail-wa{width:100%}
@media(max-width:1080px){
  .magra .mf-rail{position:static;height:auto;border-left:none;border-top:1px solid rgba(197,174,134,.3)}
  .magra .mf-rail-items{max-height:none}
}

/* MINI-BAR (móvil) */
.magra .mf-minibar{display:none}
@media(max-width:1080px){
  .magra .mf-minibar{position:fixed;left:0;right:0;bottom:0;z-index:70;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 18px;background:var(--oro);color:var(--carbon);box-shadow:0 -8px 24px rgba(0,0,0,.4)}
  .magra .mf-minibar-cnt{font-size:13px;font-weight:700}
  .magra .mf-minibar-total{font-size:24px}
  .magra .mf-minibar-go{margin-left:auto;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
}
`;
