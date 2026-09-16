// ============================================================================
// COBRO DE TURNOS — persistencia tx-scoped (Collection + Payment agregado + libro de caja).
// ============================================================================
//
// Registra UN cobro (seña, saldo, o lo que la recepción tipee) contra un turno, DENTRO de
// la transacción del llamador (I7, ADR-064): el cobro, el estado del turno y el asiento de
// caja son todo-o-nada. La regla vive en `cobros.ts` (pura); acá sólo se lee, se valida y
// se escribe.
//
// Por qué no reusa `applyCollectionInTx` (settlement/collection-repo.ts) aunque sí reusa su
// núcleo puro (`computeSettlement`/`validateNewCollection` vía cobros.ts):
//   · necesita la CLAVE DE IDEMPOTENCIA (`Collection.idempotencyKey`) —cobrar dos veces por
//     doble clic no puede duplicar plata— y aquel repo no la conoce;
//   · tiene que respetar el `Payment` LEGADO (turnos cobrados por `confirmPayment`/MP antes
//     de este cambio, sin `Collection`) como cobrado, o aparecerían como deuda;
//   · mantiene `Payment` como AGREGADO de los cobros (Reportes, ficha, comisiones y
//     facturación lo suman) y enchufa el asiento del libro por cobro (`collectionId`).
//
// IDEMPOTENCIA, tres capas: (1) el saldo — `validarCobroTurno` rechaza cobrar más de lo que
// falta; (2) pre-check por `idempotencyKey` dentro de la tx (caso secuencial); (3) el
// `@@unique(tenantId, idempotencyKey)` como árbitro de la carrera (P2002 → el llamador lo
// clasifica con `settleAppointmentPaymentGuarded`). Las claves: `senia:<turno>` al reservar,
// `saldo:<turno>` al completar, un uuid del formulario en "Registrar cobro".
//
// SCHEMA-AHEAD: `Collection.idempotencyKey` y `CashMovement.collectionId` tienen migración
// ESCRITA y SIN aplicar (gate del dueño). Con `withSchema: false` el cobro se registra igual
// —Collection + Payment agregado— sin clave persistente ni asiento (degradación acordada).

import type { Prisma } from "@/generated/prisma/client";
import { recordCobroTurnoInTx, type RecordCobroTurnoResult } from "@/lib/caja/cobro-turno";
import { round2 } from "@/lib/round";
import {
  estadoCobroTurno,
  montosCobrados,
  validarCobroTurno,
  type CobroTurno,
  type EstadoCobroTurno,
  type MetodoDePago,
  type MotivoCobroRechazado,
  type MotivoNoCompletable,
} from "./cobros";
// `desglosarCobros` y `claseDeCobro` son lo ÚNICO que distingue plata que entró de un saldo
// condonado. El import va en esta dirección y sólo en esta: `anulacion.ts` NO importa este
// módulo (que sí trae el namespace de Prisma como valor), así que el client component que
// importa `anulacion.ts` no arrastra el runtime de Prisma al bundle del browser.
import { claseDeCobro, desglosarCobros } from "./anulacion";

export type CobroTurnoTx = Prisma.TransactionClient;

// Nota del cobro que materializa un `Payment` legado. Vive ACÁ y no en un módulo
// compartido a propósito: si `anulacion.ts` la importara de este archivo, se llevaría
// consigo el import de valor de Prisma de la línea 30, y `AppointmentRow.tsx` —que es
// client component e importa `anulacion.ts`— rompería el build de Turbopack.
const NOTA_COBRO_LEGADO = "Cobro previo a los cobros parciales (Payment del turno)";

export type AplicarCobroArgs = {
  appointmentId: string;
  status: string; // estado del turno (ya cargado por el llamador)
  precio: number; // priceAtBooking ?? service.price
  monto: number;
  method: MetodoDePago;
  note?: string | null;
  actor: string; // "user:<id>"
  detail: string; // detalle del asiento en el libro ("Turno · servicio — clienta")
  idempotencyKey: string | null;
  // true = escribir `idempotencyKey` y asentar en el libro (columnas migradas).
  withSchema: boolean;
};

export type AplicarCobroResult =
  | {
      applied: true;
      collectionId: string;
      monto: number;
      estado: EstadoCobroTurno; // DESPUÉS del cobro
      payment: { id: string; amount: number };
      caja: RecordCobroTurnoResult | null; // null = sin puente (schema-ahead)
    }
  | { applied: false; reason: "duplicate"; collectionId: string };

export class CobroTurnoRechazado extends Error {
  readonly motivo: MotivoCobroRechazado;
  readonly saldo: number;
  constructor(motivo: MotivoCobroRechazado, saldo: number) {
    super(mensajeRechazo(motivo, saldo));
    this.name = "CobroTurnoRechazado";
    this.motivo = motivo;
    this.saldo = saldo;
  }
}

export function mensajeRechazo(motivo: MotivoCobroRechazado, saldo: number): string {
  switch (motivo) {
    case "turno-cerrado":
      return "Este turno está cancelado o marcado como no se presentó: no admite más cobros.";
    case "monto-invalido":
      return "El monto a cobrar tiene que ser mayor a cero.";
    case "excede-saldo":
      return saldo <= 0
        ? "Este turno ya está cobrado por completo."
        : `El monto supera lo que falta cobrar ($${saldo.toLocaleString("es-AR")}).`;
  }
}

export class CompletarTurnoRechazado extends Error {
  readonly motivo: MotivoNoCompletable | "falta-medio";
  constructor(motivo: MotivoNoCompletable | "falta-medio") {
    super(mensajeNoCompletable(motivo));
    this.name = "CompletarTurnoRechazado";
    this.motivo = motivo;
  }
}

export function mensajeNoCompletable(motivo: MotivoNoCompletable | "falta-medio"): string {
  switch (motivo) {
    case "no-confirmado":
      return "Solo se puede completar un turno que esté confirmado.";
    case "no-ocurrio":
      return "Este turno todavía no ocurrió: se puede completar recién a partir de su horario.";
    case "falta-medio":
      return "Falta el medio con que se cobra el saldo (o marcá \"dejar saldo a cobrar\").";
  }
}

// Rastro para la auditoría de qué pasó con el libro: asentado / motivo por el que no /
// degradado (columnas sin migrar). Mismo criterio que el `confirmPayment` original.
export function rastroLibroCaja(settled: {
  outcome: "ok" | "degraded" | "race";
  value?: AplicarCobroResult;
}): "sin-migrar" | { movementId: string; method: string } | string | null {
  if (settled.outcome === "degraded") return "sin-migrar";
  const v = settled.value;
  if (!v || !v.applied || !v.caja) return null;
  return v.caja.recorded ? { movementId: v.caja.movementId, method: v.caja.method } : v.caja.reason;
}

// Cobros ya registrados contra el turno (fila `Collection`, origen APPOINTMENT).
export async function cobrosDelTurnoInTx(tx: CobroTurnoTx, tenantId: string, appointmentId: string): Promise<CobroTurno[]> {
  return loadCobros(tx, tenantId, appointmentId);
}

// La NOTA viaja con el monto, siempre. Es lo único que distingue plata que entró de un saldo
// CONDONADO o de la contrapartida de una anulación, y sin ella `Payment.amount` contaba como
// cobrado un saldo perdonado. `estadoCobroTurno` la ignora A PROPÓSITO (el saldo SÍ se cierra
// con la condonación, que es lo que destraba la liquidación de comisión); `desglosarCobros`
// la lee. Son dos cuentas distintas sobre las mismas filas, y salen de la misma fila.
type CobroConNota = CobroTurno & { note: string | null };

async function loadCobros(tx: CobroTurnoTx, tenantId: string, appointmentId: string): Promise<CobroConNota[]> {
  const rows = await tx.collection.findMany({
    where: { tenantId, originType: "APPOINTMENT", originId: appointmentId },
    select: { amount: true, method: true, note: true },
  });
  return rows.map((r) => ({ amount: r.amount.toNumber(), method: r.method, note: r.note }));
}

export async function aplicarCobroTurnoInTx(
  tx: CobroTurnoTx,
  tenantId: string,
  args: AplicarCobroArgs,
): Promise<AplicarCobroResult> {
  // La NOTA de un cobro pasó a ser un dato con consecuencia: `desglosarCobros` la lee para
  // decidir si ese peso entra o no a `Payment.amount`. Es una columna de texto libre sin
  // constraint en la base, así que el prefijo reservado se rechaza ACÁ. Un cobro que se
  // hiciera pasar por condonación se descontaría solo del agregado sin que nadie lo pidiera;
  // las marcas las escribe `anulacion.ts`, por su propio camino, y nunca este.
  if (claseDeCobro(args.note) !== "cobro") {
    throw new Error(
      "Cobro de turno: la nota no puede empezar con una marca reservada (ANULACION:/CONDONACION:). " +
        "Esas marcas las escribe la anulación, no el cobro.",
    );
  }

  // Capa 2 de idempotencia: mismo formulario enviado dos veces → el primero ya quedó.
  if (args.withSchema && args.idempotencyKey) {
    const prior = await tx.collection.findFirst({
      where: { tenantId, idempotencyKey: args.idempotencyKey },
      select: { id: true },
    });
    if (prior) return { applied: false, reason: "duplicate", collectionId: prior.id };
  }

  const [cobros, pagoLegado] = await Promise.all([
    loadCobros(tx, tenantId, args.appointmentId),
    tx.payment.findUnique({
      where: { appointmentId: args.appointmentId },
      select: { id: true, status: true, amount: true, method: true },
    }),
  ]);

  const v = validarCobroTurno({ status: args.status, precio: args.precio, cobros, pagoLegado, monto: args.monto });
  if (!v.ok) throw new CobroTurnoRechazado(v.motivo, v.saldo);

  // Turno cobrado por el camino viejo (`Payment` APPROVED sin `Collection`, de `confirmPayment`
  // o Mercado Pago) que recibe su primer cobro parcial: el pago previo se MATERIALIZA como
  // cobro, así lectura (Σ Collection) y escritura (Payment agregado) cuentan lo mismo y nunca
  // se pierde un peso que ya entró. Sin asiento de caja: si lo tuvo, fue por `paymentId`.
  if (cobros.length === 0 && montosCobrados([], pagoLegado).length > 0 && pagoLegado) {
    await tx.collection.create({
      data: {
        tenantId,
        originType: "APPOINTMENT",
        originId: args.appointmentId,
        appointmentId: args.appointmentId,
        amount: round2(pagoLegado.amount),
        method: pagoLegado.method,
        note: NOTA_COBRO_LEGADO,
        collectedBy: args.actor,
        ...(args.withSchema ? { idempotencyKey: `legado:${args.appointmentId}` } : {}),
      },
      select: { id: true },
    });
    cobros.push({ amount: round2(pagoLegado.amount), method: pagoLegado.method, note: NOTA_COBRO_LEGADO });
  }


  const created = await tx.collection.create({
    data: {
      tenantId,
      originType: "APPOINTMENT",
      originId: args.appointmentId,
      appointmentId: args.appointmentId,
      amount: v.monto, // number → Decimal(14,2) en el borde
      method: args.method,
      note: args.note ?? null,
      collectedBy: args.actor,
      ...(args.withSchema && args.idempotencyKey ? { idempotencyKey: args.idempotencyKey } : {}),
    },
    select: { id: true },
  });

  // `Payment` = LA PLATA QUE REALMENTE ENTRÓ y sigue en pie. APPROVED desde el primer peso.
  // `method` = el del último cobro. Sin `comprobanteNro`: ese campo es la marca "ya facturado"
  // de `decidirFacturacion`; el viejo `REC-<ts>` la disparaba y dejaba el turno sin factura al
  // completarlo (ADR-024).
  //
  // Se deriva con `desglosarCobros` —la MISMA función que usa la anulación— y NO con un Σ
  // ciego. Una fila `CONDONACION:` es saldo perdonado, no plata: sumarla inflaba
  // `Payment.amount`. Medido: cobrar $5.000, condonar $15.000, anular el cobro y volver a
  // cobrar $5.000 dejaba `Payment.amount = 20.000` con $5.000 reales adentro. Y de ahí lo
  // leen Reportes, los KPIs, la ficha de la clienta, el libro de IVA y —lo caro— la base de
  // la comisión: se le pagaba a la profesional sobre plata que nunca entró.
  const filas: CobroConNota[] = [...cobros, { amount: v.monto, method: args.method, note: args.note ?? null }];
  const desglose = desglosarCobros(filas);

  // NO hay guarda de "coherencia" comparando esto contra `estadoCobroTurno`, y es a propósito:
  // `desglosarCobros` PARTICIONA las filas, así que `cobrado + condonado` es idénticamente
  // `Σ amounts`, que es lo que devuelve la otra. Comparar las dos no puede fallar nunca. Había
  // una guarda así, tautológica, y por eso dejó pasar el Payment inflado sin decir nada.
  // Lo único que SÍ es una anomalía: Σ negativa significa una contrapartida de anulación sin
  // su cobro original, o sea el libro de este turno ya está roto. Ahí no escribimos encima.
  if (desglose.cobrado < 0) {
    throw new Error(
      `Cobro de turno ${args.appointmentId}: Σ cobros negativa (${desglose.cobrado}). Hay una anulación sin su cobro original.`,
    );
  }
  const amount = round2(desglose.cobrado);

  const payment = await tx.payment.upsert({
    where: { appointmentId: args.appointmentId },
    create: { tenantId, appointmentId: args.appointmentId, amount, method: args.method, status: "APPROVED" },
    update: { amount, method: args.method, status: "APPROVED" },
    select: { id: true, amount: true },
  });

  const estado = estadoCobroTurno({ precio: args.precio, cobros: filas });

  let caja: RecordCobroTurnoResult | null = null;
  if (args.withSchema) {
    caja = await recordCobroTurnoInTx(tx, tenantId, {
      collectionId: created.id,
      status: "APPROVED",
      paymentMethod: args.method,
      amount: v.monto,
      detail: args.detail,
      actor: args.actor,
    });
  }

  return { applied: true, collectionId: created.id, monto: v.monto, estado, payment, caja };
}

// ── Lectura para las pantallas ──────────────────────────────────────────────
//
// Acá vivía `cobrosPorTurno`, que hacía `select: { originId, amount, method, createdAt }`
// —SIN `note`— y devolvía un Σ ciego. Se BORRÓ, no se arregló: estaba muerta en producción
// (su único consumidor era su propio test; la agenda usa `cobrosDetalladosPorTurno`, que sí
// trae `id` y `note`) y una función exportada que suma plata sin mirar la nota es el molde
// del que salió el `Payment` inflado. Dejarla viva era invitar al tercer escritor.
//
// Si hace falta leer cobros por turno, es `cobrosDetalladosPorTurno` (`anulacion.ts`), que
// tiene la misma tolerancia a la tabla sin migrar.
