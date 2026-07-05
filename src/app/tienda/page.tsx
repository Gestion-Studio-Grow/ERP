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

import { getStorefront } from "@/lib/order-actions";
import { getTenantAccent } from "@/lib/branding";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import { getSiteReplica } from "@/tenants/site-replica";
import Storefront from "./Storefront";
import SiteReplica from "./SiteReplica";

export const dynamic = "force-dynamic";

// Vidriera del TENANT, resuelta por su config (branding + slug), dentro del multi-tenant:
// - Si el tenant tiene una réplica de su sitio propio (getSiteReplica), su vidriera ES esa
//   réplica (para clientes que ya tienen web hecha por una agencia — front de ellos, back
//   nuestro). NO es un clon suelto: se sirve como la vidriera de este tenant.
// - Si no, cae a la vidriera genérica del rubro (para clientes sin web).
// En ambos casos, el backoffice (pedidos/POS/stock/facturación) es el mismo, detrás.
export default async function TiendaPage() {
  const [data, accent, slug] = await Promise.all([getStorefront(), getTenantAccent(), getCurrentTenantSlug()]);
  const replica = getSiteReplica(slug);
  if (replica) {
    return <SiteReplica site={replica} name={data.name} branding={data.branding} products={data.products} accent={accent} />;
  }
  return (
    <Storefront
      name={data.name}
      branding={data.branding}
      wording={data.wording}
      copy={data.copy}
      products={data.products}
      accent={accent}
    />
  );
}
