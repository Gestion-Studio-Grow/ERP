"use server";

// ============================================================================
// ACCIONES DE LA CAJA CON LECTOR — cobrar, anular un renglón con el encargado, configurar.
// ============================================================================
//
// COBRAR usa el MISMO alta de siempre (`insertOrder`, order-core.ts): stock, caja y venta en una
// transacción, con la clave del ticket contra el doble cobro. Lo que suma el súper va como
// opciones del alta, no como un camino aparte:
//   · el importe de la etiqueta de balanza por renglón;
//   · las promos vigentes (leídas acá) con el contexto del día y del medio de pago;
//   · el pago con varios medios.
// Todo se vuelve a decidir con lo que dice la base: la pantalla sólo muestra la vista previa.
//
// Cada acción devuelve el error (no lo tira): Next redacta en producción el mensaje de lo que se
// lanza, y la persona de la caja necesita leer qué pasó y qué hacer.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { auditAdmin } from "@/lib/audit-core";
import { logger } from "@/lib/logger";
import { requireAppAccion, AppNoDisponibleError } from "@/lib/require-app";
import { roleHasCapability } from "@/lib/capabilities";
import { verifyPassword } from "@/lib/auth-password";
import { createRateLimiter } from "@/lib/rate-limit";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { lastClosedDay } from "@/lib/caja/frontera-cierre";
import { isFrozenDay } from "@/lib/caja/cierre-diario";
import { fronteraDeVenta } from "@/lib/order-anulacion";
import { decidirAlta, insertOrder, motivoDelRechazoDelAlta, pedidoConClave } from "@/lib/order-core";
import { productosQuePuedenQuedarNegativos } from "@/lib/stock/pos-stock-rules";
import { Prisma } from "@/generated/prisma/client";
import type { VentaTicket } from "@/app/admin/(dashboard)/vender/reglas-venta";
import { leerConfigCaja, leerPromociones, guardarConfigCajaEnTx } from "./config-repo";
import { gondolasEnTx, ticketDeLaVenta } from "./caja-lectura";
import { seccionDe } from "./secciones";
import { cobroDesdeAfuera, pagosParaElTotal } from "./ticket-caja";
import { medioPrincipal, repartirPagos, textoDelPago } from "./pago-mixto";
import { diaDeLaSemana } from "./promociones";
import { formatoDesdeAfuera, problemaDelFormato } from "./balanza";
import { ACCION_ANULAR_RENGLON, ENTIDAD_RENGLON_DE_CAJA } from "./marcas";

const RUTAS = ["/admin/caja-rapida", "/admin/ventas", "/admin/pedidos", "/admin/caja"];

export type EstadoCobroCaja =
  | { ok: true; venta: VentaTicket; vuelto: number; yaEstaba?: true }
  | { ok: false; error: string; falta?: number; tipo?: "sin-confirmar" };

function noDisponible(e: unknown): { ok: false; error: string } | null {
  return e instanceof AppNoDisponibleError ? { ok: false, error: e.message } : null;
}

/** Cobra el ticket de la caja con lector. */
export async function cobrarVentaDeCaja(entrada: unknown): Promise<EstadoCobroCaja> {
  let user;
  try {
    user = await requireAppAccion("caja-rapida");
  } catch (e) {
    const r = noDisponible(e);
    if (r) return r;
    throw e;
  }
  const cobro = cobroDesdeAfuera(entrada);
  if (!cobro) return { ok: false, error: "El ticket llegó incompleto: volvé a cobrar." };
  const tenantId = await getCurrentTenantId();

  // La clave del ticket primero: si ya se grabó (se cortó la conexión y se reintenta), se
  // devuelve ESA venta y no se cobra dos veces. La pantalla no deja tocar el ticket mientras
  // reintenta, así que lo que llega con la misma clave es lo mismo.
  const previa = await pedidoConClave(tenantId, cobro.clave);
  if (previa) {
    const venta = await ticketDeLaVenta(prisma, tenantId, previa.id);
    return venta ? { ok: true, venta, vuelto: 0, yaEstaba: true } : { ok: false, error: "No encontramos la venta grabada: fijate en Ventas del día." };
  }

  const ids = [...new Set(cobro.renglones.map((r) => r.productId))];
  const hoy = dateStrInBusinessTz(new Date());
  const [productos, gondolas, promos, cerradoHasta] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId, id: { in: ids }, deletedAt: null, active: true },
      select: { id: true, name: true, saleUnit: true, price: true, pricePerKg: true, trackStock: true },
    }),
    tenantTransaction((tx) => gondolasEnTx(tx, tenantId), { tenantId }),
    leerPromociones(prisma, tenantId),
    lastClosedDay(tenantId),
  ]);
  if (productos.length !== ids.length) {
    return { ok: false, error: "Un producto del ticket ya no está a la venta (se pausó o se borró). Sacalo y cobrá de nuevo." };
  }
  const seccionPorProducto = Object.fromEntries(
    productos.map((p) => [p.id, seccionDe({ name: p.name, saleUnit: p.saleUnit, category: gondolas.get(p.id) ?? null })]),
  );
  const medios = new Set(cobro.pagos.map((p) => p.medio));
  const contexto = { fecha: hoy, diaSemana: diaDeLaSemana(hoy), medio: medios.size === 1 ? cobro.pagos[0].medio : null };
  const items = cobro.renglones.map((r) => ({ productId: r.productId, qty: r.cantidad, importe: r.importe }));
  const promociones = { vigentes: promos, contexto, seccionPorProducto };

  // El total con los precios y las promos de la base, ANTES de repartir los pagos: con varios
  // medios, cada uno tiene que sumar exacto (el alta lo vuelve a verificar adentro de la tx).
  const base = {
    channel: "COUNTER" as const,
    fulfillment: "PICKUP" as const,
    customerName: cobro.cliente?.nombre || "Mostrador",
    customerPhone: cobro.cliente?.telefono || "",
    address: null,
    notes: null,
    scheduledFor: null,
    paid: true,
    items,
  };
  let total: number;
  try {
    total = decidirAlta({ tenantId, input: { ...base, paymentMethod: [...medios][0] }, products: productos, opts: { promociones } }).total;
  } catch (err) {
    const motivo = motivoDelRechazoDelAlta(err);
    if (motivo !== null) return { ok: false, error: motivo };
    throw err;
  }
  const reparto = repartirPagos(total, pagosParaElTotal(cobro.pagos, total));
  if (!reparto.ok) return { ok: false, error: reparto.error, ...(reparto.falta ? { falta: reparto.falta } : {}) };
  const paymentMethod = reparto.mixto ? medioPrincipal(reparto.asientos)! : reparto.asientos[0].medio;

  const frontera = fronteraDeVenta({ paid: true, paymentMethod, hoy, cerradoHasta, esDiaCerrado: isFrozenDay, contexto: "caja-con-lector" });
  if (frontera.bloquea) return { ok: false, error: frontera.error };

  let r;
  try {
    r = await insertOrder(
      tenantId,
      { ...base, paymentMethod },
      {
        imputarCajaActor: `user:${user.id}`,
        idempotencyKey: cobro.clave,
        // Lo que se vende por peso en el mostrador puede dejar el stock en negativo (MAG-4).
        permitirNegativoPorProducto: productosQuePuedenQuedarNegativos(productos, "COUNTER"),
        promociones,
        pagosMixtos: reparto.mixto ? { asientos: reparto.asientos } : null,
      },
    );
  } catch (err) {
    const motivo = motivoDelRechazoDelAlta(err);
    if (motivo !== null) return { ok: false, error: motivo };
    logger.error("caja-rapida", "el cobro falló por algo que no es un rechazo de negocio", err);
    return {
      ok: false,
      tipo: "sin-confirmar",
      error: "No pudimos confirmar si la venta se grabó. Reintentá desde esta pantalla sin tocar el ticket: si ya se grabó, no se cobra dos veces.",
    };
  }
  if (r.dedup) {
    const venta = await ticketDeLaVenta(prisma, tenantId, r.id);
    return venta ? { ok: true, venta, vuelto: 0, yaEstaba: true } : { ok: false, error: "No encontramos la venta grabada: fijate en Ventas del día." };
  }

  // La venta de mostrador cobrada ya terminó: nace entregada (como en Vender, order-actions.ts).
  await prisma.order.updateMany({ where: { id: r.id, tenantId, status: "CONFIRMED" }, data: { status: "DELIVERED" } });
  await auditAdmin({
    action: "create",
    entity: "Order",
    entityId: r.id,
    changes: {
      code: r.code,
      channel: "COUNTER",
      fulfillment: "PICKUP",
      status: "DELIVERED",
      total: r.total ?? r.subtotal,
      lines: r.lines,
      caja: "caja-con-lector",
      pago: textoDelPago(reparto.asientos),
      ...(reparto.vuelto > 0 ? { vuelto: reparto.vuelto } : {}),
    },
  });
  for (const ruta of RUTAS) revalidatePath(ruta);
  const venta = await ticketDeLaVenta(prisma, tenantId, r.id);
  if (!venta) return { ok: false, error: "La venta se grabó pero no pudimos leerla: fijate en Ventas del día." };
  return { ok: true, venta, vuelto: reparto.vuelto };
}

// ── Anular un renglón con el encargado ───────────────────────────────────────

/** Intentos fallidos de clave de encargado: 5 cada 15 minutos por cajero. */
const intentosDeEncargado = createRateLimiter({ max: 5, windowMs: 15 * 60 * 1000 });

export type EstadoAnulacionDeRenglon = { ok: true; autorizo: string } | { ok: false; error: string };

/**
 * Anula un renglón del ticket que se está armando (antes de cobrar). Si quien cobra no es dueño
 * ni encargado, hace falta el mail y la clave de uno (la persona se acerca a la caja). Queda en
 * la auditoría: qué, cuánto, quién cobraba y quién autorizó. Lo que ya se cobró se anula desde
 * Ventas del día (con su contrapartida en la caja), no desde acá.
 */
export async function anularRenglonDeCaja(entrada: unknown): Promise<EstadoAnulacionDeRenglon> {
  let user;
  try {
    user = await requireAppAccion("caja-rapida");
  } catch (e) {
    const r = noDisponible(e);
    if (r) return r;
    throw e;
  }
  const o = (entrada ?? {}) as Record<string, unknown>;
  const ticket = typeof o.ticket === "string" ? o.ticket.slice(0, 80) : "";
  const r = (o.renglon ?? {}) as Record<string, unknown>;
  const nombre = typeof r.nombre === "string" ? r.nombre.slice(0, 200) : "";
  const cantidad = typeof r.cantidad === "number" && Number.isFinite(r.cantidad) ? r.cantidad : null;
  const importe = typeof r.importe === "number" && Number.isFinite(r.importe) ? r.importe : null;
  if (!ticket || !nombre || cantidad === null || importe === null) return { ok: false, error: "Elegí el renglón que querés anular." };
  const tenantId = await getCurrentTenantId();
  const config = await leerConfigCaja(prisma, tenantId);

  let autorizo = { id: user.id, nombre: user.name };
  const esEncargado = (u: { id: string; role: string }) => u.role === "OWNER" || config.encargados.includes(u.id);
  if (!esEncargado(user)) {
    const a = (o.autoriza ?? {}) as Record<string, unknown>;
    const email = typeof a.email === "string" ? a.email.trim().toLowerCase().slice(0, 200) : "";
    const clave = typeof a.clave === "string" ? a.clave.slice(0, 200) : "";
    if (!email || !clave) return { ok: false, error: "Para anular un renglón hace falta el encargado: que ponga su mail y su clave." };
    const llave = `anular-renglon:${tenantId}:${user.id}`;
    if (intentosDeEncargado.blocked(llave)) {
      return { ok: false, error: "Demasiados intentos con una clave equivocada. Esperá unos minutos o que el encargado anule desde su usuario." };
    }
    const encargado = await prisma.user.findFirst({
      where: { tenantId, email, active: true, deletedAt: null },
      select: { id: true, name: true, role: true, passwordHash: true },
    });
    const claveOk = encargado ? await verifyPassword(clave, encargado.passwordHash) : false;
    if (!encargado || !claveOk) {
      intentosDeEncargado.fail(llave);
      return { ok: false, error: "El mail o la clave del encargado no son correctos." };
    }
    if (!esEncargado(encargado)) {
      return { ok: false, error: `${encargado.name} no autoriza anulaciones en la caja. Lo decide el dueño en la configuración de la caja.` };
    }
    intentosDeEncargado.reset(llave);
    autorizo = { id: encargado.id, nombre: encargado.name };
  }

  await auditAdmin({
    action: ACCION_ANULAR_RENGLON,
    entity: ENTIDAD_RENGLON_DE_CAJA,
    entityId: ticket,
    changes: { producto: nombre, cantidad, importe, cajero: user.name, autorizo: autorizo.nombre, autorizoId: autorizo.id },
  });
  return { ok: true, autorizo: autorizo.nombre };
}

// ── Configuración: formato de la balanza y encargados ───────────────────────

export type EstadoConfigCaja = { ok: true; mensaje: string } | { ok: false; error: string } | null;

export async function guardarConfigDeCaja(_prev: EstadoConfigCaja, formData: FormData): Promise<EstadoConfigCaja> {
  let user;
  try {
    user = await requireAppAccion("caja-rapida");
  } catch (e) {
    const r = noDisponible(e);
    if (r) return r;
    throw e;
  }
  // La configuración la toca quien administra el catálogo (el dueño): cambia cómo se cobra.
  if (!roleHasCapability(user.role, "catalog:manage")) return { ok: false, error: "La configuración de la caja la cambia el dueño del negocio." };
  const formato = {
    prefijos: formData.getAll("prefijos").map(String),
    digitosProducto: Number(formData.get("digitosProducto")),
    contenido: String(formData.get("contenido") ?? ""),
    decimales: Number(formData.get("decimales")),
  };
  const problema = problemaDelFormato(formato);
  if (problema) return { ok: false, error: problema };
  const valido = formatoDesdeAfuera(formato)!;
  const tenantId = await getCurrentTenantId();
  const encargadosPedidos = formData.getAll("encargados").map(String).filter(Boolean).slice(0, 50);
  const existentes = encargadosPedidos.length
    ? await prisma.user.findMany({ where: { tenantId, id: { in: encargadosPedidos }, active: true, deletedAt: null }, select: { id: true } })
    : [];
  const versionLeida = String(formData.get("version") ?? "") || null;
  try {
    await tenantTransaction(
      (tx) =>
        guardarConfigCajaEnTx(tx, tenantId, {
          config: { formato: valido, encargados: existentes.map((u) => u.id) },
          actor: `user:${user.id}`,
          versionLeida,
        }),
      { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (err) {
    const motivo = motivoDelRechazoDelAlta(err);
    if (motivo !== null) return { ok: false, error: motivo };
    throw err;
  }
  revalidatePath("/admin/caja-rapida");
  revalidatePath("/admin/caja-rapida/configuracion");
  return { ok: true, mensaje: "Listo: la caja ya lee las etiquetas con este formato." };
}
