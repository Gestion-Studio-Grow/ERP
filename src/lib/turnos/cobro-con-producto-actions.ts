"use server";

// ============================================================================
// COBRO ÚNICO TURNO + PRODUCTOS — la Server Action (Venta y agenda simples, T1).
// ============================================================================
//
// Con `venta-agenda-simple` prendido, «Terminar» del cajón cobra el saldo del turno y los productos
// sumados en UN toque y en UNA transacción Serializable:
//   1. el cobro del turno, con el motor de siempre (`aplicarCobroTurnoInTx`: Collection + Payment
//      agregado + asiento en el libro, guarda de saldo y de caja cerrada);
//   2. la orden de los productos, con el cuerpo del alta de siempre (`insertarOrdenEnTx`: Order +
//      líneas + stock por el ledger + asiento de la venta en el libro);
//   3. el turno a COMPLETED (y el consumo de insumos), como `terminarYCobrarDividido`.
// Si cualquier pata falla (stock que no alcanza, caja cerrada, el turno cambió, la base se corta),
// no queda nada: ni cobro, ni orden, ni movimiento de stock, ni asiento.
//
// IDEMPOTENCIA: la hoja manda una clave por apertura (`clave`). El cobro del turno se escribe con
// `turno-producto:<clave>` y la orden con `turno-producto:<clave>:pedido` (derivada). Un doble toque
// secuencial encuentra la clave (pre-check en la tx) o el turno ya terminado; dos a la vez chocan en
// el `@@unique([tenantId, idempotencyKey])` y `settleAppointmentPaymentGuarded` lo da por ganado.
//
// FRONTERA DEL DÍA CERRADO (lección DB-5): se lee `lastClosedDay` y se rechaza ANTES de abrir la
// transacción; `aplicarCobroTurnoInTx` la vuelve a exigir adentro. Sin interruptor, la acción no
// hace nada: la pantalla de siempre ni siquiera la llama.

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireCapability } from "@/lib/authz";
import { roleHasCapability } from "@/lib/capabilities";
import { getCurrentTenantId } from "@/lib/tenant";
import { isDemoSandbox } from "@/lib/demo-flag";
import { tenantTransaction } from "@/lib/rls";
import { auditAdmin } from "@/lib/audit-core";
import { logger } from "@/lib/logger";
import { RechazoDeDominio, rechazoDeDominio } from "@/lib/rechazo-de-dominio";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { dateStrInBusinessTz, todayInBusinessTz } from "@/lib/datetime";
import { recordMovement } from "@/lib/stock/ledger";
import { productosQuePuedenQuedarNegativos } from "@/lib/stock/pos-stock-rules";
import { decidirAlta, insertarOrdenEnTx, motivoDelRechazoDelAlta, sellPrice, type OrderInput } from "@/lib/order-core";
import { tarjetaHabilitada } from "@/lib/caja-actions";
import { isInvoicingEnabled } from "@/lib/fiscal";
import { facturarAppointment } from "@/lib/invoice-from-appointment";
import { lastClosedDay } from "@/lib/caja/frontera-cierre";
import { isFrozenDay } from "@/lib/caja/cierre-diario";
import { cobroTurnoDetail, settleAppointmentPaymentGuarded, type SettleOutcome } from "@/lib/caja/cobro-turno";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { ventaAgendaSimplePrendida } from "@/cambios/interruptores";
import { cargarVender } from "@/app/admin/(dashboard)/vender/datos";
import { resultadoDeFacturaFallida } from "./factura-fallida.server";
import { avisoDeFacturaDelTurno, type ResultadoFacturaDelTurno } from "./aviso-factura";
import {
  aplicarCobroTurnoInTx,
  cobrosDelTurnoInTx,
  mensajeCobroEnDiaCerrado,
  rastroLibroCaja,
  CobroTurnoRechazado,
  CompletarTurnoRechazado,
  type AplicarCobroResult,
  type CobroTurnoTx,
} from "./cobro-turno-repo";
import { estadoCobroTurno, puedeCompletarse, type MetodoDePago } from "./cobros";
import { puedeCobrarEsteTurno } from "./cobro-mostrador";
import { leerFilasDeTurnos } from "./sin-cerrar.server";
import { claveDelCobro, claveDelPedido, esMedioConProducto, esMedioDeTarjeta, leerClave, leerRenglones } from "./cobro-con-producto";

export type ResultadoCobroConProducto =
  | { ok: true; aviso?: string; orderCode?: number; total?: number }
  | { ok: false; error: string };

/** Un producto que se puede sumar al turno (lo de Vender, sin el código de barras). */
export type ProductoParaElTurno = { id: string; name: string; saleUnit: "UNIT" | "WEIGHT"; precio: number };

const APAGADO = "Cobrar el turno con productos no está prendido en este negocio.";
const YA_NO_EXISTE = "Ese turno ya no existe. Recargá la agenda.";
const CAMBIO_RECIEN = "Ese turno cambió recién. Recargá la agenda.";
const NO_COBRA = "Cobrar un turno lo hace quien cobra los turnos.";
const NO_VENDE = "Sumar productos al cobro lo hace quien vende en el mostrador.";
const SIN_TARJETA = "Este negocio todavía no cobra con tarjeta: elegí otro medio.";
const NO_SE_COBRO = "No se pudo cobrar y no quedó nada a medias: no se registró ningún cobro ni venta. Probá de nuevo; si sigue, avisá.";
const SERIALIZABLE = Prisma.TransactionIsolationLevel.Serializable;
/** Reintentos ante el choque del correlativo de la orden (max(code)+1 bajo concurrencia). */
const REINTENTOS_DE_CODIGO = 3;

type Usuario = Awaited<ReturnType<typeof requireCapability>>;

function texto(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

/** La regla de siempre de quién vende y cobra, más el interruptor. Fallar acá no escribe nada. */
async function habilitado(user: Usuario): Promise<string | null> {
  if (!roleHasCapability(user.role, "agenda:collect")) return NO_COBRA;
  if (!roleHasCapability(user.role, "orders:manage")) return NO_VENDE;
  if (!ventaAgendaSimplePrendida(await interruptoresDelNegocio())) return APAGADO;
  return null;
}

/** Los productos que ofrece el buscador del cajón: la MISMA lectura de Vender (`cargarVender`). */
export async function productosParaElTurno(): Promise<{ ok: true; productos: ProductoParaElTurno[]; conTarjeta: boolean } | { ok: false; error: string }> {
  const user = await requireCapability("agenda:complete");
  const no = await habilitado(user);
  if (no) return { ok: false, error: no };
  const tenantId = await getCurrentTenantId();
  const [{ products }, conTarjeta] = await Promise.all([cargarVender(tenantId, todayInBusinessTz()), tarjetaHabilitada()]);
  const productos: ProductoParaElTurno[] = [];
  for (const p of products) {
    const precio = sellPrice(p);
    if (precio != null && precio > 0) productos.push({ id: p.id, name: p.name, saleUnit: p.saleUnit, precio });
  }
  return { ok: true, productos, conTarjeta };
}

/** Consumo de insumos al terminar el turno (ledger), igual que `terminarYCobrarDividido`. */
async function consumirInsumos(
  tx: CobroTurnoTx,
  a: { id: string; tenantId: string; service: { products: readonly { productId: string; quantity: number; product: { name: string } }[] } },
  actor: string,
) {
  for (const usage of a.service.products) {
    await recordMovement(tx, {
      tenantId: a.tenantId,
      productId: usage.productId,
      type: "CONSUMO",
      qty: usage.quantity,
      appointmentId: a.id,
      createdBy: actor,
      label: usage.product.name,
      allowNegative: true,
    });
  }
}

async function facturarConResultado(appointmentId: string, tenantId: string): Promise<ResultadoFacturaDelTurno> {
  try {
    const invoiceId = await facturarAppointment(appointmentId, tenantId);
    if (!invoiceId) return { tipo: "sin-factura" };
    const factura = await prisma.invoice.findFirst({ where: { id: invoiceId, tenantId }, select: { status: true, rechazoMotivo: true } });
    if (!factura) return { tipo: "fallo" };
    return { tipo: "emitida", status: factura.status, rechazoMotivo: factura.rechazoMotivo };
  } catch (err) {
    return resultadoDeFacturaFallida(err, { appointmentId, tenantId });
  }
}

function comoRechazo(e: unknown): string {
  unstable_rethrow(e);
  if (e instanceof CompletarTurnoRechazado || e instanceof CobroTurnoRechazado) return e.message;
  const delAlta = motivoDelRechazoDelAlta(e);
  if (delAlta !== null) return delAlta;
  return rechazoDeDominio(e, NO_SE_COBRO, "turnos.cobro-con-producto");
}

/**
 * Termina el turno cobrando su saldo y los productos sumados, con UN medio, en UNA transacción.
 *
 * Campos: `appointmentId`, `method` (EFECTIVO · TRANSFERENCIA · MERCADOPAGO · DEBITO · CREDITO),
 * `productos` (JSON `{ productId, qty }[]`, al menos uno), `clave` (uuid de la hoja), `vino=on` (un
 * Reservado con la hora pasada), `facturar=false` (opcional, la factura del turno).
 */
export async function cobrarTurnoConProductos(formData: FormData): Promise<ResultadoCobroConProducto> {
  const user = await requireCapability("agenda:complete");
  const no = await habilitado(user);
  if (no) return { ok: false, error: no };
  if (isDemoSandbox()) return { ok: true }; // modo demo: no persiste

  const appointmentId = texto(formData.get("appointmentId"));
  if (!appointmentId) return { ok: false, error: "Falta identificar el turno." };
  const method = texto(formData.get("method"));
  if (!esMedioConProducto(method)) return { ok: false, error: "Elegí con qué se cobra." };
  if (esMedioDeTarjeta(method) && !(await tarjetaHabilitada())) return { ok: false, error: SIN_TARJETA };
  const leidos = leerRenglones(formData.get("productos"));
  if (!leidos.ok) return { ok: false, error: leidos.error };
  const clave = leerClave(formData.get("clave"));
  if (!clave) return { ok: false, error: "Falta la clave del cobro. Recargá la agenda y probá de nuevo." };
  const vino = formData.get("vino") === "on";
  const facturar = formData.get("facturar") !== "false";
  const tenantId = await getCurrentTenantId();
  const actor = `user:${user.id}`;

  // El permiso sobre ESTE turno, antes de abrir la transacción (fallar acá no escribe nada).
  const [fila] = await leerFilasDeTurnos(tenantId, { ids: [appointmentId] });
  if (!fila) return { ok: false, error: YA_NO_EXISTE };
  const veredicto = puedeCobrarEsteTurno({
    rol: user.role,
    professionalIdDelUsuario: user.professionalId,
    professionalIdDelTurno: fila.professionalId,
    nombreProfesional: fila.professional.name,
    cobraEnMostrador: fila.professional.cobraEnMostrador,
  });
  if (!veredicto.ok) return { ok: false, error: veredicto.motivo };

  // LA FRONTERA DEL CIERRE (DB-5): la caja de hoy cerrada frena el cobro entero, turno y productos.
  const cerradoHasta = await lastClosedDay(tenantId);
  const hoy = dateStrInBusinessTz(new Date());
  if (cerradoHasta && isFrozenDay(hoy, cerradoHasta)) {
    return { ok: false, error: mensajeCobroEnDiaCerrado(hoy, cerradoHasta, "cobro") };
  }

  // Los productos, del negocio (tenantId + RLS), activos y no borrados; precios de la base.
  const productos = await prisma.product.findMany({
    where: { tenantId, id: { in: leidos.renglones.map((r) => r.productId) }, deletedAt: null, active: true },
    select: { id: true, name: true, saleUnit: true, price: true, pricePerKg: true, trackStock: true },
  });
  if (productos.length !== leidos.renglones.length) {
    return { ok: false, error: "Uno de los productos ya no está a la venta. Sacalo y volvé a intentar." };
  }

  const input: OrderInput = {
    channel: "COUNTER",
    fulfillment: "PICKUP",
    customerName: fila.client.name || "Mostrador",
    customerPhone: fila.client.phone ?? "",
    address: null,
    notes: "Con el turno (cobro único)",
    scheduledFor: null,
    paid: true,
    paymentMethod: method,
    items: leidos.renglones.map((r) => ({ productId: r.productId, qty: r.qty })),
  };
  let alta;
  try {
    alta = decidirAlta({ tenantId, input, products: productos, opts: { imputarCajaActor: actor } });
  } catch (e) {
    return { ok: false, error: comoRechazo(e) };
  }
  // La excepción de stock negativo es la del mostrador (por peso), decidida con la unidad de la base:
  // lo demás respeta la guarda anti-oversell (`canDecrementStock` en el ledger) y aborta todo.
  const permitirNegativoPorProducto = productosQuePuedenQuedarNegativos(productos, "COUNTER");
  const claveCobro = claveDelCobro(clave);
  const clavePedido = claveDelPedido(clave);

  type Hecho =
    | { dup: true }
    | { dup: false; cobro: AplicarCobroResult | null; orden: { id: string; code: number; total: number }; saldo: number; desdeReservado: boolean };

  const run = (withSchema: boolean) =>
    tenantTransaction<Hecho>(
      async (tx) => {
        // Capa 2 de idempotencia: el mismo envío ya quedó (cobro o pedido con la clave de la hoja).
        if (withSchema) {
          const [previoCobro, previoPedido] = await Promise.all([
            tx.collection.findFirst({ where: { tenantId, idempotencyKey: claveCobro }, select: { id: true } }),
            tx.order.findFirst({ where: { tenantId, idempotencyKey: clavePedido }, select: { id: true } }),
          ]);
          if (previoCobro || previoPedido) return { dup: true };
        }

        const a = await tx.appointment.findFirst({
          where: { id: appointmentId, tenantId },
          include: {
            service: { include: { products: { include: { product: true } } } },
            client: { select: { name: true } },
            payment: { select: { status: true, amount: true } },
          },
        });
        if (!a) throw new RechazoDeDominio(YA_NO_EXISTE);
        if (user.role === "PROFESSIONAL" && a.professionalId !== user.professionalId) {
          throw new RechazoDeDominio("Ese turno es de otra profesional: sólo podés tocar los tuyos.");
        }
        const puede = puedeCompletarse({ status: a.status, startsAt: a.startsAt, ahora: new Date(), vino });
        if (!puede.ok) throw new CompletarTurnoRechazado(puede.motivo);

        const precio = a.priceAtBooking ?? a.service.price;
        const estado = estadoCobroTurno({ precio, cobros: await cobrosDelTurnoInTx(tx, tenantId, appointmentId), pagoLegado: a.payment });

        await consumirInsumos(tx, a, actor);
        let cobro: AplicarCobroResult | null = null;
        if (estado.saldo > 0) {
          cobro = await aplicarCobroTurnoInTx(tx, tenantId, {
            appointmentId,
            status: a.status,
            precio,
            monto: estado.saldo,
            // Débito/Crédito llegan sólo con `tarjetaHabilitada()` (chequeado arriba); el motor del
            // turno no mira el medio para la regla y el libro los traduce a Tarjeta (D-C01).
            method: method as MetodoDePago,
            note: "Saldo al terminar, con productos",
            actor,
            detail: cobroTurnoDetail({ serviceName: a.service.name, clientName: a.client.name }),
            idempotencyKey: claveCobro,
            withSchema,
            cerradoHasta,
            camino: "completar",
          });
          if (!cobro.applied) throw new RechazoDeDominio(CAMBIO_RECIEN);
        }

        const orden = await insertarOrdenEnTx(tx, {
          tenantId,
          alta,
          opts: { imputarCajaActor: actor, permitirNegativoPorProducto, idempotencyKey: clavePedido },
          // La ficha del turno (leída con el tenantId): la venta queda en la ficha de la clienta.
          clientId: fila.clientId,
          writeKey: withSchema ? clavePedido : null,
          clave: clavePedido,
        });

        const { count } = await tx.appointment.updateMany({
          where: { id: appointmentId, tenantId, status: a.status },
          data: { status: "COMPLETED" },
        });
        if (count === 0) throw new RechazoDeDominio(CAMBIO_RECIEN);
        return {
          dup: false,
          cobro,
          orden: { id: orden.id, code: orden.code, total: orden.total },
          saldo: estado.saldo,
          desdeReservado: a.status === "PENDING",
        };
      },
      { tenantId, isolationLevel: SERIALIZABLE },
    );

  let settled: SettleOutcome<Hecho> | null = null;
  for (let intento = 0; settled === null; intento++) {
    try {
      settled = await settleAppointmentPaymentGuarded({ runWithBridge: () => run(true), runWithoutBridge: () => run(false) });
    } catch (e) {
      // Dos ventas a la vez sacaron el mismo correlativo de orden: se reintenta todo (nada quedó).
      if (intento < REINTENTOS_DE_CODIGO && isUniqueViolation(e, "code")) continue;
      return { ok: false, error: comoRechazo(e) };
    }
  }

  if (settled.outcome === "race" || settled.value.dup) {
    // El otro envío del mismo cobro ya cobró, vendió y terminó el turno.
    revalidatePath("/admin/turnos");
    return { ok: true };
  }
  if (settled.outcome === "degraded") {
    logger.warn("caja", "cobrarTurnoConProductos: cobro SIN puente al libro (migración de cobros parciales sin aplicar)", { tenantId, appointmentId });
  }
  const hecho = settled.value;

  await auditAdmin({
    action: "complete",
    entity: "Appointment",
    entityId: appointmentId,
    changes: {
      saldoCobrado: hecho.cobro ? [{ amount: hecho.saldo, method }] : [],
      conProductos: { orderId: hecho.orden.id, orderCode: hecho.orden.code, total: hecho.orden.total },
      saldoACobrar: 0,
      ...(hecho.desdeReservado ? { vino: true } : {}),
      libroCaja: hecho.cobro ? [rastroLibroCaja({ outcome: settled.outcome, value: hecho.cobro })] : [],
    },
  });

  let aviso: string | null = null;
  if (facturar && isInvoicingEnabled()) aviso = avisoDeFacturaDelTurno(await facturarConResultado(appointmentId, tenantId));
  for (const p of ["/admin", "/admin/turnos", "/admin/turnos/lista", "/admin/turnos/cerrar", "/admin/reportes", "/admin/caja", "/admin/caja/libro", "/admin/pedidos", "/admin/catalogo"]) {
    revalidatePath(p);
  }
  const total = Math.round((hecho.saldo + hecho.orden.total) * 100) / 100;
  return aviso ? { ok: true, aviso, orderCode: hecho.orden.code, total } : { ok: true, orderCode: hecho.orden.code, total };
}
