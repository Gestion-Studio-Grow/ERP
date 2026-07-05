// Vidriera pública del tenant carnicería (`magra`). Consume la capability POS/Orden
// del Core vía `placeOnlineOrder` (toma de pedido online → cae a la bandeja del
// backoffice). Lee el catálogo del tenant actual con `getStorefront` (público).
//
// Ruta propia fuera del grupo (site) del spa: NO hereda el layout/branding de CH
// Estética. Marca premium magra (oxblood/hueso/latón) inline, self-contained, para
// que la demo local no dependa todavía del theming por tenant (pendiente).
//
// Provisional: hoy hay un solo tenant, así que muestra el catálogo del tenant
// activo. Cuando aterrice la resolución de tenant por request (ADR-018), esta misma
// página se sirve por subdominio/slug del tenant carnicería.

import { getStorefront } from "@/lib/order-actions";
import Storefront from "./Storefront";

export const dynamic = "force-dynamic";

export default async function CarniceriaPage() {
  const { name, branding, products } = await getStorefront();
  return <Storefront name={name} branding={branding} products={products} />;
}
