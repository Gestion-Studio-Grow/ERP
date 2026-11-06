/**
 * Opción B de CH (decisión del dueño, 06/11/2026, a pedido de Carolina): UNA FACTURA POR CADA
 * COBRO DEL TURNO. La seña se factura al cobrarla y el saldo al cobrarlo, cada uno por su monto.
 * Antes la factura salía al completar el turno por lo cobrado hasta ahí y el saldo posterior no se
 * facturaba nunca (EVENTUALIDADES #15).
 *
 *   · Cada cobro del libro del turno (`Collection` que es plata que entró: ni la contrapartida de
 *     una anulación ni una condonación) es un cobro facturable, con clave
 *     `turno:cobro:<collectionId>` en `CobroFacturado`. El índice único (tenantId, clave) y el
 *     candado por clave son el árbitro: un cobro → como máximo UNA factura, aunque dos
 *     disparadores corran a la vez o la recepción reintente.
 *   · Un cobro que ya tiene fila (aunque su factura haya quedado RECHAZADA) no se vuelve a facturar
 *     solo: igual que `createInvoice` con los flujos automáticos, el reintento lo decide una persona.
 *   · La factura NO lleva origen APPOINTMENT: `Invoice` tiene @@unique(tenantId, appointmentId)
 *     (una factura por turno). El vínculo con el turno es `CobroFacturado.appointmentId`. Así la
 *     opción B no necesita quitar ese único (ver el informe del PR).
 *   · Turnos YA facturados por el camino de antes (factura con `Invoice.appointmentId` o la clave
 *     `turno:<turno>`) no se tocan: `modo: "legado"` y el llamador sigue como siempre.
 *   · Lo que Mercado Pago ya facturó por pagos de este turno (`mp:<pago>`) cubre primero los cobros
 *     del libro con medio Mercado Pago: no se factura dos veces la misma seña.
 *   · ENG-023: la factura de un cobro toma la fila del turno (la misma escritura que
 *     `createInvoiceInTx`) y relee que el cobro no esté anulado; la anulación toma esa fila FOR
 *     UPDATE antes de leer la factura del cobro (`turnos/anulacion.ts`).
 *
 * Montos en centavos (`centavosDe`, ADR-100). Todo detrás de `isInvoicingEnabled()` en los llamadores.
 */

import { Prisma } from "@/generated/prisma/client";
import { tenantTransaction } from "@/lib/rls";
import { centavosDe } from "@/lib/dinero/redondeo";
import { calcularImpuestos, getFiscalProfile } from "@/lib/fiscal";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";
import { createInvoiceInTx, crearNotaDeCreditoInTx, type CreateInvoiceInput, type InvoiceTx, type ResultadoNotaDeCredito } from "@/lib/invoice-core";
import { claveCobroTurno, facturarCobrosInTx, tomarClaves, vincularCobroInTx, type CobroAFacturar } from "@/lib/facturacion/cobros-facturados";
import { claveCobroDelLibro, cobroDeLaClave } from "@/lib/facturacion/clave-cobro-del-libro";
import { esPagoMP, saldosMPSinPareja } from "@/lib/facturacion/cobertura-mp";
import { MARCA_ANULACION, claseDeCobro, cobroAnuladoPor } from "@/lib/turnos/anulacion";

// Códigos de catálogo ARCA (ver src/plugins/arca/domain/catalogos.ts).
const CONCEPTO_SERVICIOS = 2;
const DOC_CONSUMIDOR_FINAL = 99;

// ─── La cuenta (PURA) ───────────────────────────────────────────────────────────

/** Una fila del libro del turno, ya en `number`. */
export interface FilaDelLibro {
  id: string;
  amount: number;
  method: string;
  note: string | null;
  createdAt: Date;
}

/** Un cobro que hay que facturar ahora, por `importe` (pesos). */
export interface CobroPorFacturar {
  collectionId: string;
  importe: number;
  method: string;
}

/**
 * Los cobros del turno que todavía no tienen factura, con el monto de cada uno.
 *   · Sólo cobros (no anulaciones ni condonaciones), positivos y sin contrapartida.
 *   · `conFila`: los cobros que ya tienen fila en `CobroFacturado` (cualquier estado): no se tocan.
 *   · `mpSinPareja`: lo que facturaron pagos de Mercado Pago de este turno y no está ya atado a la
 *     factura de un cobro del libro. Cubre, en orden de llegada, los cobros con medio Mercado Pago
 *     (es la misma plata anotada en el libro); lo que sobra de cada uno se factura.
 */
export function planFacturasPorCobro(x: {
  filas: readonly FilaDelLibro[];
  conFila: ReadonlySet<string>;
  mpSinPareja: number;
}): CobroPorFacturar[] {
  const anulados = new Set(x.filas.map((f) => cobroAnuladoPor(f.note)).filter((id): id is string => id != null));
  const vivos = x.filas
    .filter((f) => claseDeCobro(f.note) === "cobro" && centavosDe(f.amount) > 0 && !anulados.has(f.id))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  let presupuestoMP = Math.max(0, centavosDe(x.mpSinPareja));
  const plan: CobroPorFacturar[] = [];
  for (const f of vivos) {
    if (x.conFila.has(f.id)) continue;
    let centavos = centavosDe(f.amount);
    if (f.method === "MERCADOPAGO") {
      const cubierto = Math.min(presupuestoMP, centavos);
      presupuestoMP -= cubierto;
      centavos -= cubierto;
    }
    if (centavos > 0) plan.push({ collectionId: f.id, importe: centavos / 100, method: f.method });
  }
  return plan;
}

/** Fila de `CobroFacturado` del turno, con el estado de su factura. */
export interface FilaFacturada {
  clave: string;
  invoiceId: string;
  importe: number;
  status: string;
  createdAt: Date;
  /** La factura que acredita, si ésta es una nota de crédito. */
  asociada?: string | null;
}

/** Lo facturado por pagos de MP (vivos) que NO está atado a la factura de un cobro del libro ni
 *  acreditado por la nota de crédito de un cobro anulado (`cobertura-mp.ts`). */
export function mpSinPareja(filas: readonly FilaFacturada[]): number {
  return saldosMPSinPareja(filas).reduce((a, s) => a + s.centavos, 0) / 100;
}

/** Un medio del libro → el umbral de identificación del motor (PR5 · C4). */
const medioDePago = (method: string): "efectivo" | "otro" => (method === "EFECTIVO" ? "efectivo" : "otro");

// ─── Lectura ────────────────────────────────────────────────────────────────────

/** Si la tabla `CobroFacturado` existe (migración 20261022150000, Gate 2). Sin ella no hay opción B. */
export async function hayLibroDeCobrosInTx(tx: InvoiceTx): Promise<boolean> {
  if (typeof (tx as { $queryRaw?: unknown }).$queryRaw !== "function") return false;
  const filas = await tx.$queryRaw<{ tabla: string | null }[]>`SELECT to_regclass('"CobroFacturado"')::text AS tabla`;
  return Boolean(filas[0]?.tabla);
}

interface EstadoDelTurno {
  legado: string | null;
  filas: FilaDelLibro[];
  facturadas: FilaFacturada[];
}

async function leerEstadoInTx(tx: InvoiceTx, tenantId: string, appointmentId: string): Promise<EstadoDelTurno | null> {
  if (!(await hayLibroDeCobrosInTx(tx))) return null;
  const [legadas, libro, facturadas] = await Promise.all([
    tx.invoice.findMany({
      where: { tenantId, appointmentId, status: { not: "REJECTED" } },
      select: { id: true },
      take: 1,
    }),
    tx.collection.findMany({
      where: { tenantId, originType: "APPOINTMENT", originId: appointmentId },
      select: { id: true, amount: true, method: true, note: true, createdAt: true },
    }),
    tx.cobroFacturado.findMany({
      where: { tenantId, appointmentId },
      select: { clave: true, invoiceId: true, importe: true, createdAt: true, invoice: { select: { status: true, comprobanteAsociadoId: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const filasFacturadas: FilaFacturada[] = facturadas.map((f) => ({
    clave: f.clave,
    invoiceId: f.invoiceId,
    importe: Number(f.importe),
    status: f.invoice.status,
    createdAt: f.createdAt,
    asociada: f.invoice.comprobanteAsociadoId,
  }));
  const turnoEntero = filasFacturadas.find((f) => f.clave === claveCobroTurno(appointmentId) && f.status !== "REJECTED");
  return {
    legado: legadas[0]?.id ?? turnoEntero?.invoiceId ?? null,
    filas: libro.map((c) => ({ id: c.id, amount: c.amount.toNumber(), method: c.method, note: c.note, createdAt: c.createdAt })),
    facturadas: filasFacturadas,
  };
}

// ─── Escritura ──────────────────────────────────────────────────────────────────

/**
 * EL CANDADO COMÚN DEL TURNO: escribe la fila del turno (la misma escritura que `createInvoiceInTx`
 * con origen APPOINTMENT; la anulación la toma FOR UPDATE). Todo lo que factura plata de este turno
 * —la factura de un cobro del libro, el aviso de Mercado Pago de un pago del turno, la anulación—
 * la toma ANTES de leer qué está facturado, y lee y factura en la MISMA transacción: el segundo
 * espera al primero y, en READ COMMITTED, su lectura siguiente ya ve la factura del primero.
 * Sin esto, el aviso de MP y la factura del cobro miraban a la vez «no hay factura» y salían dos
 * (certificación del PR #38). Devuelve `false` si el turno no existe en este negocio.
 */
export async function bloquearTurnoInTx(tx: InvoiceTx, tenantId: string, appointmentId: string): Promise<boolean> {
  if (typeof (tx as { $queryRaw?: unknown }).$queryRaw !== "function") return true; // dobles de test sin SQL
  const turno = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "Appointment" SET "tenantId" = "tenantId"
    WHERE id = ${appointmentId} AND "tenantId" = ${tenantId}
    RETURNING id`;
  return turno.length > 0;
}

/**
 * Factura UN cobro del libro dentro de la transacción del llamador. Devuelve la factura del cobro
 * (la nueva, o la que ya tenía), o `null` si el cobro ya no está (anulado o no es de este turno).
 */
export async function facturarCobroDelLibroInTx(
  tx: InvoiceTx,
  input: CreateInvoiceInput,
  cobro: { appointmentId: string; collectionId: string },
): Promise<string | null> {
  const { tenantId } = input;
  const clave = claveCobroDelLibro(cobro.collectionId);
  // Candado común del turno PRIMERO (mismo orden en todos los caminos: sin abrazos mortales).
  if (!(await bloquearTurnoInTx(tx, tenantId, cobro.appointmentId))) throw new Error("No se encontró el turno a facturar.");
  await tomarClaves(tx, tenantId, [clave]);
  const previa = await tx.cobroFacturado.findFirst({ where: { tenantId, clave }, select: { invoiceId: true } });
  if (previa) return previa.invoiceId;

  // ENG-023: la fila del turno ya está escrita (la anulación la toma FOR UPDATE): RELEER el cobro.
  const [fila, reversa] = await Promise.all([
    tx.collection.findFirst({
      where: { tenantId, id: cobro.collectionId, originType: "APPOINTMENT", originId: cobro.appointmentId },
      select: { id: true },
    }),
    tx.collection.findFirst({
      where: {
        tenantId,
        originType: "APPOINTMENT",
        originId: cobro.appointmentId,
        note: { startsWith: `${MARCA_ANULACION}${cobro.collectionId} —` },
      },
      select: { id: true },
    }),
  ]);
  if (!fila || reversa) return null;

  if (input.origin) throw new Error("La factura de un cobro no lleva origen: el turno ya tiene su único de una factura.");
  const invoiceId = await createInvoiceInTx(tx, input);
  await vincularCobroInTx(tx, tenantId, { clave, importe: input.total, appointmentId: cobro.appointmentId }, invoiceId);
  return invoiceId;
}

export type ResultadoPorCobro =
  /** El turno ya tiene su factura del camino de antes: no se toca. */
  | { modo: "legado"; factura: string }
  /** Sin libro de cobros (tabla sin migrar o turno sin cobros): decide el llamador. */
  | { modo: "sin-libro" }
  /** Facturas de cobros: las nuevas, y la más reciente del turno (para el aviso). */
  | { modo: "por-cobro"; nuevas: string[]; ultima: string | null };

export interface DepsPorCobro {
  getFiscalProfile: typeof getFiscalProfile;
  fecha: () => string;
}

const DEPS: DepsPorCobro = { getFiscalProfile, fecha: fechaFiscalDelDia };

function planDelEstado(estado: EstadoDelTurno): CobroPorFacturar[] {
  const conFila = new Set(estado.facturadas.map((f) => cobroDeLaClave(f.clave)).filter((id): id is string => id != null));
  return planFacturasPorCobro({ filas: estado.filas, conFila, mpSinPareja: mpSinPareja(estado.facturadas) });
}

const ultimaDeCobros = (estado: EstadoDelTurno) => estado.facturadas.find((f) => cobroDeLaClave(f.clave) != null)?.invoiceId ?? null;

/** Una transacción del negocio, con un reintento si otro disparador ganó la carrera (P2002). */
async function enElNegocio<T>(tenantId: string, f: (tx: InvoiceTx) => Promise<T>): Promise<T> {
  const correr = () => tenantTransaction(f, { tenantId });
  try {
    return await correr();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return correr();
    throw e;
  }
}

/**
 * Factura, cada uno por su monto, los cobros del turno que todavía no tienen factura. Idempotente:
 * llamarla dos veces (o a la vez) no emite dos facturas por el mismo cobro. LANZA si una factura no
 * se pudo crear (perfil fiscal incompleto, la base): el llamador lo trata como best-effort.
 */
export async function facturarCobrosDelTurno(
  appointmentId: string,
  tenantId: string,
  deps: DepsPorCobro = DEPS,
): Promise<ResultadoPorCobro> {
  const estado = await tenantTransaction((tx) => leerEstadoInTx(tx, tenantId, appointmentId), { tenantId });
  if (!estado) return { modo: "sin-libro" };
  if (estado.legado) return { modo: "legado", factura: estado.legado };
  if (estado.filas.length === 0) return { modo: "sin-libro" };

  // Primera mirada, sin candado: si no hay nada que facturar no se toma el turno ni el perfil fiscal.
  if (planDelEstado(estado).length === 0) return { modo: "por-cobro", nuevas: [], ultima: ultimaDeCobros(estado) };

  const perfil = await deps.getFiscalProfile(tenantId);
  // Consultar y facturar en UNA transacción, bajo el candado del turno: el plan se RECALCULA con lo
  // que hay después de tomar el candado (un aviso de MP pudo facturar la seña mientras tanto).
  return enElNegocio(tenantId, async (tx): Promise<ResultadoPorCobro> => {
    if (!(await bloquearTurnoInTx(tx, tenantId, appointmentId))) throw new Error("No se encontró el turno a facturar.");
    const ahora = await leerEstadoInTx(tx, tenantId, appointmentId);
    if (!ahora) return { modo: "sin-libro" };
    if (ahora.legado) return { modo: "legado", factura: ahora.legado };
    const planBajoCandado = planDelEstado(ahora);
    const previa = ultimaDeCobros(ahora);
    const nuevas: string[] = [];
    for (const cobro of planBajoCandado) {
      const { neto, iva, total } = calcularImpuestos(perfil.condicionIva, cobro.importe);
      // El día del NEGOCIO (libros/fecha-fiscal.ts): el día en que entró la plata de ESE cobro.
      const fecha = deps.fecha();
      const comprobante: CreateInvoiceInput = {
        tenantId,
        concepto: CONCEPTO_SERVICIOS,
        fecha,
        emisor: { cuit: perfil.cuit, condicionIva: perfil.condicionIva, puntoVenta: perfil.puntoVenta },
        // El modelo Client no captura CUIT/DNI todavía → Consumidor Final (ADR-024).
        receptor: { docTipo: DOC_CONSUMIDOR_FINAL, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
        neto,
        iva,
        total,
        medioDePago: medioDePago(cobro.method),
        servicioDesde: fecha,
        servicioHasta: fecha,
        vencimientoPago: fecha,
      };
      const id = await facturarCobroDelLibroInTx(tx, comprobante, { appointmentId, collectionId: cobro.collectionId });
      if (id && !nuevas.includes(id)) nuevas.push(id);
    }
    return { modo: "por-cobro", nuevas, ultima: nuevas.at(-1) ?? previa };
  });
}

/**
 * El aviso de Mercado Pago de un pago de este turno, cuando la recepción ya anotó ese pago en el libro
 * y su cobro ya se facturó por la opción B: devuelve esa factura (para atar el pago a ella sin emitir
 * otra), o `null` si la plata de MP todavía no está facturada por un cobro del libro.
 */
export async function facturaDeCobroParaPagoMP(tenantId: string, appointmentId: string, monto: number): Promise<string | null> {
  return tenantTransaction((tx) => facturaDeCobroParaPagoMPInTx(tx, tenantId, appointmentId, monto), { tenantId });
}

/** `facturaDeCobroParaPagoMP` dentro de la transacción del llamador (bajo el candado del turno). */
export async function facturaDeCobroParaPagoMPInTx(
  tx: InvoiceTx,
  tenantId: string,
  appointmentId: string,
  monto: number,
): Promise<string | null> {
  if (!(await hayLibroDeCobrosInTx(tx))) return null;
  const [facturadas, libro] = await Promise.all([
    tx.cobroFacturado.findMany({
      where: { tenantId, appointmentId },
      select: { clave: true, invoiceId: true, importe: true, invoice: { select: { status: true } } },
      orderBy: { createdAt: "desc" },
    }),
    tx.collection.findMany({
      where: { tenantId, originType: "APPOINTMENT", originId: appointmentId, method: "MERCADOPAGO" },
      select: { id: true },
    }),
  ]);
  const cobrosMP = new Set(libro.map((c) => c.id));
  const vivas = facturadas.filter((f) => f.invoice.status !== "REJECTED");
  const deCobrosMP = vivas.filter((f) => cobrosMP.has(cobroDeLaClave(f.clave) ?? ""));
  const ids = new Set(deCobrosMP.map((f) => f.invoiceId));
  const facturadoPorCobros = deCobrosMP.reduce((a, f) => a + centavosDe(Number(f.importe)), 0);
  const yaAtado = vivas.filter((f) => esPagoMP(f.clave) && ids.has(f.invoiceId)).reduce((a, f) => a + centavosDe(Number(f.importe)), 0);
  if (facturadoPorCobros - yaAtado < centavosDe(monto)) return null;
  return deCobrosMP[0]?.invoiceId ?? null;
}

/**
 * El aviso de Mercado Pago de un pago de un turno, ya calculado su comprobante: decide y factura en
 * UNA transacción, bajo el candado del turno (`bloquearTurnoInTx`), RELEYENDO adentro:
 *   · si el turno ya tiene su factura del camino de antes, el pago se ata a ella;
 *   · si la recepción ya anotó y facturó ese pago como cobro del libro, se ata a esa factura;
 *   · si no, se factura el pago (`mp:<pago>`, idempotente por su clave).
 * Así el aviso y la factura del cobro (`facturarCobrosDelTurno`) se ordenan: el segundo ve al primero.
 */
export async function facturarPagoMPDelTurno(
  input: CreateInvoiceInput,
  cobro: CobroAFacturar & { appointmentId: string },
): Promise<string> {
  const { tenantId } = input;
  return enElNegocio(tenantId, async (tx) => {
    await bloquearTurnoInTx(tx, tenantId, cobro.appointmentId);
    const delTurno = await tx.invoice.findFirst({
      where: { tenantId, appointmentId: cobro.appointmentId, status: { not: "REJECTED" } },
      select: { id: true },
    });
    if (delTurno) return vincularCobroInTx(tx, tenantId, cobro, delTurno.id);
    const delCobro = await facturaDeCobroParaPagoMPInTx(tx, tenantId, cobro.appointmentId, cobro.importe);
    if (delCobro) return vincularCobroInTx(tx, tenantId, cobro, delCobro);
    return facturarCobrosInTx(tx, input, [cobro]);
  });
}

/**
 * Anular un cobro cuya factura ya autorizó ARCA: la NOTA DE CRÉDITO por lo que queda de esa factura,
 * en la MISMA transacción que la contrapartida (`anularCobroTurnoInTx` la recibe inyectada: ese
 * módulo lo importan pantallas y no puede traer el Core de facturación).
 */
export function notaDeCreditoDelCobroInTx(
  tx: InvoiceTx,
  x: { tenantId: string; facturaId: string; motivo: string; importe?: number },
): Promise<ResultadoNotaDeCredito> {
  return crearNotaDeCreditoInTx(tx, {
    tenantId: x.tenantId,
    facturaId: x.facturaId,
    ...(x.importe != null ? { importe: x.importe } : {}),
    motivo: `Anulación del cobro: ${x.motivo}`,
    fecha: fechaFiscalDelDia(),
  });
}
