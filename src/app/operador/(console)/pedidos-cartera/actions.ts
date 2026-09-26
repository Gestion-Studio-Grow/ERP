"use server";
// ============================================================================
// PEDIDOS DE LA CARTERA (Soporte GSG) — la única acción de la bandeja.
// ============================================================================
//
// "use server" publica cada export como endpoint: sólo esta, con FormData y la sesión de operador
// como primera línea (sin sesión → login de la consola). Primero va la guardia del negocio con el
// estudio que dice el formulario (candado de CH, trinquete de guardia-negocio.test.ts); después
// `resolverPedidoDeCartera` exige que el pedido sea de ESE estudio y vuelve a aplicar la guardia con
// el estudio y el cliente que lee de la base.

import { revalidatePath } from "next/cache";
import { operatorPrisma } from "@/lib/operator-db";
import { operadorParaNegocio } from "@/lib/operador/guardia-negocio";
import { resolverPedidoDeCartera } from "./pedidos-cartera.server";

export type ResultadoResolver = { ok: true } | { ok: false; error: string };

export async function resolverPedidoDeCarteraAction(_previo: ResultadoResolver | null, fd: FormData): Promise<ResultadoResolver> {
  const estudioTenantId = String(fd.get("estudioTenantId") ?? "").trim();
  const g = await operadorParaNegocio({ id: estudioTenantId });
  if (!g.ok) return { ok: false, error: g.motivo };
  const sesion = g.sesion;
  const pedidoId = String(fd.get("pedidoId") ?? "").trim();
  if (!pedidoId) return { ok: false, error: "Falta el pedido." };
  const r = await resolverPedidoDeCartera(operatorPrisma, {
    pedidoId,
    estudioTenantId,
    sesion,
    resultado: fd.get("resultado"),
    respuesta: fd.get("respuesta"),
  });
  if (r.ok) {
    revalidatePath("/operador/pedidos-cartera");
    revalidatePath("/contador");
  }
  return r;
}
