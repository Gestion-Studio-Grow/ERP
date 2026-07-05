"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { placeOnlineOrder } from "@/lib/order-actions";
import type { RetailWording } from "@/blueprints/retail";

// Base neutra premium compartida por todos los rubros. El COLOR de marca es el
// acento del tenant (var(--accent), inyectado por la página): CTAs, precios y hero.
const T = {
  bone: "#f4efe6", // superficie clara (hueso)
  bone2: "#e9e1d3", // bordes / superficie hundida
  ink: "#2a211c", // texto
  muted: "#6b5d52", // texto secundario
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
  whatsapp: string | null;
  instagram: string | null;
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
  products,
  accent,
}: {
  name: string;
  branding: Branding;
  wording: RetailWording;
  products: Product[];
  accent: string;
}) {
  // Carrito: productId → cantidad (kg si WEIGHT, unidades si UNIT).
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

  // Acento de marca del tenant como CSS var, para que CTAs/precios/hero lo tomen.
  const rootStyle = {
    background: T.bone,
    color: T.ink,
    minHeight: "100vh",
    fontFamily: "system-ui, sans-serif",
    ["--accent" as string]: accent,
  } as CSSProperties;

  return (
    <div style={rootStyle}>
      {/* Hero — fondo con el acento del tenant, texto claro */}
      <header style={{ background: "var(--accent)", color: T.bone }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px 48px" }}>
          <div style={{ letterSpacing: 3, fontSize: 12, textTransform: "uppercase", opacity: 0.85 }}>
            {branding?.shortLabel ?? name}
          </div>
          <h1 style={{ fontSize: 46, margin: "10px 0 6px", fontWeight: 800, letterSpacing: -1 }}>{name}</h1>
          <p style={{ opacity: 0.9, maxWidth: 580, lineHeight: 1.5 }}>
            {branding?.contactNote ?? wording.heroTagline}
          </p>
          <div style={{ marginTop: 14, display: "flex", gap: 16, fontSize: 13, opacity: 0.9, flexWrap: "wrap" }}>
            {branding?.city && <span>📍 {branding.city}</span>}
            {branding?.whatsapp && <span>📱 {branding.whatsapp}</span>}
            {branding?.instagram && <span>◎ {branding.instagram}</span>}
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24, display: "grid", gap: 24 }}>
        {/* Catálogo del rubro */}
        <section>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: "8px 0 16px" }}>{wording.catalogHeading}</h2>
          {products.length === 0 ? (
            <p style={{ color: T.muted }}>
              El catálogo todavía no tiene productos con precio. Cargalos en el catálogo del
              backoffice (o provisioná el tenant con su rubro).
            </p>
          ) : (
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))" }}>
              {products.map((p) => {
                const qty = cart[p.id] ?? 0;
                const isWeight = p.saleUnit === "WEIGHT";
                return (
                  <div
                    key={p.id}
                    style={{ background: "#fff", border: `1px solid ${T.bone2}`, borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</div>
                    <div style={{ color: "var(--accent)", fontWeight: 700 }}>
                      {money.format(unitPriceOf(p))}
                      <span style={{ color: T.muted, fontWeight: 500, fontSize: 13 }}>
                        {isWeight ? " / kg" : " / unidad"}
                      </span>
                    </div>
                    <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                      <button type="button" onClick={() => bump(p, -1)} aria-label="Quitar" style={btn(T.bone2, T.ink)}>
                        −
                      </button>
                      <span style={{ minWidth: 66, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                        {qty > 0 ? `${qty} ${isWeight ? "kg" : "u"}` : "—"}
                      </span>
                      <button type="button" onClick={() => bump(p, 1)} aria-label="Agregar" style={btn("var(--accent)", "#fff")}>
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Carrito + checkout */}
        <section style={{ background: "#fff", border: `1px solid ${T.bone2}`, borderRadius: 16, padding: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Tu pedido</h2>

          {!hasItems && <p style={{ color: T.muted }}>Elegí productos de arriba con los botones + / −.</p>}

          {hasItems && (
            <form action={placeOnlineOrder} style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gap: 6 }}>
                {lines.map((l) => (
                  <div key={l.p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                    <span>
                      {l.qty} {l.p.saleUnit === "WEIGHT" ? "kg" : "u"} · {l.p.name}
                    </span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{money2.format(l.total)}</span>
                    <input type="hidden" name="productId" value={l.p.id} />
                    <input type="hidden" name="quantity" value={l.qty} />
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${T.bone2}`, paddingTop: 8, fontWeight: 700 }}>
                  <span>Total estimado</span>
                  <span style={{ color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}>{money2.format(total)}</span>
                </div>
                {wording.weightNote && <p style={{ fontSize: 11, color: T.muted }}>* {wording.weightNote}</p>}
              </div>

              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                <label style={lbl}>
                  <span style={lblT}>Nombre *</span>
                  <input name="customerName" required style={inp} placeholder="Nombre y apellido" />
                </label>
                <label style={lbl}>
                  <span style={lblT}>Teléfono / WhatsApp *</span>
                  <input name="customerPhone" required style={inp} placeholder="11…" />
                </label>
                <label style={lbl}>
                  <span style={lblT}>Entrega</span>
                  <select
                    name="fulfillment"
                    value={fulfillment}
                    onChange={(e) => setFulfillment(e.target.value as "PICKUP" | "DELIVERY")}
                    style={inp}
                  >
                    <option value="PICKUP">Retiro en el local</option>
                    <option value="DELIVERY">Envío a domicilio</option>
                  </select>
                </label>
                {fulfillment === "DELIVERY" && (
                  <label style={lbl}>
                    <span style={lblT}>Dirección *</span>
                    <input name="address" required style={inp} placeholder="Calle, número, barrio" />
                  </label>
                )}
                <label style={{ ...lbl, gridColumn: "1 / -1" }}>
                  <span style={lblT}>Nota</span>
                  <input name="notes" style={inp} placeholder="ej: cómo lo querés preparado / talle / aclaraciones" />
                </label>
              </div>

              <button type="submit" style={{ ...btn("var(--accent)", "#fff"), height: 46, borderRadius: 12, fontWeight: 700, fontSize: 15 }}>
                {wording.orderCta}
              </button>
              <p style={{ fontSize: 11, color: T.muted, textAlign: "center" }}>
                Te contactamos para confirmar. El pago se coordina al retirar/recibir.
              </p>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

// --- estilos inline reutilizados ---
function btn(bg: string, color: string): CSSProperties {
  return { height: 34, minWidth: 34, padding: "0 12px", borderRadius: 9, border: "none", background: bg, color, fontWeight: 700, fontSize: 16, cursor: "pointer" };
}
const lbl: CSSProperties = { display: "grid", gap: 4, fontSize: 13 };
const lblT: CSSProperties = { color: "#6b5d52" };
const inp: CSSProperties = { border: "1px solid #e9e1d3", borderRadius: 9, padding: "9px 11px", fontSize: 14, background: "#fff", color: "#2a211c" };
