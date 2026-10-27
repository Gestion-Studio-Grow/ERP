/**
 * Glue del Core para el plugin Mercado Pago (ADR-024). Ata el handler del plugin
 * a tres cosas del Core: el gateway de cobros —resuelto por el registro
 * provider-agnóstico (`gatewayCobrosPara`, fase 3)—, el comando `facturarAppointment`
 * y el cobro del pedido de un link (`cobrarPedidoPorAvisoDePago`). El plugin no importa el Core.
 *
 * Tanda S1: además vive acá el aviso entero (`atenderAvisoMP`), que la ruta sólo envuelve.
 * El orden es el de seguridad:
 *   1. rate limit (antes de calcular nada);
 *   2. secretos (ninguno o ilegible → 503, fail-closed);
 *   3. firma + `ts` (±5 min) con el `data.id` del aviso → 401;
 *   4. recién ahí se lee el tipo; sólo `payment` sigue;
 *   5. se lee el pago en MP con el `data.id` FIRMADO y su `external_reference` dice el negocio
 *      (`gsg:<slug>:<tipo>:<id>`, src/lib/webhooks/resolver-negocio.ts) — nunca el host;
 *   6. la firma tiene que ser la del negocio (MP_WEBHOOK_SECRETS) o la global con aviso;
 *   7. el trabajo corre en `runInTenantContext(negocio)`.
 * Lo que no tiene negocio válido contesta 200 (MP no reintenta en bucle) y queda en AuditLog
 * (`channel: webhook`, `action: rechazado`) del negocio que se pueda nombrar.
 *
 * El COBRO de un pedido no depende de `isInvoicingEnabled()`: facturar es otra decisión. Con la
 * facturación apagada, el turno no se factura y la venta suelta no entra a la ingesta.
 */

import {
  procesarNotificacionPago,
  MercadoPagoApiError,
  type NotificacionPagoMP,
  type ResultadoNotificacion,
  type PagoMP,
  type CobrarPedidoPorPago,
} from "@/plugins/mercadopago";
import { verificarFirmaMP } from "@/plugins/mercadopago/signature";
import type { GatewayPagos } from "@/plugins/pagos";
import { facturarAppointment } from "@/lib/invoice-from-appointment";
import { gatewayCobrosPara } from "@/lib/pagos-dispatch";
import { procesarPagoStandalone } from "@/lib/mercadopago-auto";
import { isInvoicingEnabled } from "@/lib/fiscal";
import { prisma } from "@/lib/prisma";
import { basePrisma } from "@/lib/prisma-base";
import { tenantTransaction } from "@/lib/rls";
import { runInTenantContext } from "@/lib/tenant-context";
import { extractSubdomain, hostMapSubdomain } from "@/lib/tenant";
import { logger } from "@/lib/logger";
import { setRequestContext } from "@/lib/request-context";
import { lastClosedDay } from "@/lib/caja/frontera-cierre";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { cobrarPedidoEnTx, cobrarPedidoPorAvisoDePago, type DepsAvisoDePedido } from "@/lib/order-core";
import {
  candidatosDeFirma,
  firmaDelNegocio,
  leerSecretosMP,
  limitarWebhook,
  resolverNegocioDelPago,
  respuestaDemasiados,
  type DepsResolverNegocio,
  type NegocioDelWebhook,
} from "@/lib/webhooks/resolver-negocio";

// ── Auditoría con el negocio EXPLÍCITO ───────────────────────────────────────
// `audit()` (audit-core) resuelve el negocio con `getCurrentTenantId()`, o sea por el host: en el
// webhook eso es justo lo que no se puede. Acá se escribe con el tenantId resuelto, en su
// transacción (RLS con el GUC de ESE negocio).

export type EntradaAuditoriaWebhook = {
  actor: string;
  action: string;
  entity: string;
  entityId: string | null;
  changes?: unknown;
};

export async function auditarEnNegocio(tenantId: string, e: EntradaAuditoriaWebhook): Promise<void> {
  try {
    await tenantTransaction(
      (tx) =>
        tx.auditLog.create({
          data: {
            tenantId,
            actor: e.actor,
            action: e.action,
            entity: e.entity,
            entityId: e.entityId,
            changes: e.changes === undefined ? undefined : JSON.parse(JSON.stringify(e.changes)),
            channel: "webhook",
          },
        }),
      { tenantId },
    );
  } catch (err) {
    logger.error("mercadopago.webhook", "no se pudo auditar", err, { tenantId, action: e.action, entityId: e.entityId });
  }
}

/** Las dependencias del cobro de un pedido por aviso, con la auditoría al negocio del aviso. */
function depsCobroWebhook(tenantId: string): DepsAvisoDePedido {
  return {
    leerPedido: (t, orderId) =>
      prisma.order.findFirst({ where: { id: orderId, tenantId: t }, select: { code: true, total: true, paid: true, status: true } }),
    cerradoHasta: (t) => lastClosedDay(t),
    hoy: () => dateStrInBusinessTz(new Date()),
    cobrar: (t, args) => tenantTransaction((tx) => cobrarPedidoEnTx(tx, t, args), { tenantId: t }),
    auditar: (entry) => auditarEnNegocio(tenantId, entry),
  };
}

/** El cobro del pedido de un link desde el webhook (idempotente por pedido, order-core.ts). */
export const cobrarPedidoDelWebhook: CobrarPedidoPorPago = (aviso) =>
  cobrarPedidoPorAvisoDePago(aviso, depsCobroWebhook(aviso.tenantId));

// ── El handler con el Core conectado ─────────────────────────────────────────

export type OpcionesNotificacion = {
  /** El pago ya leído de MP (con la referencia en el formato del handler): no se lee dos veces. */
  pago?: PagoMP;
  /** ¿Se factura? Default: `isInvoicingEnabled()`. El cobro del pedido no lo mira. */
  facturacion?: boolean;
  cobrarPedido?: CobrarPedidoPorPago;
};

function gatewayConPago(base: () => Promise<GatewayPagos>, pago: PagoMP): GatewayPagos {
  return {
    getPayment: async (id) => (id === pago.id ? pago : (await base()).getPayment(id)),
    listPayments: async (c) => (await base()).listPayments(c),
  };
}

/**
 * Procesa una notificación de MP ya atribuida a su negocio: verifica el pago y
 *  - pedido (`pedido:<id>`) → lo COBRA (idempotente: el reenvío no asienta dos veces);
 *  - turno (id pelado) → lo factura, si la facturación está prendida;
 *  - venta directa SIN referencia → pipeline standalone, si la facturación está prendida.
 */
export async function manejarNotificacionMP(
  notif: NotificacionPagoMP,
  opts: OpcionesNotificacion = {},
): Promise<ResultadoNotificacion> {
  const facturacion = opts.facturacion ?? isInvoicingEnabled();
  const pago = opts.pago;
  const resultado = await procesarNotificacionPago(notif, {
    clientePara: (tenantId) => (pago ? gatewayConPago(() => gatewayCobrosPara(tenantId), pago) : gatewayCobrosPara(tenantId)),
    facturar: facturacion ? facturarAppointment : async () => null,
    cobrarPedido: opts.cobrarPedido ?? cobrarPedidoDelWebhook,
  });

  // Venta directa (sin turno): entra al pipeline unificado banco + Mercado Pago.
  if (resultado.procesado && !resultado.facturado && resultado.motivo?.includes("external_reference")) {
    if (!facturacion) return { ...resultado, motivo: "venta directa: la facturación está apagada" };
    const resumen = await procesarPagoStandalone(notif.tenantId, notif.paymentId);
    return {
      procesado: true,
      facturado: resumen.facturados > 0,
      invoiceId: null,
      motivo:
        resumen.facturados > 0
          ? "venta directa facturada"
          : resumen.aRevisar > 0
            ? "venta directa en cola de revisión"
            : resumen.noFacturables > 0
              ? "no facturable (clasificador)"
              : resumen.saltados > 0
                ? "ya procesado (idempotencia)"
                : "error transitorio (se reintenta)",
    };
  }

  return resultado;
}

// ── El aviso entero (la ruta lo envuelve) ────────────────────────────────────

export interface DepsAvisoMP {
  env: Record<string, string | undefined>;
  ahoraMs: () => number;
  /** Lee el pago en la cuenta de MP del despliegue (hoy un token por despliegue; P5: por negocio). */
  leerPago: (paymentId: string) => Promise<PagoMP>;
  resolver: DepsResolverNegocio;
  manejar: (notif: NotificacionPagoMP, opts: OpcionesNotificacion) => Promise<ResultadoNotificacion>;
  auditar: (tenantId: string, e: EntradaAuditoriaWebhook) => Promise<void>;
  limitar: (request: Request) => number | null;
}

const SELECT_NEGOCIO = { id: true, slug: true, subdomain: true, status: true, modules: true } as const;

/** Lecturas de `Tenant` (columnas propias, sin RLS: tenant.ts hace lo mismo). */
export const depsResolverDesdeBase: DepsResolverNegocio = {
  porSlug: (slug) => basePrisma.tenant.findUnique({ where: { slug }, select: SELECT_NEGOCIO }),
  porSubdominio: (subdomain) => basePrisma.tenant.findUnique({ where: { subdomain }, select: SELECT_NEGOCIO }),
  primerosDos: () => basePrisma.tenant.findMany({ take: 2, orderBy: { createdAt: "asc" }, select: SELECT_NEGOCIO }),
};

/** Cuenta de MP del despliegue: el gateway no usa el tenant para elegir credenciales (pagos-dispatch.ts). */
const CUENTA_DEL_DESPLIEGUE = "mp-webhook:cuenta-del-despliegue";

export const DEPS_AVISO_MP: DepsAvisoMP = {
  env: process.env,
  ahoraMs: () => Date.now(),
  leerPago: async (paymentId) => (await gatewayCobrosPara(CUENTA_DEL_DESPLIEGUE)).getPayment(paymentId),
  resolver: depsResolverDesdeBase,
  manejar: manejarNotificacionMP,
  auditar: auditarEnNegocio,
  limitar: (request) => limitarWebhook("mercadopago", request),
};

const ok = (body: Record<string, unknown>) => Response.json({ ok: true, ...body });
const falla = (status: number, error: string) => Response.json({ ok: false, error }, { status });

function hostDe(request: Request): string | null {
  return request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
}

/** El subdominio del negocio de la URL del aviso, si la URL es la de un negocio. */
export function subdominioDelHost(host: string | null): string | null {
  return hostMapSubdomain(host) ?? extractSubdomain(host);
}

type CuerpoAviso = { type?: unknown; action?: unknown; data?: { id?: unknown } };

function leerCuerpo(crudo: string): CuerpoAviso {
  try {
    const v = JSON.parse(crudo) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as CuerpoAviso) : {};
  } catch {
    return {};
  }
}

export async function atenderAvisoMP(request: Request, deps: DepsAvisoMP = DEPS_AVISO_MP): Promise<Response> {
  // 1. Rate limit: antes de leer, verificar o tocar la base.
  const espera = deps.limitar(request);
  if (espera != null) return respuestaDemasiados(espera);

  // 2. Secretos (fail-closed).
  const secretos = leerSecretosMP(deps.env);
  if (secretos.tipo !== "ok") {
    logger.error("mercadopago.webhook", `webhook rechazado: secretos ${secretos.tipo === "ninguno" ? "ausentes" : "ilegibles"}`);
    return falla(503, secretos.tipo === "ninguno" ? "webhook-secret-missing" : "webhook-secrets-invalid");
  }

  // 3. Firma. El `data.id` sale de la query (webhooks v2); si no viene ahí, del cuerpo, SÓLO como
  //    insumo del manifest: si la firma valida, ese id está firmado; si no, no se usa para nada.
  const url = new URL(request.url);
  const cuerpo = leerCuerpo(await request.text().catch(() => ""));
  const idCuerpo = cuerpo.data?.id;
  const idCuerpoTxt = typeof idCuerpo === "string" || typeof idCuerpo === "number" ? String(idCuerpo).trim() : null;
  const dataId = (url.searchParams.get("data.id") ?? idCuerpoTxt ?? "").trim();
  const firma = verificarFirmaMP({
    xSignature: request.headers.get("x-signature"),
    xRequestId: request.headers.get("x-request-id"),
    dataId,
    candidatos: candidatosDeFirma(secretos),
    ahoraMs: deps.ahoraMs(),
  });
  if (!firma.ok) {
    logger.warn("mercadopago.webhook", "webhook rechazado: firma", { motivo: firma.motivo, paymentId: dataId || null });
    return falla(401, firma.motivo);
  }
  // Un cuerpo con OTRO id que el firmado no se procesa: el único id que vale es el firmado.
  if (idCuerpoTxt != null && idCuerpoTxt !== dataId) return falla(401, "id-no-firmado");
  const paymentId = dataId;

  // 4. Recién ahora, el tipo.
  const type =
    url.searchParams.get("type") ??
    url.searchParams.get("topic") ??
    (typeof cuerpo.type === "string"
      ? cuerpo.type
      : typeof cuerpo.action === "string" && cuerpo.action.startsWith("payment")
        ? "payment"
        : "");
  if (type !== "payment") return ok({ ignored: { type, paymentId } });

  // 5. El pago (con el id firmado) y su negocio.
  let pago: PagoMP;
  try {
    pago = await deps.leerPago(paymentId);
  } catch (err) {
    if (err instanceof MercadoPagoApiError && err.status >= 400 && err.status < 500) {
      logger.warn("mercadopago.webhook", "aviso de un pago que la cuenta no tiene", { paymentId, status: err.status });
      return ok({ rechazado: "pago-no-encontrado" });
    }
    logger.error("mercadopago.webhook", "no se pudo leer el pago en Mercado Pago", err, { paymentId });
    return falla(500, "mp-no-disponible"); // transitorio: MP reintenta con espera, no en bucle
  }
  const host = hostDe(request);
  const r = await resolverNegocioDelPago(
    { externalReference: pago.externalReference, subdominioDelHost: subdominioDelHost(host) },
    deps.resolver,
  );
  const rechazar = async (motivo: string, n: NegocioDelWebhook | null) => {
    const changes = { motivo, externalReference: pago.externalReference || null, host, firmantes: firma.firmantes };
    logger.warn("mercadopago.webhook", "aviso rechazado sin efecto", { paymentId, ...changes, negocio: n?.slug ?? null });
    if (n) {
      await deps.auditar(n.id, { actor: `mercadopago:${paymentId}`, action: "rechazado", entity: "WebhookMercadoPago", entityId: paymentId, changes });
    }
  };
  if (!r.ok) {
    await rechazar(r.motivo, r.auditarEn);
    return ok({ rechazado: r.motivo });
  }

  // 6. ¿La firma es la de ESE negocio?
  const deQuien = firmaDelNegocio(firma.firmantes, r.negocio.slug, secretos);
  if (deQuien === "firma-de-otro-negocio") {
    await rechazar("firma-de-otro-negocio", r.negocio);
    return falla(401, "firma-de-otro-negocio");
  }
  if (deQuien === "global-con-aviso") {
    // Aviso al monitor: el negocio todavía no tiene su secreto en MP_WEBHOOK_SECRETS.
    logger.warn("monitor", "webhook de Mercado Pago verificado con el secreto GLOBAL", {
      aviso: "mp-webhook-secreto-global",
      negocio: r.negocio.slug,
      paymentId,
    });
  }

  // 7. El trabajo, en el contexto del negocio resuelto.
  const tenantId = r.negocio.id;
  setRequestContext({ tenantId, paymentId });
  try {
    const resultado = await runInTenantContext(tenantId, async () =>
      await deps.manejar({ type, paymentId, tenantId }, { pago: { ...pago, externalReference: r.referencia ?? "" } }),
    );
    return ok({ resultado });
  } catch (err) {
    // Error transitorio (base o MP caídos): 500 para que MP reintente (con espera, finito).
    logger.error("mercadopago.webhook", "webhook falló", err, { paymentId, tenantId });
    return Response.json({ ok: false }, { status: 500 });
  }
}
