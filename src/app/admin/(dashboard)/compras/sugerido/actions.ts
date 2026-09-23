"use server";

// CONSTANCIA DEL PEDIDO — cuando se manda (o se copia) el pedido sugerido a un proveedor.
//
// WhatsApp va siempre 1 a 1 y con el texto armado, pero el envío en sí lo hace el teléfono:
// el sistema no puede saber si el mensaje salió. Lo que sí queda es la constancia de que se
// armó y se abrió para mandar, quién, a qué proveedor y con qué cantidades, en la auditoría
// del negocio. Es lo único que publica este archivo.
//
// "use server" publica cada export como endpoint: no recibe ningún tenantId (el negocio es el
// del request), exige la app y el proveedor tiene que ser del negocio.

import { unstable_rethrow } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auditAdmin } from "@/lib/audit-core";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireAppAccion } from "@/lib/require-app";

/** Lo que se deja escrito de cada línea. Se acota: es una constancia, no un documento. */
type LineaEnviada = { productId: string; cantidad: number };

const MAX_LINEAS = 200;

function lineasValidas(raw: unknown): LineaEnviada[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_LINEAS)
    .filter(
      (l): l is LineaEnviada =>
        !!l &&
        typeof (l as LineaEnviada).productId === "string" &&
        (l as LineaEnviada).productId.length <= 64 &&
        typeof (l as LineaEnviada).cantidad === "number" &&
        Number.isFinite((l as LineaEnviada).cantidad),
    )
    .map((l) => ({ productId: l.productId, cantidad: l.cantidad }));
}

export async function dejarConstanciaDelPedido(
  proveedorId: string | null,
  via: "whatsapp" | "copiado",
  lineas: LineaEnviada[],
): Promise<{ ok: boolean }> {
  try {
    const user = await requireAppAccion("sugerido-de-compra");
    const tenantId = await getCurrentTenantId();
    let proveedor: { id: string; name: string } | null = null;
    if (proveedorId) {
      proveedor = await prisma.supplier.findFirst({ where: { id: String(proveedorId), tenantId }, select: { id: true, name: true } });
      if (!proveedor) return { ok: false };
    }
    await auditAdmin({
      action: "pedido-a-proveedor",
      entity: "Supplier",
      entityId: proveedor?.id ?? null,
      changes: {
        via: via === "whatsapp" ? "whatsapp" : "copiado",
        proveedor: proveedor?.name ?? "sin proveedor habitual",
        lineas: lineasValidas(lineas),
        rol: user.role,
      },
    });
    return { ok: true };
  } catch (err) {
    unstable_rethrow(err);
    return { ok: false };
  }
}
