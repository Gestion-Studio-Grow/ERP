"use server";

// CIERRE DIARIO DE CAJA — la pantalla que ata el libro a la plata que se cuenta.
//
// El libro (libro-caja-actions.ts) dice cuánto DEBERÍA haber. Esto compara ese número
// contra lo que la persona CUENTA, medio por medio, y asienta la diferencia como una
// fila más del libro. Es la pieza que faltaba: la auditoría de la planilla de CH
// Estética encontró un faltante de $154.500 anotado al margen en marzo y nunca
// aplicado, con abril abriendo como si la plata estuviera. Después de cerrar un día
// acá, el día siguiente abre con lo CONTADO, no con lo que el libro creía.
//
// La ARITMÉTICA no vive acá: vive pura y testeada en src/lib/caja/cierre-diario.ts.
// Estas acciones sólo consultan, delegan el cálculo y persisten.
//
// Guardas: `orders:read` para mirar, `orders:manage` para cerrar — las mismas que la
// caja y el libro, porque es el mismo trabajo. Sin capability nueva (ver el encabezado
// de caja-actions.ts).
//
// SIN MIGRACIÓN, a propósito. El diseño (docs/producto/diseno-cierre-diario-caja.md §5)
// propone un modelo `CashDayClose`; eso sería una cuarta migración esperando
// autorización sobre las tres que ya esperan, y los seis números que congelaría son
// derivables de lo que igual queda escrito. Ver `frontera-cierre.ts`.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { getCurrentUser } from "@/lib/session";
import { isDemoSandbox, DEMO_WRITE_BLOCKED } from "@/lib/demo-sandbox";
import {
  businessWallTimeToUtc,
  todayInBusinessTz,
  dateStrInBusinessTz,
} from "@/lib/datetime";
import {
  buildCierreDiario,
  validateCierre,
  ajustesAsMovements,
  isDayKey,
  nextDayKey,
  compareDayKeys,
  formatDayLabel,
  type CierreDiario,
  type CierreMovement,
  type DayKey,
  type DeclaredAmounts,
} from "@/lib/caja/cierre-diario";
import {
  lastClosedDay,
  CIERRE_DIARIO_ACTION,
  CIERRE_DIARIO_ENTITY,
} from "@/lib/caja/frontera-cierre";
import { cierreMarker } from "@/lib/caja/cierre-marca";
import { resumenCierre } from "@/lib/caja/cierre-resumen";
import { CASH_METHODS, libroOrigin, type LibroMovement } from "@/lib/caja/libro-caja";
import type { CashMethod, CashMovementType } from "@/lib/caja/cash-register";

const CIERRE_PATH = "/admin/caja/cierre";
const LIBRO_PATH = "/admin/caja/libro";

// Fin del día `day` en hora de pared del negocio: el instante 00:00 del día siguiente.
// Los movimientos del período son `[inicio, fin)`. Hacerlo en UTC metería las últimas
// tres horas de cada día en el día siguiente (Argentina es UTC−3).
function endOfDayUtc(day: DayKey): Date {
  return businessWallTimeToUtc(nextDayKey(day), "00:00");
}

// Instante contable de los ajustes: el último minuto del día cerrado, para que en el
// libro queden como la ÚLTIMA fila de ese día y el saldo corrido cierre.
function ajusteInstant(day: DayKey): Date {
  return businessWallTimeToUtc(day, "23:59");
}

/** El comprobante de un día ya cerrado: qué se contó, quién y cuándo. */
export type CierreRegistrado = {
  day: DayKey;
  cerradoEl: Date;
  quien: string;
  /** El detalle por medio, ya en castellano (ver src/lib/caja/cierre-resumen.ts). */
  resumen: ReturnType<typeof resumenCierre>;
};

export type CierreDiarioData = {
  day: DayKey;
  today: DayKey;
  lastClosedDay: DayKey | null;
  since: DayKey | null;
  /** El cierre con TODO sin declarar: sirve para mostrar el esperado por medio. */
  preview: CierreDiario;
  /** Las filas del período, para que la persona vea qué está cerrando. */
  movements: {
    id: string;
    day: DayKey;
    type: CashMovementType;
    method: CashMethod;
    amount: number;
    detail: string;
    origin: "manual" | "pos" | "turno";
  }[];
  yaCerrado: boolean;
  enElFuturo: boolean;
  /**
   * Si este día está cerrado: el comprobante de SU cierre, o null si quedó ABSORBIDO por
   * un cierre posterior (cerrar el 07 arquea desde el último cierre, así que el 05 y el 06
   * quedan adentro y no tienen cierre propio).
   *
   * El QA encontró que sin esto la pantalla de un día cerrado quedaba diciendo "0
   * movimientos" y ofreciendo "se puede cerrar igual", contradiciendo su propio cartel.
   */
  registro: CierreRegistrado | null;
};

const NADA_DECLARADO: DeclaredAmounts = { EFECTIVO: null, MP: null, TARJETA: null };

/** Lee el ledger y arma el cierre del día pedido, sin declarar nada todavía. */
export async function getCierreDiarioData(dayRaw?: string | null): Promise<CierreDiarioData> {
  await requireCapability("orders:read");
  const today = todayInBusinessTz();
  const day = isDayKey(dayRaw) ? dayRaw : today;

  if (isDemoSandbox()) {
    return {
      day,
      today,
      lastClosedDay: null,
      since: null,
      preview: buildCierreDiario({ day, previous: [], movements: [], declared: NADA_DECLARADO }),
      movements: [],
      yaCerrado: false,
      enElFuturo: compareDayKeys(day, today) > 0,
      registro: null,
    };
  }

  const tenantId = await getCurrentTenantId();
  const cerradoHasta = await lastClosedDay(tenantId);
  const yaCerrado = cerradoHasta ? compareDayKeys(day, cerradoHasta) <= 0 : false;

  // Un día CERRADO no tiene "período": el período es lo que falta arquear desde el último
  // cierre, y este día ya está adentro. Calcularlo igual daba el rango invertido que vio el
  // QA ("Desde el 08/09 hasta el 07/09 — 0 movimientos") sobre el día recién cerrado.
  if (yaCerrado) {
    return {
      day,
      today,
      lastClosedDay: cerradoHasta,
      since: null,
      preview: buildCierreDiario({ day, previous: [], movements: [], declared: NADA_DECLARADO }),
      movements: [],
      yaCerrado: true,
      enElFuturo: compareDayKeys(day, today) > 0,
      registro: await leerRegistro(tenantId, day),
    };
  }

  const since = cerradoHasta ? nextDayKey(cerradoHasta) : null;

  // Período: desde el día siguiente al último cierre (o desde el origen) hasta el final
  // del día que se está cerrando.
  const start = since ? businessWallTimeToUtc(since, "00:00") : new Date(0);
  const end = endOfDayUtc(day);

  const [rows, previousTotals] = await Promise.all([
    prisma.cashMovement.findMany({
      where: { tenantId, occurredAt: { gte: start, lt: end } },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      select: {
        id: true, occurredAt: true, type: true, method: true,
        amount: true, reason: true, orderId: true, collectionId: true,
        // El ORIGEN del cobro, no sólo su id: es lo que separa un cobro de fiado de un
        // cobro de turno en el resumen del cierre (ver CierreMovement).
        collection: { select: { originType: true } },
      },
    }),
    // El saldo de apertura se DERIVA agregando lo anterior al período: un groupBy que no
    // crece con el histórico. Igual que el libro — no se copia a mano de un cierre al otro.
    prisma.cashMovement.groupBy({
      by: ["type", "method"],
      where: { tenantId, occurredAt: { lt: start } },
      _sum: { amount: true },
    }),
  ]);

  const previous: LibroMovement[] = previousTotals.map((g, i) => ({
    id: `prev-${i}`,
    occurredAt: start,
    type: g.type as CashMovementType,
    method: g.method as CashMethod,
    amount: g._sum.amount ?? 0,
    detail: "",
  }));

  const movements: CierreMovement[] = rows.map((r) => ({
    id: r.id,
    occurredAt: r.occurredAt,
    type: r.type as CashMovementType,
    method: r.method as CashMethod,
    amount: r.amount,
    detail: r.reason ?? "",
    collectionId: r.collectionId ?? null,
    collectionOrigin: r.collection?.originType ?? null,
  }));

  return {
    day,
    today,
    lastClosedDay: cerradoHasta,
    since,
    preview: buildCierreDiario({ day, since, previous, movements, declared: NADA_DECLARADO }),
    movements: rows.map((r) => ({
      id: r.id,
      day: dateStrInBusinessTz(r.occurredAt),
      type: r.type as CashMovementType,
      method: r.method as CashMethod,
      amount: r.amount,
      detail: r.reason ?? "",
      origin: libroOrigin({ type: r.type as CashMovementType, orderId: r.orderId }),
    })),
    yaCerrado: false,
    enElFuturo: compareDayKeys(day, today) > 0,
    registro: null,
  };
}

/**
 * El comprobante del cierre de ESE día exacto. `null` si el día quedó absorbido por un
 * cierre posterior (no tuvo cierre propio) — la pantalla lo dice con esas palabras.
 */
async function leerRegistro(tenantId: string, day: DayKey): Promise<CierreRegistrado | null> {
  const fila = await prisma.auditLog.findFirst({
    where: { tenantId, entity: CIERRE_DIARIO_ENTITY, entityId: day },
    orderBy: { createdAt: "desc" },
    select: { actor: true, createdAt: true, changes: true },
  });
  if (!fila) return null;
  const resumen = resumenCierre(fila.changes);
  if (!resumen) return null;

  // El actor viaja como "user:<id>"; se resuelve al nombre para que el comprobante diga
  // quién cerró y no un identificador.
  let quien = fila.actor;
  const id = fila.actor.startsWith("user:") ? fila.actor.slice("user:".length) : null;
  if (id) {
    const u = await prisma.user.findFirst({ where: { tenantId, id }, select: { name: true } });
    if (u?.name) quien = u.name;
  }
  return { day, cerradoEl: fila.createdAt, quien, resumen };
}

export type CierreActionState = { ok: true; message: string } | { ok: false; errors: string[] } | null;

function parseDeclared(formData: FormData): DeclaredAmounts {
  const out = { ...NADA_DECLARADO };
  for (const k of CASH_METHODS) {
    const raw = String(formData.get(`declarado_${k}`) ?? "").trim().replace(",", ".");
    if (raw === "") continue; // vacío = no se concilia ese medio
    const n = Number(raw);
    // Un valor tipeado pero ilegible NO se trata como "no declarado": se manda NaN, que
    // `buildCierreDiario` deja en null y la validación reporta como faltante. Callar un
    // error de tipeo sería exactamente lo que hace la planilla.
    out[k] = Number.isFinite(n) ? n : NaN;
  }
  return out;
}

/**
 * Cierra un día: valida contra la base, escribe los ajustes de diferencia y deja el día
 * congelado. Una sola escritura, una sola transacción Serializable.
 *
 * La transacción vuelve a leer TODO y a validar: nunca confía en lo que calculó el
 * navegador. Si dos submits corren juntos (doble clic, botón trabado), el segundo
 * encuentra el día ya cerrado y lo rechaza con un mensaje claro — el peor caso es un
 * aviso, no un ajuste duplicado.
 */
export async function cerrarDia(formData: FormData): Promise<CierreActionState> {
  await requireCapability("orders:manage");
  if (isDemoSandbox()) return { ok: false, errors: [DEMO_WRITE_BLOCKED.error] };

  const dayRaw = String(formData.get("day") ?? "").trim();
  if (!isDayKey(dayRaw)) return { ok: false, errors: ["La fecha del cierre no es válida."] };
  const day: DayKey = dayRaw;
  const note = String(formData.get("note") ?? "").trim() || null;
  const declared = parseDeclared(formData);
  const today = todayInBusinessTz();

  const tenantId = await getCurrentTenantId();
  const user = await getCurrentUser();
  const actor = user ? `user:${user.id}` : "admin";

  try {
    const resultado = await tenantTransaction(
      async (tx) => {
        const cerradoHasta = await leerFrontera(tx, tenantId);
        const since = cerradoHasta ? nextDayKey(cerradoHasta) : null;
        const start = since ? businessWallTimeToUtc(since, "00:00") : new Date(0);
        const end = endOfDayUtc(day);

        const [rows, previousTotals] = await Promise.all([
          tx.cashMovement.findMany({
            where: { tenantId, occurredAt: { gte: start, lt: end } },
            orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
            select: {
              id: true, occurredAt: true, type: true, method: true, amount: true, reason: true,
              collectionId: true, collection: { select: { originType: true } },
            },
          }),
          tx.cashMovement.groupBy({
            by: ["type", "method"],
            where: { tenantId, occurredAt: { lt: start } },
            _sum: { amount: true },
          }),
        ]);

        const cierre = buildCierreDiario({
          day,
          since,
          previous: previousTotals.map((g, i) => ({
            id: `prev-${i}`,
            occurredAt: start,
            type: g.type as CashMovementType,
            method: g.method as CashMethod,
            amount: g._sum.amount ?? 0,
            detail: "",
          })),
          movements: rows.map((r) => ({
            id: r.id,
            occurredAt: r.occurredAt,
            type: r.type as CashMovementType,
            method: r.method as CashMethod,
            amount: r.amount,
            detail: r.reason ?? "",
            collectionId: r.collectionId ?? null,
            collectionOrigin: r.collection?.originType ?? null,
          })),
          declared,
        });

        const v = validateCierre(cierre, { note, today, lastClosedDay: cerradoHasta });
        if (!v.ok) return { ok: false as const, errors: v.errors };

        const filas = ajustesAsMovements(cierre, ajusteInstant(day));
        if (filas.length > 0) {
          const created = await tx.cashMovement.createMany({
            data: filas.map((f) => ({
              tenantId,
              sessionId: null,
              type: f.type,
              method: f.method,
              amount: f.amount,
              reason: f.detail,
              occurredAt: f.occurredAt,
              createdBy: cierreMarker(day),
            })),
          });
          if (created.count !== filas.length) {
            throw new Error(`se esperaban ${filas.length} ajustes y se escribieron ${created.count}`);
          }
        }

        // La fila de auditoría ES la frontera de congelamiento (ver frontera-cierre.ts),
        // así que va en la MISMA transacción que los ajustes: o quedan las dos cosas o
        // no queda ninguna.
        await tx.auditLog.create({
          data: {
            tenantId,
            actor,
            action: CIERRE_DIARIO_ACTION,
            entity: CIERRE_DIARIO_ENTITY,
            entityId: day,
            channel: "admin",
            changes: {
              day,
              since,
              estado: cierre.estado,
              note,
              porMedio: Object.fromEntries(
                CASH_METHODS.map((k) => [
                  k,
                  {
                    esperado: cierre.porMedio[k].expected,
                    declarado: cierre.porMedio[k].declared,
                    diferencia: cierre.porMedio[k].diff,
                  },
                ]),
              ),
              movimientos: cierre.movementCount,
              ajustes: filas.length,
            },
          },
        });

        return { ok: true as const, estado: cierre.estado, ajustes: filas.length };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (!resultado.ok) return resultado;

    revalidatePath(CIERRE_PATH);
    revalidatePath(LIBRO_PATH);

    const cola =
      resultado.ajustes === 0
        ? "No hubo diferencias."
        : `Se asentó ${resultado.ajustes === 1 ? "la diferencia" : `${resultado.ajustes} diferencias`} en el libro.`;
    return { ok: true, message: `Día ${formatDayLabel(day)} cerrado. ${cola}` };
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : "No se pudo cerrar el día.";
    return { ok: false, errors: [msg] };
  }
}

// La frontera leída DENTRO de la transacción (misma lógica que `lastClosedDay`, pero
// sobre `tx`, para que el chequeo del doble cierre vea el estado de esta transacción).
type TxLike = {
  cashMovement: { findFirst: (a: unknown) => Promise<{ createdBy: string } | null> };
  auditLog: { findFirst: (a: unknown) => Promise<{ entityId: string | null } | null> };
};
async function leerFrontera(tx: unknown, tenantId: string): Promise<DayKey | null> {
  const c = tx as TxLike;
  const [corte, cierre] = await Promise.all([
    c.cashMovement.findFirst({
      where: { tenantId, createdBy: { startsWith: "corte-inicial:" } },
      orderBy: { occurredAt: "desc" },
      select: { createdBy: true },
    }),
    c.auditLog.findFirst({
      where: { tenantId, entity: CIERRE_DIARIO_ENTITY },
      orderBy: { entityId: "desc" },
      select: { entityId: true },
    }),
  ]);
  const delCorte = corte?.createdBy.slice("corte-inicial:".length) ?? null;
  const delCierre = cierre?.entityId ?? null;
  const a = isDayKey(delCorte) ? delCorte : null;
  const b = isDayKey(delCierre) ? delCierre : null;
  if (a && b) return compareDayKeys(a, b) >= 0 ? a : b;
  return a ?? b;
}
