/**
 * Glue del Core para el plugin Mercado Pago (ADR-024). Ata el handler del plugin
 * a tres cosas del Core: el gateway de cobros —resuelto por el registro
 * provider-agnóstico (`gatewayCobrosPara`, fase 3)—, el comando `facturarAppointment`
 * y el cobro del pedido de un link (`cobrarPedidoPorAvisoDePago`). El plugin no importa el Core.
 *
 * Tanda P1 (P1-C5): el aviso entra primero por la CONEXIÓN que valida la firma
 * (`resolverConexionPorFirma`, tope 20, tiempo constante) y sigue por el servicio nuevo
 * (src/integraciones/entrada.server.ts: EventoIntegracion deduplicado + `manejadorAvisoMP`). Lo de
 * abajo (S1) queda como CAMINO LEGADO, sólo con `MP_MODO_LEGADO=1`.
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
import { facturarAppointment, facturarCobroMPDelTurno } from "@/lib/invoice-from-appointment";
import { gatewayCobrosDeConexion, gatewayCobrosPara, gatewayLegadoDelDespliegue, modoLegadoMP } from "@/lib/pagos-dispatch";
import { CLAVE_MERCADOPAGO } from "@/plugins/mercadopago/gateway";
import { normalizarFailClosed, type EntradaCruda } from "@/integraciones/contrato";
import { resolverConexionPorFirma, type ConexionResuelta, type ResultadoPorFirma } from "@/integraciones/conexiones.server";
import { entradaDeRequest, registrarYDespachar, type ManejadorEvento, type ResumenDespacho } from "@/integraciones/entrada.server";
import { registro as registroDeConectores } from "@/integraciones/registro";
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
  conMercadoPagoActivo,
  firmaDelNegocio,
  referenciaDeLaConexion,
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
    // R1 · con el pago, se factura ESE cobro del turno (la seña), no el turno entero. Con la
    // facturación apagada no se factura nada (main, pase N2).
    facturar: facturacion
      ? (appointmentId, tenantId, pagoMP) =>
          pagoMP ? facturarCobroMPDelTurno(appointmentId, tenantId, pagoMP) : facturarAppointment(appointmentId, tenantId)
      : async () => null,
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
  /**
   * P1-C5: la conexión de MP cuyo `webhook_secret` valida la firma del aviso (tope 20 conexiones,
   * todas probadas en tiempo constante). Default: `resolverConexionPorFirma("mercadopago", …)`.
   */
  porFirma: (req: EntradaCruda, ahora: Date) => Promise<ResultadoPorFirma>;
  /** El aviso de una conexión, por el servicio nuevo (EventoIntegracion deduplicado + handler). */
  despachar: (conexion: ConexionResuelta, req: EntradaCruda) => Promise<DespachoAvisoMP>;
  /** CAMINO LEGADO (sólo con MP_MODO_LEGADO=1): lee el pago con la cuenta de MP del despliegue. */
  leerPago: (paymentId: string) => Promise<PagoMP>;
  resolver: DepsResolverNegocio;
  manejar: (notif: NotificacionPagoMP, opts: OpcionesNotificacion) => Promise<ResultadoNotificacion>;
  auditar: (tenantId: string, e: EntradaAuditoriaWebhook) => Promise<void>;
  limitar: (request: Request) => number | null;
}

export type DespachoAvisoMP = { status: number; cuerpo: Record<string, unknown> };

const SELECT_NEGOCIO = { id: true, slug: true, subdomain: true, status: true, modules: true } as const;

/** Lecturas de `Tenant` (columnas propias, sin RLS: tenant.ts hace lo mismo). */
export const depsResolverDesdeBase: DepsResolverNegocio = {
  porSlug: (slug) => basePrisma.tenant.findUnique({ where: { slug }, select: SELECT_NEGOCIO }),
  porSubdominio: (subdomain) => basePrisma.tenant.findUnique({ where: { subdomain }, select: SELECT_NEGOCIO }),
  primerosDos: () => basePrisma.tenant.findMany({ take: 2, orderBy: { createdAt: "asc" }, select: SELECT_NEGOCIO }),
};

// ── El handler del evento de una conexión (servicio nuevo) ───────────────────

export interface DepsManejadorMP {
  /** Lee el pago con el `access_token` de ESA conexión. */
  leerPago: (c: { tenantId: string; conexionId: string }, paymentId: string) => Promise<PagoMP>;
  negocio: (tenantId: string) => Promise<NegocioDelWebhook | null>;
  manejar: (notif: NotificacionPagoMP, opts: OpcionesNotificacion) => Promise<ResultadoNotificacion>;
  auditar: (tenantId: string, e: EntradaAuditoriaWebhook) => Promise<void>;
}

export const DEPS_MANEJADOR_MP: DepsManejadorMP = {
  leerPago: async (c, paymentId) => (await gatewayCobrosDeConexion(c.tenantId, c.conexionId)).getPayment(paymentId),
  negocio: (tenantId) => basePrisma.tenant.findUnique({ where: { id: tenantId }, select: SELECT_NEGOCIO }),
  manejar: manejarNotificacionMP,
  auditar: auditarEnNegocio,
};

/**
 * El `pago.acreditado` de una conexión de MP (corre en runInTenantContext(negocio) adentro de
 * `registrarYDespachar`). El negocio YA está probado por la firma de su secreto: el pago se lee
 * con el token de esa conexión y la referencia sólo puede ser de ese negocio.
 *  - 404/400 de MP → "ignorado" (el pago no es de esa cuenta);
 *  - 401/403 o MP caído → lanza: el evento queda "fallido" y MP reintenta (500);
 *  - `gsg:` de otro negocio → "ignorado" + AuditLog `rechazado` en el negocio de la conexión.
 * El cobro es idempotente por pedido (order-core) y el evento por `pago:<id>:<x-request-id>`.
 */
export function manejadorAvisoMP(deps: DepsManejadorMP = DEPS_MANEJADOR_MP): ManejadorEvento {
  return async ({ tenantId, conexionId, evento }) => {
    if (evento.tipo !== "pago.acreditado") return { estado: "ignorado", resumen: `tipo ${evento.tipo}` };
    const paymentId = (evento.datos as { pagoExterno?: unknown }).pagoExterno;
    if (typeof paymentId !== "string" || !paymentId) return { estado: "ignorado", resumen: "sin id de pago" };
    let pago: PagoMP;
    try {
      pago = await deps.leerPago({ tenantId, conexionId }, paymentId);
    } catch (err) {
      if (err instanceof MercadoPagoApiError && (err.status === 404 || err.status === 400)) {
        logger.warn("mercadopago.webhook", "aviso de un pago que la cuenta de la conexión no tiene", { paymentId, conexionId, status: err.status });
        return { estado: "ignorado", resumen: "pago-no-encontrado", entidad: "PagoMP", entidadId: paymentId };
      }
      if (err instanceof MercadoPagoApiError && (err.status === 401 || err.status === 403)) {
        logger.error("monitor", "Mercado Pago rechazó el access token de la conexión: hay que reconectarla", err, {
          tenantId,
          conexionId,
          paymentId,
          status: err.status,
        });
      }
      throw err;
    }
    const rechazar = async (motivo: string) => {
      const changes = { motivo, externalReference: pago.externalReference || null, conexionId };
      logger.warn("mercadopago.webhook", "aviso de conexión rechazado sin efecto", { paymentId, tenantId, motivo });
      await deps.auditar(tenantId, { actor: `mercadopago:${paymentId}`, action: "rechazado", entity: "WebhookMercadoPago", entityId: paymentId, changes });
      return { estado: "ignorado" as const, resumen: motivo, entidad: "PagoMP", entidadId: paymentId };
    };
    const negocio = await deps.negocio(tenantId);
    if (!negocio || !conMercadoPagoActivo(negocio)) return rechazar("negocio-sin-mercadopago");
    const ref = referenciaDeLaConexion(pago.externalReference, negocio.slug);
    if (!ref.ok) return rechazar(ref.motivo);
    const resultado = await deps.manejar(
      { type: "payment", paymentId, tenantId },
      { pago: { ...pago, externalReference: ref.referencia ?? "" } },
    );
    return {
      estado: resultado.procesado ? "procesado" : "ignorado",
      resumen: resultado.motivo ?? (resultado.pedido?.cobrado ? "pedido cobrado" : undefined),
      entidad: "PagoMP",
      entidadId: paymentId,
    };
  };
}

/** El aviso de una conexión por el servicio nuevo: normalizar + EventoIntegracion + handler. */
export async function despacharAvisoMP(
  conexion: ConexionResuelta,
  req: EntradaCruda,
  manejador: ManejadorEvento = manejadorAvisoMP(),
): Promise<DespachoAvisoMP> {
  const conector = registroDeConectores().obtener(CLAVE_MERCADOPAGO);
  if (!conector) return { status: 503, cuerpo: { ok: false, error: "conector-ausente" } };
  const n = normalizarFailClosed(conector, req);
  if (!n.ok) {
    logger.warn("mercadopago.webhook", "normalizar rechazó el aviso", { motivo: n.motivo, conexionId: conexion.conexionId });
    return { status: n.motivo === "cuerpo_invalido" ? 400 : 500, cuerpo: { ok: false, error: n.motivo } };
  }
  const r: ResumenDespacho = await registrarYDespachar(conexion, conector, n.eventos, manejador);
  // Un handler que falló → 500: MP reintenta y el reintento reclama la fila "fallido".
  return { status: r.fallidos > 0 ? 500 : 200, cuerpo: { ok: r.fallidos === 0, resultado: r } };
}

export const DEPS_AVISO_MP: DepsAvisoMP = {
  env: process.env,
  ahoraMs: () => Date.now(),
  porFirma: (req, ahora) => resolverConexionPorFirma(CLAVE_MERCADOPAGO, req, ahora),
  despachar: (conexion, req) => despacharAvisoMP(conexion, req),
  leerPago: async (paymentId) => gatewayLegadoDelDespliegue().getPayment(paymentId),
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

function idDelCuerpo(cuerpo: CuerpoAviso): string | null {
  const id = cuerpo.data?.id;
  return typeof id === "string" || typeof id === "number" ? String(id).trim() : null;
}

function tipoDelAviso(consulta: Record<string, string>, cuerpo: CuerpoAviso): string {
  return (
    consulta.type ??
    consulta.topic ??
    (typeof cuerpo.type === "string"
      ? cuerpo.type
      : typeof cuerpo.action === "string" && cuerpo.action.startsWith("payment")
        ? "payment"
        : "")
  );
}

/**
 * El webhook viejo de S1 (`/api/webhooks/mercadopago`), delegado a las conexiones (P1-C5):
 *   1. rate limit (antes de leer nada);
 *   2. la conexión cuya firma valida (tope 20, tiempo constante) → servicio nuevo
 *      (EventoIntegracion deduplicado, handler en runInTenantContext del negocio de la conexión);
 *   3. ninguna firma valida → rechazo (401; 503 si no hay ninguna conexión con secreto), SIN
 *      adivinar el negocio por el host. Más conexiones que el tope → 503; dos que firman → 401.
 *   4. Sólo con `MP_MODO_LEGADO=1` y sin conexión que firme: el camino de S1 (secretos por env +
 *      `external_reference`), con aviso al monitor.
 */
export async function atenderAvisoMP(request: Request, deps: DepsAvisoMP = DEPS_AVISO_MP): Promise<Response> {
  // 1. Rate limit: antes de leer, verificar o tocar la base.
  const espera = deps.limitar(request);
  if (espera != null) return respuestaDemasiados(espera);

  const crudo = await entradaDeRequest(request);
  if (!crudo || crudo.metodo !== "POST") return falla(413, "aviso-invalido");
  const cuerpo = leerCuerpo(new TextDecoder().decode(crudo.cuerpo));
  // El `data.id` de la query (webhooks v2); si no viene, el del cuerpo, SÓLO como insumo del
  // manifest: si la firma valida, ese id está firmado; si no, no se usa para nada.
  const idCuerpo = idDelCuerpo(cuerpo);
  const dataId = (crudo.consulta["data.id"] ?? idCuerpo ?? "").trim();
  const req: EntradaCruda = { ...crudo, consulta: { ...crudo.consulta, "data.id": dataId } };

  // 2. La conexión que firmó.
  const porFirma = await deps.porFirma(req, new Date(deps.ahoraMs()));
  if (porFirma.ok) {
    if (idCuerpo != null && idCuerpo !== dataId) return falla(401, "id-no-firmado");
    const type = tipoDelAviso(crudo.consulta, cuerpo);
    if (type !== "payment") return ok({ ignored: { type, paymentId: dataId } });
    const { tenantId, conexionId } = porFirma.conexion;
    setRequestContext({ tenantId, paymentId: dataId });
    try {
      const d = await deps.despachar(porFirma.conexion, req);
      return Response.json(d.cuerpo, { status: d.status });
    } catch (err) {
      logger.error("mercadopago.webhook", "webhook de conexión falló", err, { paymentId: dataId, tenantId, conexionId });
      return Response.json({ ok: false }, { status: 500 });
    }
  }

  // 3. Ninguna conexión firmó.
  if (porFirma.motivo === "demasiadas") {
    logger.error("monitor", "webhook de Mercado Pago: más conexiones que el tope para resolver por firma", undefined, {
      aviso: "mp-webhook-demasiadas-conexiones",
    });
    return falla(503, "demasiadas-conexiones");
  }
  if (porFirma.motivo === "ambigua") {
    logger.error("monitor", "webhook de Mercado Pago: dos conexiones validan la misma firma (secreto repetido)", undefined, {
      aviso: "mp-webhook-firma-ambigua",
      paymentId: dataId || null,
    });
    return falla(401, "firma-ambigua");
  }
  if (!modoLegadoMP(deps.env)) {
    logger.warn("mercadopago.webhook", "webhook rechazado: ninguna conexión validó la firma", { motivo: porFirma.motivo, paymentId: dataId || null });
    return porFirma.motivo === "sin_secreto" ? falla(503, "sin-conexion") : falla(401, porFirma.motivo);
  }

  // 4. Modo legado (transición): el camino de S1, con la request reconstruida de los mismos bytes.
  logger.warn("monitor", "webhook de Mercado Pago por el camino legado (MP_MODO_LEGADO=1)", {
    aviso: "mp-webhook-modo-legado",
    motivo: porFirma.motivo,
    paymentId: dataId || null,
  });
  const legado = new Request(request.url, { method: "POST", headers: request.headers, body: crudo.cuerpo as unknown as BodyInit });
  return atenderAvisoMPLegado(legado, deps);
}

/** El aviso de S1 tal cual (secretos por env + `external_reference`). Sólo con MP_MODO_LEGADO=1. */
async function atenderAvisoMPLegado(request: Request, deps: DepsAvisoMP): Promise<Response> {
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
  const idCuerpoTxt = idDelCuerpo(cuerpo);
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
  const consulta: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    if (!Object.prototype.hasOwnProperty.call(consulta, k)) consulta[k] = v;
  });
  const type = tipoDelAviso(consulta, cuerpo);
  if (type !== "payment") return ok({ ignored: { type, paymentId } });

  // 5. El pago (con el id firmado) y su negocio.
  let pago: PagoMP;
  try {
    pago = await deps.leerPago(paymentId);
  } catch (err) {
    // Sólo 404 (pago que la cuenta no tiene) y 400 (id inválido) se acusan con 200: lo demás tiene
    // que volver a llegar, porque con 200 MP no reintenta y un pago acreditado quedaría sin cobrar.
    if (err instanceof MercadoPagoApiError && (err.status === 404 || err.status === 400)) {
      logger.warn("mercadopago.webhook", "aviso de un pago que la cuenta no tiene", { paymentId, status: err.status });
      return ok({ rechazado: "pago-no-encontrado" });
    }
    if (err instanceof MercadoPagoApiError && (err.status === 401 || err.status === 403)) {
      // Token vencido o rotado: no se arregla solo. 503 (MP reintenta) + alerta al monitor.
      logger.error("monitor", "Mercado Pago rechazó la credencial al leer un pago: revisar el access token", err, {
        paymentId,
        status: err.status,
      });
      return falla(503, "mp-credencial-rechazada");
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
