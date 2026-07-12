"use server";

// Capability CAJA del POS — turno de mostrador + arqueo (cierra el agujero del
// vertical retail). Server Actions scoped por tenant, mismo patrón que
// order-actions.ts: requireCapability al tope, getCurrentTenantId (fail-closed
// ADR-015) en cada write, audit + revalidatePath al terminar.
//
// La ARITMÉTICA del arqueo NO vive acá: vive pura y testeable en
// src/lib/caja/cash-register.ts. Estas acciones solo orquestan la persistencia y
// delegan el cálculo del esperado/diferencia en `reconcileCash`.
//
// Reusa la capability `orders:manage` (mostrador): abrir/cerrar caja y registrar
// movimientos es trabajo de mostrador del mismo tenor que tomar y cobrar pedidos.
// No se agrega una capability nueva para no inflar el modelo RBAC (gobierno
// calidad-vs-costo); si más adelante hace falta separar "arqueo" de "vender", se
// agrega un renglón en capabilities.ts sin tocar estos guardas.

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auditAdmin } from "@/lib/audit";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { tenantTransaction } from "@/lib/rls";
import { Prisma } from "@/generated/prisma/client";
import { reconcileCash, type CashMovementLike, type CashMovementType } from "@/lib/caja/cash-register";
import { isDemoSandbox, getDemoCajaData, DEMO_WRITE_BLOCKED } from "@/lib/demo-sandbox";

const CAJA_PATH = "/admin/caja";

// Resultado de las acciones de formulario de caja, para `useActionState` en la UI.
// `null` = estado inicial (ocioso). En vez de lanzar (que rompe el flujo con la
// pantalla de error de Next), las acciones DEVUELVEN el error de validación/dominio
// para mostrarlo inline junto al formulario. Los mensajes ya son texto amable en
// español (van directo a la UI del mostrador).
export type CajaActionState = { ok: true } | { ok: false; error: string } | null;

// Traduce un error (de validación propia o de dominio lanzado dentro de la
// transacción) al estado de error de la UI. Un error inesperado no filtra detalles
// internos: cae a un mensaje genérico.
function toActionError(err: unknown): { ok: false; error: string } {
  const msg = err instanceof Error && err.message ? err.message : "No se pudo completar la operación.";
  return { ok: false, error: msg };
}

// Tipos de movimiento que el mostrador puede registrar a mano (la APERTURA la crea
// `openCashSession`; VENTA la crearía el flujo de venta en efectivo, futuro).
const MANUAL_MOVEMENT_TYPES = ["INGRESO", "EGRESO", "RETIRO"] as const;
type ManualMovementType = (typeof MANUAL_MOVEMENT_TYPES)[number];

function parseAmount(raw: FormDataEntryValue | null): number {
  // Acepta coma o punto decimal (entrada AR): "1.234,50" no aplica acá porque el
  // input es number; normalizamos coma → punto por las dudas.
  return Number(String(raw ?? "").trim().replace(",", "."));
}

// --- Loader de la pantalla de caja ---
//
// Devuelve la sesión ABIERTA del tenant (si hay) con sus movimientos, más las
// últimas sesiones cerradas para el histórico. Guard de lectura por `orders:read`.
export async function getCajaData() {
  await requireCapability("orders:read");
  if (isDemoSandbox()) return getDemoCajaData();
  const tenantId = await getCurrentTenantId();
  const [open, recentClosed] = await Promise.all([
    prisma.cashSession.findFirst({
      where: { tenantId, status: "OPEN" },
      orderBy: { openedAt: "desc" },
      include: { movements: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.cashSession.findMany({
      where: { tenantId, status: "CLOSED" },
      orderBy: { closedAt: "desc" },
      take: 10,
    }),
  ]);
  return { open, recentClosed };
}

// --- Abrir turno de caja ---
//
// Crea la sesión OPEN con el fondo inicial declarado y materializa un movimiento
// APERTURA (para que el ledger del turno arranque completo). Falla si ya hay una
// sesión abierta: un solo mostrador por tenant (invariante de dominio, no de
// schema). Todo dentro de una transacción tenant-aware.
//
// M-1 · CONCURRENCIA: el check-then-insert (leer "no hay OPEN" → crear OPEN) en
// ReadCommitted deja pasar DOS aperturas simultáneas —ambas leen "no hay" antes de que
// cualquiera inserte→ y quedan dos turnos OPEN, con lo que el arqueo no cuadra. Se cierra
// con el MISMO patrón que el overbooking (ADR-004/023, `bookingTransaction`): nivel
// SERIALIZABLE + reintento. Postgres SSI detecta la dependencia lectura↔escritura de las
// dos aperturas y aborta una con serialization_failure (P2034); `tenantTransaction`
// reintenta, y en la 2ª pasada la apertura ya commiteada es visible → el check dispara el
// error de dominio "ya hay una caja abierta". Sin índice ni migración: efectivo ya.
export async function openCashSession(
  _prev: CajaActionState,
  formData: FormData,
): Promise<CajaActionState> {
  const user = await requireCapability("orders:manage");
  if (isDemoSandbox()) return DEMO_WRITE_BLOCKED;
  const tenantId = await getCurrentTenantId();
  const openingFloat = parseAmount(formData.get("openingFloat"));
  if (!Number.isFinite(openingFloat) || openingFloat < 0) {
    return { ok: false, error: "El fondo inicial tiene que ser un monto válido (0 o más)." };
  }
  const actor = `user:${user.id}`;

  let session: { id: string };
  try {
    session = await tenantTransaction(async (tx) => {
      const already = await tx.cashSession.findFirst({
        where: { tenantId, status: "OPEN" },
        select: { id: true },
      });
      if (already) {
        throw new Error("Ya hay una caja abierta. Cerrá el turno actual antes de abrir otro.");
      }
      return tx.cashSession.create({
        data: {
          tenantId,
          status: "OPEN",
          openedBy: actor,
          openingFloat,
          movements: {
            create: {
              tenantId,
              type: "APERTURA",
              amount: openingFloat,
              reason: "Fondo inicial de caja",
              createdBy: actor,
            },
          },
        },
        select: { id: true },
      });
    }, { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (err) {
    return toActionError(err);
  }

  await auditAdmin({
    action: "open",
    entity: "CashSession",
    entityId: session.id,
    changes: { openingFloat },
  });
  revalidatePath(CAJA_PATH);
  return { ok: true };
}

// --- Registrar un movimiento de caja (ingreso / egreso / retiro) ---
//
// Solo se puede sobre la sesión ABIERTA del tenant. El monto se guarda POSITIVO;
// el signo lo aplica el arqueo según el tipo. Motivo obligatorio (es plata que
// entra o sale sin una venta detrás: tiene que quedar justificada).
export async function addCashMovement(
  _prev: CajaActionState,
  formData: FormData,
): Promise<CajaActionState> {
  const user = await requireCapability("orders:manage");
  if (isDemoSandbox()) return DEMO_WRITE_BLOCKED;
  const tenantId = await getCurrentTenantId();

  const typeRaw = String(formData.get("type") || "").trim();
  const type = (MANUAL_MOVEMENT_TYPES as readonly string[]).includes(typeRaw)
    ? (typeRaw as ManualMovementType)
    : null;
  if (!type) {
    return { ok: false, error: "Tipo de movimiento inválido. Elegí ingreso, egreso o retiro." };
  }
  const amount = parseAmount(formData.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "El monto del movimiento tiene que ser mayor a 0." };
  }
  const reason = String(formData.get("reason") || "").trim();
  if (!reason) {
    return { ok: false, error: "Poné un motivo para el movimiento (queda registrado en el arqueo)." };
  }
  const actor = `user:${user.id}`;

  try {
    await tenantTransaction(async (tx) => {
      const session = await tx.cashSession.findFirst({
        where: { tenantId, status: "OPEN" },
        select: { id: true },
      });
      if (!session) {
        throw new Error("No hay una caja abierta. Abrí un turno antes de registrar movimientos.");
      }
      await tx.cashMovement.create({
        data: { tenantId, sessionId: session.id, type, amount, reason, createdBy: actor },
      });
    }, { tenantId });
  } catch (err) {
    return toActionError(err);
  }

  await auditAdmin({
    action: "movement",
    entity: "CashSession",
    changes: { type, amount, reason },
  });
  revalidatePath(CAJA_PATH);
  return { ok: true };
}

// --- Cerrar turno de caja (arqueo) ---
//
// Toma el efectivo CONTADO declarado, calcula el esperado con la aritmética pura
// (reconcileCash sobre el fondo inicial + los movimientos del turno) y CONGELA el
// arqueo en la sesión (closingExpected/closingCounted/closingDiff). El histórico
// queda inmutable: no recalcula después aunque se toque algo.
export async function closeCashSession(
  _prev: CajaActionState,
  formData: FormData,
): Promise<CajaActionState> {
  const user = await requireCapability("orders:manage");
  if (isDemoSandbox()) return DEMO_WRITE_BLOCKED;
  const tenantId = await getCurrentTenantId();
  const counted = parseAmount(formData.get("counted"));
  if (!Number.isFinite(counted) || counted < 0) {
    return { ok: false, error: "El efectivo contado tiene que ser un monto válido (0 o más)." };
  }
  const note = String(formData.get("note") || "").trim() || null;
  const actor = `user:${user.id}`;

  let result: { id: string } & ReturnType<typeof reconcileCash>;
  try {
    result = await tenantTransaction(async (tx) => {
      const session = await tx.cashSession.findFirst({
        where: { tenantId, status: "OPEN" },
        include: { movements: { select: { type: true, amount: true } } },
      });
      if (!session) {
        throw new Error("No hay una caja abierta para cerrar.");
      }
      const movements: CashMovementLike[] = session.movements.map((m) => ({
        type: m.type as CashMovementType,
        amount: m.amount,
      }));
      const arqueo = reconcileCash(session.openingFloat, movements, counted);

      await tx.cashSession.update({
        where: { id: session.id },
        data: {
          status: "CLOSED",
          closedBy: actor,
          closingExpected: arqueo.expected,
          closingCounted: arqueo.counted,
          closingDiff: arqueo.diff,
          closingNote: note,
          closedAt: new Date(),
        },
      });
      return { id: session.id, ...arqueo };
    }, { tenantId });
  } catch (err) {
    return toActionError(err);
  }

  await auditAdmin({
    action: "close",
    entity: "CashSession",
    entityId: result.id,
    changes: { expected: result.expected, counted: result.counted, diff: result.diff },
  });
  revalidatePath(CAJA_PATH);
  return { ok: true };
}
