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
import Storefront from "./Storefront";

export const dynamic = "force-dynamic";

export default async function TiendaPage() {
  const [data, accent] = await Promise.all([getStorefront(), getTenantAccent()]);
  return <Storefront {...data} accent={accent} />;
}
