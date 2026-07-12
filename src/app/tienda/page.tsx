// Vidriera pública por tenant — genérica del blueprint Retail/Mostrador. Reusa
// la capability POS/Orden del Core vía `placeOnlineOrder` (toma de pedido online →
// bandeja del backoffice) y `getStorefront` (catálogo + branding + wording del rubro).
//
// "Hecha para ese negocio": el COLOR de acento sale del tenant (getTenantAccent, la
// misma capa de marca por tenant del ERP: magra=oxblood) y el WORDING sale del rubro
// (carnicería→"Nuestros cortes", verdulería→"Frutas y verduras", …). La base neutra
// premium (superficies hueso, texto tinta) es igual para todos los rubros.
//
// Ruta propia fuera del grupo (site) del spa: no hereda su layout. Provisional: hoy
// hay un solo tenant, así que muestra el del tenant activo; con resolución de tenant
// por request (ADR-018) se sirve por subdominio/slug del tenant.

import { cache } from "react";
import type { Metadata } from "next";
import { getStorefront } from "@/lib/order-actions";
import { getTenantAccent, tenantFaviconDataUri, brandForSlug, resolveTenantLayout } from "@/lib/branding";
import { tenantFidelityEnabled, tenantBrandSheetEnabled } from "@/lib/identity";
import { getBrandSheet, brandSheetAccent } from "@/lib/brand-sheet";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import type { CSSProperties } from "react";
import { getSiteReplica } from "@/tenants/site-replica";
import Storefront from "./Storefront";
import SiteReplica from "./SiteReplica";
import MagraFront from "./MagraFront";
import ShineFront from "./ShineFront";

export const dynamic = "force-dynamic";

// Una sola lectura del storefront/acento por request, compartida entre
// generateMetadata y el componente: React.cache dedupe la llamada en el mismo
// render (evita un 2º golpe a la DB — Neon plan free).
const loadStorefront = cache(getStorefront);
const loadAccent = cache(getTenantAccent);

// Iniciales del tenant para el monograma del favicon (1 palabra → 2 primeras
// letras; varias → iniciales). "Magra" → "MA", "Carne Feliz" → "CF".
function tenantInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const raw = words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "");
  return raw.slice(0, 2).toUpperCase() || "•";
}

// El favicon por tenant usa el mismo builder que el layout raíz
// (tenantFaviconDataUri), acá con las iniciales derivadas del nombre del
// storefront en vez del monograma del brand map. Antes la vidriera de cualquier
// tenant mostraba el ícono "CH" del layout raíz (p. ej. Magra, con el del spa).

// Metadata POR TENANT. Antes la vidriera heredaba el <title> del layout raíz
// ("CH Estética…"), así que el storefront de Magra decía "CH Estética" en la
// pestaña, al compartir en redes y en buscadores. Ahora sale del tenant.
export async function generateMetadata(): Promise<Metadata> {
  const [data, accent] = await Promise.all([loadStorefront(), loadAccent()]);
  const name = data.name;
  const suffix = data.copy?.tagline ?? data.branding?.city ?? null;
  const title = suffix ? `${name} · ${suffix}` : name;
  const raw =
    data.copy?.intro ??
    data.copy?.about?.body ??
    data.branding?.contactNote ??
    `Comprá online en ${name}${data.branding?.city ? `, ${data.branding.city}` : ""}.`;
  const description = raw.length > 160 ? `${raw.slice(0, 157)}…` : raw;
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    icons: { icon: tenantFaviconDataUri(tenantInitials(name), accent) },
  };
}

// Vidriera del TENANT, resuelta por su config (branding + slug), dentro del multi-tenant:
// - Si el tenant tiene una réplica de su sitio propio (getSiteReplica), su vidriera ES esa
//   réplica (para clientes que ya tienen web hecha por una agencia — front de ellos, back
//   nuestro). NO es un clon suelto: se sirve como la vidriera de este tenant.
// - Si no, cae a la vidriera genérica del rubro (para clientes sin web).
// En ambos casos, el backoffice (pedidos/POS/stock/facturación) es el mismo, detrás.
export default async function TiendaPage() {
  const [data, accent, slug] = await Promise.all([loadStorefront(), loadAccent(), getCurrentTenantSlug()]);

  // MAGRA — front público editorial propio (ADR-072 §8, mockup aprobado). Rompe el molde
  // genérico: identidad real de MAGRA (carbón+hueso+oro, Bebas Neue, riel de pedido) con el
  // catálogo + carrito del ERP detrás. Se resuelve por slug (`magra` en prod, `magra-demo` en
  // el seed de QA) y se sirve DIRECTO — su piel es autocontenida (no depende del theme del
  // brand-sheet). Copy TEXTUAL autorizado (magra-content.ts), imágenes generadas por IA.
  if (slug === "magra" || slug === "magra-demo") {
    return <MagraFront products={data.products} branding={data.branding} tenantKey={slug} />;
  }

  // SHINE — front público editorial LUMINOSO propio (manual de marca Shine 2026). La
  // contracara de Magra: crema+burdeos+malva, serif delicada (Cormorant~The Seasons) +
  // Kumbh Sans, la LLAMA como isotipo. Rompe el molde genérico con la identidad real de
  // Shine + el catálogo/carrito del ERP detrás (placeOnlineOrder). Copy real (storefront.ts),
  // fotos de marca (public/tenants/shinevelas). Piel autocontenida (no depende del brand-sheet).
  if (slug === "shinevelas" && data.copy) {
    return (
      <ShineFront
        products={data.products}
        branding={data.branding}
        copy={data.copy}
        imagery={resolveTenantLayout(brandForSlug(slug)).imagery ?? null}
        tenantKey={slug}
      />
    );
  }

  const replica = getSiteReplica(slug);
  // tenantKey namespacea el WhatsApp que un visitante complete cuando el tenant
  // no tiene su número real configurado (ver WhatsAppCtaProvider) — sin slug
  // (single-tenant/legacy) cae a un key fijo, sigue siendo estable por tenant.
  const tenantKey = slug ?? "default";

  // FICHA DE MARCA (RFC-004-D, frente A), detrás de `TENANT_BRAND_SHEET_ENABLED`: con el flag
  // ON, la vidriera se envuelve en la PIEL del tenant (theme pack por `data-brand` + tema +
  // acento de la ficha de la DB). Con el flag OFF → sin wrapper, tokens :root (byte-idéntico).
  const sheet = tenantBrandSheetEnabled() ? await getBrandSheet() : null;
  const skinAccent = sheet ? brandSheetAccent(sheet, sheet.frontTheme).accent : accent;

  const inner = replica ? (
    <SiteReplica site={replica} name={data.name} branding={data.branding} products={data.products} accent={skinAccent} tenantKey={tenantKey} />
  ) : (
    // FIDELIDAD DE LAYOUT (RFC-004-A §3), detrás de `TENANT_FIDELITY_ENABLED`: estructura real
    // del tenant (logo/banner/hero/orden) + logo asset. Con el flag OFF → molde de hoy.
    <Storefront
      name={data.name}
      branding={data.branding}
      wording={data.wording}
      copy={data.copy}
      products={data.products}
      accent={skinAccent}
      tenantKey={tenantKey}
      layout={resolveTenantLayout(brandForSlug(slug))}
      logoAsset={brandForSlug(slug).logoAsset ?? null}
      fidelity={tenantFidelityEnabled()}
    />
  );

  if (!sheet) return inner;
  return (
    <div data-theme={sheet.frontTheme} data-brand={sheet.themeId} style={{ "--accent": skinAccent } as CSSProperties}>
      {inner}
    </div>
  );
}
