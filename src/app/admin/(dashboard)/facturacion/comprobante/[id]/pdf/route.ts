// Descarga del PDF de un comprobante (R3-F1). Mismas guardias que la vista: la app y el permiso
// de facturar antes de leer, y el lector único que sólo ve comprobantes del negocio del pedido.
// Si falta un dato obligatorio no hay PDF: responde qué falta, en castellano, para que se pueda seguir.
import { requireApp } from "@/lib/require-app";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { respuestaPdfDeComprobante } from "@/lib/comprobante-pdf-respuesta";

export const dynamic = "force-dynamic";

export async function GET(_pedido: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  await requireApp("facturacion");
  await requireCapability("billing:manage");
  const { id } = await params;
  return respuestaPdfDeComprobante(id, await getCurrentTenantId(), "Facturación");
}
