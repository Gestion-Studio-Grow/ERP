// FACTURITA · PDF de una factura, para mandársela al cliente. Vive bajo /facturita/app (portón de
// sesión del proxy) y pide el mismo permiso que la lista; el lector sólo ve el negocio del pedido.
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { respuestaPdfDeComprobante } from "@/lib/comprobante-pdf-respuesta";

export const dynamic = "force-dynamic";

export async function GET(_pedido: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  await requireCapability("billing:manage");
  const { id } = await params;
  return respuestaPdfDeComprobante(id, await getCurrentTenantId(), "Mis facturas");
}
