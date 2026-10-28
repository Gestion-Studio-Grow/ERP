// FACTURITA · PDF de una factura, para mandársela al cliente. Vive bajo /facturita/app (portón de
// sesión del proxy) y pide el mismo permiso que la lista Y que el negocio sea de Facturita (mismo
// control que `requireTenantFacturita`); el lector sólo ve el negocio del pedido.
// Si el PDF no sale, el aviso dice qué falta EN FACTURITA y lleva a «Mi cuenta» o a «Mis facturas»,
// no a pantallas del backoffice que acá no existen.
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { tenantTransaction } from "@/lib/rls";
import { respuestaPdfDeComprobante } from "@/lib/comprobante-pdf-respuesta";
import { faltantePdfEnFacturita } from "@/lib/facturita-emisor";

export const dynamic = "force-dynamic";

export async function GET(_pedido: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();
  const tenant = await tenantTransaction(
    (tx) => tx.tenant.findUnique({ where: { id: tenantId }, select: { blueprintId: true } }),
    { tenantId },
  );
  if (tenant?.blueprintId !== "facturita") {
    return new Response("Esta descarga es del producto Facturita.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
    });
  }
  const { id } = await params;
  return respuestaPdfDeComprobante(id, tenantId, {
    texto: "Mis facturas",
    href: "/facturita/app/facturas",
    completarEmisor: { texto: "Completar en Mi cuenta", href: "/facturita/app/cuenta#datos-para-facturas" },
    reescribir: faltantePdfEnFacturita,
  });
}
