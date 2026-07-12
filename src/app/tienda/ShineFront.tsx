"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { placeOnlineOrder } from "@/lib/order-actions";
import { WhatsAppCtaProvider, useWhatsAppCta } from "@/components/whatsapp-cta";
import type { StorefrontCopy } from "@/tenants/storefront";
import type { TenantImagery } from "@/lib/tenant-layout";

// ── VIDRIERA SHINE — front público editorial LUMINOSO (manual de marca Shine 2026).
// "Que tu luz nunca se apague": velas aromáticas + aromas + deco. Es la CONTRACARA de
// MagraFront (que es oscuro/carbón): Shine es LUZ — crema #f3ebe1 + burdeos #671128 +
// malva, serif delicada (Cormorant ~ The Seasons del manual) + Kumbh Sans (la del manual).
// La LLAMA es el isotipo/alma: vive en el logo, el hero (halo cálido) y los divisores.
// No es el molde genérico: identidad real de Shine con el catálogo + carrito del ERP
// detrás (placeOnlineOrder → bandeja/POS/stock). Copy real de src/tenants/storefront.ts;
// fotos de marca en public/tenants/shinevelas. Técnicas: next/image (hero priority),
// reveal-on-scroll (IntersectionObserver + prefers-reduced-motion), AA, mobile-first.

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
  copy: StorefrontCopy;
  imagery: TenantImagery | null;
  tenantKey: string;
};

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const unitPrice = (p: Product) => (p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price) ?? 0;

// Reveal-on-scroll: fade + rise cuando el elemento entra en viewport. Respeta
// prefers-reduced-motion (muestra directo). Un solo observer compartido por instancia.
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
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
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, cls: shown ? "sh-rise sh-in" : "sh-rise" };
}

function Reveal({ children, as = "div", className = "" }: { children: ReactNode; as?: "div" | "section" | "li"; className?: string }) {
  const { ref, cls } = useReveal<HTMLDivElement>();
  const Tag = as as "div";
  return (
    <Tag ref={ref} className={`${cls} ${className}`.trim()}>
      {children}
    </Tag>
  );
}

// Isotipo de marca: la LLAMA. Cuerpo de fuego (teardrop) + núcleo claro + halo cálido.
// Parpadeo sutil (flicker) desactivado con prefers-reduced-motion vía CSS.
function Flame({ size = 22, glow = false, className = "" }: { size?: number; glow?: boolean; className?: string }) {
  return (
    <span className={`sh-flame ${glow ? "sh-flame-glow" : ""} ${className}`.trim()} style={{ width: size, height: size * 1.4 }} aria-hidden>
      <svg viewBox="0 0 24 34" width={size} height={size * 1.4} fill="none">
        <path d="M12 1c1.6 5 6.8 7.2 6.8 14.2 0 6-4 10.8-6.8 10.8s-6.8-4.8-6.8-10.8C5.2 8.9 9.9 7 12 1Z" fill="var(--sh-flame-outer)" />
        <path d="M12 9c1 3 3.6 4.3 3.6 8.4 0 3.6-2.1 6.4-3.6 6.4s-3.6-2.8-3.6-6.4C8.4 13.6 10.7 12 12 9Z" fill="var(--sh-flame-inner)" />
      </svg>
    </span>
  );
}

export default function ShineFront({ products, branding, copy, imagery, tenantKey }: Props) {
  const configured = branding?.whatsapp ?? null;
  return (
    <WhatsAppCtaProvider tenantKey={tenantKey} configuredNumber={configured}>
      <ShineContent products={products} copy={copy} imagery={imagery} />
    </WhatsAppCtaProvider>
  );
}

function ShineContent({ products, copy, imagery }: { products: Product[]; copy: StorefrontCopy; imagery: TenantImagery | null }) {
  const { requestWhatsApp } = useWhatsAppCta();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [fulfillment, setFulfillment] = useState<"PICKUP" | "DELIVERY">("DELIVERY");
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

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

  // Envío: fijo + umbral de envío gratis (del copy). Nudge "te faltan $X".
  const flat = copy.shipping?.flatRate ?? 0;
  const freeAt = copy.shipping?.freeThreshold ?? 0;
  const shipFree = freeAt > 0 && subtotal >= freeAt;
  const shipCost = !hasItems ? 0 : shipFree ? 0 : flat;
  const missingForFree = freeAt > 0 && subtotal > 0 && subtotal < freeAt ? freeAt - subtotal : 0;
  const total = subtotal + shipCost;

  const mundos = copy.vacioLines ?? [];
  const heroImg = imagery?.heroImage ?? null;
  const ambiance = imagery?.ambianceImage ?? null;
  const giftImg = imagery?.giftImage ?? null;

  const waCart =
    `¡Hola Shine! Quiero este pedido:\n` +
    lines.map((l) => `• ${l.q} × ${l.p.name}`).join("\n") +
    `\nEntrega: ${fulfillment === "PICKUP" ? "retiro" : "envío a domicilio"}` +
    `\nTotal estimado: ${money.format(total)}`;

  return (
    <div className="shine">
      <style>{CSS}</style>

      {/* ── TOP BAR ── */}
      <header className="sh-top">
        <a href="#top" className="sh-brand" aria-label="Shine · velas, aromas y deco">
          <Flame size={18} glow />
          <span className="sh-logo">Shine</span>
          <small>velas · aromas · deco</small>
        </a>
        <nav className="sh-nav" aria-label="Secciones">
          <a href="#mundos">Mundos</a>
          <a href="#ritual">Ritual</a>
          <a href="#coleccion">Colección</a>
          <a href="#regalos">Regalos</a>
        </nav>
        <a className="sh-btn sh-btn-vino sh-top-cta" href="#coleccion">Ver la colección</a>
      </header>

      <div className="sh-shell" id="top">
        <main className="sh-main">
          {/* ── HERO ── */}
          <section className="sh-hero">
            <div className="sh-hero-visual">
              {heroImg ? (
                <Image src={heroImg} alt="Velas de soja encendidas creando un ambiente cálido" fill priority sizes="(max-width: 900px) 100vw, 52vw" className="sh-hero-img" />
              ) : (
                <div aria-hidden className="sh-hero-fallback" />
              )}
              <div aria-hidden className="sh-hero-veil" />
              <div aria-hidden className="sh-hero-halo" />
            </div>
            <div className="sh-hero-copy">
              <span className="sh-eyebrow">{copy.eyebrow}</span>
              <h1 className="sh-display sh-hero-h1">{copy.tagline}</h1>
              {copy.pitch && <p className="sh-hero-pitch">{copy.pitch}</p>}
              <p className="sh-lede">{copy.intro}</p>
              <div className="sh-cta-row">
                <a className="sh-btn sh-btn-vino" href="#coleccion">Ver la colección&nbsp;&nbsp;→</a>
                <button type="button" className="sh-btn sh-btn-ghost" onClick={() => requestWhatsApp("¡Hola Shine! Quería hacer una consulta.")}>
                  Escribinos
                </button>
              </div>
              <p className="sh-slogan"><Flame size={13} /> Que tu luz nunca se apague</p>
            </div>
          </section>

          {/* ── PROPUESTAS DE VALOR ── */}
          <section className="sh-values" aria-label="Por qué Shine">
            {copy.valueProps.map((v, i) => (
              <Reveal key={i} className="sh-value">
                <span aria-hidden className="sh-value-glyph">{v.icon}</span>
                <div className="sh-value-title">{v.title}</div>
                <div className="sh-value-text">{v.text}</div>
              </Reveal>
            ))}
          </section>

          {/* ── MUNDOS PARA TU CASA ── */}
          <section className="sh-sec" id="mundos">
            <Kicker n="01" t={copy.vacioTitle} />
            <div className="sh-mundos">
              {mundos.map((m, i) => {
                const img = m.section ? imagery?.sectionImages?.[m.section] ?? null : null;
                return (
                  <Reveal key={i} as="div" className="sh-mundo">
                    <a href="#coleccion" className="sh-mundo-a">
                      <div className="sh-mundo-visual">
                        {img ? (
                          <Image src={img} alt={m.title} fill sizes="(max-width: 900px) 50vw, 24vw" className="sh-mundo-img" />
                        ) : (
                          <div aria-hidden className="sh-mundo-fallback"><Flame size={30} glow /></div>
                        )}
                        <span className="sh-mundo-tag">{m.title}</span>
                      </div>
                      <p className="sh-mundo-text">{m.text}</p>
                      <span className="sh-mundo-link">Descubrir →</span>
                    </a>
                  </Reveal>
                );
              })}
            </div>
          </section>

          {/* ── ARMÁ TU RITUAL ── */}
          {copy.ritual && (
            <section className="sh-ritual" id="ritual">
              {ambiance && (
                <div className="sh-ritual-band" aria-hidden>
                  <Image src={ambiance} alt="" fill sizes="100vw" className="sh-ritual-img" />
                  <div className="sh-ritual-veil" />
                </div>
              )}
              <div className="sh-ritual-inner">
                <Reveal className="sh-ritual-head">
                  <span className="sh-eyebrow sh-eyebrow-light">Una experiencia, no un producto</span>
                  <h2 className="sh-display sh-ritual-h2">{copy.ritual.title}</h2>
                  <p className="sh-ritual-intro">{copy.ritual.intro}</p>
                </Reveal>
                <ol className="sh-steps">
                  {copy.ritual.steps.map((s, i) => (
                    <Reveal key={i} as="li" className="sh-step">
                      <span className="sh-step-n sh-display">{s.icon}</span>
                      <h3 className="sh-step-t">{s.title}</h3>
                      <p className="sh-step-p">{s.text}</p>
                    </Reveal>
                  ))}
                </ol>
              </div>
            </section>
          )}

          {/* ── COLECCIÓN (catálogo comprable) ── */}
          <section className="sh-sec" id="coleccion">
            <Kicker n="02" t="La colección · comprá online" />
            {products.length === 0 ? (
              <div className="sh-empty">
                <Flame size={34} glow />
                <p className="sh-empty-t">Estamos encendiendo la vidriera</p>
                <p className="sh-empty-s">En un rato vas a poder comprar online. Mientras tanto, escribinos y te armamos el pedido.</p>
                <button type="button" className="sh-btn sh-btn-wa" onClick={() => requestWhatsApp("¡Hola Shine! Quiero hacer un pedido.")}>
                  <WaIcon /> Pedir por WhatsApp
                </button>
              </div>
            ) : (
              <div className="sh-grid">
                {products.map((p) => {
                  const q = cart[p.id] ?? 0;
                  return (
                    <Reveal key={p.id} className={`sh-pcard${q > 0 ? " on" : ""}`}>
                      <div aria-hidden className="sh-pcard-visual">
                        <div className="sh-pcard-halo" style={haloStyle(p.name)} />
                        <Flame size={26} />
                      </div>
                      <div className="sh-pcard-body">
                        <h3 className="sh-pcard-h3">{p.name}</h3>
                        <div className="sh-pcard-row">
                          <span className="sh-pcard-pr sh-num">{money.format(unitPrice(p))}</span>
                          <div className="sh-stepper" role="group" aria-label={`Cantidad de ${p.name}`}>
                            <button type="button" onClick={() => bump(p, -1)} disabled={q === 0} aria-label={`Quitar ${p.name}`}>−</button>
                            <span className="sh-q sh-num" aria-live="polite">{q}</span>
                            <button type="button" onClick={() => bump(p, 1)} aria-label={`Agregar ${p.name}`}>+</button>
                          </div>
                        </div>
                      </div>
                    </Reveal>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── SETS DE REGALO ── */}
          {copy.giftSets && (
            <section className="sh-sec sh-gifts" id="regalos">
              <Kicker n="03" t={copy.giftSets.title} />
              {copy.giftSets.intro && <p className="sh-gifts-intro">{copy.giftSets.intro}</p>}
              <div className="sh-giftgrid">
                {giftImg && (
                  <Reveal className="sh-gift-hero">
                    <Image src={giftImg} alt="Set de regalo Shine" fill sizes="(max-width: 900px) 100vw, 40vw" className="sh-gift-img" />
                    <div className="sh-gift-hero-veil" aria-hidden />
                    <span className="sh-gift-hero-t sh-display">Para regalar<br />—o regalarte.</span>
                  </Reveal>
                )}
                <div className="sh-giftcards">
                  {copy.giftSets.sets.map((g, i) => (
                    <Reveal key={i} as="div" className="sh-giftcard">
                      <div className="sh-giftcard-top">
                        <h3 className="sh-giftcard-h3 sh-display">{g.name}</h3>
                        {g.note && <span className="sh-giftcard-note">{g.note}</span>}
                      </div>
                      <p className="sh-giftcard-items">{g.items}</p>
                      <div className="sh-giftcard-foot">
                        <span className="sh-giftcard-pr sh-num">{money.format(g.price ?? 0)}</span>
                        <button type="button" className="sh-linkcta" onClick={() => requestWhatsApp(`¡Hola Shine! Me interesa el ${g.name}.`)}>
                          Lo quiero →
                        </button>
                      </div>
                    </Reveal>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* ── AROMAS DE TEMPORADA ── */}
          {copy.gourmetItems.length > 0 && (
            <section className="sh-aromas">
              <Reveal className="sh-aromas-inner">
                <span className="sh-eyebrow">{copy.gourmetTitle}</span>
                <div className="sh-aromas-list">
                  {copy.gourmetItems.map((a, i) => (
                    <span key={i} className="sh-aroma sh-display">{a}</span>
                  ))}
                </div>
              </Reveal>
            </section>
          )}

          {/* ── ABOUT ── */}
          <section className="sh-about">
            <Reveal className="sh-about-inner">
              <Flame size={30} glow className="sh-about-flame" />
              <h2 className="sh-display sh-about-h2">{copy.about.title}</h2>
              <p className="sh-about-p">{copy.about.body}</p>
            </Reveal>
          </section>

          {/* ── FOOTER ── */}
          <footer className="sh-foot" id="contacto">
            <div className="sh-foot-top">
              <div className="sh-display sh-foot-big">Que tu luz<br /><span>nunca se apague.</span></div>
              <button type="button" className="sh-btn sh-btn-vino" onClick={() => requestWhatsApp("¡Hola Shine! Quería hacer un pedido.")}>
                Escribinos por WhatsApp →
              </button>
            </div>
            <div className="sh-foot-cols">
              <div>
                <h4>Envíos</h4>
                <p>{copy.deliveryZones.join(" · ")}</p>
                {copy.shipping && <p>Gratis desde {money.format(copy.shipping.freeThreshold ?? 0)}</p>}
              </div>
              <div>
                <h4>Medios de pago</h4>
                <p>{copy.paymentMethods.join(" · ")}</p>
              </div>
              <div>
                <h4>Contacto</h4>
                <button type="button" className="sh-foot-link" onClick={() => requestWhatsApp("¡Hola Shine!")}>WhatsApp</button>
              </div>
            </div>
            <div className="sh-foot-legal">
              <span>© {new Date().getFullYear()} Shine · Velas, aromas y deco</span>
              <Link href="/admin" className="sh-admin">Acceso administrador</Link>
            </div>
          </footer>
        </main>

        {/* ── RIEL DE PEDIDO ── */}
        <aside className="sh-rail" id="pedido" aria-label="Tu pedido">
          <div className="sh-rail-head">
            <span className="sh-eyebrow">Tu pedido</span>
            <div className="sh-rail-t sh-display">Tu bolsa <span className="sh-cnt" aria-live="polite">{count}</span></div>
          </div>
          <form action={placeOnlineOrder} className="sh-rail-form">
            <div className="sh-rail-items">
              {!hasItems && <p className="sh-rail-empty">Sumá productos con el botón + y armá tu ambiente.</p>}
              {lines.map((l) => (
                <div key={l.p.id} className="sh-ri">
                  <div className="sh-ri-info">
                    <div className="sh-ri-nm">{l.p.name}</div>
                    <div className="sh-ri-qt sh-num">{money.format(unitPrice(l.p))} / u</div>
                    <div className="sh-stepper sh-stepper-sm" role="group" aria-label={`Cantidad de ${l.p.name}`}>
                      <button type="button" onClick={() => bump(l.p, -1)} aria-label={`Quitar ${l.p.name}`}>−</button>
                      <span className="sh-q sh-num">{l.q}</span>
                      <button type="button" onClick={() => bump(l.p, 1)} aria-label={`Agregar ${l.p.name}`}>+</button>
                    </div>
                  </div>
                  <div className="sh-ri-amt sh-num">{money.format(l.t)}</div>
                  <input type="hidden" name="productId" value={l.p.id} />
                  <input type="hidden" name="quantity" value={l.q} />
                </div>
              ))}
            </div>
            <div className="sh-rail-foot">
              {missingForFree > 0 && (
                <p className="sh-nudge"><Flame size={13} /> Te faltan <b>{money.format(missingForFree)}</b> para el envío gratis</p>
              )}
              <div className="sh-totrow">
                <span className="sh-k">Subtotal</span>
                <span className="sh-v sh-num">{money.format(subtotal)}</span>
              </div>
              {copy.shipping && (
                <div className="sh-totrow">
                  <span className="sh-k">Envío</span>
                  <span className="sh-v sh-num">{!hasItems ? "—" : shipFree ? <b className="sh-free">Gratis</b> : money.format(shipCost)}</span>
                </div>
              )}
              <div className="sh-totrow sh-big">
                <span className="sh-k">Total</span>
                <span className="sh-v sh-num" aria-live="polite">{money.format(total)}</span>
              </div>

              {hasItems && (
                <div className="sh-checkout">
                  <label className="sh-field">
                    <span>Nombre y apellido *</span>
                    <input name="customerName" required autoComplete="name" placeholder="Tu nombre" />
                  </label>
                  <label className="sh-field">
                    <span>WhatsApp *</span>
                    <input name="customerPhone" required autoComplete="tel" inputMode="tel" placeholder="11 …" />
                  </label>
                  <label className="sh-field">
                    <span>Entrega</span>
                    <select name="fulfillment" value={fulfillment} onChange={(e) => setFulfillment(e.target.value as "PICKUP" | "DELIVERY")}>
                      <option value="DELIVERY">Envío a domicilio</option>
                      <option value="PICKUP">Retiro</option>
                    </select>
                  </label>
                  {fulfillment === "DELIVERY" && (
                    <label className="sh-field">
                      <span>Dirección *</span>
                      <input name="address" required autoComplete="street-address" placeholder="Calle, número, barrio" />
                    </label>
                  )}
                  <label className="sh-field">
                    <span>Nota (opcional)</span>
                    <input name="notes" placeholder="Aroma preferido, para regalo…" />
                  </label>
                </div>
              )}

              <p className="sh-rail-muted">Coordinamos el pago al confirmar: transferencia, tarjetas o Mercado Pago.</p>
              <button type="submit" className="sh-btn sh-btn-vino sh-rail-submit" disabled={!hasItems}>Enviar pedido</button>
              <button type="button" className="sh-btn sh-btn-wa sh-rail-wa" onClick={() => requestWhatsApp(hasItems ? waCart : "¡Hola Shine! Quiero hacer un pedido.")}>
                <WaIcon /> Pedir por WhatsApp
              </button>
            </div>
          </form>
        </aside>
      </div>

      {/* ── MINI-BAR MÓVIL ── */}
      {hasItems && (
        <a href="#pedido" className="sh-minibar">
          <span className="sh-minibar-cnt">{count} {count === 1 ? "producto" : "productos"}</span>
          <span className="sh-minibar-total sh-num">{money.format(total)}</span>
          <span className="sh-minibar-go">Finalizar →</span>
        </a>
      )}
    </div>
  );
}

// Halo determinístico por nombre (para productos sin foto): tinte cálido malva/nude/vino
// derivado del hash del nombre, así cada producto tiene su matiz estable pero de marca.
function haloStyle(name: string): CSSProperties {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const shift = h % 24; // 0..23 grados de variación dentro del rango cálido
  return { background: `radial-gradient(75% 70% at 50% 38%, hsl(${350 - shift} 40% 74%), hsl(${348 - shift} 34% 62%) 55%, hsl(${345 - shift} 44% 34%))` };
}

function Kicker({ n, t }: { n: string; t: string }) {
  return (
    <div className="sh-kicker">
      <Flame size={15} />
      <span className="sh-kicker-n sh-display">{n}</span>
      <span className="sh-kicker-l" />
      <span className="sh-kicker-t sh-display">{t}</span>
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

// ── CSS scopeado a `.shine` — piel luminosa de marca (manual Shine 2026) ──
const CSS = `
.shine{
  --crema:#f3ebe1;--papel:#fdf8f2;--blush:#e8d9d5;--nude:#d0aeac;--malva:#b88a89;
  --malva-d:#835c5b;--vino:#671128;--vino-hi:#7e1a35;--tinta:#3a2429;--bruma:#8a7570;--wa:#0b7a3b;
  --rail:360px;
  --f-display:var(--font-cormorant),'Cormorant Garamond',Georgia,serif;
  --f-body:var(--font-kumbh),system-ui,-apple-system,sans-serif;
  --sh-flame-outer:#c98a4e;--sh-flame-inner:#f6e2a8;
  --shadow-warm:0 18px 46px -22px rgba(103,17,40,.32);
  background:var(--crema);color:var(--tinta);font-family:var(--f-body);font-weight:400;line-height:1.55;
  -webkit-font-smoothing:antialiased;position:relative;overflow-x:hidden}
.shine *{box-sizing:border-box}
.shine .sh-display{font-family:var(--f-display);font-weight:500;letter-spacing:.005em;line-height:1.02}
.shine .sh-num{font-variant-numeric:tabular-nums;font-feature-settings:"tnum"}
.shine a{color:inherit;text-decoration:none}

/* Reveal */
.shine .sh-rise{opacity:1;transform:none}
@media(prefers-reduced-motion:no-preference){
  .shine .sh-rise{opacity:0;transform:translateY(18px);transition:opacity .7s ease,transform .7s cubic-bezier(.22,.61,.36,1)}
  .shine .sh-rise.sh-in{opacity:1;transform:none}
}

/* Llama */
.shine .sh-flame{position:relative;display:inline-flex;align-items:center;justify-content:center;flex:none}
.shine .sh-flame svg{position:relative;z-index:2}
.shine .sh-flame-glow::before{content:"";position:absolute;inset:-60% -80%;z-index:1;border-radius:50%;
  background:radial-gradient(50% 50% at 50% 55%,rgba(246,210,120,.62),rgba(201,138,78,.28) 45%,transparent 72%)}
/* La animación (flicker + glow) es OPT-IN: solo las llamas de acento (con glow) laten,
   y son POCAS y singulares (hero, about, nudge). Las llamas repetidas (tarjetas de
   producto, kickers) son estáticas → cero coste de compositing continuo en listas largas. */
@media(prefers-reduced-motion:no-preference){
  .shine .sh-flame-glow svg{animation:sh-flick 3.6s ease-in-out infinite;transform-origin:50% 85%}
  .shine .sh-flame-glow::before{animation:sh-glow 3.6s ease-in-out infinite}
}
@keyframes sh-flick{0%,100%{transform:scale(1) rotate(-.5deg)}50%{transform:scale(1.05,1.08) rotate(.5deg)}}
@keyframes sh-glow{0%,100%{opacity:.85}50%{opacity:1}}

/* Eyebrow */
.shine .sh-eyebrow{font-family:var(--f-body);font-weight:600;font-size:11px;letter-spacing:.34em;text-transform:uppercase;color:var(--vino)}
.shine .sh-eyebrow-light{color:var(--nude)}

/* Botones */
.shine .sh-btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;font-family:var(--f-body);font-weight:600;font-size:13px;letter-spacing:.08em;padding:14px 26px;min-height:48px;border-radius:999px;border:1px solid transparent;cursor:pointer;transition:.2s;text-align:center}
.shine .sh-btn-vino{background:var(--vino);color:#fff}
.shine .sh-btn-vino:hover{background:var(--vino-hi);transform:translateY(-2px);box-shadow:var(--shadow-warm)}
.shine .sh-btn-vino:disabled{opacity:.4;cursor:not-allowed;transform:none;box-shadow:none}
.shine .sh-btn-ghost{border-color:var(--malva);color:var(--malva-d);background:transparent}
.shine .sh-btn-ghost:hover{border-color:var(--vino);color:var(--vino);background:rgba(184,138,137,.1)}
.shine .sh-btn-wa{background:var(--wa);color:#fff}
.shine .sh-btn-wa:hover{background:#0a6935;transform:translateY(-2px)}

/* TOP BAR */
.shine .sh-top{position:fixed;top:0;left:0;right:0;z-index:60;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px clamp(16px,4vw,52px);background:linear-gradient(180deg,rgba(243,235,225,.92),rgba(243,235,225,.7) 65%,rgba(243,235,225,0));backdrop-filter:blur(8px)}
.shine .sh-brand{display:flex;align-items:baseline;gap:9px;min-width:0}
.shine .sh-brand .sh-flame{align-self:center}
.shine .sh-logo{font-family:var(--f-display);font-weight:600;font-size:30px;letter-spacing:.02em;color:var(--vino);line-height:1}
.shine .sh-brand small{font-size:9.5px;letter-spacing:.24em;color:var(--malva-d);text-transform:uppercase;white-space:nowrap}
.shine .sh-nav{display:flex;gap:26px;font-size:12.5px;letter-spacing:.06em;font-weight:500;color:var(--malva-d)}
.shine .sh-nav a{opacity:.9;transition:.2s;display:inline-flex;align-items:center;min-height:26px;border-bottom:1px solid transparent}
.shine .sh-nav a:hover{color:var(--vino);opacity:1;border-bottom-color:var(--vino)}
.shine .sh-top-cta{padding:10px 20px;min-height:42px;font-size:12.5px}
@media(max-width:940px){.shine .sh-nav{display:none}}
@media(max-width:560px){.shine .sh-top-cta{display:none}.shine .sh-brand small{display:none}}

/* SHELL + RAIL */
.shine .sh-shell{display:grid;grid-template-columns:minmax(0,1fr) var(--rail)}
@media(max-width:1080px){.shine .sh-shell{grid-template-columns:1fr}}
.shine .sh-main{min-width:0}

/* HERO */
.shine .sh-hero{position:relative;min-height:100vh;display:grid;grid-template-columns:.92fr 1.08fr;align-items:stretch}
@media(max-width:900px){.shine .sh-hero{grid-template-columns:1fr;min-height:auto}}
.shine .sh-hero-visual{position:relative;order:2;min-height:100vh;background:var(--blush)}
@media(max-width:900px){.shine .sh-hero-visual{order:1;min-height:56vh;aspect-ratio:4/3}}
.shine .sh-hero-img{object-fit:cover}
.shine .sh-hero-fallback{position:absolute;inset:0;background:radial-gradient(60% 55% at 55% 42%,var(--nude),var(--malva) 60%,var(--vino))}
.shine .sh-hero-veil{position:absolute;inset:0;background:linear-gradient(90deg,rgba(243,235,225,.9),rgba(243,235,225,.15) 30%,transparent 55%),linear-gradient(0deg,rgba(103,17,40,.16),transparent 40%)}
@media(max-width:900px){.shine .sh-hero-veil{background:linear-gradient(0deg,var(--crema),rgba(243,235,225,.1) 45%,transparent),linear-gradient(0deg,rgba(103,17,40,.14),transparent 50%)}}
.shine .sh-hero-halo{position:absolute;left:12%;top:38%;width:42%;height:42%;background:radial-gradient(50% 50% at 50% 50%,rgba(246,210,120,.4),transparent 70%);filter:blur(6px);pointer-events:none}
.shine .sh-hero-copy{order:1;position:relative;z-index:3;align-self:center;padding:120px clamp(20px,4vw,64px) 9vh;max-width:640px}
@media(max-width:900px){.shine .sh-hero-copy{order:2;padding:32px 22px 48px;margin-top:-8vh}}
.shine .sh-hero-h1{font-size:clamp(46px,7vw,88px);color:var(--vino);margin:18px 0 0;max-width:14ch;font-weight:500}
.shine .sh-hero-pitch{margin:18px 0 0;font-size:clamp(17px,2.4vw,21px);color:var(--malva-d);font-weight:500;max-width:34ch;line-height:1.4}
.shine .sh-lede{margin:20px 0 0;font-size:16px;line-height:1.7;color:var(--tinta);max-width:46ch}
.shine .sh-cta-row{display:flex;gap:13px;flex-wrap:wrap;align-items:center;margin-top:30px}
.shine .sh-slogan{display:inline-flex;align-items:center;gap:9px;margin-top:34px;font-family:var(--f-display);font-style:italic;font-size:19px;color:var(--malva-d);letter-spacing:.01em}

/* VALUES */
.shine .sh-values{display:grid;grid-template-columns:repeat(5,1fr);gap:clamp(16px,2.4vw,34px);padding:clamp(40px,6vh,72px) clamp(18px,4vw,64px);border-top:1px solid var(--blush);border-bottom:1px solid var(--blush);background:var(--papel)}
@media(max-width:900px){.shine .sh-values{grid-template-columns:1fr 1fr;gap:26px 22px}}
@media(max-width:460px){.shine .sh-values{grid-template-columns:1fr}}
.shine .sh-value-glyph{color:var(--malva);font-size:24px;line-height:1;display:block;margin-bottom:12px}
.shine .sh-value-title{font-weight:600;font-size:15px;margin-bottom:6px;color:var(--vino)}
.shine .sh-value-text{color:var(--malva-d);font-size:13.5px;line-height:1.55}

/* SECTIONS */
.shine .sh-sec{padding:clamp(56px,9vh,120px) clamp(18px,4vw,64px);position:relative}
.shine .sh-kicker{display:flex;align-items:center;gap:14px;margin-bottom:40px}
.shine .sh-kicker-n{font-size:18px;color:var(--malva);letter-spacing:.02em}
.shine .sh-kicker-l{height:1px;flex:0 0 46px;background:var(--nude)}
.shine .sh-kicker-t{font-size:clamp(26px,4vw,40px);color:var(--vino);font-weight:500}

/* MUNDOS */
.shine .sh-mundos{display:grid;grid-template-columns:repeat(4,1fr);gap:clamp(16px,2vw,26px)}
@media(max-width:900px){.shine .sh-mundos{grid-template-columns:1fr 1fr}}
@media(max-width:520px){.shine .sh-mundos{grid-template-columns:1fr}}
.shine .sh-mundo-a{display:block;height:100%}
.shine .sh-mundo-visual{position:relative;aspect-ratio:4/5;border-radius:14px;overflow:hidden;background:var(--blush);box-shadow:var(--shadow-warm)}
.shine .sh-mundo-img{object-fit:cover;transition:transform .6s cubic-bezier(.22,.61,.36,1)}
.shine .sh-mundo-a:hover .sh-mundo-img{transform:scale(1.05)}
.shine .sh-mundo-fallback{position:absolute;inset:0;display:grid;place-items:center;background:radial-gradient(70% 60% at 50% 40%,var(--nude),var(--malva) 65%,var(--vino))}
.shine .sh-mundo-tag{position:absolute;left:14px;bottom:14px;z-index:2;font-family:var(--f-display);font-weight:600;font-size:26px;color:#fff;text-shadow:0 2px 16px rgba(58,17,25,.6)}
.shine .sh-mundo-text{margin:16px 2px 0;font-size:14px;line-height:1.55;color:var(--malva-d)}
.shine .sh-mundo-link{display:inline-block;margin:12px 2px 0;font-size:13px;font-weight:600;color:var(--vino);letter-spacing:.02em}
.shine .sh-mundo-a:hover .sh-mundo-link{text-decoration:underline;text-underline-offset:3px}

/* RITUAL */
.shine .sh-ritual{position:relative;overflow:hidden;padding:clamp(64px,11vh,150px) clamp(18px,4vw,64px);color:#fff}
.shine .sh-ritual-band{position:absolute;inset:0;z-index:0}
.shine .sh-ritual-img{object-fit:cover}
.shine .sh-ritual-veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(58,17,25,.78),rgba(58,17,25,.62)),radial-gradient(60% 50% at 30% 30%,rgba(246,210,120,.2),transparent 60%)}
.shine .sh-ritual-inner{position:relative;z-index:1;max-width:1000px;margin:0 auto}
.shine .sh-ritual-head{text-align:center;max-width:640px;margin:0 auto 48px}
.shine .sh-ritual-h2{font-size:clamp(34px,5.5vw,60px);margin:14px 0 0;color:#fff;font-weight:500}
.shine .sh-ritual-intro{margin:16px auto 0;font-size:16.5px;line-height:1.65;color:rgba(255,255,255,.86);max-width:52ch}
.shine .sh-steps{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(20px,3vw,40px);counter-reset:none}
@media(max-width:820px){.shine .sh-steps{grid-template-columns:1fr;gap:24px}}
.shine .sh-step{background:rgba(253,248,242,.1);border:1px solid rgba(253,248,242,.22);border-radius:16px;padding:30px 26px;backdrop-filter:blur(3px)}
.shine .sh-step-n{display:grid;place-items:center;width:48px;height:48px;border-radius:50%;background:rgba(246,210,120,.2);color:#f6e2a8;font-size:24px;font-weight:600;margin-bottom:16px}
.shine .sh-step-t{font-size:19px;font-weight:600;color:#fff;margin:0 0 8px}
.shine .sh-step-p{font-size:14.5px;line-height:1.6;color:rgba(255,255,255,.82)}

/* COLECCIÓN grid */
.shine .sh-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:clamp(14px,2vw,24px)}
@media(max-width:980px){.shine .sh-grid{grid-template-columns:repeat(3,1fr)}}
@media(max-width:680px){.shine .sh-grid{grid-template-columns:1fr 1fr}}
@media(max-width:420px){.shine .sh-grid{grid-template-columns:1fr}}
.shine .sh-pcard{background:var(--papel);border:1px solid var(--blush);border-radius:16px;overflow:hidden;display:flex;flex-direction:column;transition:.25s}
.shine .sh-pcard:hover{transform:translateY(-3px);box-shadow:var(--shadow-warm);border-color:var(--nude)}
.shine .sh-pcard.on{border-color:var(--vino);box-shadow:0 0 0 1.5px var(--vino),var(--shadow-warm)}
.shine .sh-pcard-visual{position:relative;aspect-ratio:1/1;display:grid;place-items:center;overflow:hidden}
.shine .sh-pcard-halo{position:absolute;inset:0}
.shine .sh-pcard-body{padding:16px 18px 18px;display:flex;flex-direction:column;gap:12px;flex:1}
.shine .sh-pcard-h3{font-size:16px;font-weight:600;color:var(--tinta);line-height:1.3;margin:0}
.shine .sh-pcard-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto;flex-wrap:wrap}
.shine .sh-pcard-pr{font-size:19px;font-weight:600;color:var(--vino)}

/* STEPPER */
.shine .sh-stepper{display:flex;align-items:center;gap:6px}
.shine .sh-stepper button{width:40px;height:40px;border-radius:10px;border:1px solid var(--nude);background:var(--crema);color:var(--vino);cursor:pointer;font-size:19px;line-height:1;display:grid;place-items:center;transition:.15s}
.shine .sh-stepper button:hover:not(:disabled){background:var(--vino);color:#fff;border-color:var(--vino)}
.shine .sh-stepper button:disabled{opacity:.4;cursor:not-allowed}
.shine .sh-stepper .sh-q{font-size:16px;min-width:26px;text-align:center;color:var(--tinta);font-weight:600}
.shine .sh-stepper-sm button{width:36px;height:36px;font-size:17px}

/* EMPTY */
.shine .sh-empty{text-align:center;background:var(--papel);border:1px solid var(--blush);border-radius:18px;padding:44px 24px;display:flex;flex-direction:column;align-items:center;gap:8px}
.shine .sh-empty-t{font-family:var(--f-display);font-size:24px;color:var(--vino);margin-top:8px}
.shine .sh-empty-s{color:var(--malva-d);font-size:14.5px;max-width:44ch;line-height:1.55;margin-bottom:8px}

/* GIFTS */
.shine .sh-gifts{background:var(--papel);border-top:1px solid var(--blush)}
.shine .sh-gifts-intro{margin:-24px 0 34px;color:var(--malva-d);font-size:15.5px;max-width:52ch}
.shine .sh-giftgrid{display:grid;grid-template-columns:.9fr 1.1fr;gap:clamp(20px,3vw,44px);align-items:stretch}
@media(max-width:900px){.shine .sh-giftgrid{grid-template-columns:1fr}}
.shine .sh-gift-hero{position:relative;border-radius:18px;overflow:hidden;min-height:340px;background:var(--malva);box-shadow:var(--shadow-warm)}
.shine .sh-gift-img{object-fit:cover}
.shine .sh-gift-hero-veil{position:absolute;inset:0;background:linear-gradient(180deg,transparent 30%,rgba(58,17,25,.66))}
.shine .sh-gift-hero-t{position:absolute;left:26px;bottom:24px;z-index:2;font-size:34px;color:#fff;font-weight:600;line-height:1.05;text-shadow:0 2px 18px rgba(58,17,25,.5)}
.shine .sh-giftcards{display:flex;flex-direction:column;gap:16px}
.shine .sh-giftcard{background:var(--crema);border:1px solid var(--blush);border-radius:16px;padding:22px 24px;transition:.2s}
.shine .sh-giftcard:hover{border-color:var(--nude);box-shadow:var(--shadow-warm)}
.shine .sh-giftcard-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.shine .sh-giftcard-h3{font-size:24px;color:var(--vino);font-weight:600}
.shine .sh-giftcard-note{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;font-weight:600;color:var(--vino);background:var(--blush);padding:5px 11px;border-radius:999px}
.shine .sh-giftcard-items{margin:10px 0 16px;font-size:14.5px;line-height:1.55;color:var(--malva-d)}
.shine .sh-giftcard-foot{display:flex;align-items:center;justify-content:space-between;gap:12px}
.shine .sh-giftcard-pr{font-size:22px;font-weight:600;color:var(--tinta)}
.shine .sh-linkcta{background:none;border:none;padding:6px 0;color:var(--vino);font-family:var(--f-body);font-weight:600;font-size:14px;cursor:pointer;display:inline-flex;align-items:center;min-height:28px}
.shine .sh-linkcta:hover{color:var(--vino-hi);text-decoration:underline;text-underline-offset:3px}

/* AROMAS */
.shine .sh-aromas{padding:clamp(48px,7vh,90px) clamp(18px,4vw,64px);text-align:center}
.shine .sh-aromas .sh-eyebrow{display:block;margin-bottom:22px}
.shine .sh-aromas-list{display:flex;flex-wrap:wrap;justify-content:center;gap:14px 30px}
.shine .sh-aroma{font-size:clamp(22px,3.4vw,34px);color:var(--malva-d);font-style:italic;font-weight:500}
.shine .sh-aroma:not(:last-child)::after{content:"·";margin-left:30px;color:var(--nude);font-style:normal}

/* ABOUT */
.shine .sh-about{background:linear-gradient(180deg,var(--crema),var(--blush));padding:clamp(64px,11vh,140px) clamp(18px,4vw,64px);text-align:center}
.shine .sh-about-inner{max-width:60ch;margin:0 auto;display:flex;flex-direction:column;align-items:center}
.shine .sh-about-flame{margin-bottom:20px}
.shine .sh-about-h2{font-size:clamp(30px,5vw,54px);color:var(--vino);font-weight:500;line-height:1.08}
.shine .sh-about-p{margin-top:20px;font-size:17px;line-height:1.8;color:var(--tinta)}

/* FOOTER */
.shine .sh-foot{background:var(--vino);color:var(--crema);padding:clamp(52px,8vh,110px) clamp(18px,4vw,64px) 34px}
.shine .sh-foot-top{display:flex;justify-content:space-between;gap:30px;flex-wrap:wrap;align-items:flex-end;margin-bottom:48px}
.shine .sh-foot-big{font-size:clamp(38px,7vw,86px);color:#fff;line-height:1.02;font-weight:500}
.shine .sh-foot-big span{color:var(--nude);font-style:italic}
.shine .sh-foot-cols{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;border-top:1px solid rgba(243,235,225,.2);padding-top:34px}
@media(max-width:640px){.shine .sh-foot-cols{grid-template-columns:1fr}}
.shine .sh-foot-cols h4{font-size:10.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--nude);margin-bottom:12px}
.shine .sh-foot-cols p{font-size:14px;color:rgba(243,235,225,.86);line-height:1.6;margin-bottom:4px}
.shine .sh-foot-link{background:none;border:none;padding:5px 0;color:var(--crema);font-family:var(--f-body);font-size:14px;text-decoration:underline;text-underline-offset:3px;cursor:pointer;min-height:26px}
.shine .sh-foot-link:hover{color:#fff}
.shine .sh-foot-legal{margin-top:40px;padding-top:20px;border-top:1px solid rgba(243,235,225,.16);display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;align-items:center;font-size:12px;color:rgba(243,235,225,.66)}
.shine .sh-admin{color:rgba(243,235,225,.8);text-decoration:underline;text-underline-offset:3px;min-height:24px;display:inline-flex;align-items:center}
.shine .sh-admin:hover{color:#fff}

/* RAIL */
.shine .sh-rail{position:sticky;top:0;height:100vh;overflow-y:auto;background:var(--papel);border-left:1px solid var(--blush);display:flex;flex-direction:column;z-index:40}
.shine .sh-rail-form{display:flex;flex-direction:column;flex:1}
.shine .sh-rail-head{padding:24px 22px 16px;border-bottom:1px solid var(--blush)}
@media(min-width:1081px){.shine .sh-rail-head{padding-top:84px}}
.shine .sh-rail-head .sh-eyebrow{display:block;margin-bottom:8px}
.shine .sh-rail-t{font-size:28px;color:var(--vino);display:flex;align-items:center;justify-content:space-between;font-weight:600}
.shine .sh-cnt{font-size:13px;font-family:var(--f-body);font-weight:700;background:var(--vino);color:#fff;border-radius:999px;padding:3px 11px;min-width:26px;text-align:center}
.shine .sh-rail-items{padding:4px 0}
.shine .sh-rail-empty{padding:24px 22px;color:var(--malva-d);font-size:13.5px;line-height:1.5}
.shine .sh-ri{display:flex;align-items:flex-start;gap:12px;padding:14px 22px;border-bottom:1px solid var(--blush)}
.shine .sh-ri-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:7px}
.shine .sh-ri-nm{font-size:14px;color:var(--tinta);font-weight:600}
.shine .sh-ri-qt{font-size:12px;color:var(--malva-d)}
.shine .sh-ri-amt{font-size:16px;color:var(--vino);font-weight:600;white-space:nowrap}
.shine .sh-rail-foot{padding:16px 22px 22px;border-top:1px solid var(--blush);margin-top:auto}
.shine .sh-nudge{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--vino);background:var(--blush);border-radius:10px;padding:9px 12px;margin-bottom:14px;line-height:1.4}
.shine .sh-totrow{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px}
.shine .sh-totrow .sh-k{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--malva-d)}
.shine .sh-totrow.sh-big{margin-top:6px;padding-top:12px;border-top:1px solid var(--blush)}
.shine .sh-totrow.sh-big .sh-k{color:var(--vino);font-weight:700}
.shine .sh-totrow .sh-v{font-size:16px;color:var(--tinta);font-weight:600}
.shine .sh-totrow.sh-big .sh-v{font-size:26px;color:var(--vino)}
.shine .sh-free{color:var(--wa)}
.shine .sh-checkout{display:grid;gap:10px;margin:16px 0 4px}
.shine .sh-field{display:grid;gap:5px;font-size:12px;color:var(--malva-d)}
.shine .sh-field input,.shine .sh-field select{border:1px solid var(--nude);background:var(--crema);color:var(--tinta);border-radius:9px;padding:11px 12px;font-size:14px;font-family:var(--f-body);min-height:44px}
.shine .sh-field input::placeholder{color:var(--bruma)}
.shine .sh-field input:focus,.shine .sh-field select:focus{outline:2px solid var(--vino);outline-offset:1px;border-color:var(--vino)}
.shine .sh-rail-muted{font-size:11.5px;color:var(--bruma);margin:12px 0 14px;line-height:1.5}
.shine .sh-rail-submit{width:100%;margin-bottom:10px}
.shine .sh-rail-wa{width:100%}
@media(max-width:1080px){.shine .sh-rail{position:static;height:auto;border-left:none;border-top:1px solid var(--nude)}}

/* MINI-BAR móvil */
.shine .sh-minibar{display:none}
@media(max-width:1080px){
  .shine .sh-minibar{position:fixed;left:0;right:0;bottom:0;z-index:70;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 18px;background:var(--vino);color:#fff;box-shadow:0 -8px 24px rgba(58,17,25,.34)}
  .shine .sh-minibar-cnt{font-size:13px;font-weight:600}
  .shine .sh-minibar-total{font-size:20px;font-weight:600}
  .shine .sh-minibar-go{margin-left:auto;font-size:13px;font-weight:600;letter-spacing:.04em}
}

/* Foco visible AA global dentro del front */
.shine a:focus-visible,.shine button:focus-visible{outline:2px solid var(--vino);outline-offset:2px;border-radius:6px}
`;
