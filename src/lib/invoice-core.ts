/**
 * Capability Factura — lado Core del Plugin ARCA (ADR-020 §6.a, ADR-022).
 *
 * Estas son las funciones del Core que el borde del Plugin usa:
 *  - `createInvoice`: crea la factura y ENCOLA el evento `InvoiceCreated` en la
 *    MISMA transacción (patrón outbox, ADR-002). Es la fuente del evento
 *    (superficie III de ADR-020).
 *  - `registerFiscalDocument`: recibe el CAE del plugin y lo persiste. Es el
 *    comando público que el plugin invoca (superficie II).
 *  - `markInvoiceRejected`: registra un rechazo de ARCA.
 *
 * NO es un Server Action ("use server"): lo invoca el worker/dispatcher del
 * Core, no un formulario de cliente. El día que la UI necesite emitir una
 * factura, se expone un comando `"use server"` que llame a `createInvoice`.
 *
 * Tipos Core-propios (no importa el plugin): la dependencia va plugin→Core, no
 * al revés (ADR-002). El dispatcher hace el puente entre estos tipos y los del
 * plugin (structural typing idéntico).
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { tenantTransaction } from "@/lib/rls";
import { centavosDe, sumarAlCentavo } from "@/lib/dinero/redondeo";
import { buildInvoiceOriginLink, type InvoiceOriginType } from "@/lib/settlement/invoice-origin";
import { decidirComprobante } from "@/lib/fiscal/decidir-comprobante";
import { normalizarFecha } from "@/lib/fiscal/vigencias";
import { leerRegimenFacturaAEnTx } from "@/lib/fiscal/regimen-factura-a.server";
import { montosDeLaNota, saldoPorAnular } from "@/lib/facturacion/nota-credito-core";

/** Cliente de transacción interactiva (mismo patrón que `LedgerTx` en stock/ledger.ts):
 *  `createInvoiceInTx` corre DENTRO de una tx ya abierta por el llamador → componible y
 *  testeable con un doble de test (se castea un mock a este tipo, como en audit-retention). */
export type InvoiceTx = Prisma.TransactionClient;

/** Desglose de IVA por alícuota (calculado por el Core, ADR-006). */
export interface SubtotalIva {
  alicuotaId: number;
  base: number;
  importe: number;
}

/**
 * Origen (VENTA) de una factura — enlace 1:1 (D10). Es la CLAVE DE IDEMPOTENCIA por venta
 * (I2, ADR-064): una factura por Order/Appointment, un reintento devuelve la misma. El
 * traductor origen→FK es el helper puro `buildInvoiceOriginLink` (settlement/invoice-origin),
 * la MISMA fuente que usa el settlement — no se duplica la lógica.
 */
export type InvoiceOrigin = { type: InvoiceOriginType; id: string } | { type: "ABONO"; id: string };

/**
 * Motor de facturación · origen ABONO (pedido 2 de la consola del contador): `id` =
 * `<reglaId>:<AAAA-MM>`. Va en `Invoice.abonoClave`, con índice único (tenantId, abonoClave): la
 * BASE impide dos facturas de la misma regla en el mismo mes (migración
 * 20261022140000_invoice_abono_descripcion, Gate 2).
 */
const FORMA_CLAVE_ABONO = /^[A-Za-z0-9_-]{1,64}:\d{4}-(0[1-9]|1[0-2])$/;

/** La clave de un abono (regla, mes), validada. Lanza si no tiene la forma `<reglaId>:<AAAA-MM>`. */
export function claveDeAbono(reglaId: string, mes: string): string {
  const clave = `${reglaId}:${mes}`;
  if (!FORMA_CLAVE_ABONO.test(clave)) throw new Error(`Clave de abono inválida: «${clave}» (va <regla>:<AAAA-MM>).`);
  return clave;
}

/** Enlace de origen para `invoice.create/findFirst`: el de una venta (D10) o el del abono. */
function enlaceDeOrigen(origin: InvoiceOrigin | undefined): { orderId?: string; appointmentId?: string; mpPaymentId?: string; abonoClave?: string } {
  if (!origin) return {};
  if (origin.type === "ABONO") {
    if (!FORMA_CLAVE_ABONO.test(origin.id)) throw new Error(`Clave de abono inválida: «${origin.id}» (va <regla>:<AAAA-MM>).`);
    return { abonoClave: origin.id };
  }
  return buildInvoiceOriginLink(origin.type, origin.id);
}

const tieneOrigen = (link: ReturnType<typeof enlaceDeOrigen>) =>
  "orderId" in link || "appointmentId" in link || "mpPaymentId" in link || "abonoClave" in link;

/** Datos que se guardan en el payload del evento `InvoiceCreated`. */
export interface CreateInvoiceInput {
  tenantId: string;
  concepto: number; // 1=Productos, 2=Servicios, 3=ambos
  fecha: string; // AAAAMMDD
  emisor: { cuit: number; condicionIva: string; puntoVenta: number };
  receptor: { docTipo: number; docNro: number; condicionIva: string };
  neto: number;
  iva: SubtotalIva[];
  total: number;
  /**
   * ENG-024 · `true` sólo si `iva` salió de la alícuota de cada producto. Ningún camino lo pone
   * todavía (`calcularImpuestos` aplica una tasa pareja): el plugin no deja emitir así a un
   * Responsable Inscripto.
   */
  ivaPorProducto?: boolean;
  servicioDesde?: string;
  servicioHasta?: string;
  vencimientoPago?: string;
  /** Venta de la que sale la factura (I2). Si se pasa, la creación es IDEMPOTENTE por venta. */
  origin?: InvoiceOrigin;
  /**
   * ENG-021 · Si la factura de esa venta está RECHAZADA, reabrirla y reenviarla. Sólo lo pide
   * quien corrigió el dato ("Volver a facturar", `facturarVenta`). Los flujos automáticos
   * (webhook de MP que llega de nuevo, turno completado otra vez, pedido externo, bancos) no lo
   * piden: reciben la misma factura rechazada, sin reenviar los mismos datos.
   */
  reabrirSiRechazada?: boolean;
  /**
   * Motor de facturación · Default factura. `nota_credito`: anula (total o parcialmente) el
   * comprobante `asociado`, que tiene que estar AUTORIZADO (CbtesAsoc). Lo arma
   * `crearNotaDeCreditoInTx` (más abajo), que controla el saldo con la fila de la factura tomada.
   */
  clase?: "factura" | "nota_credito";
  /** La factura que corrige la nota (su fila y sus datos ante ARCA). Sólo con `clase: nota_credito`. */
  asociado?: ComprobanteAsociadoInput;
  /**
   * Motor de facturación · pedido 5: «qué se factura» («Honorarios de octubre»). Se guarda en
   * `Invoice.descripcion` para el PDF y el CSV; no viaja a ARCA (WSFEv1 no lleva descripción).
   * Sólo se escribe si viene (la columna nace con 20261022140000, Gate 2).
   */
  descripcion?: string;
}

/** El comprobante que corrige una nota de crédito: la fila del Core y cómo lo conoce ARCA. */
export interface ComprobanteAsociadoInput {
  invoiceId: string;
  cbteTipo: number;
  puntoVenta: number;
  numero: number;
  /** AAAAMMDD. */
  fecha: string;
}

/** Forma del payload del evento `InvoiceCreated` que viaja por el outbox. */
export interface InvoiceCreatedPayload
  extends Omit<CreateInvoiceInput, "tenantId" | "origin" | "reabrirSiRechazada" | "asociado" | "descripcion"> {
  /** Nota de crédito: la factura que corrige, como la conoce ARCA (CbtesAsoc). */
  asociado?: { cbteTipo: number; puntoVenta: number; numero: number; fecha: string };
  invoiceId: string;
  tenantId: string;
  /**
   * ENG-020 · Número que el despacho le pidió a ARCA para este evento, anotado ANTES de
   * pedirlo (`arca-dispatch.ts`). Si la respuesta se pierde, el reintento lo consulta y adopta
   * el comprobante ya autorizado en vez de pedir otro.
   */
  intentoArca?: { puntoVenta: number; tipo: number; numero: number };
}

/** Input del comando `registerFiscalDocument` (lo llama el plugin con el CAE). */
export interface RegisterFiscalDocumentInput {
  invoiceId: string;
  tenantId: string;
  cae: string;
  caeVencimiento: string; // AAAAMMDD
  numero: number;
  puntoVenta: number;
  tipoComprobante: number;
}

export const OUTBOX_INVOICE_CREATED = "InvoiceCreated";

/** `lastError` del envío que se cierra porque la venta se volvió a facturar (ENG-021). */
export const MOTIVO_ENVIO_REEMPLAZADO = "Reemplazado: la venta se volvió a facturar con otro envío.";

/**
 * Se lanza DENTRO de la transacción cuando el envío ya estaba cerrado: deshace lo escrito en la
 * factura. Nunca sale de este módulo.
 */
class EnvioYaCerrado extends Error {}

/**
 * Cierra el envío (si seguía abierto) en la transacción dada. Si ya estaba cerrado lanza
 * `EnvioYaCerrado`, y la transacción entera se deshace.
 */
async function cerrarEnvioOAbortar(
  tx: InvoiceTx,
  envioId: string,
  tenantId: string,
  lastError?: string,
): Promise<void> {
  const cerrado = await tx.outboxEvent.updateMany({
    where: { id: envioId, tenantId, processedAt: null },
    data: { processedAt: new Date(), ...(lastError !== undefined ? { lastError } : {}) },
  });
  if (cerrado.count === 0) throw new EnvioYaCerrado();
}

/** Corre `escribir` y cierra el envío en UNA transacción; `false` si el envío ya estaba cerrado. */
async function escribirSiElEnvioSigueAbierto(
  tenantId: string,
  envioId: string,
  escribir: (tx: InvoiceTx) => Promise<{ count: number }>,
  lastError?: string,
): Promise<boolean> {
  try {
    return await tenantTransaction(
      async (tx) => {
        // Primero la factura y después el envío: el mismo orden que la reapertura, así dos
        // transacciones que tocan las dos filas nunca se esperan en cruz.
        const escrita = await escribir(tx);
        await cerrarEnvioOAbortar(tx, envioId, tenantId, lastError);
        return escrita.count === 1;
      },
      { tenantId },
    );
  } catch (e) {
    if (e instanceof EnvioYaCerrado) return false;
    throw e;
  }
}

/**
 * Crea una factura en estado PENDING y encola `InvoiceCreated` en la misma
 * transacción (outbox, ADR-002). Devuelve el id de la factura.
 *
 * El `tipoComprobante` NO se fija acá: lo deriva el plugin (mapeo a catálogo
 * ARCA, ADR-022) y lo escribe `registerFiscalDocument`.
 */
export async function createInvoice(input: CreateInvoiceInput): Promise<string> {
  // Enlace a la venta (D10) vía el helper puro compartido; `hasOrigin` = la creación es
  // idempotente por venta. Sin origen (MP standalone/histórico) no hay dedupe → crea siempre.
  const originLink = enlaceDeOrigen(input.origin);
  const hasOrigin = tieneOrigen(originLink);
  try {
    return await tenantTransaction((tx) => createInvoiceInTx(tx, input), {
      tenantId: input.tenantId,
    });
  } catch (e) {
    // CARRERA: dos createInvoice simultáneos para la MISMA venta pasan el check-then-create
    // y ambos crean → el índice único (tenantId, orderId/appointmentId) hace fallar al 2º
    // (P2002). La tx aborta; refetcheamos (query nueva, fuera de la tx abortada) y devolvemos
    // el ganador → idempotente igual. Sin el @@unique del schema (Gate 2) esto NO dispara: la
    // guarda a nivel DB es la que cierra la ventana de carrera (el check solo cubre el caso secuencial).
    if (hasOrigin && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // Parado en el negocio (RLS): con RLS_ENFORCEMENT on, una lectura suelta con `prisma` sin
      // contexto de tenant falla (getCurrentTenantId) y el perdedor de la carrera reventaba en
      // vez de devolver la factura ganadora (lo encontró motor-postgres.test.ts, «duplicado»).
      const existing = await tenantTransaction(
        (tx) => tx.invoice.findFirst({ where: { tenantId: input.tenantId, ...originLink }, select: { id: true } }),
        { tenantId: input.tenantId },
      );
      if (existing) return existing.id;
    }
    throw e;
  }
}

/**
 * Cuerpo transaccional de `createInvoice`, extraído para poder testear la ORQUESTACIÓN
 * (idempotencia por venta + outbox) con un doble de test sin DB (ADR-026). Corre SIEMPRE
 * dentro de la tx del llamador — nunca abre la suya. Devuelve el id de la factura.
 *
 * IDEMPOTENCIA POR VENTA (I2, ADR-064): si ya existe una factura para este origen, la
 * devuelve — nunca DOS comprobantes para la misma venta — y NO encola un outbox nuevo
 * (no re-despacha). Sin origen, crea siempre (facturas MP standalone / previas a D10).
 *
 * VOLVER A FACTURAR (ENG-021): si la factura de esa venta está RECHAZADA (ARCA no la autorizó:
 * no tiene CAE ni número) y el llamador lo pide (`reabrirSiRechazada`, sólo la acción humana),
 * se reabre la MISMA fila con los datos de ahora y se encola un envío
 * nuevo. Una fila y no dos: los índices únicos por venta no se tocan. Si dos pedidos llegan a
 * la vez, el UPDATE condicionado a REJECTED lo gana uno solo (el otro espera el bloqueo de la
 * fila, ve PENDING y no encola). En la misma transacción se CIERRA todo envío anterior de esa
 * factura que haya quedado abierto: un envío es la única vía por la que la factura toma un CAE
 * o un rechazo (`registerFiscalDocument` y `markInvoiceRejected` sólo escriben si cierran SU
 * envío), así que un envío viejo ya no puede escribir sobre la factura reabierta. Queda un solo
 * envío vivo por factura. Orden de bloqueo: factura y después envío, igual que al registrar.
 */
export async function createInvoiceInTx(
  tx: InvoiceTx,
  input: CreateInvoiceInput,
): Promise<string> {
  const originLink = enlaceDeOrigen(input.origin);
  const hasOrigin = tieneOrigen(originLink);

  if ("orderId" in originLink && originLink.orderId) {
    await tomarPedidoNoAnulado(tx, input.tenantId, originLink.orderId);
  }
  if ("appointmentId" in originLink && originLink.appointmentId) {
    await tomarTurnoConElMismoCobro(tx, input.tenantId, originLink.appointmentId, input.total);
  }

  if (hasOrigin) {
    const existing = await tx.invoice.findFirst({
      where: { tenantId: input.tenantId, ...originLink },
      select: { id: true, status: true },
    });
    if (existing) {
      if (existing.status !== "REJECTED" || !input.reabrirSiRechazada) return existing.id;
      const reabierta = await tx.invoice.updateMany({
        where: { id: existing.id, tenantId: input.tenantId, status: "REJECTED", cae: null },
        data: { ...datosDelComprobante(input), rechazoMotivo: null },
      });
      if (reabierta.count === 1) {
        await tx.outboxEvent.updateMany({
          where: {
            tenantId: input.tenantId,
            type: OUTBOX_INVOICE_CREATED,
            processedAt: null,
            payload: { path: ["invoiceId"], equals: existing.id },
          },
          data: { processedAt: new Date(), lastError: MOTIVO_ENVIO_REEMPLAZADO },
        });
        await encolarInvoiceCreated(tx, existing.id, input);
      }
      return existing.id;
    }
  }

  const invoice = await tx.invoice.create({
    data: {
      tenantId: input.tenantId,
      ...originLink, // enlace a la venta (D10) = clave de idempotencia
      ...datosDelComprobante(input),
    },
    select: { id: true },
  });

  await encolarInvoiceCreated(tx, invoice.id, input);
  return invoice.id;
}

/** Un pedido anulado no se factura (ENG-023): ni factura nueva ni reapertura de una rechazada. */
export class VentaAnuladaError extends Error {
  constructor() {
    super("La venta está anulada: no se factura.");
    this.name = "VentaAnuladaError";
  }
}

/**
 * ENG-023, del lado de la factura: toma la fila del pedido (FOR SHARE) y, si está anulado,
 * lanza `VentaAnuladaError` sin escribir nada. Es el mismo candado que
 * pisa la anulación con su compare-and-set (`anularVentaInTx`, UPDATE de `status`), así que las
 * dos nunca terminan juntas:
 *  · anulación primero: esta lectura espera su confirmación, vuelve a evaluar la fila (Read
 *    Committed), la ve CANCELLED y no factura;
 *  · facturación primero: la anulación espera esta transacción y, al releer la factura después
 *    de su compare-and-set, la ve en camino y vuelve atrás.
 * SQL crudo porque Prisma no expresa FOR SHARE; el negocio va explícito en el WHERE (patrón de
 * `stock/adjustment-insert.ts`) además de RLS.
 */
async function tomarPedidoNoAnulado(tx: InvoiceTx, tenantId: string, orderId: string): Promise<void> {
  // Con FOR SHARE, Postgres devuelve la versión de la fila que dejó confirmada quien la tenía
  // bloqueada: el `status` que se lee acá es el de después de la anulación.
  const filas = await tx.$queryRaw<{ status: string }[]>`
    SELECT status::text AS status FROM "Order"
    WHERE id = ${orderId} AND "tenantId" = ${tenantId}
    FOR SHARE`;
  if (filas.length === 0) throw new Error("No se encontró la venta a facturar.");
  if (filas[0].status === "CANCELLED") throw new VentaAnuladaError();
}

/**
 * El cobro del turno cambió entre que se armó el comprobante y que se tomó la fila del turno
 * (ENG-023): se anuló entero, o una parte. No se factura con el monto viejo.
 */
export class CobroDelTurnoCambioError extends Error {
  constructor(anulado: boolean) {
    super(
      anulado
        ? "El cobro del turno está anulado: no se factura."
        : "El cobro del turno cambió mientras se facturaba: volvé a facturarlo.",
    );
    this.name = "CobroDelTurnoCambioError";
  }
}

/**
 * ENG-023, del lado de la factura, turno. Dos pasos, y en este orden:
 *  1. ESCRIBE la fila del turno (un UPDATE que no cambia ningún valor). La anulación del cobro
 *     (`anularCobroTurnoInTx`) toma esa fila FOR UPDATE antes de leer las facturas y corre en
 *     Serializable: si esta transacción confirmó después de la foto de la anulación, Postgres la
 *     aborta por actualización concurrente (40001), `tenantTransaction` la reintenta y la
 *     reintentada ve la factura. Un FOR SHARE no alcanzaría: un bloqueo sin escritura no aborta
 *     a una transacción Serializable, que seguiría leyendo su foto sin la factura.
 *     Si la anulación tiene la fila, este UPDATE la espera.
 *  2. Ya con la fila tomada, RELEE el cobro del turno (`Payment`, el agregado que baja la
 *     anulación) en una sentencia aparte: en Read Committed cada sentencia toma su foto, así que
 *     ésta ve lo que la anulación confirmó mientras se esperaba. `facturarAppointment` arma el
 *     comprobante con ese mismo `Payment.amount`: si ahora es 0 o distinto al total, no se
 *     factura. Sin `Payment` (turno facturado a precio de lista, sin cobros) no hay cobro que
 *     anular y no se compara.
 * SQL crudo porque Prisma no expresa esta escritura; el negocio va explícito en el WHERE además
 * de RLS.
 */
async function tomarTurnoConElMismoCobro(
  tx: InvoiceTx,
  tenantId: string,
  appointmentId: string,
  total: number,
): Promise<void> {
  const turno = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "Appointment" SET "tenantId" = "tenantId"
    WHERE id = ${appointmentId} AND "tenantId" = ${tenantId}
    RETURNING id`;
  if (turno.length === 0) throw new Error("No se encontró el turno a facturar.");
  const pago = await tx.$queryRaw<{ amount: number }[]>`
    SELECT amount FROM "Payment"
    WHERE "appointmentId" = ${appointmentId} AND "tenantId" = ${tenantId}`;
  if (pago.length === 0) return;
  const cobrado = centavosDe(pago[0].amount);
  if (cobrado <= 0) throw new CobroDelTurnoCambioError(true);
  if (cobrado !== centavosDe(total)) throw new CobroDelTurnoCambioError(false);
}

/** Los datos del comprobante que se guardan en la factura PENDING (alta o reapertura). */
function datosDelComprobante(input: CreateInvoiceInput) {
  return {
    puntoVenta: input.emisor.puntoVenta,
    concepto: input.concepto,
    docTipo: input.receptor.docTipo,
    docNro: String(input.receptor.docNro),
    fecha: input.fecha,
    neto: input.neto,
    // Total de IVA = suma de cada alícuota al centavo (R3 de ADR-100): el mismo número que
    // viaja a ARCA como ImpIVA (soap.ts), así el libro IVA coincide con Mis Comprobantes.
    iva: sumarAlCentavo(input.iva.map((x) => x.importe)),
    ivaDesglose: input.iva as unknown as object, // desglose por alícuota (audit)
    total: input.total,
    status: "PENDING" as const,
    ...(input.clase === "nota_credito" && input.asociado ? { comprobanteAsociadoId: input.asociado.invoiceId } : {}),
    ...(input.descripcion?.trim() ? { descripcion: input.descripcion.trim().slice(0, 300) } : {}),
  };
}

/** Encola `InvoiceCreated` para la factura, en la misma transacción (outbox, ADR-002). */
async function encolarInvoiceCreated(
  tx: InvoiceTx,
  invoiceId: string,
  input: CreateInvoiceInput,
): Promise<void> {
  const payload: InvoiceCreatedPayload = {
    invoiceId,
    tenantId: input.tenantId,
    concepto: input.concepto,
    fecha: input.fecha,
    emisor: input.emisor,
    receptor: input.receptor,
    neto: input.neto,
    iva: input.iva,
    total: input.total,
    ...(input.ivaPorProducto === true ? { ivaPorProducto: true } : {}),
    servicioDesde: input.servicioDesde,
    servicioHasta: input.servicioHasta,
    vencimientoPago: input.vencimientoPago,
    ...(input.clase === "nota_credito" && input.asociado
      ? {
          clase: "nota_credito" as const,
          asociado: {
            cbteTipo: input.asociado.cbteTipo,
            puntoVenta: input.asociado.puntoVenta,
            numero: input.asociado.numero,
            fecha: input.asociado.fecha,
          },
        }
      : {}),
  };

  await tx.outboxEvent.create({
    data: {
      tenantId: input.tenantId,
      type: OUTBOX_INVOICE_CREATED,
      payload: payload as unknown as object,
    },
  });
}

/**
 * Comando público (superficie II): el plugin pasa el CAE y el Core lo persiste, atado al envío
 * (`envioId`, el evento del outbox) que lo obtuvo.
 *
 * En UNA transacción: la factura PENDING pasa a AUTHORIZED y el envío se cierra. Si el envío ya
 * estaba cerrado (otro despacho lo procesó, o la venta se volvió a facturar y este envío quedó
 * reemplazado), NO se escribe nada y devuelve `false`: el CAE de un envío viejo jamás se
 * registra sobre la factura reabierta con otros importes (ENG-021). También devuelve `false` si
 * la factura ya no estaba PENDING (el envío se cierra igual). `true` = la factura tomó el CAE.
 * `tenantId` explícito: lo invoca el despacho, sin request (ADR-018 §4).
 */
export async function registerFiscalDocument(
  input: RegisterFiscalDocumentInput,
  envioId: string,
): Promise<boolean> {
  return escribirSiElEnvioSigueAbierto(input.tenantId, envioId, (tx) =>
    tx.invoice.updateMany({
      where: { id: input.invoiceId, tenantId: input.tenantId, status: "PENDING" },
      data: {
        status: "AUTHORIZED",
        cae: input.cae,
        caeVencimiento: input.caeVencimiento,
        numero: input.numero,
        tipoComprobante: input.tipoComprobante,
        authorizedAt: new Date(),
      },
    }),
  );
}

/**
 * Consulta pública (superficie II, ENG-020): ¿ese número de comprobante (punto de venta, tipo,
 * número) ya lo tiene registrado OTRA factura del negocio? El plugin la usa antes de adoptar un
 * comprobante que encontró autorizado en ARCA: si ya es de otra venta, no lo adopta.
 */
/**
 * El último número AUTORIZADO que el negocio tiene guardado para ese punto de venta y tipo (0 si
 * ninguno). Es lo que ARCA contestaría a `FECompUltimoAutorizado`; lo usa el modo prueba (stub),
 * que no tiene memoria entre pedidos. Con la RLS del negocio.
 */
export async function ultimoNumeroAutorizado(tenantId: string, puntoVenta: number, tipo: number): Promise<number> {
  const r = await tenantTransaction(
    (tx) =>
      tx.invoice.aggregate({
        where: { tenantId, puntoVenta, tipoComprobante: tipo, status: "AUTHORIZED", numero: { not: null } },
        _max: { numero: true },
      }),
    { tenantId },
  );
  return r._max.numero ?? 0;
}

export async function numeroUsadoPorOtraFactura(consulta: {
  tenantId: string;
  invoiceId: string;
  puntoVenta: number;
  tipo: number;
  numero: number;
}): Promise<boolean> {
  const otra = await tenantTransaction(
    (tx) =>
      tx.invoice.findFirst({
        where: {
          tenantId: consulta.tenantId,
          puntoVenta: consulta.puntoVenta,
          tipoComprobante: consulta.tipo,
          numero: consulta.numero,
          id: { not: consulta.invoiceId },
        },
        select: { id: true },
      }),
    { tenantId: consulta.tenantId },
  );
  return otra !== null;
}

/**
 * Registra que ARCA rechazó la factura (REJECTED + motivo) y cierra el envío que recibió el
 * rechazo, en UNA transacción: si el proceso se corta, o quedan las dos cosas o ninguna (un
 * envío abierto para una factura rechazada era la puerta a un segundo CAE al volver a
 * facturar). Si el envío ya estaba cerrado no se escribe nada y devuelve `false`: el rechazo
 * de un envío viejo no toca la factura reabierta. `true` = la factura quedó rechazada.
 */
export async function markInvoiceRejected(
  invoiceId: string,
  tenantId: string,
  motivo: string,
  envioId: string,
): Promise<boolean> {
  return escribirSiElEnvioSigueAbierto(
    tenantId,
    envioId,
    (tx) =>
      tx.invoice.updateMany({
        where: { id: invoiceId, tenantId, status: "PENDING" },
        data: { status: "REJECTED", rechazoMotivo: motivo },
      }),
    motivo,
  );
}

/**
 * ENG-021 · Antes de mandar un envío a ARCA: si su factura ya no está PENDING (quedó autorizada
 * o rechazada y el envío no se llegó a cerrar, como pasaba antes de que registrar y rechazar
 * cerraran el envío en la misma transacción), lo cierra SIN pedirle nada a ARCA y devuelve
 * `true` (= no se envía; también si otro despacho ya lo había cerrado). Un pedido más sólo podía
 * terminar en un CAE que ninguna factura toma. `false` = la factura sigue PENDING: se envía.
 */
export async function cerrarEnvioDeFacturaNoPendiente(
  envioId: string,
  invoiceId: string,
  tenantId: string,
): Promise<boolean> {
  return tenantTransaction(
    async (tx) => {
      const factura = await tx.invoice.findFirst({
        where: { id: invoiceId, tenantId },
        select: { status: true },
      });
      if (factura?.status === "PENDING") return false;
      await tx.outboxEvent.updateMany({
        where: { id: envioId, tenantId, processedAt: null },
        data: {
          processedAt: new Date(),
          lastError: `La factura ya no estaba pendiente (${factura?.status ?? "no existe"}): no se envió a ARCA.`,
        },
      });
      return true;
    },
    { tenantId },
  );
}

// ─── Motor de facturación · NOTA DE CRÉDITO ASOCIADA (pedido 1 de la consola del contador) ────

/** Lo que pide quien anula una factura autorizada. */
export interface NotaDeCreditoInput {
  tenantId: string;
  /** La factura AUTORIZADA que se anula (del mismo negocio: la llave foránea lo impone). */
  facturaId: string;
  /** Total a anular, IVA incluido. Sin él, todo lo que queda por anular. */
  importe?: number;
  /** Por qué se anula: queda en la descripción del comprobante y en la auditoría de quien llama. */
  motivo: string;
  /** Fecha de la nota (CbteFch), AAAAMMDD o AAAA-MM-DD: el día en que se emite. */
  fecha: string;
  /** El día en que se pide el CAE, para la ventana de fechas de ARCA. Default: `fecha`. */
  fechaDeEnvio?: string;
}

export type ResultadoNotaDeCredito = { ok: true; invoiceId: string } | { ok: false; error: string };

/** Lo que queda de la factura original en su envío (lo que viajó a ARCA). */
interface DatosEmitidos {
  concepto: number;
  emisor: CreateInvoiceInput["emisor"];
  receptor: CreateInvoiceInput["receptor"];
  neto: number;
  iva: SubtotalIva[];
  total: number;
  ivaPorProducto?: boolean;
  servicioDesde?: string;
  servicioHasta?: string;
  vencimientoPago?: string;
}

const NATURALEZA_DEL_CONCEPTO: Record<number, "productos" | "servicios" | "productos_y_servicios"> = {
  1: "productos",
  2: "servicios",
  3: "productos_y_servicios",
};

/**
 * Emite una NOTA DE CRÉDITO asociada a una factura autorizada, dentro de la transacción del
 * llamador (con el contexto RLS del negocio): crea la Invoice PENDING de clase nota de crédito
 * (`comprobanteAsociadoId` = la factura) y encola su envío a ARCA por el outbox, como cualquier
 * factura. Nunca lanza por un dato del usuario: devuelve `{ ok: false, error }` en criollo.
 *
 * INVARIANTE — nunca se anula más de lo facturado, ni con dos pedidos a la vez: la fila de la
 * factura se toma FOR UPDATE antes de sumar las notas vivas (PENDING o AUTHORIZED), así dos notas
 * simultáneas sobre la misma factura se ordenan y la segunda ve el saldo que dejó la primera
 * (DB-4: la exclusión la da la base, no un chequeo suelto).
 *
 * La decisión fiscal es la única del Core (`decidirComprobante`): misma letra, mismo receptor,
 * saldo, fechas. Lo que no queda «lista» no se emite: vuelve el motivo.
 */
export async function crearNotaDeCreditoInTx(tx: InvoiceTx, input: NotaDeCreditoInput): Promise<ResultadoNotaDeCredito> {
  const motivo = input.motivo?.trim() ?? "";
  if (!motivo) return { ok: false, error: "Contá por qué se anula la factura: queda escrito en la nota de crédito." };
  const fecha = normalizarFecha(input.fecha);
  if (!fecha) return { ok: false, error: "La fecha de la nota de crédito no es válida." };
  const fechaDeEnvio = normalizarFecha(input.fechaDeEnvio ?? input.fecha) ?? fecha;

  const filas = await tx.$queryRaw<
    { status: string; tipoComprobante: number | null; puntoVenta: number; numero: number | null; fecha: string; total: string; comprobanteAsociadoId: string | null }[]
  >`
    SELECT status::text AS status, "tipoComprobante", "puntoVenta", numero, fecha, total::text AS total, "comprobanteAsociadoId"
    FROM "Invoice"
    WHERE id = ${input.facturaId} AND "tenantId" = ${input.tenantId}
    FOR UPDATE`;
  const f = filas[0];
  if (!f) return { ok: false, error: "No encontramos esa factura en este negocio." };
  if (f.comprobanteAsociadoId) return { ok: false, error: "Eso ya es una nota: se anula una factura, no una nota de crédito." };
  if (f.status !== "AUTHORIZED" || f.numero == null || f.tipoComprobante == null) {
    return {
      ok: false,
      error:
        f.status === "PENDING"
          ? "La factura todavía no la autorizó ARCA: esperá a que tenga CAE para anularla."
          : "La factura no está autorizada por ARCA (fue rechazada): no hay nada que anular con una nota de crédito.",
    };
  }

  const notas = await tx.invoice.findMany({
    where: { tenantId: input.tenantId, comprobanteAsociadoId: input.facturaId, status: { in: ["PENDING", "AUTHORIZED"] } },
    select: { total: true },
  });
  const yaAcreditado = sumarAlCentavo(notas.map((n) => Number(n.total)));
  const totalFactura = Number(f.total);
  const saldo = saldoPorAnular(totalFactura, yaAcreditado);
  if (saldo <= 0) return { ok: false, error: "Esa factura ya está anulada entera con notas de crédito." };
  const importe = input.importe ?? saldo;
  if (!Number.isFinite(importe) || centavosDe(importe) <= 0) {
    return { ok: false, error: "El importe a anular tiene que ser mayor a cero." };
  }
  if (centavosDe(importe) > centavosDe(saldo)) {
    return { ok: false, error: `No se puede anular ${pesosAR(importe)}: de esa factura queda ${pesosAR(saldo)} por anular.` };
  }

  // Los datos con los que la factura viajó a ARCA: su último envío (emisor, receptor, IVA, fechas).
  const envio = await tx.outboxEvent.findFirst({
    where: { tenantId: input.tenantId, type: OUTBOX_INVOICE_CREATED, payload: { path: ["invoiceId"], equals: input.facturaId } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { payload: true },
  });
  const emitida = envio?.payload as unknown as DatosEmitidos | undefined;
  if (!emitida?.emisor || !emitida.receptor) {
    return { ok: false, error: "No encontramos con qué datos se emitió esa factura: anulala desde ARCA y avisá a soporte." };
  }

  let montos: { neto: number; iva: SubtotalIva[]; total: number };
  try {
    montos = montosDeLaNota({ neto: emitida.neto, iva: emitida.iva ?? [], total: totalFactura }, importe);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo calcular la nota de crédito." };
  }
  // Servicios: la nota informa el mismo período; el vencimiento no puede ser anterior a la nota.
  const vto = emitida.vencimientoPago && emitida.vencimientoPago >= fecha ? emitida.vencimientoPago : fecha;
  const conServicio = emitida.concepto === 2 || emitida.concepto === 3;

  const decision = decidirComprobante(
    {
      condicionIva: emitida.emisor.condicionIva,
      cuit: emitida.emisor.cuit,
      regimenFacturaA:
        emitida.emisor.condicionIva === "RESPONSABLE_INSCRIPTO" ? await leerRegimenFacturaAEnTx(tx, input.tenantId) : null,
    },
    { condicionIva: emitida.receptor.condicionIva, docTipo: emitida.receptor.docTipo, docNro: emitida.receptor.docNro },
    {
      clase: "nota_credito",
      fecha,
      fechaDeEnvio,
      importeTotal: montos.total,
      naturaleza: NATURALEZA_DEL_CONCEPTO[emitida.concepto] ?? null,
      servicio: conServicio ? { desde: emitida.servicioDesde ?? null, hasta: emitida.servicioHasta ?? null, vencimientoPago: vto } : null,
      asociado: {
        cbteTipo: f.tipoComprobante,
        puntoVenta: f.puntoVenta,
        numero: f.numero,
        fecha: f.fecha,
        importeTotal: totalFactura,
        importeYaAcreditado: yaAcreditado,
        docNro: emitida.receptor.docNro,
      },
    },
    { exigirPeriodoDeServicio: true },
  );
  if (decision.estado !== "lista") {
    const porQue = decision.motivos.filter((m) => m.gravedad !== "aviso").map((m) => m.mensaje).join(" ");
    return { ok: false, error: porQue || "La nota de crédito no se puede emitir con estos datos." };
  }

  const nota = await tx.invoice.create({
    data: {
      tenantId: input.tenantId,
      ...datosDelComprobante({
        tenantId: input.tenantId,
        concepto: emitida.concepto,
        fecha,
        emisor: emitida.emisor,
        receptor: emitida.receptor,
        neto: montos.neto,
        iva: montos.iva,
        total: montos.total,
        clase: "nota_credito",
        asociado: { invoiceId: input.facturaId, cbteTipo: f.tipoComprobante, puntoVenta: f.puntoVenta, numero: f.numero, fecha: f.fecha },
        descripcion: `Anula ${centavosDe(montos.total) === centavosDe(totalFactura) ? "la" : "parte de la"} factura ${f.puntoVenta}-${f.numero}: ${motivo}`,
      }),
    },
    select: { id: true },
  });
  await encolarInvoiceCreated(tx, nota.id, {
    tenantId: input.tenantId,
    concepto: emitida.concepto,
    fecha,
    emisor: emitida.emisor,
    receptor: emitida.receptor,
    neto: montos.neto,
    iva: montos.iva,
    total: montos.total,
    ...(emitida.ivaPorProducto === true ? { ivaPorProducto: true } : {}),
    ...(conServicio ? { servicioDesde: emitida.servicioDesde, servicioHasta: emitida.servicioHasta, vencimientoPago: vto } : {}),
    clase: "nota_credito",
    asociado: { invoiceId: input.facturaId, cbteTipo: f.tipoComprobante, puntoVenta: f.puntoVenta, numero: f.numero, fecha: f.fecha },
  });
  return { ok: true, invoiceId: nota.id };
}

/** `crearNotaDeCreditoInTx` en su propia transacción, parada en el negocio (RLS). */
export async function crearNotaDeCredito(input: NotaDeCreditoInput): Promise<ResultadoNotaDeCredito> {
  return tenantTransaction((tx) => crearNotaDeCreditoInTx(tx, input), { tenantId: input.tenantId });
}

const pesosAR = (n: number) => `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Consulta una factura del tenant. */
export async function getInvoice(id: string, tenantId: string) {
  return prisma.invoice.findFirst({ where: { id, tenantId } });
}
