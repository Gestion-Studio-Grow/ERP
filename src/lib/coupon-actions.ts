"use server";

// CUPONES — los carga la dueña (Promociones, o Catálogo en CH) y valen en tres lugares: al
// reservar un turno, en el mostrador (Vender) y en la tienda online. El control del máximo de
// usos va SIEMPRE en la transacción que los consume (turno: actions.ts; pedido: order-core.ts);
// acá sólo se cargan, se prenden y apagan, y se prueban sin consumir.

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auditAdmin, requestIp } from "@/lib/audit-core";
import { getCurrentTenantId } from "@/lib/tenant";
import { canCurrentUser, requireCapability } from "@/lib/authz";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { leerImporte } from "@/lib/pos-peso";
import { businessWallTimeToUtc } from "@/lib/datetime";
import { nextDayKey } from "@/lib/caja/cierre-diario";
import { aplicarCupon, normalizarCodigoDeCupon, CODIGO_CUPON_MAX, CUPON_NO_VALE } from "@/lib/venta-reglas";
import { frenoDeCupones, probarCuponPublico, CUPON_FRENADO } from "@/lib/cupones/prueba-publica";

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
//
// Es la reserva PÚBLICA de CH: pasa por el freno y la regla única de cupones/prueba-publica.ts.
// Lo que ve la clienta, antes → después:
//   · código inexistente o apagado: "Cupón inválido." → igual;
//   · código vencido: "Este cupón ya venció." → "Cupón inválido.";
//   · código agotado: "Este cupón ya alcanzó el máximo de usos." → "Cupón inválido.";
//   · 10 intentos fallidos en 10 minutos desde la misma IP contra ESTE negocio (el freno cuenta
//     por negocio + IP): antes seguía contestando; ahora "Probaste muchos códigos seguidos.
//     Esperá unos minutos y volvé a intentar." (`CUPON_FRENADO`). Límite aceptado: las clientas
//     que reservan desde el wifi del salón comparten la IP y el cupo (ver `crearFrenoDeCupones`).
//   · cupón que vale pero no llega a descontar nada (en 0, o 5 % de $9 al peso): antes pasaba con
//     $0 y la reserva gastaba el uso; ahora "El cupón X no llega a descontar nada sobre $9,00." y
//     la reserva no lo gasta (ENG-109).
// Un cupón que descuenta se aplica con la cuenta de la reserva (`montoDeCupon`, camino "turno",
// al peso); lo único que cambia es el medio peso, que antes bajaba por error de binario y ahora
// sube (29 % de $750: $217 → $218), y el 100 %, que ahora deja el turno en cero (ENG-109).
export async function checkCoupon(code: string, price: number): Promise<CouponCheck> {
  const tenantId = await getCurrentTenantId();
  const normalized = String(code ?? "").trim().toUpperCase();
  if (!normalized) return { ok: false, reason: "Ingresá un código." };

  const prueba = await probarCuponPublico({
    freno: frenoDeCupones,
    tenantId,
    ip: await requestIp(),
    ahora: new Date(),
    leer: () => prisma.coupon.findUnique({ where: { tenantId_code: { tenantId, code: normalized } } }),
    // El freno y el texto único van por acá; el cupón en 0 (o que redondeado no descuenta nada)
    // lo rechaza abajo `aplicarCupon`, con el motivo, igual que la reserva (ENG-109).
    exigeDescuento: false,
  });
  if (!prueba.ok) return { ok: false, reason: prueba.motivo === "frenado" ? CUPON_FRENADO : "Cupón inválido." };
  const coupon = prueba.cupon;

  // La misma decisión que la reserva (`cuponDeLaReserva`, ENG-109): el % al peso, y un cupón que
  // no llega a descontar nada se avisa acá en vez de aplicarse en $0 y gastarse al reservar.
  const r = aplicarCupon({ cupon: coupon, base: price, ahora: new Date(), camino: "turno" });
  if (!r.ok) return { ok: false, reason: r.sinDescuento ? r.error : "Cupón inválido." };
  return { ok: true, coupon: { code: coupon.code, type: coupon.type, value: coupon.value }, discount: r.descuento };
}

export type VistaPreviaCupon =
  | { ok: true; codigo: string; tipo: string; valor: number; descuento: number }
  | { ok: false; error: string };

/**
 * «Aplicar» el cupón en la tienda: cuánto descontaría sobre `base` (lo que se compra, sin el
 * envío), con la MISMA regla que el alta (`aplicarCupon`). No consume un uso: eso pasa al tomar
 * el pedido, en su transacción, y ahí se vuelve a decidir con la base (este número es una
 * vista previa; la `base` la manda el navegador).
 *
 * Pública a propósito, como `checkCoupon`: la usa la tienda, sin sesión. Sólo contesta por un
 * código que ya se conoce; no lista cupones. Freno y respuesta única: cupones/prueba-publica.ts.
 *
 * La usa también Vender (el mostrador, `useCuponDePedido`). Con una sesión del negocio que puede
 * vender, contesta el motivo real ("venció el 30/09") y no pasa por el freno: la cajera necesita
 * el motivo para explicárselo al cliente, y sus errores de tipeo no pueden trabar la tienda que
 * sale por la misma IP del local.
 */
export async function probarCuponEnPedido(codigo: string, base: number): Promise<VistaPreviaCupon> {
  const tenantId = await getCurrentTenantId();
  const code = normalizarCodigoDeCupon(codigo);
  if (!code) return { ok: false, error: "Escribí el código del cupón." };
  const baseLeida = Number.isFinite(base) ? base : 0;
  const leer = () =>
    prisma.coupon.findFirst({
      where: { tenantId, code },
      select: { code: true, type: true, value: true, active: true, expiresAt: true, maxUses: true, usedCount: true },
    });

  if (await canCurrentUser("orders:manage")) {
    const c = await leer();
    const r = aplicarCupon({ cupon: c, base: baseLeida, ahora: new Date() });
    if (!r.ok || !c) return r.ok ? { ok: false, error: CUPON_NO_VALE } : r;
    return { ok: true, codigo: r.codigo, tipo: c.type, valor: c.value, descuento: r.descuento };
  }

  // Sin compra no se lee nada: si no, una bolsa vacía distinguiría un código bueno de uno malo
  // ("agregá algo" contra "no existe") sin sumar al freno.
  if (!(baseLeida > 0)) return { ok: false, error: "Agregá algo a la compra antes de usar el cupón." };
  const prueba = await probarCuponPublico({
    freno: frenoDeCupones,
    tenantId,
    ip: await requestIp(),
    ahora: new Date(),
    leer,
    exigeDescuento: true, // los pedidos: `aplicarCupon` ya exigía un descuento cargado
  });
  if (!prueba.ok) return { ok: false, error: prueba.motivo === "frenado" ? CUPON_FRENADO : CUPON_NO_VALE };
  const c = prueba.cupon;
  const r = aplicarCupon({ cupon: c, base: baseLeida, ahora: new Date() });
  // Con el cupón usable y la base positiva, `aplicarCupon` no rechaza; si algún día cambia, la
  // respuesta hacia afuera sigue siendo la única.
  // Si el cupón vale pero sobre esta bolsa no descuenta nada, se dice eso (no "no existe"): el
  // código ya pasó el freno y la prueba, no hay nada nuevo que revelar.
  if (!r.ok) return { ok: false, error: r.sinDescuento ? r.error : CUPON_NO_VALE };
  // El tipo y el valor van para que la pantalla recalcule la vista previa cuando cambia la bolsa
  // (`montoDeCupon`). El servidor vuelve a decidir todo al tomar el pedido.
  return { ok: true, codigo: r.codigo, tipo: c.type, valor: c.value, descuento: r.descuento };
}
