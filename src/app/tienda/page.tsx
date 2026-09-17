// Vidriera pública por tenant — genérica del blueprint Retail/Mostrador. Reusa
// la capability POS/Orden del Core vía `placeOnlineOrder` (toma de pedido online →
// bandeja del backoffice) y `getStorefront` (catálogo + branding + wording del rubro).
//
// "Hecha para ese negocio": el COLOR de acento sale del tenant (getTenantAccent, la
// misma capa de marca por tenant del ERP: magra=oxblood) y el WORDING sale del rubro
// (carnicería→"Nuestros cortes", verdulería→"Frutas y verduras", …). La base neutra
// premium (superficies hueso, texto tinta) es igual para todos los rubros.
//
// Ruta propia fuera del grupo (site) del spa: no hereda su layout. El tenant se resuelve
// por request (ADR-018, por subdominio/slug) y su identidad —rubro y marca— sale de
// `getTenantIdentity()` (src/lib/identidad-rubro.ts): el RUBRO del dato del alta
// (`Tenant.blueprintId`) y la MARCA de la familia del slug. Importa con MAGRA abriendo 5
// locales, cada uno su propio tenant: `magra-lomas` es carnicería y es MAGRA sin que nadie
// tenga que agregar su slug a una lista.

import { cache } from "react";
import type { Metadata } from "next";
import { getStorefront } from "@/lib/order-actions";
import { getTenantAccent, tenantFaviconDataUri, brandForSlug, resolveTenantLayout } from "@/lib/branding";
import { tenantFidelityEnabled, tenantBrandSheetEnabled } from "@/lib/identity";
import { getBrandSheet, brandSheetAccent } from "@/lib/brand-sheet";
import { editorialFrontFor, getTenantIdentity } from "@/lib/identidad-rubro";
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
  const [data, accent, identity] = await Promise.all([loadStorefront(), loadAccent(), getTenantIdentity()]);
  const name = data.name;
  // SHINE: favicon = isotipo REAL de marca (manual), no las iniciales genéricas. Por MARCA
  // (identity.brandId), no por slug exacto: `shinevelas-demo` es la misma marca.
  const iconUri = identity.brandId === "shinevelas" ? "/tenants/shinevelas/brand/favicon.png" : tenantFaviconDataUri(tenantInitials(name), accent);
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
    icons: { icon: iconUri },
  };
}

// Vidriera del TENANT, resuelta por su config (branding + slug), dentro del multi-tenant:
// - Si el tenant tiene una réplica de su sitio propio (getSiteReplica), su vidriera ES esa
//   réplica (para clientes que ya tienen web hecha por una agencia — front de ellos, back
//   nuestro). NO es un clon suelto: se sirve como la vidriera de este tenant.
// - Si no, cae a la vidriera genérica del rubro (para clientes sin web).
// En ambos casos, el backoffice (pedidos/POS/stock/facturación) es el mismo, detrás.
export default async function TiendaPage() {
  const [data, accent, identity] = await Promise.all([loadStorefront(), loadAccent(), getTenantIdentity()]);
  const slug = identity.slug;
  const front = editorialFrontFor(identity);

  // Qué front editorial se sirve: por MARCA (identity.brandId = familia del slug), no por una
  // lista de slugs escritos a mano. Antes era `slug === "magra" || slug === "magra-demo"`: con
  // 5 locales, `magra-lomas` y sus hermanos no matcheaban y caían a la vidriera genérica —
  // o peor, a la landing de estética de CH si además no eran retail (ver (site)/page.tsx).
  //
  // La marca NO puede salir de `blueprintId`: ése es el RUBRO. Otra carnicería también es
  // `carniceria` y no puede llevar el relato, los proveedores ni las reseñas de MAGRA.

  // MAGRA — front público editorial propio (ADR-072 §8, mockup aprobado). Rompe el molde
  // genérico: identidad real de MAGRA (carbón+hueso+oro, Bebas Neue, riel de pedido) con el
  // catálogo + carrito del ERP detrás. Se sirve DIRECTO — su piel es autocontenida (no depende
  // del theme del brand-sheet). Copy TEXTUAL autorizado (magra-content.ts) para lo editorial;
  // los datos del local (dirección/horarios/WhatsApp) viajan en `branding` (BusinessSettings).
  if (front === "magra") {
    return <MagraFront products={data.products} branding={data.branding} tenantKey={slug ?? "magra"} />;
  }

  // SHINE — front público editorial LUMINOSO propio (manual de marca Shine 2026). La
  // contracara de Magra: crema+burdeos+malva, serif delicada (Cormorant~The Seasons) +
  // Kumbh Sans, la LLAMA como isotipo. Rompe el molde genérico con la identidad real de
  // Shine + el catálogo/carrito del ERP detrás (placeOnlineOrder). Copy real (storefront.ts),
  // fotos de marca (public/tenants/shinevelas). Piel autocontenida (no depende del brand-sheet).
  if (front === "shinevelas" && data.copy) {
    return (
      <ShineFront
        products={data.products}
        branding={data.branding}
        copy={data.copy}
        imagery={resolveTenantLayout(brandForSlug(slug)).imagery ?? null}
        tenantKey={slug ?? "shinevelas"}
      />
    );
  }

  // VOCABULARIO de la vidriera genérica, del RUBRO DEL DATO. `getStorefront` lo resuelve por
  // slug (`retailWordingForSlug(tenant?.slug)`, en src/lib/order-actions.ts), así que una
  // carnicería cuyo slug no esté en el mapa
  // —el caso de cualquier cliente nuevo que no se llame magra/shinevelas/adosmanos— decía
  // "Nuestros productos" y "producto" en vez de "La selección" y "corte". La palabra ajena en
  // la pantalla le dice al cliente que el sistema no es para él. Acá ya tenemos el rubro leído
  // del tenant, así que gana ése; si el tenant no es retail, queda lo que vino.
  const wording = identity.rubro?.wording ?? data.wording;

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
      wording={wording}
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
