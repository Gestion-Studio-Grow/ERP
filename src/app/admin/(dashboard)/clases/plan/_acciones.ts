"use server";
// «Mi plan» (ProfeTurnos T2): pagar el abono por Mercado Pago y los trámites de arrepentimiento o baja
// CON SESIÓN (el camino que sí cambia el plan; el público sólo registra). Plata: OWNER o quien
// gestiona Clases; el PROFESSIONAL no. Ningún secreto sale de acá: el token sólo va al header de MP.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAppAccion } from "@/lib/require-app";
import { gestionaClases } from "@/lib/padel/plata-guardia";
import { getCurrentTenantId } from "@/lib/tenant";
import { basePrisma } from "@/lib/prisma-base";
import { logger } from "@/lib/logger";
import { todayInBusinessTz } from "@/lib/datetime";
import { esTipoTramite, numeroDeTramite } from "@/lib/factoque-tramites";
import { crearCobroMensual, origenDelHost } from "@/lib/profeturnos/cobro-mp";
import { registrarTramiteProfeturnos } from "@/lib/profeturnos/tramites.server";
import { RUTA_MI_PLAN } from "@/lib/profeturnos/plan-core";

async function quienPaga() {
  const user = await requireAppAccion("padel-clases");
  if (user.role !== "OWNER" && !gestionaClases(user)) redirect("/admin/clases");
  const tenantId = await getCurrentTenantId();
  if (tenantId !== user.tenantId) redirect("/admin/clases");
  return { user, tenantId };
}

/** «Pagar con Mercado Pago»: crea la preferencia y manda al checkout. El pago lo acredita el webhook. */
export async function pagarAbono(): Promise<void> {
  const { tenantId } = await quienPaga();
  const h = await headers();
  const origen = origenDelHost(h.get("x-forwarded-host") ?? h.get("host"));
  const r = await crearCobroMensual({ tenantId, origen });
  if (!r.ok) {
    logger.warn("profeturnos", "no se pudo crear el cobro del abono", { motivo: r.motivo });
    redirect(`${RUTA_MI_PLAN}?error=${r.motivo === "sin-token" ? "sin-pagos" : "mp"}`);
  }
  logger.info("profeturnos", "cobro del abono creado", { tenantId, referencia: r.referencia });
  redirect(r.url);
}

/** Arrepentimiento o baja desde el panel: pasa por el enganche de T2 (efectoDelTramite). */
export async function tramiteDesdeMiPlan(fd: FormData): Promise<void> {
  const { user, tenantId } = await quienPaga();
  // El contrato es del titular: arrepentirse o darse de baja, sólo el OWNER.
  if (user.role !== "OWNER") redirect(RUTA_MI_PLAN);
  const tipo = fd.get("tipo");
  if (!esTipoTramite(tipo)) redirect(RUTA_MI_PLAN);
  const t = await basePrisma.tenant.findUnique({ where: { id: tenantId }, select: { subdomain: true, slug: true } });
  const usuario = t?.subdomain || t?.slug || tenantId;
  const motivo = String(fd.get("motivo") ?? "").slice(0, 500);
  const numero = numeroDeTramite(tipo, todayInBusinessTz());
  const r = await registrarTramiteProfeturnos(tipo, numero, { email: user.email, usuario, motivo }, { tenantId, userId: user.id });
  logger.warn("monitor", "trámite de ProfeTurnos desde el panel", { aviso: `profeturnos-${tipo}`, tramite: numero, efecto: r.efecto });
  redirect(`${RUTA_MI_PLAN}?tramite=${encodeURIComponent(numero)}&tipo=${tipo}&efecto=${r.efecto}`);
}
