import {
  getCajaData,
  openCashSession,
  addCashMovement,
  closeCashSession,
} from "@/lib/caja-actions";
import { fmtShortDate } from "@/lib/datetime";
import { expectedCash, type CashMovementLike, type CashMovementType } from "@/lib/caja/cash-register";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

const MOVEMENT_LABEL: Record<string, string> = {
  APERTURA: "Apertura",
  VENTA: "Venta",
  INGRESO: "Ingreso",
  EGRESO: "Egreso",
  RETIRO: "Retiro",
};

// Color del signo según el tipo, para que el ledger se lea de un vistazo.
const MOVEMENT_TONE: Record<string, string> = {
  APERTURA: "text-muted",
  VENTA: "text-success",
  INGRESO: "text-success",
  EGRESO: "text-danger",
  RETIRO: "text-danger",
};

export default async function CajaPage() {
  // getCajaData aplica requireCapability("orders:read") — guard de la página.
  const { open, recentClosed } = await getCajaData();

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-semibold mb-1">Caja</h1>
      <p className="text-muted mb-8">
        Abrí el turno con el fondo inicial, registrá ingresos, egresos y retiros durante el día, y
        cerrá haciendo el arqueo: el sistema calcula cuánto efectivo debería haber y lo compara con
        lo que contás en el cajón.
      </p>

      {open ? <OpenSession session={open} /> : <ClosedState />}

      {recentClosed.length > 0 && (
        <>
          <h2 className="text-lg font-medium mt-10 mb-3">Turnos cerrados recientes</h2>
          <div className="space-y-2">
            {recentClosed.map((s) => {
              const diff = s.closingDiff ?? 0;
              const diffTone = diff === 0 ? "text-muted" : diff < 0 ? "text-danger" : "text-success";
              const diffLabel = diff === 0 ? "Cuadra" : diff < 0 ? "Faltante" : "Sobrante";
              return (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line px-4 py-2 text-sm"
                >
                  <span className="text-xs text-faint">
                    {s.closedAt ? fmtShortDate(s.closedAt) : "—"}
                  </span>
                  <span className="text-body">
                    Esperado {money.format(s.closingExpected ?? 0)} · Contado{" "}
                    {money.format(s.closingCounted ?? 0)}
                  </span>
                  <span className={`ml-auto tabular-nums font-medium ${diffTone}`}>
                    {diffLabel} {diff !== 0 && money.format(Math.abs(diff))}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}

// --- Estado: no hay caja abierta → formulario de apertura ---
function ClosedState() {
  return (
    <div className="rounded-lg border border-line p-5">
      <h2 className="text-lg font-medium mb-1">No hay una caja abierta</h2>
      <p className="text-sm text-muted mb-4">
        Abrí el turno declarando el efectivo con el que arranca el cajón.
      </p>
      <form action={openCashSession} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Fondo inicial</span>
          <input
            type="number"
            name="openingFloat"
            min="0"
            step="0.01"
            defaultValue="0"
            required
            className="rounded-md border border-line-strong bg-surface-raised px-3 py-1.5 text-sm w-40 tabular-nums"
          />
        </label>
        <button type="submit" className="chip-btn text-sm min-h-9">
          Abrir caja
        </button>
      </form>
    </div>
  );
}

// --- Estado: caja abierta → resumen en vivo + movimientos + cierre ---
function OpenSession({
  session,
}: {
  session: {
    id: string;
    openingFloat: number;
    openedAt: Date;
    openedBy: string;
    movements: { id: string; type: string; amount: number; reason: string | null; createdAt: Date }[];
  };
}) {
  const movs: CashMovementLike[] = session.movements.map((m) => ({
    type: m.type as CashMovementType,
    amount: m.amount,
  }));
  // Esperado EN VIVO (mismo cálculo que usa el cierre): fondo + ingresos − egresos.
  const expected = expectedCash(session.openingFloat, movs);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-line p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <span className="rounded-full bg-success-soft text-success px-2 py-0.5 text-[11px] font-medium">
              Caja abierta
            </span>
            <p className="text-xs text-faint mt-1">
              Abierta {fmtShortDate(session.openedAt)} · fondo inicial{" "}
              {money.format(session.openingFloat)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted">Efectivo esperado ahora</p>
            <p className="text-2xl font-semibold tabular-nums">{money.format(expected)}</p>
          </div>
        </div>

        {/* Ledger del turno */}
        <ul className="mt-4 divide-y divide-line text-sm">
          {session.movements.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0">
                <span className={`font-medium ${MOVEMENT_TONE[m.type] ?? "text-body"}`}>
                  {MOVEMENT_LABEL[m.type] ?? m.type}
                </span>
                {m.reason && <span className="text-muted"> · {m.reason}</span>}
                <span className="text-xs text-faint"> · {fmtShortDate(m.createdAt)}</span>
              </span>
              <span className={`tabular-nums ${MOVEMENT_TONE[m.type] ?? "text-body"}`}>
                {money.format(m.amount)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Registrar movimiento */}
      <div className="rounded-lg border border-line p-5">
        <h2 className="text-lg font-medium mb-3">Registrar movimiento</h2>
        <form action={addCashMovement} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Tipo</span>
            <select
              name="type"
              defaultValue="INGRESO"
              className="rounded-md border border-line-strong bg-surface-raised px-3 py-1.5 text-sm"
            >
              <option value="INGRESO">Ingreso</option>
              <option value="EGRESO">Egreso</option>
              <option value="RETIRO">Retiro</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Monto</span>
            <input
              type="number"
              name="amount"
              min="0.01"
              step="0.01"
              required
              className="rounded-md border border-line-strong bg-surface-raised px-3 py-1.5 text-sm w-36 tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm grow min-w-[12rem]">
            <span className="text-muted">Motivo</span>
            <input
              type="text"
              name="reason"
              required
              placeholder="Pago a proveedor, cambio, retiro a caja fuerte…"
              className="rounded-md border border-line-strong bg-surface-raised px-3 py-1.5 text-sm w-full"
            />
          </label>
          <button type="submit" className="chip-btn text-sm min-h-9">
            Registrar
          </button>
        </form>
      </div>

      {/* Cierre / arqueo */}
      <div className="rounded-lg border border-line p-5">
        <h2 className="text-lg font-medium mb-1">Cerrar turno (arqueo)</h2>
        <p className="text-sm text-muted mb-4">
          Contá el efectivo del cajón y cargalo. El sistema lo compara con el esperado (
          {money.format(expected)}) y registra la diferencia.
        </p>
        <form action={closeCashSession} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Efectivo contado</span>
            <input
              type="number"
              name="counted"
              min="0"
              step="0.01"
              required
              className="rounded-md border border-line-strong bg-surface-raised px-3 py-1.5 text-sm w-40 tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm grow min-w-[12rem]">
            <span className="text-muted">Nota (opcional)</span>
            <input
              type="text"
              name="note"
              placeholder="Observaciones del cierre…"
              className="rounded-md border border-line-strong bg-surface-raised px-3 py-1.5 text-sm w-full"
            />
          </label>
          <button type="submit" className="chip-btn chip-btn-danger text-sm min-h-9">
            Cerrar caja
          </button>
        </form>
      </div>
    </div>
  );
}
