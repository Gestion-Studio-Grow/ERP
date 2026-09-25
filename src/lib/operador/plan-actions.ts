"use server";

// ============================================================================
// PLAN DEL NEGOCIO — las actions de la tarjeta de la consola del operador (R2-F4).
// ============================================================================
//
// Dos endpoints, los dos del plano de operador (ADR-021):
//   · `aplicarPlanDelNegocio`: cambia el plan. Sólo prende o apaga pantallas; los datos quedan.
//   · `ajustarLimiteDelNegocio`: una excepción de UN límite para este negocio (o volver al del plan).
// El operador sale de `requireOperadorParaNegocio` (la cookie firmada; en CH, además, el candado),
// SIEMPRE lo primero: nunca del formulario. Todo lo demás se decide de nuevo con la base fresca:
// se relee el negocio, se recalcula la vista previa, se compara con lo que vio el operador y la
// escritura es condicional y con el candado de las apps (plan-escritura.server.ts).
// CH (beauty-spa) no cambia de plan desde acá: `vistaPreviaDePlan` lo frena con el motivo.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOperadorParaNegocio } from "@/lib/operador/guardia-negocio";
import { catalogo } from "@/modules/catalog";
import { flagsDeApps, leerInterruptoresDe } from "@/app/operador/(console)/tenants/[id]/negocio.server";
import { mismoConjunto, requiereOkDelDuenio } from "@/app/operador/(console)/tenants/[id]/apps-del-negocio";
import {
  MOTIVO_PLAN_OK_DEL_DUENIO,
  motivoSiFaltaConfirmar,
  vistaPreviaDePlan,
} from "@/app/operador/(console)/tenants/[id]/plan-del-negocio";
import {
  escribirExcepcionDeLimite,
  escribirPlanConCandado,
  leerFilasDeLimites,
  leerNegocioParaPlan,
} from "@/lib/operador/plan-escritura.server";
import { esPlanId, LIMITE_IDS, type LimiteId } from "@/planes/catalogo";
import { LIMITES } from "@/planes/limites";
import { leerValorDeLimite } from "@/lib/operador/plan-formulario";

const CAMBIO_MIENTRAS_MIRABAS =
  "El negocio cambió mientras mirabas: otra pestaña u otra persona le cambió el plan o los módulos. " +
  "No se guardó nada. Revisá la vista previa con los datos de ahora y confirmá de nuevo.";

const NO_SE_PUDO_LEER =
  "No pudimos leer cómo está el negocio ahora (sus interruptores o sus límites). No se guardó nada: recargá la ficha y probá de nuevo.";

function volver(tenantId: string, q: Record<string, string>): never {
  redirect(`/operador/tenants/${tenantId}?${new URLSearchParams(q).toString()}#plan`);
}

function leerModulosVistos(valor: FormDataEntryValue | null): string[] | null {
  try {
    const v: unknown = JSON.parse(String(valor ?? ""));
    return Array.isArray(v) && v.every((x) => typeof x === "string") ? v : null;
  } catch {
    return null;
  }
}

function refrescar(tenantId: string): void {
  revalidatePath(`/operador/tenants/${tenantId}`);
  revalidatePath("/operador");
  revalidatePath("/admin", "layout");
}

export async function aplicarPlanDelNegocio(formData: FormData) {
  const tenantId = String(formData.get("tenantId") || "").trim();
  const sesion = await requireOperadorParaNegocio({ id: tenantId });
  if (!tenantId) redirect("/operador?error=notfound");
  const planPedido = String(formData.get("plan") || "").trim();
  const planVisto = String(formData.get("planVisto") || "").trim() || null;
  const modulosVistos = leerModulosVistos(formData.get("modulosVistos"));
  const entiende = formData.get("entiendo") === "si";

  const n = await leerNegocioParaPlan(tenantId);
  if (!n) redirect("/operador?error=notfound");
  if (requiereOkDelDuenio(n.slug)) volver(tenantId, { error: MOTIVO_PLAN_OK_DEL_DUENIO });

  let filas;
  try {
    filas = await leerFilasDeLimites(tenantId);
  } catch {
    volver(tenantId, { error: NO_SE_PUDO_LEER, plan: planPedido });
  }
  const interruptores = await leerInterruptoresDe(tenantId);
  if (!interruptores) volver(tenantId, { error: NO_SE_PUDO_LEER, plan: planPedido });

  const previa = vistaPreviaDePlan(n, planPedido, flagsDeApps(interruptores.estado), catalogo(), filas);
  if (!previa.ok) volver(tenantId, { error: previa.motivo });
  if (modulosVistos === null || !mismoConjunto(modulosVistos, n.modules) || planVisto !== n.plan) {
    volver(tenantId, { error: CAMBIO_MIENTRAS_MIRABAS, plan: previa.plan });
  }
  if (previa.sinCambios) volver(tenantId, { ok: `No había nada que cambiar: ya tiene el plan ${previa.nombre}.` });
  const falta = motivoSiFaltaConfirmar(previa, entiende);
  if (falta) volver(tenantId, { error: falta, plan: previa.plan });

  const r = await escribirPlanConCandado({
    tenantId,
    leido: { plan: n.plan, modules: n.modules, profile: n.profile },
    previa,
    operador: sesion.nombre,
  });
  if (r.tipo === "cambio") volver(tenantId, { error: CAMBIO_MIENTRAS_MIRABAS, plan: previa.plan });
  if (r.tipo === "rechazado") volver(tenantId, { error: r.motivo, plan: previa.plan });

  refrescar(tenantId);
  const cerradas =
    r.excepcionesCerradas > 0
      ? ` Se cerraron ${r.excepcionesCerradas} ${r.excepcionesCerradas === 1 ? "ajuste de límite" : "ajustes de límites"} del plan anterior.`
      : "";
  volver(tenantId, {
    ok: `Listo: pasó al plan ${previa.nombre}. Sus datos quedan guardados; se nota la próxima vez que abran su panel.${cerradas}`,
  });
}

export async function ajustarLimiteDelNegocio(formData: FormData) {
  const tenantId = String(formData.get("tenantId") || "").trim();
  const sesion = await requireOperadorParaNegocio({ id: tenantId });
  if (!tenantId) redirect("/operador?error=notfound");
  const limite = String(formData.get("limite") || "").trim();
  const planVisto = String(formData.get("planVisto") || "").trim();
  if (!(LIMITE_IDS as readonly string[]).includes(limite)) volver(tenantId, { error: "Ese límite no existe. Recargá la ficha." });
  if (!esPlanId(planVisto)) volver(tenantId, { error: "El negocio no tiene un plan del catálogo: primero elegí uno." });
  const valor = leerValorDeLimite(String(formData.get("valor") ?? ""));
  if (!valor.ok) volver(tenantId, { error: valor.motivo });

  const n = await leerNegocioParaPlan(tenantId);
  if (!n) redirect("/operador?error=notfound");
  if (requiereOkDelDuenio(n.slug)) volver(tenantId, { error: MOTIVO_PLAN_OK_DEL_DUENIO });

  const r = await escribirExcepcionDeLimite({
    tenantId,
    planVisto,
    limite: limite as LimiteId,
    ...(valor.quitar ? {} : { valor: valor.tope }),
    operador: sesion.nombre,
  });
  if (r.tipo === "cambio") volver(tenantId, { error: CAMBIO_MIENTRAS_MIRABAS });
  if (r.tipo === "rechazado") volver(tenantId, { error: r.motivo });

  refrescar(tenantId);
  const nombre = LIMITES[limite as LimiteId].nombre;
  volver(tenantId, {
    ok: valor.quitar
      ? `Listo: «${nombre}» vuelve al tope de su plan.`
      : `Listo: «${nombre}» queda en ${valor.tope === null ? "sin tope" : valor.tope} para este negocio.`,
  });
}
