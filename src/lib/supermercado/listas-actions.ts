"use server";

// ============================================================================
// ACCIÓN DE LISTAS DE PROVEEDORES — guardar la lista de precios que mandó un proveedor.
// ============================================================================
//
// La planilla se vuelve a leer ACÁ (no se confía en lo que leyó la pantalla) y el proveedor
// tiene que ser de este negocio. La lista vigente de cada proveedor queda como fila del registro
// de auditoría (config-repo.ts): quién la cargó y cuándo, y la anterior queda en el historial.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireAppAccion, AppNoDisponibleError } from "@/lib/require-app";
import { RechazoDeDominio } from "@/lib/rechazo-de-dominio";
import { todayInBusinessTz } from "@/lib/datetime";
import { Prisma } from "@/generated/prisma/client";
import { guardarListaDeProveedorEnTx } from "./config-repo";
import { leerPlanillaDeLista } from "./listas-proveedor";

export type EstadoLista = { ok: true; mensaje: string } | { ok: false; error: string };

export async function guardarListaDeProveedor(entrada: unknown): Promise<EstadoLista> {
  let user;
  try {
    user = await requireAppAccion("listas-de-proveedores");
  } catch (e) {
    if (e instanceof AppNoDisponibleError) return { ok: false, error: e.message };
    throw e;
  }
  const o = (entrada ?? {}) as Record<string, unknown>;
  const proveedorId = typeof o.proveedorId === "string" ? o.proveedorId.slice(0, 64) : "";
  const texto = typeof o.texto === "string" ? o.texto.slice(0, 1_000_000) : "";
  const vigenteDesde = typeof o.vigenteDesde === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.vigenteDesde) ? o.vigenteDesde : todayInBusinessTz();
  const versionLeida = typeof o.version === "string" && o.version ? o.version : null;
  if (!proveedorId) return { ok: false, error: "Elegí el proveedor de la lista." };
  const tenantId = await getCurrentTenantId();
  const proveedor = await prisma.supplier.findFirst({ where: { id: proveedorId, tenantId, active: true }, select: { id: true, name: true } });
  if (!proveedor) return { ok: false, error: "Ese proveedor no está en tu lista de proveedores: dalo de alta en Proveedores." };
  const lectura = leerPlanillaDeLista(texto);
  if (lectura.renglones.length === 0) {
    return { ok: false, error: "No se pudo leer ningún renglón. Pegá la lista con código, descripción y costo, una fila por producto." };
  }
  try {
    await tenantTransaction(
      (tx) => guardarListaDeProveedorEnTx(tx, tenantId, { proveedorId, renglones: lectura.renglones, vigenteDesde, actor: `user:${user.id}`, versionLeida }),
      { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (err) {
    if (err instanceof RechazoDeDominio) return { ok: false, error: err.message };
    throw err;
  }
  revalidatePath("/admin/compras/listas");
  revalidatePath("/admin/catalogo/precios");
  const n = lectura.renglones.length;
  return { ok: true, mensaje: `Se guardó la lista de ${proveedor.name}: ${n} ${n === 1 ? "producto" : "productos"}.` };
}
