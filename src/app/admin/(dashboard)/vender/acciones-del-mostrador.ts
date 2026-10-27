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
//     lo que se cobra. Desde la tanda perf la pantalla la pide AL SUMAR el renglón, no al cobrar.
//   · `cobrarDelMostrador` (sólo el mostrador boutique): el cobro en UN viaje. Controla el precio
//     que se ve (`precioVisto`) contra la base y, si es el mismo, cobra con `createOrder` (que no
//     cambia: idempotencia, caja, frontera del día). Si cambió, no graba nada y devuelve el de
//     ahora. Las reglas, puras, en `boutique/precio-del-renglon.ts`.

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
import { createOrder, type OrderActionState } from "@/lib/order-actions";
import { avisoDeCambioDePrecio, type CambioDePrecio } from "./reglas-venta";
import {
  CAMPO_PRECIO_VISTO,
  avisoDePrecioAlGrabar,
  cambiosContraLoVisto,
  cambiosEnLoCobrado,
  cobradoPorProducto,
  leerPreciosVistos,
} from "./boutique/precio-del-renglon";

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

/**
 * El cobro frenado porque el precio que se veía ya no es el de la base. No se grabó nada con esta
 * clave: `vigentes` trae el precio de ahora para que la pantalla lo muestre y se cobre con él.
 */
export type CobroFrenadoPorPrecio = {
  ok: false;
  tipo: "precio-cambio";
  error: string;
  vigentes: Record<string, PrecioVigente>;
  cambios: CambioDePrecio[];
};
export type CobroDelMostrador = OrderActionState | CobroFrenadoPorPrecio;

/**
 * El cobro del mostrador boutique en UN viaje: controla el precio visto y cobra (MG-048 sin la
 * consulta previa). Sin `precioVisto` (registrar sin cobrar, reintento de un cobro en duda) es
 * `createOrder` tal cual. El negocio sale SIEMPRE de la sesión; el precio que se graba, de la base.
 */
export async function cobrarDelMostrador(formData: FormData): Promise<CobroDelMostrador> {
  await requireCapability("orders:manage");
  if (!(formData instanceof FormData)) return { ok: false, error: "No llegó la venta: recargá la página y probá de nuevo." };
  const vistos = leerPreciosVistos(formData.getAll(CAMPO_PRECIO_VISTO));
  // `createOrder` recibe el formulario de siempre (la firma del reintento no ve este campo).
  formData.delete(CAMPO_PRECIO_VISTO);
  if (vistos.size === 0) return createOrder(formData);

  const tenantId = await getCurrentTenantId();
  const enBase = await prisma.product.findMany({
    where: { tenantId, id: { in: [...vistos.keys()] }, deletedAt: null, active: true },
    select: { id: true, name: true, saleUnit: true, price: true, pricePerKg: true },
  });
  const cambios = cambiosContraLoVisto(vistos, enBase);
  if (cambios.length > 0) {
    // ¿Ya hay una venta con esta clave? Entonces es un reintento de una grabada: la contesta
    // `createOrder` (la compara con lo grabado), no se frena por el precio de hoy.
    const clave = String(formData.get("idempotencyKey") || "").trim();
    const yaGrabada = clave
      ? await prisma.order.findFirst({ where: { tenantId, idempotencyKey: clave }, select: { id: true } })
      : null;
    if (!yaGrabada) {
      return {
        ok: false,
        tipo: "precio-cambio",
        error: avisoDeCambioDePrecio(cambios),
        vigentes: Object.fromEntries(enBase.map((p) => [p.id, { price: p.price, pricePerKg: p.pricePerKg }])),
        cambios,
      };
    }
    return createOrder(formData);
  }

  const r = await createOrder(formData);
  if (!r || !r.ok || r.yaEstaba || !r.venta) return r;
  // El precio cambió en el instante entre el control y el alta: la venta quedó con el de la base
  // (nunca uno viejo), y se dice. Sin otra lectura si las líneas se reconocen por nombre.
  let cobrado = cobradoPorProducto(r.venta.lineas, enBase);
  if (cobrado === null) {
    const items = await prisma.orderItem.findMany({
      where: { tenantId, orderId: r.venta.id, productId: { in: [...vistos.keys()] } },
      select: { productId: true, unitPrice: true },
    });
    cobrado = items.flatMap((i) => (i.productId ? [{ productId: i.productId, precio: i.unitPrice }] : []));
  }
  const tarde = cambiosEnLoCobrado(cobrado, vistos, enBase);
  if (tarde.length === 0) return r;
  logger.warn("vender.precio", "el precio cambió entre el control y el alta; la venta quedó con el de la base", {
    orderId: r.venta.id,
    productos: tarde.map((c) => c.id),
  });
  return { ...r, mensaje: [r.mensaje, avisoDePrecioAlGrabar(tarde)].filter(Boolean).join(" ") };
}
