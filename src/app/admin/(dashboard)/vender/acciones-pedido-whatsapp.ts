"use server";

// ============================================================================
// PEDIDO DESDE WHATSAPP — la constancia de «Confirmar por WhatsApp» (Magra, tanda 2 · 2B · MG-053).
// ============================================================================
//
// El pedido se registra con `createOrder` (order-actions.ts), como cualquier pedido del mostrador:
// acá no se graba plata ni renglones. Lo único que suma esta acción es la CONSTANCIA de que se le
// mandó a la clienta el «te anotamos»: una fila de auditoría del pedido (action «whatsapp», como
// `registrarAvisoWhatsApp`) con su tipo propio, «pedido-confirmado», que no cuenta como «avisado
// que está listo» (`leerAvisados` lee sólo «pedido-listo»). El total que queda es el de la BASE,
// no el que mostró la pantalla.
//
// Es un endpoint ("use server"): pide `orders:manage` y acota por el negocio de la sesión; un id de
// otro negocio no encuentra nada y no deja fila. El mensaje sale igual por el WhatsApp del que
// atiende (wa.me): si la constancia falla, el aviso ya salió.

import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { auditAdmin } from "@/lib/audit-core";

const TIPO_PEDIDO_CONFIRMADO = "pedido-confirmado";

export async function registrarConfirmacionDeWhatsApp(orderId: string): Promise<void> {
  await requireCapability("orders:manage");
  const tenantId = await getCurrentTenantId();
  const id = String(orderId ?? "").trim().slice(0, 64);
  if (!id) return;
  const o = await prisma.order.findFirst({ where: { id, tenantId }, select: { code: true, total: true } });
  if (!o) return;
  await auditAdmin({
    action: "whatsapp",
    entity: "Order",
    entityId: id,
    changes: { tipo: TIPO_PEDIDO_CONFIRMADO, code: o.code, total: Number(o.total) },
  });
}
