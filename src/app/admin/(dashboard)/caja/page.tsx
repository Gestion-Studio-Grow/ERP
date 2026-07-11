import { getCajaData } from "@/lib/caja-actions";
import { fmtShortDate } from "@/lib/datetime";
import {
  expectedCash,
  summarizeMovements,
  type CashMovementLike,
  type CashMovementType,
} from "@/lib/caja/cash-register";
import { Card, CardHeader, CardTitle, CardDescription, Badge, fmtMoneyARS, type BadgeProps } from "@/components/ui";
import { OpenCajaForm, AddMovementForm, CloseCajaForm } from "./CajaForms";

export const dynamic = "force-dynamic";


const MOVEMENT_LABEL: Record<string, string> = {
  APERTURA: "Apertura",
  VENTA: "Venta",
  INGRESO: "Ingreso",
  EGRESO: "Egreso",
  RETIRO: "Retiro",
};

// Tono del badge + signo del importe según cómo mueve el efectivo esperado:
// entra (+, success), sale (−, danger), o neutro (apertura).
const MOVEMENT_TONE: Record<string, BadgeProps["tone"]> = {
  APERTURA: "neutral",
  VENTA: "success",
  INGRESO: "success",
  EGRESO: "danger",
  RETIRO: "danger",
};

// Signo visible del importe en el ledger: la apertura no mueve el esperado.
function movementSignLabel(type: string): "+" | "−" | "" {
  if (type === "VENTA" || type === "INGRESO") return "+";
  if (type === "EGRESO" || type === "RETIRO") return "−";
  return "";
}

export default async function CajaPage() {
  // getCajaData aplica requireCapability("orders:read") — guard de la página.
  const { open, recentClosed } = await getCajaData();

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-semibold mb-1 text-strong">Caja</h1>
      <p className="text-muted mb-8 max-w-2xl">
        Abrí el turno con el fondo inicial, registrá ingresos, egresos y retiros durante el día, y
        cerrá haciendo el arqueo: el sistema calcula cuánto efectivo debería haber y lo compara con
        lo que contás en el cajón. Las ventas en efectivo se registran solas.
      </p>

      {open ? <OpenSession session={open} /> : <ClosedState />}

      {recentClosed.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-medium mb-3 text-strong">Turnos cerrados recientes</h2>
          <div className="space-y-2">
            {recentClosed.map((s) => {
              const diff = s.closingDiff ?? 0;
              const tone: BadgeProps["tone"] = diff === 0 ? "neutral" : diff < 0 ? "danger" : "success";
              const label = diff === 0 ? "Cuadra" : diff < 0 ? "Faltante" : "Sobrante";
              return (
                <Card key={s.id} flush className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                  <span className="text-xs text-faint">
                    {s.closedAt ? fmtShortDate(s.closedAt) : "—"}
                  </span>
                  <span className="text-body">
                    Esperado {fmtMoneyARS(s.closingExpected ?? 0)} · Contado{" "}
                    {fmtMoneyARS(s.closingCounted ?? 0)}
                  </span>
                  <Badge tone={tone} className="ml-auto tabular-nums">
                    {label}
                    {diff !== 0 && ` ${fmtMoneyARS(Math.abs(diff))}`}
                  </Badge>
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}

// --- Estado vacío: no hay caja abierta → apertura ---
function ClosedState() {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>No hay una caja abierta</CardTitle>
          <CardDescription>
            Abrí el turno declarando el efectivo con el que arranca el cajón.
          </CardDescription>
        </div>
        <Badge tone="neutral" dot>
          Caja cerrada
        </Badge>
      </CardHeader>
      <OpenCajaForm />
    </Card>
  );
}

// --- Caja abierta → resumen en vivo + ledger + registrar movimiento + cierre ---
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
  // Esperado EN VIVO (mismo cálculo que usa el cierre) + desglose por categoría.
  const expected = expectedCash(session.openingFloat, movs);
  const breakdown = summarizeMovements(movs);
  const expectedLabel = fmtMoneyARS(expected);

  // Filas del desglose: se muestran solo las categorías con monto (el fondo y el
  // esperado van siempre).
  const rows = [
    { label: "Ventas en efectivo", value: breakdown.sales, sign: "+" as const },
    { label: "Otros ingresos", value: breakdown.cashIn, sign: "+" as const },
    { label: "Egresos", value: breakdown.cashOut, sign: "−" as const },
    { label: "Retiros", value: breakdown.withdrawals, sign: "−" as const },
  ].filter((r) => r.value > 0);

  return (
    <div className="space-y-6">
      {/* Resumen en vivo */}
      <Card>
        <CardHeader>
          <div>
            <Badge tone="success" dot>
              Caja abierta
            </Badge>
            <p className="text-xs text-faint mt-2">
              Abierta {fmtShortDate(session.openedAt)} · fondo inicial{" "}
              {fmtMoneyARS(session.openingFloat)}
            </p>
          </div>
          {/* aria-live: al registrar un movimiento, la revalidación re-renderiza
              este bloque con el nuevo esperado y el lector de pantalla lo anuncia. */}
          <div className="text-right" aria-live="polite" aria-atomic="true">
            <p className="text-xs text-muted">Efectivo esperado ahora</p>
            <p className="text-2xl font-semibold tabular-nums text-strong">{expectedLabel}</p>
          </div>
        </CardHeader>

        {/* Desglose del esperado */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 border-t border-line pt-4 text-sm sm:max-w-md">
          <div className="flex justify-between">
            <dt className="text-muted">Fondo inicial</dt>
            <dd className="tabular-nums text-body">{fmtMoneyARS(session.openingFloat)}</dd>
          </div>
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between">
              <dt className="text-muted">{r.label}</dt>
              <dd className={`tabular-nums ${r.sign === "+" ? "text-success" : "text-danger"}`}>
                {r.sign} {fmtMoneyARS(r.value)}
              </dd>
            </div>
          ))}
        </dl>

        {/* Ledger del turno */}
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-faint mb-2">
            Movimientos del turno
          </p>
          {session.movements.length === 0 ? (
            <p className="text-sm text-muted py-2">Todavía no hay movimientos en este turno.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {session.movements.map((m) => {
                const tone = MOVEMENT_TONE[m.type] ?? "neutral";
                const sign = movementSignLabel(m.type);
                return (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Badge tone={tone}>{MOVEMENT_LABEL[m.type] ?? m.type}</Badge>
                      {m.reason && <span className="truncate text-muted">{m.reason}</span>}
                      <span className="shrink-0 text-xs text-faint">{fmtShortDate(m.createdAt)}</span>
                    </span>
                    <span
                      className={`shrink-0 tabular-nums ${
                        sign === "+" ? "text-success" : sign === "−" ? "text-danger" : "text-body"
                      }`}
                    >
                      {sign && `${sign} `}
                      {fmtMoneyARS(m.amount)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>

      {/* Registrar movimiento */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Registrar movimiento</CardTitle>
            <CardDescription>
              Ingreso, egreso o retiro de efectivo. Las ventas en efectivo entran solas.
            </CardDescription>
          </div>
        </CardHeader>
        <AddMovementForm />
      </Card>

      {/* Cierre / arqueo */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Cerrar turno (arqueo)</CardTitle>
            <CardDescription>
              Contá el efectivo del cajón y cargalo. El sistema lo compara con el esperado (
              {expectedLabel}) y registra la diferencia.
            </CardDescription>
          </div>
        </CardHeader>
        <CloseCajaForm expected={expected} />
      </Card>
    </div>
  );
}
