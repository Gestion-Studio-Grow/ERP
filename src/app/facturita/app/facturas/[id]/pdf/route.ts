// FACTURITA · PDF de una factura, para mandársela al cliente. Vive bajo /facturita/app (portón de
// sesión del proxy) y pide el mismo permiso que la lista; el lector sólo ve el negocio del pedido.
// Si el PDF no sale, el aviso dice qué falta EN FACTURITA y lleva a «Mi cuenta» o a «Mis facturas»,
// no a pantallas del backoffice que acá no existen.
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { respuestaPdfDeComprobante } from "@/lib/comprobante-pdf-respuesta";
import { faltantePdfEnFacturita } from "@/lib/facturita-emisor";

export const dynamic = "force-dynamic";

export async function GET(_pedido: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  await requireCapability("billing:manage");
  const { id } = await params;
  return respuestaPdfDeComprobante(id, await getCurrentTenantId(), {
    texto: "Mis facturas",
    href: "/facturita/app/facturas",
    completarEmisor: { texto: "Completar en Mi cuenta", href: "/facturita/app/cuenta#datos-para-facturas" },
    reescribir: faltantePdfEnFacturita,
  });
}
