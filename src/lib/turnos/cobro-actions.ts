"use server";

// ============================================================================
// COBRO DIVIDIDO, LLEGÓ LA SEÑA, DEUDA VIEJA Y DESHACER — las Server Actions (reingeniería CH, Tanda 2).
// ============================================================================
//
//   · `terminarYCobrarDividido`  — «Efectivo $10.000 + Mercado Pago $8.000» y el turno terminado.
//   · `cobrarSeniaYConfirmar`    — «Llegó la seña $5.000»: el cobro y el Confirmado juntos.
//   · `cobrarVariosTurnos`       — «+ Sumar lo que debe»: un cobro por turno, cada uno a su turno.
//   · `deshacerCierre`           — volver atrás una cancelación, un «no vino» o una seña recién cobrada.
//   · `deudaViejaDelTurno`       — lectura: lo que la clienta de este turno quedó debiendo de antes.
//
// NO hay lógica de plata nueva acá. Cada acción es UNA transacción Serializable que llama al motor de
// siempre: `aplicarCobroTurnoInTx` (Collection + Payment agregado + asiento en el libro, con la guarda
// de saldo, la de caja cerrada y la clave de idempotencia), `anularCobroTurnoInTx` (contrapartida +
// egreso en el libro), `puedeCompletarse`, `puedeCobrarEsteTurno`, `assertSlotAvailable`, el consumo
// de insumos por el ledger y la facturación best-effort del turno. Las reglas nuevas (reparto, seña,
// ventana de deshacer) son funciones puras en `cobro-dividido.ts`.
//
// Todo con el negocio en el `where` además de RLS: un id de otro negocio contesta «Ese turno ya no
// existe», nunca un error crudo de Prisma, y no deja ni un cobro ni un asiento (CH-061, cert O-1).
// Un error que no es de dominio (la base se cayó a la mitad) revierte la transacción ENTERA y vuelve
// como «no se cobró nada», con el detalle en el log.
//
// Claves de idempotencia (`@@unique([tenantId, idempotencyKey])`): `saldo:<turno>:<n>` por línea de
// un cobro de saldo, `senia:<turno>` para la seña. Un doble toque choca en la clave (la carrera, que
// `settleAppointmentPaymentGuarded` clasifica) o en la guarda de saldo: nunca cobra dos veces.

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
import { importeONaN } from "@/lib/dinero/leer";
import { centavosDe } from "@/lib/dinero/redondeo";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { assertSlotAvailable } from "@/lib/booking-core";
import { recordMovement } from "@/lib/stock/ledger";
import { isInvoicingEnabled } from "@/lib/fiscal";
import { facturarAppointment } from "@/lib/invoice-from-appointment";
import { avisoDeFacturaDelTurno, type ResultadoFacturaDelTurno } from "./aviso-factura";
import { lastClosedDay } from "@/lib/caja/frontera-cierre";
import { isFrozenDay, type DayKey } from "@/lib/caja/cierre-diario";
import { cobroTurnoDetail, settleAppointmentPaymentGuarded, type SettleOutcome } from "@/lib/caja/cobro-turno";
import {
  aplicarCobroTurnoInTx,
  cobrosDelTurnoInTx,
  rastroLibroCaja,
  CobroTurnoRechazado,
  CompletarTurnoRechazado,
  type AplicarCobroResult,
  type CobroTurnoTx,
} from "./cobro-turno-repo";
import { esMetodoDePago, estadoCobroTurno, puedeCompletarse, type MetodoDePago } from "./cobros";
import { puedeCobrarEsteTurno } from "./cobro-mostrador";
import { AnulacionRechazada, anularCobroTurnoInTx, cobrosDetalladosPorTurno, desglosarCobros, type AnularCobroResult } from "./anulacion";
import { plataDeLaFila, type FilaDeTurno } from "./cierre-lote";
import { leerFilasDeTurnos } from "./sin-cerrar.server";
import {
  MOTIVO_DESHACER_SENIA,
  notaLlegoLaSenia,
  claveDeSaldo,
  claveDeSenia,
  leerCobrosVarios,
  leerPagos,
  leerQueSeDeshace,
  planDeSenia,
  puedeDeshacerCierre,
  puedeDeshacerSenia,
  validarCobroDividido,
  validarCobrosVarios,
  type DeudaVieja,
  type LineaDePago,
  type PlanDeSenia,
} from "./cobro-dividido";

/** La forma de siempre (`ResultadoAccion` de actions.ts): el formulario la muestra en línea. */
export type ResultadoCobro = { ok: true; aviso?: string } | { ok: false; error: string };

/** «Llegó la seña»: además, el cobro que se hizo (para el «Deshacer» de 10 s). */
export type ResultadoDeSenia =
  | { ok: true; aviso?: string; cobroId: string | null; monto: number; confirmo: boolean }
  | { ok: false; error: string };

type Usuario = Awaited<ReturnType<typeof requireCapability>>;

const YA_NO_EXISTE = "Ese turno ya no existe. Recargá la agenda.";
const CAMBIO_RECIEN = "Ese turno cambió recién. Recargá la agenda.";
const NO_COBRA = "Cobrar un turno lo hace quien cobra los turnos.";
/** Lo que se ve si algo que no es de dominio corta la transacción: no quedó nada a medias. */
const NO_SE_COBRO = "No se pudo cobrar y no quedó nada a medias: no se registró ningún cobro. Probá de nuevo; si sigue, avisá.";

const SERIALIZABLE = Prisma.TransactionIsolationLevel.Serializable;

function texto(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

/** ¿Quien mira puede cobrar este turno? La misma regla que «Registrar cobro» y el cierre en lote. */
function veredictoDe(user: Usuario, f: FilaDeTurno) {
  return puedeCobrarEsteTurno({
    rol: user.role,
    professionalIdDelUsuario: user.professionalId,
    professionalIdDelTurno: f.professionalId,
    nombreProfesional: f.professional.name,
    cobraEnMostrador: f.professional.cobraEnMostrador,
  });
}

/** Una profesional toca sólo lo suyo: invariante dura, también adentro de la transacción. */
function soloLoSuyo(user: Usuario, professionalId: string) {
  if (user.role === "PROFESSIONAL" && professionalId !== user.professionalId) {
    throw new RechazoDeDominio("Ese turno es de otra profesional: sólo podés tocar los tuyos.");
  }
}

/** Plata que entró de verdad (sin condonaciones), con la MISMA cuenta que la agenda y la bandeja. */
function cobradoReal(precio: number, cobros: readonly { amount: number; method: string; note: string | null }[], pagoLegado: { status: string; amount: number } | null) {
  return cobros.length > 0 ? desglosarCobros(cobros).cobrado : estadoCobroTurno({ precio, cobros, pagoLegado }).cobrado;
}

/** Consumo de insumos al terminar el turno (ledger), igual que `completeAppointment`. */
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

/** Factura el turno y dice cómo quedó, sin tirar (la misma regla que `completeAppointment`). */
async function facturarConResultado(appointmentId: string, tenantId: string): Promise<ResultadoFacturaDelTurno> {
  try {
    const invoiceId = await facturarAppointment(appointmentId, tenantId);
    if (!invoiceId) return { tipo: "sin-factura" };
    const factura = await prisma.invoice.findFirst({ where: { id: invoiceId, tenantId }, select: { status: true, rechazoMotivo: true } });
    if (!factura) return { tipo: "fallo" };
    return { tipo: "emitida", status: factura.status, rechazoMotivo: factura.rechazoMotivo };
  } catch (err) {
    logger.error("arca", "facturación best-effort falló", err, { appointmentId, tenantId });
    return { tipo: "fallo" };
  }
}

function revalidarCaja() {
  revalidatePath("/admin");
  revalidatePath("/admin/turnos");
  revalidatePath("/admin/turnos/lista");
  revalidatePath("/admin/turnos/cerrar");
  revalidatePath("/admin/reportes");
  revalidatePath("/admin/caja");
  revalidatePath("/admin/caja/libro");
}

/** Los rechazos de dominio vuelven con su frase; lo demás, con `generico` y el detalle al log. */
function comoRechazo(e: unknown, generico: string, scope: string): string {
  unstable_rethrow(e);
  if (e instanceof CompletarTurnoRechazado || e instanceof CobroTurnoRechazado || e instanceof AnulacionRechazada) return e.message;
  return rechazoDeDominio(e, generico, scope);
}

const includeParaTerminar = {
  service: { include: { products: { include: { product: true } } } },
  client: { select: { name: true } },
  payment: { select: { status: true, amount: true } },
} as const;

// ── 1. COBRO DIVIDIDO ────────────────────────────────────────────────────────

/**
 * Termina el turno cobrando el saldo en VARIOS medios: N cobros (`saldo:<turno>:1..N`) + COMPLETED,
 * en UNA transacción Serializable. Si cualquier línea falla (caja cerrada, saldo cambiado, la base se
 * corta), no queda ningún cobro ni el turno cambia (CH-023).
 *
 * Campos: `appointmentId`, `pagos` (JSON de `{ metodo, monto }[]`, ver `camposDeDividir`), `vino=on`
 * (un Reservado con la hora pasada), `facturar=false` (opcional, como `completeAppointment`).
 */
export async function terminarYCobrarDividido(formData: FormData): Promise<ResultadoCobro> {
  const user = await requireCapability("agenda:complete");
  if (!roleHasCapability(user.role, "agenda:collect")) return { ok: false, error: NO_COBRA };
  if (isDemoSandbox()) return { ok: true }; // modo demo: no persiste
  const appointmentId = texto(formData.get("appointmentId"));
  if (!appointmentId) return { ok: false, error: "Falta identificar el turno." };
  const pagos = leerPagos(formData.get("pagos"));
  if (!pagos.ok) return { ok: false, error: pagos.error };
  const vino = formData.get("vino") === "on";
  const facturar = formData.get("facturar") !== "false";
  const tenantId = await getCurrentTenantId();
  const actor = `user:${user.id}`;

  // El permiso se resuelve ANTES de abrir la transacción (fallar acá no escribe nada).
  const [fila] = await leerFilasDeTurnos(tenantId, { ids: [appointmentId] });
  if (!fila) return { ok: false, error: YA_NO_EXISTE };
  const veredicto = veredictoDe(user, fila);
  if (!veredicto.ok) return { ok: false, error: veredicto.motivo };
  const cerradoHasta = await lastClosedDay(tenantId);

  type Hecho = { lineas: LineaDePago[]; cobros: AplicarCobroResult[]; desdeReservado: boolean };
  const run = (withSchema: boolean) =>
    tenantTransaction<Hecho>(
      async (tx) => {
        const a = await tx.appointment.findFirst({ where: { id: appointmentId, tenantId }, include: includeParaTerminar });
        if (!a) throw new RechazoDeDominio(YA_NO_EXISTE);
        soloLoSuyo(user, a.professionalId);
        const puede = puedeCompletarse({ status: a.status, startsAt: a.startsAt, ahora: new Date(), vino });
        if (!puede.ok) throw new CompletarTurnoRechazado(puede.motivo);

        const precio = a.priceAtBooking ?? a.service.price;
        const estado = estadoCobroTurno({ precio, cobros: await cobrosDelTurnoInTx(tx, tenantId, appointmentId), pagoLegado: a.payment });
        // La foto que vale es ésta: si entró un cobro desde que se dibujó la hoja, el reparto ya no
        // suma lo que falta y se rechaza entero, sin cobrar una parte.
        const v = validarCobroDividido(pagos.lineas, estado.saldo);
        if (!v.ok) throw new RechazoDeDominio(v.error);

        await consumirInsumos(tx, a, actor);
        const detail = cobroTurnoDetail({ serviceName: a.service.name, clientName: a.client.name });
        const cobros: AplicarCobroResult[] = [];
        for (const [i, linea] of v.lineas.entries()) {
          const r = await aplicarCobroTurnoInTx(tx, tenantId, {
            appointmentId,
            status: a.status,
            precio,
            monto: linea.monto,
            method: linea.metodo,
            note: `Saldo al terminar (${i + 1} de ${v.lineas.length})`,
            actor,
            detail,
            idempotencyKey: claveDeSaldo(appointmentId, i + 1),
            withSchema,
            cerradoHasta,
            camino: "completar",
          });
          // Una línea que «ya estaba» en medio de un cobro nuevo es un estado roto: se revierte todo.
          if (!r.applied) throw new RechazoDeDominio(CAMBIO_RECIEN);
          cobros.push(r);
        }
        const { count } = await tx.appointment.updateMany({
          where: { id: appointmentId, tenantId, status: a.status },
          data: { status: "COMPLETED" },
        });
        if (count === 0) throw new RechazoDeDominio(CAMBIO_RECIEN);
        return { lineas: v.lineas, cobros, desdeReservado: a.status === "PENDING" };
      },
      { tenantId, isolationLevel: SERIALIZABLE },
    );

  let settled: SettleOutcome<Hecho>;
  try {
    settled = await settleAppointmentPaymentGuarded({ runWithBridge: () => run(true), runWithoutBridge: () => run(false) });
  } catch (e) {
    return { ok: false, error: comoRechazo(e, NO_SE_COBRO, "turnos.cobro-dividido") };
  }
  if (settled.outcome === "race") {
    // El otro envío del mismo reparto ya cobró y terminó el turno.
    revalidatePath("/admin/turnos");
    return { ok: true };
  }
  if (settled.outcome === "degraded") {
    logger.warn("caja", "terminarYCobrarDividido: cobros SIN puente al libro (migración de cobros parciales sin aplicar)", { tenantId, appointmentId });
  }
  const { lineas, cobros, desdeReservado } = settled.value;

  await auditAdmin({
    action: "complete",
    entity: "Appointment",
    entityId: appointmentId,
    changes: {
      saldoCobrado: lineas.map((l) => ({ amount: l.monto, method: l.metodo })),
      dividido: true,
      saldoACobrar: 0,
      ...(desdeReservado ? { vino: true } : {}),
      libroCaja: cobros.map((c) => rastroLibroCaja({ outcome: settled.outcome, value: c })),
    },
  });

  let aviso: string | null = null;
  if (facturar && isInvoicingEnabled()) aviso = avisoDeFacturaDelTurno(await facturarConResultado(appointmentId, tenantId));
  revalidarCaja();
  revalidatePath("/admin/catalogo");
  return aviso ? { ok: true, aviso } : { ok: true };
}

// ── 2. LLEGÓ LA SEÑA ─────────────────────────────────────────────────────────

/**
 * «Llegó la seña $5.000»: cobra la seña que falta (`senia:<turno>`) y, si estaba Reservado, lo pasa a
 * Confirmado, en UNA transacción Serializable (CH-022). Idempotente dos veces: por la clave y por la
 * plata (si la seña ya entró, no se cobra de nuevo aunque la columna de la clave no esté migrada).
 *
 * Campos (`camposDeSenia`): `appointmentId`, `method` (por defecto transferencia en la pantalla, NO
 * acá: el servidor exige el medio), `amount` (lo que decía el botón; si la pantalla quedó vieja, se
 * rechaza en vez de cobrar otro monto).
 */
export async function cobrarSeniaYConfirmar(formData: FormData): Promise<ResultadoDeSenia> {
  // La seña es un COBRO: la cobra quien cobra ESE turno (`agenda:collect` + `puedeCobrarEsteTurno`),
  // también la profesional que cobra sus turnos (cert CH T2, F-1). Confirmar es `agenda:manage`
  // (`confirmarTurno`): sin eso se registra la seña y el turno sigue Reservado, y el aviso lo dice.
  const user = await requireCapability("agenda:collect");
  const confirma = roleHasCapability(user.role, "agenda:manage");
  if (isDemoSandbox()) return { ok: true, cobroId: null, monto: 0, confirmo: true }; // modo demo: no persiste
  const appointmentId = texto(formData.get("appointmentId"));
  if (!appointmentId) return { ok: false, error: "Falta identificar el turno." };
  const methodRaw = texto(formData.get("method"));
  if (!esMetodoDePago(methodRaw)) return { ok: false, error: "Elegí por dónde llegó la seña: transferencia, Mercado Pago o efectivo." };
  const method: MetodoDePago = methodRaw;
  const esperado = importeONaN(formData.get("amount"));
  const montoEsperado = Number.isFinite(esperado) ? esperado : null;
  const tenantId = await getCurrentTenantId();
  const actor = `user:${user.id}`;

  const [fila] = await leerFilasDeTurnos(tenantId, { ids: [appointmentId] });
  if (!fila) return { ok: false, error: YA_NO_EXISTE };
  const veredicto = veredictoDe(user, fila);
  if (!veredicto.ok) return { ok: false, error: veredicto.motivo };
  const cerradoHasta = await lastClosedDay(tenantId);

  type Hecho = { plan: PlanDeSenia; cobro: AplicarCobroResult | null; confirmo: boolean };
  const run = (withSchema: boolean) =>
    tenantTransaction<Hecho>(
      async (tx) => {
        const a = await tx.appointment.findFirst({
          where: { id: appointmentId, tenantId },
          include: {
            service: { select: { name: true, price: true, depositAmount: true } },
            client: { select: { name: true } },
            payment: { select: { status: true, amount: true } },
          },
        });
        if (!a) throw new RechazoDeDominio(YA_NO_EXISTE);
        soloLoSuyo(user, a.professionalId);
        const precio = a.priceAtBooking ?? a.service.price;
        const cobros = (await cobrosDetalladosPorTurno(tx, tenantId, [appointmentId])).get(appointmentId) ?? [];
        const plan = planDeSenia({
          status: a.status,
          depositAmount: a.service.depositAmount,
          precio,
          cobradoReal: cobradoReal(precio, cobros, a.payment),
          montoEsperado,
          puedeConfirmar: confirma,
        });
        if (plan.tipo === "rechazado") throw new RechazoDeDominio(plan.motivo);

        let cobro: AplicarCobroResult | null = null;
        if (plan.tipo === "cobrar") {
          cobro = await aplicarCobroTurnoInTx(tx, tenantId, {
            appointmentId,
            status: a.status,
            precio,
            monto: plan.monto,
            method,
            note: notaLlegoLaSenia(user.role),
            actor,
            detail: cobroTurnoDetail({ serviceName: a.service.name, clientName: a.client.name }),
            idempotencyKey: claveDeSenia(appointmentId),
            withSchema,
            cerradoHasta,
            camino: "cobro",
          });
        }
        const confirmar = (plan.tipo === "cobrar" && plan.confirmar) || plan.tipo === "solo-confirmar";
        if (confirmar) {
          const { count } = await tx.appointment.updateMany({
            where: { id: appointmentId, tenantId, status: "PENDING" },
            data: { status: "CONFIRMED" },
          });
          if (count === 0) throw new RechazoDeDominio(CAMBIO_RECIEN);
        }
        return { plan, cobro, confirmo: confirmar };
      },
      { tenantId, isolationLevel: SERIALIZABLE },
    );

  let settled: SettleOutcome<Hecho>;
  try {
    settled = await settleAppointmentPaymentGuarded({ runWithBridge: () => run(true), runWithoutBridge: () => run(false) });
  } catch (e) {
    return { ok: false, error: comoRechazo(e, NO_SE_COBRO, "turnos.llego-la-senia") };
  }
  if (settled.outcome === "race") {
    // Doble toque: el otro ya cobró la seña (misma clave) y confirmó. No hay un segundo cobro.
    revalidatePath("/admin/turnos");
    return { ok: true, cobroId: null, monto: 0, confirmo: false, aviso: "La seña ya estaba registrada." };
  }
  if (settled.outcome === "degraded") {
    logger.warn("caja", "cobrarSeniaYConfirmar: seña cobrada SIN puente al libro (migración de cobros parciales sin aplicar)", { tenantId, appointmentId });
  }
  const { plan, cobro, confirmo } = settled.value;
  const cobrado = cobro && cobro.applied ? cobro : null;

  if (cobrado) {
    await auditAdmin({
      action: "collect_payment",
      entity: "Appointment",
      entityId: appointmentId,
      changes: {
        tipo: "senia",
        llegoLaSenia: true,
        // Se toca con la plata a la vista en el banco / Mercado Pago, no por la captura de la clienta.
        verificacion: user.role === "PROFESSIONAL" ? "verificada por la profesional" : "verificada por recepción",
        cobroId: cobrado.collectionId,
        method,
        amount: cobrado.monto,
        confirmo,
        cobrado: cobrado.estado.cobrado,
        saldo: cobrado.estado.saldo,
        libroCaja: rastroLibroCaja({ outcome: settled.outcome, value: cobrado }),
      },
    });
  }
  if (confirmo) {
    await auditAdmin({ action: "confirm", entity: "Appointment", entityId: appointmentId, changes: { status: "CONFIRMED", porSenia: true } });
  }
  revalidarCaja();
  revalidatePath("/admin/turnos/manana");

  if (!cobrado) {
    const aviso = !confirma
      ? "La seña ya estaba registrada. El turno lo confirma la recepción."
      : plan.tipo === "ya-estaba"
        ? "La seña ya estaba cobrada y el turno confirmado."
        : "La seña ya estaba cobrada: quedó confirmado.";
    return { ok: true, cobroId: null, monto: 0, confirmo, aviso };
  }
  return { ok: true, cobroId: cobrado.collectionId, monto: cobrado.monto, confirmo };
}

// ── 3. DEUDA VIEJA ───────────────────────────────────────────────────────────

/**
 * Cobra varios turnos de la MISMA clienta con un medio, un cobro por turno imputado a SU turno, y
 * opcionalmente termina el de hoy, en UNA transacción Serializable (CH-024). Los turnos que no son el
 * de hoy tienen que estar terminados y debiendo (cuenta a cobrar).
 *
 * Campos (`camposDeCobrarVarios`): `cobros` (JSON `{ id, monto }[]`), `method`, `terminar` (el turno
 * de hoy, opcional) y `vino=on` si ese turno es un Reservado con la hora pasada.
 */
export async function cobrarVariosTurnos(formData: FormData): Promise<ResultadoCobro> {
  const user = await requireCapability("agenda:collect");
  const terminarId = texto(formData.get("terminar")) || null;
  if (terminarId && !roleHasCapability(user.role, "agenda:complete")) return { ok: false, error: "Terminar un turno lo hace quien atiende o la recepción." };
  if (isDemoSandbox()) return { ok: true }; // modo demo: no persiste
  const methodRaw = texto(formData.get("method"));
  if (!esMetodoDePago(methodRaw)) return { ok: false, error: "Elegí el medio de pago: Mercado Pago, efectivo o transferencia." };
  const method: MetodoDePago = methodRaw;
  const lectura = leerCobrosVarios(formData.get("cobros"));
  if (!lectura.ok) return { ok: false, error: lectura.error };
  const invalido = validarCobrosVarios(lectura.cobros);
  if (invalido) return { ok: false, error: invalido };
  const vino = formData.get("vino") === "on";
  const tenantId = await getCurrentTenantId();
  const actor = `user:${user.id}`;

  const ids = [...new Set([...lectura.cobros.map((c) => c.id), ...(terminarId ? [terminarId] : [])])];
  const filas = await leerFilasDeTurnos(tenantId, { ids });
  if (filas.length !== ids.length) return { ok: false, error: YA_NO_EXISTE };
  for (const f of filas) {
    const v = veredictoDe(user, f);
    if (!v.ok) return { ok: false, error: v.motivo };
  }
  if (new Set(filas.map((f) => f.clientId)).size > 1) {
    return { ok: false, error: "Esos turnos son de clientas distintas: cobralos por separado." };
  }
  const cerradoHasta = await lastClosedDay(tenantId);

  type Hecho = { cobros: { id: string; r: AplicarCobroResult }[]; desdeReservado: boolean };
  const run = (withSchema: boolean) =>
    tenantTransaction<Hecho>(
      async (tx) => {
        const turnos = await tx.appointment.findMany({ where: { tenantId, id: { in: ids } }, include: includeParaTerminar });
        if (turnos.length !== ids.length) throw new RechazoDeDominio(YA_NO_EXISTE);
        if (new Set(turnos.map((t) => t.clientId)).size > 1) throw new RechazoDeDominio("Esos turnos son de clientas distintas: cobralos por separado.");
        const porId = new Map(turnos.map((t) => [t.id, t]));
        for (const t of turnos) soloLoSuyo(user, t.professionalId);

        const hoy = terminarId ? porId.get(terminarId)! : null;
        if (hoy) {
          const puede = puedeCompletarse({ status: hoy.status, startsAt: hoy.startsAt, ahora: new Date(), vino });
          if (!puede.ok) throw new CompletarTurnoRechazado(puede.motivo);
          const enElCobro = lectura.cobros.some((c) => c.id === hoy.id);
          if (!enElCobro) {
            const e = estadoCobroTurno({ precio: hoy.priceAtBooking ?? hoy.service.price, cobros: await cobrosDelTurnoInTx(tx, tenantId, hoy.id), pagoLegado: hoy.payment });
            if (e.saldo > 0) throw new RechazoDeDominio("El turno de hoy todavía tiene saldo: sumalo al cobro o cobralo aparte.");
          }
          await consumirInsumos(tx, hoy, actor);
        }

        const hechos: { id: string; r: AplicarCobroResult }[] = [];
        for (const c of lectura.cobros) {
          const t = porId.get(c.id)!;
          const esHoy = t.id === terminarId;
          if (!esHoy && t.status !== "COMPLETED") {
            throw new RechazoDeDominio("Lo de antes se suma sólo de turnos ya terminados que quedaron debiendo.");
          }
          const precio = t.priceAtBooking ?? t.service.price;
          const previos = await cobrosDelTurnoInTx(tx, tenantId, t.id);
          if (esHoy) {
            const e = estadoCobroTurno({ precio, cobros: previos, pagoLegado: t.payment });
            // El turno de hoy se cobra ENTERO (se termina): si el saldo cambió, la pantalla quedó vieja.
            if (centavosDe(e.saldo) !== centavosDe(c.monto)) throw new RechazoDeDominio(CAMBIO_RECIEN);
          }
          const r = await aplicarCobroTurnoInTx(tx, tenantId, {
            appointmentId: t.id,
            status: t.status,
            precio,
            monto: c.monto,
            method,
            note: esHoy ? "Saldo al terminar" : "Deuda de antes, cobrada al venir",
            actor,
            detail: cobroTurnoDetail({ serviceName: t.service.name, clientName: t.client.name }),
            idempotencyKey: claveDeSaldo(t.id, esHoy ? 1 : previos.length + 1),
            withSchema,
            cerradoHasta,
            camino: esHoy ? "completar" : "cobro",
          });
          if (!r.applied) throw new RechazoDeDominio(CAMBIO_RECIEN);
          hechos.push({ id: t.id, r });
        }

        if (hoy) {
          const { count } = await tx.appointment.updateMany({ where: { id: hoy.id, tenantId, status: hoy.status }, data: { status: "COMPLETED" } });
          if (count === 0) throw new RechazoDeDominio(CAMBIO_RECIEN);
        }
        return { cobros: hechos, desdeReservado: hoy?.status === "PENDING" };
      },
      { tenantId, isolationLevel: SERIALIZABLE },
    );

  let settled: SettleOutcome<Hecho>;
  try {
    settled = await settleAppointmentPaymentGuarded({ runWithBridge: () => run(true), runWithoutBridge: () => run(false) });
  } catch (e) {
    return { ok: false, error: comoRechazo(e, NO_SE_COBRO, "turnos.cobrar-varios") };
  }
  if (settled.outcome === "race") {
    revalidatePath("/admin/turnos");
    return { ok: true };
  }
  if (settled.outcome === "degraded") {
    logger.warn("caja", "cobrarVariosTurnos: cobros SIN puente al libro (migración de cobros parciales sin aplicar)", { tenantId, ids });
  }
  for (const { id, r } of settled.value.cobros) {
    if (!r.applied) continue;
    await auditAdmin({
      action: "collect_payment",
      entity: "Appointment",
      entityId: id,
      changes: {
        method,
        amount: r.monto,
        cobrado: r.estado.cobrado,
        saldo: r.estado.saldo,
        ...(id === terminarId ? {} : { deudaDeAntes: true }),
        libroCaja: rastroLibroCaja({ outcome: settled.outcome, value: r }),
      },
    });
  }
  let aviso: string | null = null;
  if (terminarId) {
    await auditAdmin({
      action: "complete",
      entity: "Appointment",
      entityId: terminarId,
      changes: { saldoACobrar: 0, conDeudaDeAntes: true, ...(settled.value.desdeReservado ? { vino: true } : {}) },
    });
    if (isInvoicingEnabled()) aviso = avisoDeFacturaDelTurno(await facturarConResultado(terminarId, tenantId));
  }
  revalidarCaja();
  return aviso ? { ok: true, aviso } : { ok: true };
}

/**
 * Lo que la clienta de este turno quedó debiendo de ANTES (turnos terminados con saldo), para el
 * «+ Sumar lo que debe ($9.000)» de la hoja de cobro. Sólo los que quien mira puede cobrar (la deuda
 * de un turno de la profesional que cobra aparte se la cobra ella). Hasta 30 turnos hacia atrás.
 */
export async function deudaViejaDelTurno(appointmentId: string): Promise<DeudaVieja[]> {
  const user = await requireCapability("agenda:collect");
  if (isDemoSandbox() || !appointmentId) return [];
  const tenantId = await getCurrentTenantId();
  const turno = await prisma.appointment.findFirst({ where: { id: appointmentId, tenantId }, select: { clientId: true } });
  if (!turno?.clientId) return [];
  const previos = await prisma.appointment.findMany({
    where: { tenantId, clientId: turno.clientId, status: "COMPLETED", id: { not: appointmentId } },
    select: { id: true },
    orderBy: { startsAt: "desc" },
    take: 30,
  });
  const filas = await leerFilasDeTurnos(tenantId, { ids: previos.map((p) => p.id) });
  return filas
    .filter((f) => veredictoDe(user, f).ok && (user.role !== "PROFESSIONAL" || f.professionalId === user.professionalId))
    .map((f) => ({ f, saldo: plataDeLaFila(f).saldo }))
    .filter((x) => x.saldo > 0)
    .sort((x, y) => x.f.startsAt.getTime() - y.f.startsAt.getTime())
    .map(({ f, saldo }) => ({ turnoId: f.id, inicio: f.startsAt.toISOString(), servicio: f.service.name, saldo }));
}

// ── 4. DESHACER ──────────────────────────────────────────────────────────────

/**
 * «Deshacer», en tres sabores (`que`):
 *   · `cancelacion` / `no-vino`: el turno vuelve a Reservado (PENDING) si se marcó hace menos de 10
 *     minutos (la hora sale de la auditoría) y el hueco sigue libre (`assertSlotAvailable`). La plata
 *     no se toca: si la seña se retuvo, sigue ahí; si se devolvió, el turno queda sin seña (CH-026).
 *   · `senia` (con `cobroId`): la seña recién cobrada por «Llegó la seña» se ANULA con motivo
 *     «deshacer» (contrapartida + egreso en el libro, misma fecha contable) y, si aquel toque había
 *     confirmado el turno, vuelve a Reservado. Si la caja de ese día ya cerró o el turno se facturó,
 *     no se toca nada y se dice por qué (CH-049).
 */
export async function deshacerCierre(formData: FormData): Promise<ResultadoCobro> {
  const que = leerQueSeDeshace(formData.get("que"));
  if (!que) return { ok: false, error: "No sé qué hay que deshacer. Recargá la agenda." };
  // Deshacer la seña es anular un cobro recién hecho: la misma capacidad que lo cobró (`agenda:collect`,
  // y adentro el veredicto de ESE turno), para que la profesional deshaga la suya (cert CH T2, F-1).
  const user = await requireCapability(que === "no-vino" ? "agenda:complete" : que === "senia" ? "agenda:collect" : "agenda:manage");
  if (isDemoSandbox()) return { ok: true }; // modo demo: no persiste
  const appointmentId = texto(formData.get("appointmentId"));
  if (!appointmentId) return { ok: false, error: "Falta identificar el turno." };
  const tenantId = await getCurrentTenantId();
  if (que === "senia") return deshacerSenia(user, tenantId, appointmentId, texto(formData.get("cobroId")));

  const turno = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId },
    select: { status: true, startsAt: true, endsAt: true, professionalId: true, boxId: true, serviceId: true },
  });
  if (!turno) return { ok: false, error: YA_NO_EXISTE };
  if (user.role === "PROFESSIONAL" && turno.professionalId !== user.professionalId) {
    return { ok: false, error: "Ese turno es de otra profesional: sólo podés tocar los tuyos." };
  }
  const marca = await prisma.auditLog.findFirst({
    where: { tenantId, entity: "Appointment", entityId: appointmentId, action: que === "cancelacion" ? "cancel" : "no_show" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const puede = puedeDeshacerCierre({ que, status: turno.status, hechoEl: marca?.createdAt ?? null, ahora: new Date() });
  if (!puede.ok) return { ok: false, error: puede.motivo };
  const desde = que === "cancelacion" ? "CANCELLED" : "NO_SHOW";

  try {
    await tenantTransaction(
      async (tx) => {
        try {
          await assertSlotAvailable(tx, { ...turno, excludeAppointmentId: appointmentId });
        } catch (e) {
          if (e instanceof RechazoDeDominio) {
            throw new RechazoDeDominio("No se puede deshacer: ese horario ya se ocupó o se bloqueó. Dale otro turno desde «Dar turno».");
          }
          throw e;
        }
        const { count } = await tx.appointment.updateMany({ where: { id: appointmentId, tenantId, status: desde }, data: { status: "PENDING" } });
        if (count === 0) throw new RechazoDeDominio(CAMBIO_RECIEN);
      },
      { tenantId, isolationLevel: SERIALIZABLE },
    );
  } catch (e) {
    return { ok: false, error: comoRechazo(e, "No se pudo deshacer. Recargá la agenda y fijate cómo quedó el turno.", "turnos.deshacer") };
  }
  await auditAdmin({ action: que === "cancelacion" ? "undo_cancel" : "undo_no_show", entity: "Appointment", entityId: appointmentId, changes: { status: "PENDING", desde } });
  revalidatePath("/admin");
  revalidatePath("/admin/turnos");
  revalidatePath("/admin/turnos/lista");
  revalidatePath("/admin/turnos/cerrar");
  revalidatePath("/admin/espera");
  return { ok: true };
}

async function deshacerSenia(user: Usuario, tenantId: string, appointmentId: string, cobroId: string): Promise<ResultadoCobro> {
  if (!roleHasCapability(user.role, "agenda:collect")) return { ok: false, error: NO_COBRA };
  if (!cobroId) return { ok: false, error: "Falta identificar la seña a deshacer." };
  const [fila] = await leerFilasDeTurnos(tenantId, { ids: [appointmentId] });
  if (!fila) return { ok: false, error: YA_NO_EXISTE };
  const veredicto = veredictoDe(user, fila);
  if (!veredicto.ok) return { ok: false, error: veredicto.motivo };

  const cobro = await prisma.collection.findFirst({
    where: { tenantId, id: cobroId, originType: "APPOINTMENT", originId: appointmentId },
    select: { note: true, createdAt: true },
  });
  if (!cobro) return { ok: false, error: "Esa seña ya no está registrada. Recargá la agenda." };
  const puede = puedeDeshacerSenia({ note: cobro.note, cobradoEl: cobro.createdAt, ahora: new Date() });
  if (!puede.ok) return { ok: false, error: puede.motivo };
  // ¿Aquel toque confirmó el turno? Lo dice su auditoría; sin ella, no se cambia el estado.
  const huella = await prisma.auditLog.findFirst({
    where: { tenantId, entity: "Appointment", entityId: appointmentId, action: "collect_payment", changes: { path: ["cobroId"], equals: cobroId } },
    select: { changes: true },
  });
  const confirmo = Boolean(huella?.changes && typeof huella.changes === "object" && (huella.changes as { confirmo?: unknown }).confirmo === true);
  const diaCerradoHasta = await lastClosedDay(tenantId);
  const actor = `user:${user.id}`;

  type Hecho = { anulacion: AnularCobroResult; volvioAReservado: boolean };
  const run = (withSchema: boolean) =>
    tenantTransaction<Hecho>(
      async (tx) => {
        const a = await tx.appointment.findFirst({
          where: { id: appointmentId, tenantId },
          select: { status: true, professionalId: true, priceAtBooking: true, service: { select: { price: true } } },
        });
        if (!a) throw new RechazoDeDominio(YA_NO_EXISTE);
        soloLoSuyo(user, a.professionalId);
        if (a.status !== "PENDING" && a.status !== "CONFIRMED") {
          throw new RechazoDeDominio("Ese turno ya se cerró: si la seña estuvo mal, anulala desde «La plata» con su motivo.");
        }
        const anulacion = await anularCobroTurnoInTx(tx, tenantId, {
          collectionId: cobroId,
          appointmentId,
          precio: a.priceAtBooking ?? a.service.price,
          motivo: MOTIVO_DESHACER_SENIA,
          actor,
          diaCerradoHasta,
          esDiaCerrado: (dia, hasta) => isFrozenDay(dia as DayKey, hasta as DayKey),
          diaDe: dateStrInBusinessTz,
          withSchema,
        });
        let volvioAReservado = false;
        if (confirmo && a.status === "CONFIRMED") {
          const { count } = await tx.appointment.updateMany({ where: { id: appointmentId, tenantId, status: "CONFIRMED" }, data: { status: "PENDING" } });
          if (count === 0) throw new RechazoDeDominio(CAMBIO_RECIEN);
          volvioAReservado = true;
        }
        return { anulacion, volvioAReservado };
      },
      { tenantId, isolationLevel: SERIALIZABLE },
    );

  let settled: SettleOutcome<Hecho>;
  try {
    settled = await settleAppointmentPaymentGuarded({ runWithBridge: () => run(true), runWithoutBridge: () => run(false) });
  } catch (e) {
    return { ok: false, error: comoRechazo(e, "No se pudo deshacer la seña y no se tocó nada. Probá de nuevo; si sigue, avisá.", "turnos.deshacer-senia") };
  }
  if (settled.outcome === "race" || !settled.value.anulacion.applied) {
    // Otro toque ya la había deshecho.
    revalidatePath("/admin/turnos");
    return { ok: true };
  }
  const { anulacion, volvioAReservado } = settled.value;
  await auditAdmin({
    action: "void_collection",
    entity: "Appointment",
    entityId: appointmentId,
    changes: {
      collectionId: cobroId,
      motivo: MOTIVO_DESHACER_SENIA,
      deshacer: true,
      monto: anulacion.monto,
      cobrado: anulacion.cobradoDespues,
      saldo: anulacion.saldoDespues,
      volvioAReservado,
      libroCaja: settled.outcome === "degraded" ? "sin-migrar" : anulacion.libro,
    },
  });
  revalidarCaja();
  return { ok: true };
}
