"use server";

// «Pedir a Soporte GSG» desde la ficha de un cliente (endpoint). Un solo export. Del navegador
// llegan SÓLO el cliente elegido y lo que se pide: el estudio, la persona y el permiso salen de la
// sesión, y el cliente se verifica contra la cartera del estudio antes de escribir nada. Un cliente
// que no es de la cartera recibe el mismo error que uno que no existe (no se filtra nada ajeno).

import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { basePrisma } from "@/lib/prisma-base";
import { tenantTransaction } from "@/lib/rls";
import { MODULO_CARTERA, exigirClienteDeCartera, type EstadoCartera, type FilaCarteraDb } from "@/lib/cartera-core";
import { decidirAcceso } from "@/lib/multilocal/multilocal-core";
import { respuestaDelPedido, validarPedido } from "./pedido-soporte";
import { guardarPedidoSoporte } from "./pedido-soporte.server";

export type ResultadoPedidoSoporte = { ok: true; mensaje: string } | { ok: false; error: string };

const NO_SE_PUDO = "No pudimos dejar el pedido. Probá de nuevo en un rato; si sigue, escribile a Soporte GSG.";

async function filaDeCartera(estudioTenantId: string, clienteTenantId: string): Promise<FilaCarteraDb | null> {
  const fila = await tenantTransaction(
    (tx) =>
      tx.carteraCliente.findUnique({
        where: { tenantId_clienteTenantId: { tenantId: estudioTenantId, clienteTenantId } },
        select: { id: true, clienteTenantId: true, alias: true, estado: true },
      }),
    { tenantId: estudioTenantId },
  );
  return fila ? { ...fila, estado: fila.estado as EstadoCartera } : null;
}

export async function pedirASoporteAction(input: {
  cliente: string;
  tipo: string;
  cuit?: string;
  nota?: string;
}): Promise<ResultadoPedidoSoporte> {
  const usuario = await requireCapability("cartera:manage");
  const estudioTenantId = await getCurrentTenantId();
  const estudio = await basePrisma.tenant.findUnique({ where: { id: estudioTenantId }, select: { modules: true } });
  if (!estudio?.modules?.includes(MODULO_CARTERA)) return { ok: false, error: "Tu negocio no tiene la cartera del estudio contable." };
  const acceso = decidirAcceso(estudio.modules, "estudio");
  if (!acceso.ok) return acceso;

  const clienteTenantId = typeof input?.cliente === "string" ? input.cliente.trim() : "";
  if (!clienteTenantId || clienteTenantId === estudioTenantId) return { ok: false, error: "Ese cliente no está en tu cartera." };
  const pertenencia = await exigirClienteDeCartera(filaDeCartera, estudioTenantId, clienteTenantId, { permitirPausada: true });
  if (!pertenencia.ok) return pertenencia;

  const v = validarPedido({ tipo: input.tipo, cuit: input.cuit, nota: input.nota });
  if (!v.ok) return v;

  try {
    const r = await guardarPedidoSoporte({
      estudioTenantId,
      actor: `user:${usuario.id}`,
      clienteTenantId,
      alias: pertenencia.fila.alias,
      pedido: v.pedido,
    });
    return { ok: true, mensaje: respuestaDelPedido(v.pedido.tipo, r.yaEstaba) };
  } catch (e) {
    // Sin datos del cliente en el log (ni CUIT ni nota): el estudio y el tipo de error.
    console.error("[cartera.pedido_soporte] no se pudo guardar", { estudioTenantId, error: e instanceof Error ? e.name : "desconocido" });
    return { ok: false, error: NO_SE_PUDO };
  }
}
