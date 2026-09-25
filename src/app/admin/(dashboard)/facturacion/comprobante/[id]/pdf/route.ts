// Descarga del PDF de un comprobante (R3-F1). Mismas guardias que la vista: la app y el permiso
// de facturar antes de leer, y el lector único que sólo ve comprobantes del negocio del pedido.
// Si falta un dato obligatorio no hay PDF: responde qué falta, en castellano, para que se pueda seguir.
import { requireApp } from "@/lib/require-app";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { leerComprobanteImpreso } from "@/lib/comprobante-pdf-datos";
import { generarComprobantePdf } from "@/lib/comprobante-pdf";

export const dynamic = "force-dynamic";

function aviso(estado: number, texto: string): Response {
  return new Response(texto, {
    status: estado,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}

export async function GET(_pedido: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  await requireApp("facturacion");
  await requireCapability("billing:manage");
  const { id } = await params;
  const datos = await leerComprobanteImpreso(id, await getCurrentTenantId());
  if (!datos) return aviso(404, "No encontramos ese comprobante en tu negocio. Volvé a Facturación y elegilo de la lista.");

  const r = await generarComprobantePdf(datos);
  if (!r.ok) {
    return aviso(409, ["Todavía no se puede descargar este comprobante. Falta:", ...r.faltantes.map((f) => `- ${f.mensaje}`)].join("\n"));
  }
  return new Response(new Uint8Array(r.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${r.nombreArchivo}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
