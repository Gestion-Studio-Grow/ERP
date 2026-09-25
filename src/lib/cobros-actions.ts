"use server";

// Server Actions del módulo COBROS (Mercado Pago — links de pago). El cobro libre (monto a
// mano) está gated por `payments:manage` (OWNER); el link de un PEDIDO, por `orders:manage`,
// porque su monto sale de la base (ver abajo). Modo sandbox por defecto: funciona sin credenciales;
// con `MP_MODO=real` + `MP_ACCESS_TOKEN` genera links reales. Nunca maneja secretos
// en código (el token lo carga el dueño en el entorno).

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { auditAdmin } from "@/lib/audit-core";
import { round2 } from "@/lib/round";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { cobrarPedidoPorAvisoDePago } from "@/lib/order-core";
import {
  crearPasarelaCobrosPara,
  modoCobrosDesdeEnv,
  type ModoCobros,
} from "@/lib/mercadopago-cobros-dispatch";
import {
  SolicitudCobroInvalidaError,
  type SolicitudCobro,
} from "@/plugins/mercadopago/cobros";
import { MercadoPagoApiError } from "@/plugins/mercadopago/http";
import { procesarNotificacionPago } from "@/plugins/mercadopago/handler";
import { referenciaDePedido } from "@/plugins/mercadopago/core-contract";
import { StubMercadoPagoClient } from "@/plugins/mercadopago/stub";
import { importeONaN } from "@/lib/dinero/leer";
import {
  ACCION_LINK_DE_PAGO,
  linkDePagoDisponible,
  simulacionDisponible,
  simuladorDeAvisosEncendido,
  textoDelLinkDePago,
  tieneMercadoPago,
  ultimosLinks,
} from "@/app/admin/(dashboard)/pedidos/link-de-pago";

const SIN_MERCADO_PAGO =
  "Mercado Pago todavía no está conectado en este negocio. Pedile al dueño que lo conecte para mandar links de pago.";

/** Resultado de generar un cobro — lo consume la UI (CobrosSection). */
export type GenerarCobroResult =
  | {
      ok: true;
      preferenceId: string;
      initPoint: string;
      sandboxInitPoint?: string;
      modo: ModoCobros;
    }
  | { ok: false; error: string };

/**
 * Genera un link de cobro (preferencia de Checkout Pro) desde el formulario del
 * backoffice. Devuelve el link para compartir (WhatsApp) o un error legible.
 */
export async function generarCobro(formData: FormData): Promise<GenerarCobroResult> {
  await requireCapability("payments:manage");
  const tenantId = await getCurrentTenantId();

  const concepto = String(formData.get("concepto") || "").trim();
  const monto = importeONaN(formData.get("monto"));
  const referenciaExterna = String(formData.get("referenciaExterna") || "").trim() || undefined;
  const emailPagador = String(formData.get("emailPagador") || "").trim() || undefined;

  const solicitud: SolicitudCobro = { concepto, monto, referenciaExterna, emailPagador };

  try {
    const pasarela = crearPasarelaCobrosPara(tenantId);
    const link = await pasarela.crearLinkDePago(solicitud);
    await auditAdmin({
      action: "create",
      entity: "PaymentLink",
      entityId: link.preferenceId,
      changes: { concepto, monto, referenciaExterna },
    });
    return {
      ok: true,
      preferenceId: link.preferenceId,
      initPoint: link.initPoint,
      sandboxInitPoint: link.sandboxInitPoint,
      modo: modoCobrosDesdeEnv(),
    };
  } catch (e) {
    if (e instanceof SolicitudCobroInvalidaError) {
      return { ok: false, error: e.errores.map((x) => x.mensaje).join(" ") };
    }
    if (e instanceof MercadoPagoApiError) {
      // No filtrar detalles crudos del proveedor al operador: mensaje claro + código.
      return {
        ok: false,
        error: `Mercado Pago rechazó la solicitud (${e.status}). Revisá el access token y que la cuenta esté habilitada para cobrar.`,
      };
    }
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo generar el cobro." };
  }
}

/** Modo de cobros actual (para que la UI avise si está en sandbox). */
export async function estadoCobros(): Promise<{ modo: ModoCobros }> {
  await requireCapability("payments:manage");
  return { modo: modoCobrosDesdeEnv() };
}

// ============================================================================
// LINK DE PAGO DE UN PEDIDO (bandeja de Pedidos para preparar)
// ============================================================================
//
// A diferencia de `generarCobro` (monto y concepto escritos a mano, sólo la dueña), acá el
// monto sale del PEDIDO en la base y el link queda atado a él (`referenciaDePedido`): por eso
// alcanza con `orders:manage`, la misma capability que cobrar el pedido en la bandeja.
// Recepción no elige cuánto se cobra; sólo manda el link del total que ya está.
//
// Y sólo en un negocio con el módulo de Mercado Pago contratado (`tieneMercadoPago`, sobre
// `Tenant.modules` leído acá mismo, no sobre el menú): el token de Mercado Pago es uno por
// despliegue (mercadopago-cobros-dispatch.ts), así que sin este candado recepción de cualquier
// comercio del despliegue generaría links que cobran en esa cuenta. La pantalla usa la misma
// regla (`linkDePagoDisponible`) para mostrar el botón.
//
// Lo que el link NO hace todavía: cobrar solo el pedido cuando el cliente paga. Eso lo resuelve
// `cobrarPedidoPorAvisoDePago`, pero el webhook de producción no se lo pasa al handler (ver
// pedidos/link-de-pago.ts). Hoy el pedido pagado se marca con «Cobrar».

export type EstadoLinkDePago =
  | null
  | { ok: true; url: string; monto: number; code: number; whatsapp: string | null; prueba: boolean }
  | { ok: false; error: string };

export async function generarLinkDePagoDePedido(
  _prev: EstadoLinkDePago,
  formData: FormData,
): Promise<EstadoLinkDePago> {
  await requireCapability("orders:manage");
  const tenantId = await getCurrentTenantId();
  const modo = modoCobrosDesdeEnv();
  const id = String(formData.get("id") || "").trim();
  if (!id) return { ok: false, error: "Falta identificar el pedido." };
  const [o, tenant] = await Promise.all([
    prisma.order.findFirst({
      where: { id, tenantId },
      select: { id: true, code: true, total: true, paid: true, status: true, customerPhone: true },
    }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, modules: true } }),
  ]);
  if (
    !linkDePagoDisponible({
      modo,
      simulador: simuladorDeAvisosEncendido(),
      moduloMercadoPago: tieneMercadoPago(tenant?.modules),
    })
  ) {
    return { ok: false, error: SIN_MERCADO_PAGO };
  }
  if (!o) return { ok: false, error: "No se encontró el pedido." };
  if (o.status === "CANCELLED") return { ok: false, error: `El pedido #${o.code} está anulado: no se cobra.` };
  if (o.paid) return { ok: false, error: `El pedido #${o.code} ya está cobrado.` };
  const monto = round2(o.total);
  if (!(monto > 0)) return { ok: false, error: `El pedido #${o.code} no tiene importe para cobrar.` };
  const negocio = tenant?.name ?? "el local";

  const solicitud: SolicitudCobro = {
    concepto: `Pedido #${o.code} · ${negocio}`,
    monto,
    referenciaExterna: referenciaDePedido(o.id),
  };
  try {
    const link = await crearPasarelaCobrosPara(tenantId).crearLinkDePago(solicitud);
    // Con credenciales de prueba se paga en el sandbox de Mercado Pago; con las reales, el link real.
    const url = modo === "real" ? link.initPoint : (link.sandboxInitPoint ?? link.initPoint);
    await auditAdmin({
      action: ACCION_LINK_DE_PAGO,
      entity: "Order",
      entityId: o.id,
      changes: { code: o.code, monto, preferenceId: link.preferenceId, modo, url },
    });
    revalidatePath("/admin/pedidos");
    return {
      ok: true,
      url,
      monto,
      code: o.code,
      whatsapp: waLinkClienta(o.customerPhone, textoDelLinkDePago({ negocio, code: o.code, monto, url })),
      prueba: modo !== "real",
    };
  } catch (e) {
    if (e instanceof SolicitudCobroInvalidaError) {
      return { ok: false, error: e.errores.map((x) => x.mensaje).join(" ") };
    }
    if (e instanceof MercadoPagoApiError) {
      return {
        ok: false,
        error: `Mercado Pago rechazó el link (${e.status}). Pedile al dueño que revise la conexión con Mercado Pago.`,
      };
    }
    return { ok: false, error: "No se pudo generar el link ahora. Probá de nuevo en un rato." };
  }
}

export type EstadoSimulacionDePago = null | { ok: true; mensaje: string } | { ok: false; error: string };

/**
 * SÓLO PARA PROBAR (modo `stub` con `MP_SIMULAR_AVISOS`): hace llegar el aviso de pago del link
 * como si el cliente hubiera pagado, con el monto del último link generado. Corre el handler del
 * plugin (`procesarNotificacionPago`) con `cobrarPedidoPorAvisoDePago` conectado: el mismo
 * handler y el mismo cobro que va a usar el aviso real CUANDO el webhook los conecte (hoy no:
 * ver pedidos/link-de-pago.ts). Lo que el simulador NO recorre es la ruta del webhook, su firma
 * y su despacho. El id del pago es fijo por pedido: tocarlo dos veces es el mismo aviso
 * repetido, y tiene que dejar un solo asiento en el libro.
 */
export async function simularPagoDePedido(
  _prev: EstadoSimulacionDePago,
  formData: FormData,
): Promise<EstadoSimulacionDePago> {
  await requireCapability("orders:manage");
  const tenantId = await getCurrentTenantId();
  const id = String(formData.get("id") || "").trim();
  if (!id) return { ok: false, error: "Falta identificar el pedido." };
  const [o, filas, tenant] = await Promise.all([
    prisma.order.findFirst({ where: { id, tenantId }, select: { id: true, code: true } }),
    prisma.auditLog.findMany({
      where: { tenantId, entity: "Order", entityId: id, action: ACCION_LINK_DE_PAGO },
      select: { entityId: true, createdAt: true, changes: true },
    }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { modules: true } }),
  ]);
  if (
    !simulacionDisponible({
      modo: modoCobrosDesdeEnv(),
      simulador: simuladorDeAvisosEncendido(),
      moduloMercadoPago: tieneMercadoPago(tenant?.modules),
    })
  ) {
    return { ok: false, error: "La simulación de pagos sólo existe en el modo de prueba, con Mercado Pago contratado." };
  }
  if (!o) return { ok: false, error: "No se encontró el pedido." };
  const link = ultimosLinks(filas).get(o.id);
  if (!link) return { ok: false, error: `El pedido #${o.code} no tiene un link de pago generado.` };

  const cliente = new StubMercadoPagoClient();
  const paymentId = `simulado-${o.id}`;
  cliente.simularPago({
    id: paymentId,
    estado: "approved",
    monto: link.monto,
    externalReference: referenciaDePedido(o.id),
    descripcion: `Pago de prueba del pedido #${o.code}`,
  });
  const r = await procesarNotificacionPago(
    { type: "payment", paymentId, tenantId },
    { clientePara: () => cliente, facturar: async () => null, cobrarPedido: cobrarPedidoPorAvisoDePago },
  );
  revalidatePath("/admin/pedidos");
  revalidatePath("/admin/ventas");
  revalidatePath("/admin/vender");
  const p = r.pedido;
  if (p?.cobrado) return { ok: true, mensaje: `Llegó el aviso de pago: pedido #${p.code} cobrado con Mercado Pago.` };
  if (p?.motivo === "ya-cobrado") return { ok: true, mensaje: `Aviso repetido: el pedido #${o.code} ya estaba cobrado. No se asentó dos veces.` };
  return { ok: false, error: p?.detalle ?? "El aviso no cobró el pedido." };
}
