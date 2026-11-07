"use server";

// VOUCHERS · buscar el vecino al que se le da un lote. Misma búsqueda que el cliente de Vender
// (nombre, teléfono o documento, desde 3 caracteres), con la capability del alta del lote
// (`clients:manage`, la de `crearLote`) y el interruptor del negocio. Sesión y negocio se
// resuelven acá; nunca vienen del navegador.

import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { tenantTransaction } from "@/lib/rls";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { vouchersPrendidos } from "@/cambios/interruptores";
import { buscarClientesParaVentaEnTx, textoParaBuscar } from "@/lib/clientes/buscar-para-venta-core";

export type VecinoEncontrado = { id: string; nombre: string; detalle: string };

export async function buscarVecino(texto: string): Promise<VecinoEncontrado[]> {
  await requireCapability("clients:manage");
  if (!vouchersPrendidos(await interruptoresDelNegocio())) return [];
  if (!textoParaBuscar(texto).ok) return [];
  const tenantId = await getCurrentTenantId();
  const encontrados = await tenantTransaction((tx) => buscarClientesParaVentaEnTx(tx, tenantId, String(texto ?? "")), { tenantId });
  return encontrados.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    detalle: [c.telefono, c.docNro ? `doc. ${c.docNro}` : null].filter(Boolean).join(" · "),
  }));
}
