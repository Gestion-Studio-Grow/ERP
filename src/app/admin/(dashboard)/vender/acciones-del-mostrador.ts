"use server";

// ============================================================================
// VENDER · ACCIONES DEL MOSTRADOR NUEVO (Magra tanda 2 · 2A) — teclas fijadas y precios al día.
// ============================================================================
//
// Dos acciones chicas, con el negocio SIEMPRE de la sesión (nunca de lo que manda la pantalla):
//
//   · `fijarTeclasDelMostrador`: el dueño elige las teclas que quiere tener siempre a mano. Exige
//     `orders:manage` (es Vender) y además `catalog:manage` (sólo el dueño ordena el mostrador). Se
//     guarda en AuditLog con control de versión (src/lib/vender/teclas-fijadas.ts), en una
//     transacción serializable con RLS. Devuelve el error, no lo tira: Next redacta lo lanzado.
//   · `preciosVigentesDelTicket`: el precio de HOY de los productos del ticket, para que la
//     pantalla diga «Subió a $X recién» ANTES de cobrar en vez de cobrar un precio que no muestra
//     (MG-048). Sólo lee, filtra por `tenantId`, no trae borrados y acepta hasta 100 ids. El
//     servidor igual cobra con el catálogo de la base al grabar: esto es para que lo que se ve sea
//     lo que se cobra.

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { roleHasCapability } from "@/lib/capabilities";
import { motivoMostrable } from "@/lib/rechazo-de-dominio";
import { esConflictoDeEscritura } from "@/lib/conflicto-de-escritura";
import { logger } from "@/lib/logger";
import { CAMBIO_MIENTRAS_MIRABAS_TECLAS, guardarTeclasFijadasEnTx } from "@/lib/vender/teclas-fijadas";

export type EstadoTeclasFijadas = { ok: true; version: string; ids: string[] } | { ok: false; error: string };

/** El dueño guarda las teclas fijadas de Vender (la lista entera, con la versión que leyó). */
export async function fijarTeclasDelMostrador(entrada: unknown): Promise<EstadoTeclasFijadas> {
  const user = await requireCapability("orders:manage");
  if (!roleHasCapability(user.role, "catalog:manage")) {
    return { ok: false, error: "Las teclas fijas las elige el dueño del negocio." };
  }
  const o = (entrada ?? {}) as { ids?: unknown; version?: unknown };
  const versionLeida = typeof o.version === "string" && o.version ? o.version : null;
  const tenantId = await getCurrentTenantId();
  try {
    const r = await tenantTransaction(
      (tx) => guardarTeclasFijadasEnTx(tx, tenantId, { ids: o.ids, actor: `user:${user.id}`, versionLeida }),
      { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    revalidatePath("/admin/vender");
    return { ok: true, version: r.version!, ids: r.ids };
  } catch (e) {
    const m = motivoMostrable(e);
    if (m !== null) return { ok: false, error: m };
    if (esConflictoDeEscritura(e)) return { ok: false, error: CAMBIO_MIENTRAS_MIRABAS_TECLAS };
    logger.error("vender.teclas", "no se pudieron guardar las teclas fijadas", e);
    return { ok: false, error: "No pudimos guardar las teclas. Probá de nuevo en un rato; si sigue, avisale a Gestión Studio Grow." };
  }
}

export type PrecioVigente = { price: number | null; pricePerKg: number | null };

/** El precio de hoy de los productos del ticket (sólo los de ESTE negocio, no borrados ni pausados). */
export async function preciosVigentesDelTicket(ids: unknown): Promise<Record<string, PrecioVigente>> {
  await requireCapability("orders:manage");
  const pedidos = Array.isArray(ids)
    ? [...new Set(ids.filter((x): x is string => typeof x === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(x)))].slice(0, 100)
    : [];
  if (pedidos.length === 0) return {};
  const tenantId = await getCurrentTenantId();
  const filas = await prisma.product.findMany({
    where: { tenantId, id: { in: pedidos }, deletedAt: null, active: true },
    select: { id: true, price: true, pricePerKg: true },
  });
  return Object.fromEntries(filas.map((f) => [f.id, { price: f.price, pricePerKg: f.pricePerKg }]));
}
