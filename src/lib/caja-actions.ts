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
// GUARDA DE DÍA CERRADO — el QA de recorrido la encontró faltando acá y el agujero era
// real: con el 07/09 ya cerrado y congelado desde el libro, esta pantalla dejaba registrar
// un egreso CON FECHA 07/09 sin decir nada, y el saldo del día siguiente pasaba de los
// $2.400 contados a −$5.300. O sea: el sistema decía "este día está congelado" en una
// pantalla y lo movía desde otra. La frontera es una sola y ahora la miran las dos.
import { lastClosedDay } from "@/lib/caja/frontera-cierre";
import { ajusteDeArqueoTurno } from "@/lib/caja/cierre-marca";
import { isFrozenDay, frozenDayMessage } from "@/lib/caja/cierre-diario";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { tenantTransaction } from "@/lib/rls";
import { Prisma } from "@/generated/prisma/client";
import {
  reconcileCash,
  type CashMethod,
  type CashMovementLike,
  type CashMovementType,
} from "@/lib/caja/cash-register";
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

  const congelado = await rechazarSiElDiaEstaCerrado(tenantId);
  if (congelado) return congelado;

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

// El alta manual de movimientos se fue de acá: la escribe `addLibroEntry`
// (src/lib/libro-caja-actions.ts), que es el único camino manual del negocio. Esta acción
// no tenía selector de medio —toda fila caía en `@default(EFECTIVO)`— y además exigía un
// turno de cajero abierto, que en un negocio de servicios no existe nunca: desde la Caja no
// se podía registrar un gasto en absoluto. `addLibroEntry` engancha el asiento al turno
// abierto cuando lo hay, así que el mostrador con cajón no pierde nada.

/**
 * Frena cualquier escritura de caja sobre un día ya cerrado. Se llama ANTES de abrir la
 * transacción (el día es "hoy", no depende de nada que la tx pueda cambiar) y devuelve el
 * mismo mensaje que el libro, para que la persona lea siempre lo mismo.
 */
async function rechazarSiElDiaEstaCerrado(tenantId: string): Promise<CajaActionState | null> {
  const cerradoHasta = await lastClosedDay(tenantId);
  if (!cerradoHasta) return null;
  const hoy = dateStrInBusinessTz(new Date());
  if (!isFrozenDay(hoy, cerradoHasta)) return null;
  return { ok: false, error: frozenDayMessage(hoy, cerradoHasta) };
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

  // También al CERRAR. La primera pasada de esta guarda cubrió los dos caminos que
  // escriben un `CashMovement` (abrir y registrar), y el cierre del turno no escribe
  // ninguno — pero congela `closingDiff` en la sesión, o sea deja un SEGUNDO faltante
  // declarado sobre un día que el libro ya dio por contado, y que ningún libro lee.
  // Es el defecto de la planilla —el faltante anotado al margen— con otra ropa.
  const diaCerrado = await rechazarSiElDiaEstaCerrado(tenantId);
  if (diaCerrado) return diaCerrado;

  let result: { id: string } & ReturnType<typeof reconcileCash>;
  try {
    result = await tenantTransaction(async (tx) => {
      const session = await tx.cashSession.findFirst({
        where: { tenantId, status: "OPEN" },
        // `method` es OBLIGATORIO acá: `summarizeMovements` cuenta SÓLO los movimientos
        // EFECTIVO (el arqueo cuenta el cajón). Si no se selecciona, llega `undefined`,
        // que la aritmética interpreta como EFECTIVO por compatibilidad hacia atrás — y
        // entonces un ingreso por MP enganchado a este turno infla el efectivo esperado
        // y produce un faltante fantasma al cerrar.
        include: { movements: { select: { type: true, amount: true, method: true } } },
      });
      if (!session) {
        throw new Error("No hay una caja abierta para cerrar.");
      }
      const movements: CashMovementLike[] = session.movements.map((m) => ({
        type: m.type as CashMovementType,
        amount: m.amount,
        method: m.method as CashMethod,
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

      // La diferencia del arqueo SE ASIENTA EN EL LIBRO, en la misma transacción.
      //
      // Antes vivía sólo en `closingDiff`, y el libro deriva su saldo SUMANDO movimientos:
      // un faltante contado en el cajón no llegaba a ningún lado. El 07/09 quedó un turno
      // con la diferencia varada en la sesión mientras el libro seguía diciendo otra cosa.
      //
      // Signo: el conteo físico manda. Contado > esperado ⇒ entró plata que el sistema no
      // tenía (INGRESO); contado < esperado ⇒ falta (EGRESO). Siempre EFECTIVO: el arqueo
      // de turno cuenta el cajón y nada más.
      //
      // `sessionId` va apuntando al turno que la produjo, pero eso NO la mete en el arqueo
      // de ese turno: la sesión ya quedó CLOSED en esta misma transacción y su esperado
      // quedó congelado arriba. Es trazabilidad, no aritmética.
      const ajuste = ajusteDeArqueoTurno(arqueo.diff, session.id);
      if (ajuste) {
        await tx.cashMovement.create({ data: { tenantId, sessionId: session.id, ...ajuste } });
      }

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
