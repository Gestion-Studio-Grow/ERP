"use server";

// ============================================================================
// VOUCHERS · LIQUIDACIÓN DEL LUNES — Server Actions (CH Estética · administración de La Alameda).
// ============================================================================
//
// Cada acción: (1) capability `cash:manage` (es plata: la misma que abrir/cerrar/arquear la caja y
// que la liquidación de antes), (2) interruptor «vouchers» del negocio (apagado = rechazo, nada se
// escribe), (3) tenantId del request, (4) el repo con su transacción. Un rechazo de dominio vuelve
// como `{ ok:false, error }` con el mensaje tal cual; la tabla ausente (migración
// 20261108140000_voucher_liquidacion_semanal sin aplicar) vuelve como «falta un paso de base de datos».

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { isDemoSandbox } from "@/lib/demo-flag";
import { rechazoDeDominio } from "@/lib/rechazo-de-dominio";
import { isPrismaError } from "@/lib/prisma-errors";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { vouchersPrendidos } from "@/cambios/interruptores";
import { leerMonto, MENSAJES_VOUCHER } from "./voucher-core";
import { esMedioAdministracion } from "./liquidacion-core";
import {
  conciliarLiquidacionSemanal,
  descartarLiquidacion as descartarRepo,
  generarLiquidacionSemanal,
  registrarPagoACuenta,
  type LiquidacionGenerada,
  type ResultadoConciliacionSemanal,
} from "./liquidacion-repo";

export type ResultadoLiquidacionAccion<T> = { ok: true; valor: T } | { ok: false; error: string };

const MIGRACION_PENDIENTE =
  "La liquidación del lunes necesita un paso de base de datos que todavía no se aplicó. Cuando se aplique, se enciende sola.";
const NO_SE_PUDO = "No se pudo completar y no quedó nada a medias. Probá de nuevo; si sigue, avisá.";
const MODO_DEMO = "En la demo los vouchers no se guardan.";
const APAGADO = { ok: false as const, error: MENSAJES_VOUCHER.apagado };

function texto(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

function comoError(e: unknown, scope: string): { ok: false; error: string } {
  unstable_rethrow(e);
  if (isPrismaError(e, "P2021") || isPrismaError(e, "P2022")) return { ok: false, error: MIGRACION_PENDIENTE };
  return { ok: false, error: rechazoDeDominio(e, NO_SE_PUDO, scope) };
}

async function preparar(): Promise<{ actor: string; tenantId: string } | { ok: false; error: string }> {
  const user = await requireCapability("cash:manage");
  if (!vouchersPrendidos(await interruptoresDelNegocio())) return APAGADO;
  if (isDemoSandbox()) return { ok: false, error: MODO_DEMO };
  return { actor: `user:${user.id}`, tenantId: await getCurrentTenantId() };
}

function revalidar(liquidacionId?: string) {
  revalidatePath("/admin/vouchers");
  if (liquidacionId) revalidatePath(`/admin/vouchers/liquidacion/${liquidacionId}`);
}

/** Genera la liquidación de la semana que terminó el domingo `hasta` (YYYY-MM-DD). */
export async function generarLiquidacion(formData: FormData): Promise<ResultadoLiquidacionAccion<LiquidacionGenerada>> {
  const ctx = await preparar();
  if ("ok" in ctx) return ctx;
  try {
    const valor = await generarLiquidacionSemanal(ctx.tenantId, { hasta: texto(formData.get("hasta")), actor: ctx.actor });
    revalidar(valor.liquidacionId);
    return { ok: true, valor };
  } catch (e) {
    return comoError(e, "vouchers.liquidacion.generar");
  }
}

/** Descarta una liquidación ABIERTA (mal generada): sus vouchers vuelven a «sin liquidar». */
export async function descartarLiquidacion(formData: FormData): Promise<ResultadoLiquidacionAccion<{ liberados: number }>> {
  const ctx = await preparar();
  if ("ok" in ctx) return ctx;
  const liquidacionId = texto(formData.get("liquidacionId"));
  if (!liquidacionId) return { ok: false, error: "Falta identificar la liquidación." };
  try {
    const valor = await descartarRepo(ctx.tenantId, { liquidacionId, actor: ctx.actor });
    revalidar(liquidacionId);
    return { ok: true, valor };
  } catch (e) {
    return comoError(e, "vouchers.liquidacion.descartar");
  }
}

/**
 * Concilia la liquidación contra el pago de la administración. Campos: `liquidacionId`, `pagado`
 * (importe), `fecha` (YYYY-MM-DD), `medio`, `referencia` (opcional) y `rechazados` (los números que
 * la administración no pagó, uno por renglón o separados por coma/espacio).
 */
export async function conciliarLiquidacion(formData: FormData): Promise<ResultadoLiquidacionAccion<ResultadoConciliacionSemanal>> {
  const ctx = await preparar();
  if ("ok" in ctx) return ctx;
  const liquidacionId = texto(formData.get("liquidacionId"));
  if (!liquidacionId) return { ok: false, error: "Falta identificar la liquidación." };
  const pagadoRaw = texto(formData.get("pagado"));
  const pagado = pagadoRaw ? leerMonto(pagadoRaw) : null;
  if (pagado == null || pagado < 0) return { ok: false, error: "Escribí cuánto pagó la administración (puede ser 0)." };
  const medio = texto(formData.get("medio"));
  if (!esMedioAdministracion(medio)) return { ok: false, error: "Elegí cómo pagó la administración." };
  const rechazados = texto(formData.get("rechazados"))
    .split(/[\s,;]+/)
    .filter(Boolean);
  try {
    const valor = await conciliarLiquidacionSemanal(ctx.tenantId, {
      liquidacionId,
      pagado,
      fecha: texto(formData.get("fecha")),
      medio,
      referencia: texto(formData.get("referencia")) || null,
      rechazados,
      actor: ctx.actor,
    });
    revalidar(liquidacionId);
    return { ok: true, valor };
  } catch (e) {
    return comoError(e, "vouchers.liquidacion.conciliar");
  }
}

/** Pago a cuenta de la administración (pre-pago, o lo que pague después de una diferencia). */
export async function pagoACuenta(formData: FormData): Promise<ResultadoLiquidacionAccion<{ pagoId: string; duplicado: boolean }>> {
  const ctx = await preparar();
  if ("ok" in ctx) return ctx;
  const montoRaw = texto(formData.get("monto"));
  const monto = montoRaw ? leerMonto(montoRaw) : null;
  if (monto == null || monto <= 0) return { ok: false, error: "Escribí el monto que pagó la administración." };
  const medio = texto(formData.get("medio"));
  if (!esMedioAdministracion(medio)) return { ok: false, error: "Elegí cómo pagó la administración." };
  try {
    const valor = await registrarPagoACuenta(ctx.tenantId, {
      clave: texto(formData.get("clave")),
      monto,
      fecha: texto(formData.get("fecha")),
      medio,
      referencia: texto(formData.get("referencia")) || null,
      nota: texto(formData.get("nota")) || null,
      actor: ctx.actor,
    });
    revalidar();
    return { ok: true, valor };
  } catch (e) {
    return comoError(e, "vouchers.cuenta.pago");
  }
}
