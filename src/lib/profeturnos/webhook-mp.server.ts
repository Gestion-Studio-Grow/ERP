// PROFETURNOS · Webhook del abono mensual (T2): Mercado Pago avisa un pago de la cuenta de GSG.
//
// Orden (cada paso corta; nada se escribe antes del último):
//  1. Sin `MP_WEBHOOK_SECRET` → 503 (fail-closed). Sin `MP_ACCES_TOKEN` → 503.
//  2. Firma HMAC (`verificarFirmaMP`) con el `data.id` de la query y el `ts` en ventana (±5 min) → 401.
//     Un cuerpo con OTRO id que el firmado → 401.
//  3. Sólo avisos de tipo `payment`; el resto, 200 sin hacer nada.
//  4. Se RE-LEE el pago en la API de MP con el token de GSG: el cuerpo no se usa para nada más.
//  5. Exige approved + ARS + monto == PRECIO_MENSUAL + referencia `pt:<tenantId>:mensual:<nonce>` de un
//     negocio que exista y sea del blueprint `profe-padel`. Si no, 200 (MP no reintenta) y log de aviso.
//  6. En UNA tenantTransaction: candados (pago y plan del negocio), fila `profeturnos.pago` con
//     entityId = paymentId (si ya está, es un reintento: no se extiende dos veces) y fila
//     `profeturnos.plan` con vigenciaHasta = max(hoy, vigencia actual) + 1 mes.
//  7. Un pago YA ACREDITADO que vuelve devuelto o con contracargo (refunded / charged_back): fila
//     `profeturnos.pago.reverso` (una por pago y estado) y aviso al monitor. No se tocan los días.

import "server-only";
import { basePrisma } from "@/lib/prisma-base";
import { tenantTransaction } from "@/lib/rls";
import { logger } from "@/lib/logger";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { verificarFirmaMP } from "@/plugins/mercadopago/signature";
import { leerPagoDeMp, tokenDeGsg } from "./cobro-mp";
import { tenantDeLaReferencia, validarPago, vigenciaTrasUnPago, type PagoLeido } from "./plan-core";
import { PRECIO_MENSUAL } from "./planes";
import { ACCION_PAGO, ACCION_PLAN, planEnTx } from "./plan.server";
import { BLUEPRINT_PROFETURNOS } from "./tramites.server";

type Env = Record<string, string | undefined>;

export interface DepsWebhookProfeturnos {
  env: Env;
  ahoraMs: () => number;
  leerPago: (paymentId: string, token: string) => Promise<PagoLeido>;
}

export const DEPS_WEBHOOK_PROFETURNOS: DepsWebhookProfeturnos = {
  env: process.env,
  ahoraMs: () => Date.now(),
  leerPago: (id, token) => leerPagoDeMp(id, token),
};

const ACTOR = "webhook:profeturnos-mp";

const responder = (status: number, cuerpo: Record<string, unknown>) => Response.json(cuerpo, { status });

function idDelCuerpo(cuerpo: unknown): string | null {
  const d = (cuerpo as { data?: { id?: unknown } } | null)?.data;
  if (d && (typeof d.id === "string" || typeof d.id === "number")) return String(d.id).trim();
  return null;
}

function tipoDelAviso(url: URL, cuerpo: unknown): string {
  const q = url.searchParams.get("type") ?? url.searchParams.get("topic");
  if (q) return q;
  const c = cuerpo as { type?: unknown; topic?: unknown } | null;
  return typeof c?.type === "string" ? c.type : typeof c?.topic === "string" ? c.topic : "";
}

export type Acreditacion =
  | { resultado: "acreditado"; tenantId: string; vigenciaHasta: string }
  | { resultado: "repetido"; tenantId: string }
  | { resultado: "tenant-inexistente" }
  | { resultado: "tenant-ajeno" };

/**
 * Acredita un pago YA VALIDADO (aprobado, ARS, precio exacto, referencia parseada) en su negocio.
 * Idempotente por paymentId; segura en paralelo (candados de transacción).
 */
export async function acreditarPago(p: { paymentId: string; tenantId: string; monto: number; referencia: string }, hoy: string): Promise<Acreditacion> {
  // Tenant no tiene RLS: basePrisma, como el ruteo (y el trámite público).
  const t = await basePrisma.tenant.findUnique({ where: { id: p.tenantId }, select: { blueprintId: true } });
  if (!t) return { resultado: "tenant-inexistente" };
  if (t.blueprintId !== BLUEPRINT_PROFETURNOS) return { resultado: "tenant-ajeno" };
  return tenantTransaction(
    async (tx): Promise<Acreditacion> => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`profeturnos-pago:${p.paymentId}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`profeturnos-plan:${p.tenantId}`}))`;
      const ya = await tx.auditLog.findFirst({
        where: { tenantId: p.tenantId, action: ACCION_PAGO, entity: "Pago", entityId: p.paymentId },
        select: { id: true },
      });
      if (ya) return { resultado: "repetido", tenantId: p.tenantId };
      const plan = await planEnTx(tx, p.tenantId, hoy);
      const vigenciaHasta = vigenciaTrasUnPago({ altaEn: plan.altaEn, vigenciaHasta: plan.fila.vigenciaHasta, plan: plan.fila.plan, hoy });
      await tx.auditLog.create({
        data: {
          tenantId: p.tenantId,
          actor: ACTOR,
          action: ACCION_PAGO,
          entity: "Pago",
          entityId: p.paymentId,
          changes: { paymentId: p.paymentId, monto: p.monto, moneda: "ARS", referencia: p.referencia, vigenciaHasta },
          channel: "webhook",
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: p.tenantId,
          actor: ACTOR,
          action: ACCION_PLAN,
          entity: "Tenant",
          entityId: p.tenantId,
          changes: { plan: "mensual", vigenciaHasta, por: "pago-mp", paymentId: p.paymentId, antes: { ...plan.fila } },
          channel: "webhook",
        },
      });
      return { resultado: "acreditado", tenantId: p.tenantId, vigenciaHasta };
    },
    { tenantId: p.tenantId },
  );
}

/** Fila de auditoría de un pago acreditado que MP devolvió o contracargó. */
export const ACCION_PAGO_REVERSO = "profeturnos.pago.reverso";

/** Estados de MP que revierten un pago ya cobrado. */
const ESTADOS_REVERSO = new Set(["refunded", "charged_back"]);

export type Reverso = { resultado: "registrado" } | { resultado: "repetido" } | { resultado: "sin-pago" };

/**
 * Un pago que acreditamos y que MP ahora informa devuelto o contracargado: deja la fila
 * `profeturnos.pago.reverso` (idempotente por paymentId + estado, con el mismo candado del pago) para
 * que GSG lo vea. Si no hay fila `profeturnos.pago` de ese id, no se acreditó: nada que registrar.
 *
 * PROVISIONAL A CONFIRMAR (dueño): NO se le quitan días al plan automáticamente. Qué hacer con la
 * vigencia de un pago revertido (cortarla, descontar el mes, dejarla) lo decide el dueño; hasta
 * entonces queda la fila y el aviso, y GSG lo resuelve a mano.
 */
export async function registrarReverso(p: { paymentId: string; tenantId: string; status: string }): Promise<Reverso> {
  const t = await basePrisma.tenant.findUnique({ where: { id: p.tenantId }, select: { blueprintId: true } });
  if (!t || t.blueprintId !== BLUEPRINT_PROFETURNOS) return { resultado: "sin-pago" };
  return tenantTransaction(
    async (tx): Promise<Reverso> => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`profeturnos-pago:${p.paymentId}`}))`;
      const pago = await tx.auditLog.findFirst({
        where: { tenantId: p.tenantId, action: ACCION_PAGO, entity: "Pago", entityId: p.paymentId },
        select: { changes: true },
      });
      if (!pago) return { resultado: "sin-pago" };
      const previos = await tx.auditLog.findMany({
        where: { tenantId: p.tenantId, action: ACCION_PAGO_REVERSO, entity: "Pago", entityId: p.paymentId },
        select: { changes: true },
      });
      if (previos.some((r) => (r.changes as { status?: unknown } | null)?.status === p.status)) return { resultado: "repetido" };
      const monto = (pago.changes as { monto?: unknown } | null)?.monto;
      await tx.auditLog.create({
        data: {
          tenantId: p.tenantId,
          actor: ACTOR,
          action: ACCION_PAGO_REVERSO,
          entity: "Pago",
          entityId: p.paymentId,
          changes: { paymentId: p.paymentId, status: p.status, monto: typeof monto === "number" ? monto : null, estado: "a-revisar-por-gsg" },
          channel: "webhook",
        },
      });
      return { resultado: "registrado" };
    },
    { tenantId: p.tenantId },
  );
}

export async function atenderAvisoProfeturnos(request: Request, deps: DepsWebhookProfeturnos = DEPS_WEBHOOK_PROFETURNOS): Promise<Response> {
  // 1. Fail-closed.
  const secreto = deps.env.MP_WEBHOOK_SECRET?.trim();
  if (!secreto) {
    logger.error("profeturnos.webhook", "aviso rechazado: falta MP_WEBHOOK_SECRET");
    return responder(503, { ok: false, error: "webhook-secret-missing" });
  }
  const token = tokenDeGsg(deps.env);
  if (!token) {
    logger.error("profeturnos.webhook", "aviso rechazado: falta el token de MP de GSG");
    return responder(503, { ok: false, error: "token-missing" });
  }

  // 2. Firma, con el id de la query (o del cuerpo, sólo como insumo del manifest firmado).
  const url = new URL(request.url);
  let cuerpo: unknown = null;
  try {
    cuerpo = JSON.parse(await request.text());
  } catch {
    cuerpo = null;
  }
  const idCuerpo = idDelCuerpo(cuerpo);
  const dataId = (url.searchParams.get("data.id") ?? idCuerpo ?? "").trim();
  const firma = verificarFirmaMP({
    xSignature: request.headers.get("x-signature"),
    xRequestId: request.headers.get("x-request-id"),
    dataId,
    candidatos: [{ clave: "gsg", secreto }],
    ahoraMs: deps.ahoraMs(),
  });
  if (!firma.ok) {
    logger.warn("profeturnos.webhook", "aviso rechazado: firma", { motivo: firma.motivo });
    return responder(401, { ok: false, error: firma.motivo });
  }
  if (idCuerpo !== null && idCuerpo !== dataId) return responder(401, { ok: false, error: "id-no-firmado" });

  // 3. Sólo pagos.
  const tipo = tipoDelAviso(url, cuerpo);
  if (tipo !== "payment") return responder(200, { ok: true, ignorado: "tipo" });
  if (!/^\d{1,20}$/.test(dataId)) return responder(200, { ok: true, ignorado: "id" });

  // 4. Re-lectura en MP (si falla, 502: MP reintenta).
  let pago: PagoLeido;
  try {
    pago = await deps.leerPago(dataId, token);
  } catch (e) {
    const status = (e as { status?: unknown })?.status;
    logger.error("profeturnos.webhook", "no se pudo leer el pago en MP", undefined, { paymentId: dataId, status: typeof status === "number" ? status : null });
    return responder(502, { ok: false, error: "mp-no-responde" });
  }
  if (pago.id !== dataId) {
    logger.warn("profeturnos.webhook", "MP devolvió otro pago que el avisado", { paymentId: dataId });
    return responder(200, { ok: true, ignorado: "id-distinto" });
  }

  // 5. Lo que se exige.
  const v = validarPago(pago, PRECIO_MENSUAL);
  // 7. Devuelto o contracargado: si ya lo habíamos acreditado, queda registrado y se avisa.
  const tenantDelReverso = pago.status && ESTADOS_REVERSO.has(pago.status) ? tenantDeLaReferencia(pago.referencia) : null;
  if (tenantDelReverso && pago.status) {
    let rv: Reverso;
    try {
      rv = await registrarReverso({ paymentId: dataId, tenantId: tenantDelReverso, status: pago.status });
    } catch (e) {
      logger.error("profeturnos.webhook", "no se pudo registrar el reverso del pago", e, { paymentId: dataId });
      return responder(500, { ok: false, error: "reverso-no-registrado" });
    }
    if (rv.resultado === "registrado") {
      // Aviso a GSG (monitor): sin datos del pagador, sólo el id del pago y el estado de MP.
      logger.warn("monitor", "pago de ProfeTurnos devuelto o contracargado: revisar el plan a mano", {
        aviso: "profeturnos-pago-reverso",
        paymentId: dataId,
        status: pago.status,
      });
    }
    if (rv.resultado !== "sin-pago") return responder(200, { ok: true, reverso: rv.resultado });
  }
  if (!v.ok) {
    if (v.motivo !== "no-aprobado") {
      // Aviso a GSG: un pago aprobado que no se acredita (moneda, monto o referencia) se revisa a mano.
      logger.warn("monitor", "pago de ProfeTurnos no acreditado", { aviso: "profeturnos-pago-rechazado", motivo: v.motivo, paymentId: dataId });
    }
    return responder(200, { ok: true, ignorado: v.motivo });
  }

  // 6. Acreditación.
  const hoy = dateStrInBusinessTz(new Date(deps.ahoraMs()));
  let r: Acreditacion;
  try {
    r = await acreditarPago({ paymentId: dataId, tenantId: v.tenantId, monto: pago.monto as number, referencia: pago.referencia as string }, hoy);
  } catch (e) {
    logger.error("profeturnos.webhook", "no se pudo acreditar el pago", e, { paymentId: dataId });
    return responder(500, { ok: false, error: "no-acreditado" });
  }
  if (r.resultado === "tenant-inexistente" || r.resultado === "tenant-ajeno") {
    logger.warn("monitor", "pago de ProfeTurnos con referencia de un negocio que no corresponde", { aviso: "profeturnos-pago-rechazado", motivo: r.resultado, paymentId: dataId });
    return responder(200, { ok: true, ignorado: r.resultado });
  }
  if (r.resultado === "repetido") return responder(200, { ok: true, repetido: true });
  logger.info("profeturnos.webhook", "abono acreditado", { paymentId: dataId, tenantId: r.tenantId, vigenciaHasta: r.vigenciaHasta });
  return responder(200, { ok: true, acreditado: true });
}
