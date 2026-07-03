"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auditAdmin } from "@/lib/audit";
import { getCurrentTenantId } from "@/lib/tenant";

const CATALOG_PATH = "/admin/catalogo";

export async function getCoupons() {
  const tenantId = await getCurrentTenantId();
  return prisma.coupon.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
}

export async function createCoupon(formData: FormData) {
  const tenantId = await getCurrentTenantId();
  const code = String(formData.get("code") || "").trim().toUpperCase();
  const type = String(formData.get("type")) === "FIXED" ? "FIXED" : "PERCENT";
  const value = Number(formData.get("value"));
  const expiresRaw = String(formData.get("expiresAt") || "");
  const maxUsesRaw = String(formData.get("maxUses") || "").trim();

  if (!code) throw new Error("El código no puede estar vacío.");
  if (!Number.isFinite(value) || value <= 0) throw new Error("El valor del descuento tiene que ser mayor a 0.");
  if (type === "PERCENT" && value > 100) throw new Error("Un descuento porcentual no puede superar el 100%.");

  await prisma.coupon.create({
    data: {
      tenantId,
      code,
      type,
      value,
      expiresAt: expiresRaw ? new Date(expiresRaw) : null,
      maxUses: maxUsesRaw ? Number(maxUsesRaw) : null,
    },
  });
  await auditAdmin({ action: "create", entity: "Coupon", changes: { code, type, value } });
  revalidatePath(CATALOG_PATH);
}

export async function toggleCouponActive(formData: FormData) {
  const id = String(formData.get("id"));
  const active = String(formData.get("active")) === "true";
  await prisma.coupon.update({ where: { id }, data: { active: !active } });
  revalidatePath(CATALOG_PATH);
}

export async function deleteCoupon(formData: FormData) {
  const id = String(formData.get("id"));
  await prisma.coupon.delete({ where: { id } });
  await auditAdmin({ action: "delete", entity: "Coupon", entityId: id });
  revalidatePath(CATALOG_PATH);
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
