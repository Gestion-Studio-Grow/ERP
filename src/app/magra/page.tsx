// DEMO: réplica fiel de la web de MAGRA (magrameatmarket.com.ar) con NUESTRO backoffice
// detrás. Pitch para el segmento con agencia: "no te tocamos tu vidriera, te vendemos y
// adaptamos el backoffice". El front replica su sitio (contenido/imágenes reales,
// autorizado por el cliente); los pedidos entran a nuestro sistema vía placeOnlineOrder
// → bandeja /admin/pedidos (POS/stock/facturación).
//
// Provisional: hoy hay un solo tenant, así que lee el catálogo del tenant activo. Con
// resolución de tenant por request (ADR-018) se sirve por dominio.

import { getStorefront } from "@/lib/order-actions";
import { getTenantAccent } from "@/lib/branding";
import MagraReplica from "./MagraReplica";

export const dynamic = "force-dynamic";

export default async function MagraDemoPage() {
  const [{ branding, products }, accent] = await Promise.all([getStorefront(), getTenantAccent()]);
  return <MagraReplica branding={branding} products={products} accent={accent} />;
}
