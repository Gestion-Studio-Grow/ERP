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
import { auditAdmin } from "@/lib/audit-core";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { tenantTransaction } from "@/lib/rls";
import { isColumnMissing } from "@/lib/prisma-errors";
import { businessWallTimeToUtc, todayInBusinessTz, dateStrInBusinessTz } from "@/lib/datetime";
import { isDemoSandbox, DEMO_WRITE_BLOCKED, getDemoLibroMovements } from "@/lib/demo-sandbox";
import {
  buildLibro,
  openingFromHistory,
  parseMonth,
  formatMonthKey,
  dateBelongsToMonth,
  formatMonthLabel,
  motivoParaNoBorrar,
  movimientoDelLedger,
  leerSinColumnasFaltantes,
  flagPossibleDuplicates,
  CASH_METHOD_LABEL,
  type Libro,
  type LibroMovement,
} from "@/lib/caja/libro-caja";
import { fmtMoneyARS } from "@/components/ui/format";
import type { CashMethod, CashMovementType } from "@/lib/caja/cash-register";
import { isFrozenDay, frozenDayMessage, nextDayKey } from "@/lib/caja/cierre-diario";
// La frontera de congelamiento (hasta qué día está cerrado) vive aparte porque la
// comparten el libro y el cierre diario. Cubre las dos formas de cerrar: el corte
// inicial y cada cierre de día.
import { lastClosedDay } from "@/lib/caja/frontera-cierre";
// Marca de los egresos que asienta el alta de una compra a proveedor. El libro la
// necesita por dos motivos opuestos: para NO dejar borrar esas filas desde acá
// (dirección única) y para AVISAR cuando alguien está por tipear a mano un egreso que
// el sistema ya asentó solo.
import { COMPRA_ACTOR_PREFIX, esEgresoDeCompra } from "@/lib/stock/purchase-egreso";
import { COMISION_ACTOR_PREFIX, esEgresoDeComision } from "@/lib/comision-liquidacion";
import { leerImporte } from "@/lib/pos-peso";

const LIBRO_PATH = "/admin/caja/libro";
// El mismo formulario de alta se monta en la Caja (es el único camino de escritura manual),
// así que las dos pantallas se invalidan juntas: cargar un gasto desde la Caja tiene que
// mover el saldo por medio que esa misma pantalla está mostrando.
const CAJA_PATH = "/admin/caja";

// Error de dominio para el aviso de duplicado. Va como clase (y no como string
// suelto) para poder distinguirlo de cualquier otro fallo de la transacción.
class DuplicadoError extends Error {
  constructor(readonly delSistema: { detail: string; origen: "venta" | "compra" | "comision" } | null = null) {
    super();
  }
}

// Estado de las acciones del libro para la UI.
//
// La variante `confirmable` es lo que separa este libro de la planilla: en Sheets
// una fila con el año mal tipeado, o cargada dos veces, entra sin que nadie se
// entere. Acá la acción FRENA y pide confirmación explícita, y sólo guarda si el
// usuario insiste. Ver `CONFIRM_*` abajo.
export type LibroActionState =
  | { ok: true; message?: string }
  | { ok: false; error: string; confirmable?: "fuera-de-mes" | "duplicado" }
  | null;

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
  // Plata escrita como se escribe acá: "12.500" son doce mil quinientos y "12,5" doce con
  // cincuenta. Antes era `Number(raw.replace(",", "."))`, que leía "12.500" como 12,5 y
  // "1.234,56" como NaN. Lo ilegible y lo vacío vuelven NaN: el llamador lo rechaza con
  // mensaje en vez de asentar un número que nadie tipeó.
  const l = leerImporte(String(raw ?? ""));
  return l.estado === "ok" ? l.valor : NaN;
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
  // Filas MANUALES que tienen una gemela del sistema el mismo día (mismo medio y monto):
  // candidatas a doble conteo durante la transición desde la planilla. Ver
  // `flagPossibleDuplicates`. Vacío en demo.
  posiblesDuplicados: string[];
  /**
   * Hasta qué día está cerrada la caja, o null si nunca se cerró. La pantalla lo usa para
   * proponer una fecha que SÍ se pueda usar: el QA encontró que después de cerrar el día,
   * el formulario seguía proponiendo esa fecha y cada intento de carga fallaba hasta
   * cambiarla a mano.
   */
  cerradoHasta: string | null;
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
    return { ...buildLibro(openingFromHistory([]), demo), monthKey, year, month, posiblesDuplicados: [], cerradoHasta: null };
  }

  const tenantId = await getCurrentTenantId();
  const [rows, previousTotals] = await Promise.all([
    filasDelMes(tenantId, start, end),
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

  // `createdBy` entra al select sólo para clasificar el origen contable de cada fila;
  // `movimientoDelLedger` no lo deja pasar a la fila (ver su comentario).
  const movements: LibroMovement[] = rows.map((r) =>
    movimientoDelLedger({ ...r, type: r.type as CashMovementType, method: r.method as CashMethod }),
  );

  const libro = buildLibro(opening, movements);
  return {
    ...libro,
    monthKey,
    year,
    month,
    posiblesDuplicados: [...flagPossibleDuplicates(libro.rows, dateStrInBusinessTz)],
    cerradoHasta: await lastClosedDay(tenantId),
  };
}

type FilaLibroDb = {
  id: string;
  occurredAt: Date;
  type: string;
  method: string;
  amount: number;
  reason: string | null;
  orderId: string | null;
  createdBy: string;
  collectionId: string | null;
  paymentId: string | null;
};

// Las filas del mes. `collectionId` y `paymentId` son la referencia de un cobro de turno y
// de su anulación, y cada una la agrega una migración que puede faltar en la base (ver
// `leerSinColumnasFaltantes` en caja/libro-caja.ts, donde vive la regla y su test): si
// falta, se lee sin ella y esas filas salen sin referencia, en vez de caerse el libro.
// Sin `export`: recibe un tenantId y este archivo es "use server".
async function filasDelMes(tenantId: string, start: Date, end: Date): Promise<FilaLibroDb[]> {
  const where = { tenantId, occurredAt: { gte: start, lt: end } };
  const orderBy = [{ occurredAt: "asc" as const }, { id: "asc" as const }];
  const { filas } = await leerSinColumnasFaltantes(
    async (columnas) => {
      const filas = await prisma.cashMovement.findMany({
        where,
        orderBy,
        select: {
          id: true,
          occurredAt: true,
          type: true,
          method: true,
          amount: true,
          reason: true,
          orderId: true,
          createdBy: true,
          collectionId: columnas.includes("collectionId"),
          paymentId: columnas.includes("paymentId"),
        },
      });
      // Una columna que no se pidió no viene (undefined): queda en null, fila sin esa referencia.
      return filas.map((f) => ({ ...f, collectionId: f.collectionId ?? null, paymentId: f.paymentId ?? null }));
    },
    (err, columna) => isColumnMissing(err, columna),
  );
  return filas;
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

  // ── Congelamiento por corte inicial ────────────────────────────────────────
  //
  // Lo contado en el corte ES la verdad: todo lo anterior a esa fecha ya está dentro
  // del conteo físico. Cargar un movimiento viejo suelto lo contaría DOS veces y
  // movería el saldo operativo. No es opinable ni confirmable: se rechaza.
  const cerradoHasta = await lastClosedDay(tenantId);
  if (cerradoHasta && isFrozenDay(dateStr, cerradoHasta)) {
    return { ok: false, error: frozenDayMessage(dateStr, cerradoHasta) };
  }

  // ── Guardas anti-error, derivadas de la auditoría de la planilla real ──────
  //
  // La planilla de CH Estética llegó con 25 filas fechadas un año antes (mayo 2025
  // en vez de 2026) y con filas repetidas. Las dos cosas pasan sin ruido en Sheets.
  // Acá las dos frenan y piden confirmación; el usuario puede insistir, pero no
  // puede hacerlo sin darse cuenta.
  const confirmado = String(formData.get("confirm") || "") === "1";

  // (a) FUERA DEL MES QUE SE ESTÁ MIRANDO. Cubre dos errores de una: el año mal
  // tipeado, y cargar una fila con la fecha de hoy mientras se mira otro mes (la
  // fila se guardaría bien pero desaparecería de la pantalla, que es peor que un
  // error: parece que no se guardó y se vuelve a cargar → doble cobro).
  const mesEnPantalla = String(formData.get("viewMonth") || "").trim();
  if (!confirmado && !dateBelongsToMonth(dateStr, mesEnPantalla)) {
    const vista = parseMonth(mesEnPantalla);
    const rotulo = vista ? formatMonthLabel(vista.year, vista.month) : mesEnPantalla;
    return {
      ok: false,
      confirmable: "fuera-de-mes",
      error:
        `Esa fecha (${dateStr}) no es de ${rotulo}, que es el mes que estás viendo. ` +
        `Si la guardás así, la fila no va a aparecer en esta pantalla. Revisá la fecha o confirmá para guardarla igual.`,
    };
  }

  const actor = `user:${user.id}`;
  // Límites del DÍA del negocio en UTC, para comparar contra filas que llevan la hora real
  // del cobro (las del sistema) y no el mediodía al que se ancla el alta manual.
  const diaDesde = businessWallTimeToUtc(dateStr, "00:00");
  const diaHasta = businessWallTimeToUtc(nextDayKey(dateStr), "00:00");
  try {
    await tenantTransaction(async (tx) => {
      // (b) POSIBLE DUPLICADO, dos variantes en una consulta:
      //
      //   · Manual repetida: mismo día, mismo detalle, mismo medio y mismo monto. Puede ser
      //     legítimo (dos señas iguales el mismo día), por eso avisa en vez de prohibir. Es
      //     la red que atrapa el doble guardado venga de donde venga — incluido un doble
      //     click o un reintento del usuario.
      //
      //   · YA LO REGISTRÓ EL SISTEMA: un ingreso manual del mismo día, medio y monto que
      //     una VENTA (turno cobrado desde Turnos o venta del mostrador). Es LA defensa de
      //     la transición desde la planilla: la dueña venía tipeando cada cobro a mano, y
      //     ahora esos cobros entran solos. Sin esta guarda cada uno quedaría dos veces. El
      //     detalle no se compara (ella escribe "Sofía facial", el sistema "Turno · …"):
      //     alcanza con día + medio + monto. Se avisa, con el detalle de la fila del
      //     sistema, y se puede insistir (una seña igual al precio del servicio es legítima).
      //
      //   · YA LO ASENTÓ UNA COMPRA: un egreso manual del mismo día, medio y monto que el
      //     que dejó el alta de una compra a proveedor (marca `compra:` en `createdBy`).
      //     Desde que registrar una compra asienta su egreso solo, la costumbre de
      //     tipearlo también en el libro produce el gasto DOS veces y una caja que cierra
      //     de menos. Se avisa con el detalle de la fila del sistema y se puede insistir
      //     (dos pagos iguales al mismo proveedor el mismo día son posibles).
      if (!confirmado) {
        // OJO CON `method`: NO va al tope del `where`. Estuvo ahí, arriba del OR, y por eso
        // el aviso de las ramas del SISTEMA exigía que el medio coincidiera — justo lo que no
        // se puede dar por cierto cuando el medio del asiento pudo haberse ASUMIDO. Para un
        // egreso de compra o de comisión alcanza día + monto: dos pagos al mismo proveedor,
        // el mismo día y por el mismo importe son mucho más raros que un medio mal asumido.
        // Para las ramas tipeadas a mano el medio sí es parte de la comparación.
        const yaHay = await tx.cashMovement.findFirst({
          where: {
            tenantId,
            amount,
            occurredAt: { gte: diaDesde, lt: diaHasta },
            OR: [
              { type, reason: detail, occurredAt, method },
              ...(type === "INGRESO" ? [{ type: "VENTA" as const, method }] : []),
              ...(type === "EGRESO"
                ? [
                    { type: "EGRESO" as const, createdBy: { startsWith: COMPRA_ACTOR_PREFIX } },
                    { type: "EGRESO" as const, createdBy: { startsWith: COMISION_ACTOR_PREFIX } },
                  ]
                : []),
            ],
          },
          // Primero la del sistema si hay una: es el aviso más importante. El enum se ordena
          // por declaración (APERTURA, VENTA, INGRESO, …), así que `asc` pone VENTA antes.
          // Para EGRESO el orden no alcanza (las dos ramas son del mismo tipo): ahí distingue
          // la marca de `createdBy`.
          orderBy: { type: "asc" },
          select: { id: true, type: true, reason: true, createdBy: true },
        });
        if (yaHay) {
          if (yaHay.type === "VENTA") throw new DuplicadoError({ detail: yaHay.reason ?? "", origen: "venta" });
          if (esEgresoDeCompra(yaHay)) throw new DuplicadoError({ detail: yaHay.reason ?? "", origen: "compra" });
          if (esEgresoDeComision(yaHay)) throw new DuplicadoError({ detail: yaHay.reason ?? "", origen: "comision" });
          throw new DuplicadoError(null);
        }
      }
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
    if (err instanceof DuplicadoError) {
      if (err.delSistema?.origen === "comision") {
        return {
          ok: false,
          confirmable: "duplicado",
          error:
            `El sistema ya asentó ese egreso cuando liquidaste la comisión: “${err.delSistema.detail}”, ` +
            `${fmtMoneyARS(amount)} (${CASH_METHOD_LABEL[method]}). Las liquidaciones descuentan solas de la ` +
            `caja: no hace falta cargarlas también acá. Si es otro pago distinto, confirmá para guardarlo igual.`,
        };
      }
      if (err.delSistema?.origen === "compra") {
        return {
          ok: false,
          confirmable: "duplicado",
          error:
            `El sistema ya asentó ese gasto cuando registraste la compra: “${err.delSistema.detail}”, ` +
            `${fmtMoneyARS(amount)} (${CASH_METHOD_LABEL[method]}). Las compras a proveedor descuentan solas ` +
            `de la caja: no hace falta cargarlas también acá. Si es otro pago distinto, confirmá para guardarlo igual.`,
        };
      }
      if (err.delSistema) {
        return {
          ok: false,
          confirmable: "duplicado",
          error:
            `El sistema ya registró un cobro igual ese día: “${err.delSistema.detail}”, ` +
            `${fmtMoneyARS(amount)} (${CASH_METHOD_LABEL[method]}). Los turnos cobrados desde Turnos y las ventas ` +
            `del mostrador entran solos al libro: no hace falta tipearlos. Si es otro cobro distinto, confirmá para guardarlo igual.`,
        };
      }
      return {
        ok: false,
        confirmable: "duplicado",
        error:
          `Ya hay un movimiento igual ese mismo día: “${detail}”, ${type === "INGRESO" ? "ingreso" : "egreso"} ` +
          `de ${fmtMoneyARS(amount)} (${CASH_METHOD_LABEL[method]}). Si es otro cobro distinto, confirmá para guardarlo igual.`,
      };
    }
    return toActionError(err);
  }

  await auditAdmin({
    action: "libro.add",
    entity: "CashMovement",
    changes: { type, method, amount, detail, occurredAt: dateStr },
  });
  revalidatePath(LIBRO_PATH);
  revalidatePath(CAJA_PATH);
  // Confirmación EXPLÍCITA: la única señal de éxito no puede ser "fijate si
  // apareció la fila". Si el usuario no ve una confirmación, vuelve a cargar.
  return {
    ok: true,
    message: `Guardado: ${detail} — ${type === "INGRESO" ? "ingreso" : "egreso"} de ${fmtMoneyARS(amount)} (${CASH_METHOD_LABEL[method]})`,
  };
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

  const cerradoHasta = await lastClosedDay(tenantId);

  let borrado: { type: string; method: string; amount: number; reason: string | null };
  try {
    borrado = await tenantTransaction(async (tx) => {
      const found = await tx.cashMovement.findFirst({
        where: { tenantId, id },
        select: { id: true, type: true, method: true, amount: true, reason: true, orderId: true, createdBy: true, occurredAt: true },
      });
      if (!found) throw new Error("Ese movimiento ya no existe.");
      // Lo que escribió el SISTEMA no se borra desde el libro (dirección única): venta, turno
      // cobrado, caja del mostrador, corte inicial, diferencias de cierre y de arqueo, anulación
      // de un cobro, comisión, compra, reintegro de una devolución a proveedor y cobro o pago
      // de cuenta corriente. La regla, con cada porqué, es `motivoParaNoBorrar` (libro-caja.ts).
      const bloqueo = motivoParaNoBorrar({ type: found.type as CashMovementType, orderId: found.orderId, createdBy: found.createdBy });
      if (bloqueo) throw new Error(bloqueo);
      // Mismo candado que el alta: un día ya cerrado no se toca. Borrar hacia atrás
      // desbalancearía el saldo operativo contra lo que se contó.
      const dia = dateStrInBusinessTz(found.occurredAt);
      if (cerradoHasta && isFrozenDay(dia, cerradoHasta)) {
        throw new Error(frozenDayMessage(dia, cerradoHasta));
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
  revalidatePath(CAJA_PATH);
  return { ok: true, message: `Borrado: ${borrado.reason ?? "movimiento"}.` };
}
