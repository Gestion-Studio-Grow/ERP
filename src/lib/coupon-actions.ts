"use server";

// CUPONES — los carga la dueña (Promociones, o Catálogo en CH) y valen en tres lugares: al
// reservar un turno, en el mostrador (Vender) y en la tienda online. El control del máximo de
// usos va SIEMPRE en la transacción que los consume (turno: actions.ts; pedido: order-core.ts);
// acá sólo se cargan, se prenden y apagan, y se prueban sin consumir.

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auditAdmin, requestIp } from "@/lib/audit-core";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { leerImporte } from "@/lib/pos-peso";
import { businessWallTimeToUtc } from "@/lib/datetime";
import { nextDayKey } from "@/lib/caja/cierre-diario";
import { aplicarCupon, normalizarCodigoDeCupon, CODIGO_CUPON_MAX, type ResultadoCupon } from "@/lib/venta-reglas";
import { frenoDeCupones, CUPON_FRENADO } from "@/lib/order-core";

const CATALOG_PATH = "/admin/catalogo";
const PROMOCIONES_PATH = "/admin/promociones";

function revalidarCupones() {
  revalidatePath(CATALOG_PATH);
  revalidatePath(PROMOCIONES_PATH);
}

export async function getCoupons() {
  // Los cupones se listan dentro de la página de Catálogo (solo OWNER).
  await requireCapability("catalog:read");
  const tenantId = await getCurrentTenantId();
  return prisma.coupon.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
}

export async function createCoupon(formData: FormData) {
  await requireCapability("coupons:manage");
  const tenantId = await getCurrentTenantId();
  // Un código más largo que lo que se busca se rechaza, no se corta: cortado en silencio, la
  // dueña anunciaría uno y el sistema guardaría otro.
  const escrito = String(formData.get("code") ?? "").trim();
  if (escrito.length > CODIGO_CUPON_MAX) {
    throw new Error(`El código puede tener hasta ${CODIGO_CUPON_MAX} letras y números.`);
  }
  const code = normalizarCodigoDeCupon(escrito);
  const type = String(formData.get("type")) === "FIXED" ? "FIXED" : "PERCENT";
  // Con coma o con punto: "10,5" es diez y medio, como se escribe acá (antes `Number` daba NaN).
  const lectura = leerImporte(String(formData.get("value") ?? ""));
  const value = lectura.estado === "ok" ? lectura.valor : NaN;
  const expiresRaw = String(formData.get("expiresAt") || "").trim();
  const maxUsesRaw = String(formData.get("maxUses") || "").trim();
  const maxUses = maxUsesRaw ? Number(maxUsesRaw) : null;

  if (!code) throw new Error("El código no puede estar vacío.");
  if (!Number.isFinite(value) || value <= 0) throw new Error("El valor del descuento tiene que ser mayor a 0.");
  if (type === "PERCENT" && value > 100) throw new Error("Un descuento porcentual no puede superar el 100%.");
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) {
    throw new Error("El máximo de usos tiene que ser un número entero, de 1 para arriba.");
  }
  if (expiresRaw && !/^\d{4}-\d{2}-\d{2}$/.test(expiresRaw)) throw new Error("La fecha de vencimiento no es válida.");

  try {
    await prisma.coupon.create({
      data: {
        tenantId,
        code,
        type,
        value,
        // "Vence el 30/09" vale TODO el 30/09 en la hora del negocio. Antes se guardaba la
        // medianoche UTC de ese día, que en Argentina son las 21 del 29/09: el cupón se vencía
        // tres horas antes del día que decía la pantalla.
        expiresAt: expiresRaw ? new Date(businessWallTimeToUtc(nextDayKey(expiresRaw), "00:00").getTime() - 1) : null,
        maxUses,
      },
    });
  } catch (e) {
    if (isUniqueViolation(e, "code")) throw new Error(`Ya hay un cupón con el código ${code}.`);
    throw e;
  }
  await auditAdmin({ action: "create", entity: "Coupon", changes: { code, type, value, maxUses } });
  revalidarCupones();
}

// El `tenantId` va en el filtro (antes era `update`/`delete` por id y dependía sólo de RLS): con
// el flag de RLS apagado, un id de otro negocio prendía, apagaba o borraba un cupón ajeno.
export async function toggleCouponActive(formData: FormData) {
  await requireCapability("coupons:manage");
  const tenantId = await getCurrentTenantId();
  const id = String(formData.get("id"));
  const active = String(formData.get("active")) === "true";
  const r = await prisma.coupon.updateMany({ where: { id, tenantId }, data: { active: !active } });
  if (r.count === 1) {
    await auditAdmin({ action: "update", entity: "Coupon", entityId: id, changes: { active: !active } });
  }
  revalidarCupones();
}

export async function deleteCoupon(formData: FormData) {
  await requireCapability("coupons:manage");
  const tenantId = await getCurrentTenantId();
  const id = String(formData.get("id"));
  const r = await prisma.coupon.deleteMany({ where: { id, tenantId } });
  if (r.count === 1) await auditAdmin({ action: "delete", entity: "Coupon", entityId: id });
  revalidarCupones();
}

export type CouponCheck =
  | { ok: true; coupon: { code: string; type: "PERCENT" | "FIXED"; value: number }; discount: number }
  | { ok: false; reason: string };

// Valida un cupón contra un precio dado y devuelve el descuento resultante,
// SIN consumir un uso todavía — eso pasa recién al confirmar la reserva
// (bookAppointment), dentro de la misma transacción que crea el turno, para
// que dos personas no puedan gastar el último uso del mismo cupón a la vez.
export async function checkCoupon(code: string, price: number): Promise<CouponCheck> {
  const tenantId = await getCurrentTenantId();
  const normalized = code.trim().toUpperCase();
  if (!normalized) return { ok: false, reason: "Ingresá un código." };

  const coupon = await prisma.coupon.findUnique({ where: { tenantId_code: { tenantId, code: normalized } } });
  if (!coupon || !coupon.active) return { ok: false, reason: "Cupón inválido." };
  if (coupon.expiresAt && coupon.expiresAt < new Date()) return { ok: false, reason: "Este cupón ya venció." };
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
    return { ok: false, reason: "Este cupón ya alcanzó el máximo de usos." };
  }

  const discount = coupon.type === "PERCENT" ? Math.round(price * (coupon.value / 100)) : Math.min(coupon.value, price);
  return { ok: true, coupon: { code: coupon.code, type: coupon.type, value: coupon.value }, discount };
}

export type VistaPreviaCupon =
  | { ok: true; codigo: string; tipo: string; valor: number; descuento: number }
  | { ok: false; error: string };

/**
 * «Aplicar» el cupón en el mostrador o en la tienda: cuánto descontaría sobre `base` (lo que se
 * compra, sin el envío), con la MISMA regla que el alta (`aplicarCupon`). No consume un uso:
 * eso pasa al tomar el pedido, en su transacción, y ahí se vuelve a decidir con la base (este
 * número es una vista previa; la `base` la manda el navegador).
 *
 * Pública a propósito, como `checkCoupon`: la usa la tienda, sin sesión. Sólo contesta por un
 * código que ya se conoce; no lista cupones. Y con freno: 10 códigos inexistentes en 10 minutos
 * desde la misma IP y deja de contestar hasta que pase la ventana (`frenoDeCupones`).
 */
export async function probarCuponEnPedido(codigo: string, base: number): Promise<VistaPreviaCupon> {
  const tenantId = await getCurrentTenantId();
  const code = normalizarCodigoDeCupon(codigo);
  if (!code) return { ok: false, error: "Escribí el código del cupón." };
  // El freno de los códigos inexistentes (order-core.ts): va antes de leer, así un código
  // adivinado después del freno tampoco contesta.
  const ip = await requestIp();
  if (frenoDeCupones.frenado(tenantId, ip)) return { ok: false, error: CUPON_FRENADO };
  const c = await prisma.coupon.findFirst({
    where: { tenantId, code },
    select: { code: true, type: true, value: true, active: true, expiresAt: true, maxUses: true, usedCount: true },
  });
  if (!c) frenoDeCupones.inexistente(tenantId, ip);
  const r: ResultadoCupon = aplicarCupon({ cupon: c, base: Number.isFinite(base) ? base : 0, ahora: new Date() });
  if (!r.ok || !c) return r.ok ? { ok: false, error: "Ese cupón no existe o no está activo." } : r;
  // El tipo y el valor van para que la pantalla recalcule la vista previa cuando cambia la bolsa
  // (`montoDeCupon`). El servidor vuelve a decidir todo al tomar el pedido.
  return { ok: true, codigo: r.codigo, tipo: c.type, valor: c.value, descuento: r.descuento };
}
