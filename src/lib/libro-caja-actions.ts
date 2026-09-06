"use server";

// LIBRO DE CAJA mensual — la pantalla que reemplaza la planilla de Google Sheets con
// la que CH Estética lleva la caja hoy.
//
// Es otra LECTURA del mismo ledger (`CashMovement`) que ya usa el arqueo de turno,
// no una segunda contabilidad: el arqueo mira un turno y solo el efectivo (contar el
// cajón); el libro mira un mes y los tres medios (la caja del negocio). Por eso una
// venta cobrada por el POS aparece en el libro sin que nadie la vuelva a tipear.
//
// La ARITMÉTICA no vive acá: vive pura y testeable en src/lib/caja/libro-caja.ts
// (probada contra el agosto 2026 real de la planilla). Estas acciones solo orquestan
// la persistencia y delegan el cálculo.
//
// Guardas: `orders:read` para leer y `orders:manage` para escribir — las mismas que
// la caja del mostrador, porque es el mismo trabajo (ver el encabezado de
// caja-actions.ts sobre por qué no se agrega una capability nueva).

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auditAdmin } from "@/lib/audit";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { tenantTransaction } from "@/lib/rls";
import { businessWallTimeToUtc, todayInBusinessTz } from "@/lib/datetime";
import { isDemoSandbox, DEMO_WRITE_BLOCKED, getDemoLibroMovements } from "@/lib/demo-sandbox";
import {
  buildLibro,
  openingFromHistory,
  parseMonth,
  formatMonthKey,
  type Libro,
  type LibroMovement,
} from "@/lib/caja/libro-caja";
import type { CashMethod, CashMovementType } from "@/lib/caja/cash-register";

const LIBRO_PATH = "/admin/caja/libro";

export type LibroActionState = { ok: true } | { ok: false; error: string } | null;

function toActionError(err: unknown): { ok: false; error: string } {
  const msg = err instanceof Error && err.message ? err.message : "No se pudo completar la operación.";
  return { ok: false, error: msg };
}

// Lo que el libro deja cargar a mano. VENTA y APERTURA quedan afuera a propósito: las
// crea el POS y el arqueo respectivamente, y dejar tipearlas abriría la puerta a
// duplicar una venta que el sistema ya registró.
const LIBRO_TYPES = ["INGRESO", "EGRESO"] as const;
const LIBRO_METHODS = ["EFECTIVO", "MP", "TARJETA"] as const;

function parseAmount(raw: FormDataEntryValue | null): number {
  return Number(String(raw ?? "").trim().replace(",", "."));
}

// Límites del mes en HORA DE PARED del negocio, convertidos a UTC. Si el corte se
// hiciera en UTC, los movimientos de las últimas 3 horas de cada mes caerían en el mes
// siguiente (Argentina es UTC−3) y el saldo de arrastre no cerraría.
function monthRangeUtc(year: number, month: number): { start: Date; end: Date } {
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  return {
    start: businessWallTimeToUtc(formatMonthKey(year, month) + "-01", "00:00"),
    end: businessWallTimeToUtc(formatMonthKey(next.y, next.m) + "-01", "00:00"),
  };
}

// Mes por defecto: el mes corriente EN LA ZONA DEL NEGOCIO.
export async function currentMonthKey(): Promise<string> {
  return todayInBusinessTz().slice(0, 7);
}

export type LibroCajaData = Libro & {
  monthKey: string;
  year: number;
  month: number;
};

// --- Loader de la pantalla del libro ---
//
// El saldo inicial NO se guarda ni se copia a mano de un mes al otro (que es como se
// arrastran los errores en la planilla): se DERIVA agregando en la base todo lo
// anterior al mes. Un `groupBy` por (tipo, medio) alcanza y no crece con el histórico
// — no hace falta traer las filas viejas para saber con cuánto arranca el mes.
export async function getLibroCajaData(monthRaw?: string | null): Promise<LibroCajaData> {
  await requireCapability("orders:read");
  const parsed = parseMonth(monthRaw) ?? parseMonth(todayInBusinessTz().slice(0, 7))!;
  const { year, month } = parsed;
  const monthKey = formatMonthKey(year, month);
  const { start, end } = monthRangeUtc(year, month);

  // Demo: un mes plausible en vez de una pantalla vacía. Solo las filas del mes
  // pedido — si el visitante navega a otro mes, ve el vacío honesto, no datos
  // inventados en todos lados.
  if (isDemoSandbox()) {
    const demo = getDemoLibroMovements().filter(
      (m) => m.occurredAt >= start && m.occurredAt < end,
    );
    return { ...buildLibro(openingFromHistory([]), demo), monthKey, year, month };
  }

  const tenantId = await getCurrentTenantId();
  const [rows, previousTotals] = await Promise.all([
    prisma.cashMovement.findMany({
      where: { tenantId, occurredAt: { gte: start, lt: end } },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      select: { id: true, occurredAt: true, type: true, method: true, amount: true, reason: true },
    }),
    prisma.cashMovement.groupBy({
      by: ["type", "method"],
      where: { tenantId, occurredAt: { lt: start } },
      _sum: { amount: true },
    }),
  ]);

  // Cada grupo (tipo, medio) se trata como UN movimiento por el total: `openingFromHistory`
  // ya sabe qué signo le toca a cada tipo, así que el arrastre sale sin duplicar la
  // tabla de signos acá.
  const opening = openingFromHistory(
    previousTotals.map((g, i) => ({
      id: `prev-${i}`,
      occurredAt: start,
      type: g.type as CashMovementType,
      method: g.method as CashMethod,
      amount: g._sum.amount ?? 0,
      detail: "",
    })),
  );

  const movements: LibroMovement[] = rows.map((r) => ({
    id: r.id,
    occurredAt: r.occurredAt,
    type: r.type as CashMovementType,
    method: r.method as CashMethod,
    amount: r.amount,
    detail: r.reason ?? "",
  }));

  return { ...buildLibro(opening, movements), monthKey, year, month };
}

// --- Cargar un asiento del libro ---
//
// Una fila de la planilla: fecha contable + detalle + ingreso/egreso + medio + monto.
//
// Sobre `sessionId`: si hay un turno de mostrador ABIERTO, el asiento se engancha a ese
// turno para que el arqueo del cierre lo vea (si es efectivo, es plata que entró o salió
// del cajón de verdad). Si no hay turno abierto —el caso normal de este negocio, que no
// usa turnos— queda suelto (`sessionId` NULL) y el libro lo toma igual. El arqueo filtra
// por medio, así que enganchar un movimiento por MP no infla el efectivo esperado.
export async function addLibroEntry(
  _prev: LibroActionState,
  formData: FormData,
): Promise<LibroActionState> {
  const user = await requireCapability("orders:manage");
  if (isDemoSandbox()) return DEMO_WRITE_BLOCKED;
  const tenantId = await getCurrentTenantId();

  const typeRaw = String(formData.get("type") || "").trim();
  const type = (LIBRO_TYPES as readonly string[]).includes(typeRaw)
    ? (typeRaw as (typeof LIBRO_TYPES)[number])
    : null;
  if (!type) return { ok: false, error: "Elegí si es un ingreso o un egreso." };

  const methodRaw = String(formData.get("method") || "").trim();
  const method = (LIBRO_METHODS as readonly string[]).includes(methodRaw)
    ? (methodRaw as CashMethod)
    : null;
  if (!method) return { ok: false, error: "Elegí el medio: efectivo, MP/transferencia o tarjeta." };

  const amount = parseAmount(formData.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "El monto tiene que ser mayor a 0." };
  }

  const detail = String(formData.get("detail") || "").trim();
  if (!detail) {
    return { ok: false, error: "Poné un detalle (de quién entró o en qué se gastó)." };
  }

  // Fecha contable. Se ancla al MEDIODÍA de la zona del negocio: así ningún corrimiento
  // de zona horaria puede mover la fila al día anterior o al siguiente.
  const dateStr = String(formData.get("date") || "").trim() || todayInBusinessTz();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { ok: false, error: "La fecha tiene que tener el formato AAAA-MM-DD." };
  }
  const occurredAt = businessWallTimeToUtc(dateStr, "12:00");
  if (Number.isNaN(occurredAt.getTime())) {
    return { ok: false, error: "La fecha no es válida." };
  }

  const actor = `user:${user.id}`;
  try {
    await tenantTransaction(async (tx) => {
      const openSession = await tx.cashSession.findFirst({
        where: { tenantId, status: "OPEN" },
        select: { id: true },
      });
      await tx.cashMovement.create({
        data: {
          tenantId,
          sessionId: openSession?.id ?? null,
          type,
          method,
          amount,
          reason: detail,
          occurredAt,
          createdBy: actor,
        },
      });
    }, { tenantId });
  } catch (err) {
    return toActionError(err);
  }

  await auditAdmin({
    action: "libro.add",
    entity: "CashMovement",
    changes: { type, method, amount, detail, occurredAt: dateStr },
  });
  revalidatePath(LIBRO_PATH);
  return { ok: true };
}

// --- Borrar un asiento del libro ---
//
// Existe porque sin esto la pantalla sería PEOR que la planilla: en Sheets un error de
// tipeo se corrige borrando la fila, y una caja que no se puede corregir no la usa
// nadie. Queda auditado con el monto y el detalle de lo borrado, así el borrado es
// reversible a mano y rastreable a quién lo hizo.
//
// Solo borra asientos manuales del libro (INGRESO/EGRESO). Una VENTA la creó el POS y
// una APERTURA el arqueo: borrarlas desde acá descuadraría el turno que las originó.
export async function deleteLibroEntry(
  _prev: LibroActionState,
  formData: FormData,
): Promise<LibroActionState> {
  await requireCapability("orders:manage");
  if (isDemoSandbox()) return DEMO_WRITE_BLOCKED;
  const tenantId = await getCurrentTenantId();
  const id = String(formData.get("id") || "").trim();
  if (!id) return { ok: false, error: "Falta identificar el movimiento a borrar." };

  let borrado: { type: string; method: string; amount: number; reason: string | null };
  try {
    borrado = await tenantTransaction(async (tx) => {
      const found = await tx.cashMovement.findFirst({
        where: { tenantId, id },
        select: { id: true, type: true, method: true, amount: true, reason: true, orderId: true },
      });
      if (!found) throw new Error("Ese movimiento ya no existe.");
      if (found.type !== "INGRESO" && found.type !== "EGRESO") {
        throw new Error("Ese movimiento lo generó la caja del mostrador. Corregilo desde el turno, no desde el libro.");
      }
      if (found.orderId) {
        throw new Error("Ese movimiento viene de un pedido cobrado. Corregí el pedido, no el libro.");
      }
      await tx.cashMovement.delete({ where: { id: found.id } });
      return { type: found.type, method: found.method, amount: found.amount, reason: found.reason };
    }, { tenantId });
  } catch (err) {
    return toActionError(err);
  }

  await auditAdmin({
    action: "libro.delete",
    entity: "CashMovement",
    entityId: id,
    changes: borrado,
  });
  revalidatePath(LIBRO_PATH);
  return { ok: true };
}
