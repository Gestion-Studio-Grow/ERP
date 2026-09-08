import Link from "next/link";
import { redirect } from "next/navigation";
import { getCajaData } from "@/lib/caja-actions";
import { getCurrentTenantRubro } from "@/lib/carniceria/rubro";
import { isDemoSandbox } from "@/lib/demo-flag";
import { fmtShortDate } from "@/lib/datetime";
import {
  expectedCash,
  summarizeMovements,
  type CashMethod,
  type CashMovementLike,
  type CashMovementType,
} from "@/lib/caja/cash-register";
import { Card, CardHeader, CardTitle, CardDescription, Badge, fmtMoneyARS, type BadgeProps } from "@/components/ui";
import { CASH_METHOD_LABEL } from "@/lib/caja/libro-caja";
import { OpenCajaForm, AddMovementForm, CloseCajaForm } from "./CajaForms";

export const dynamic = "force-dynamic";

// El arqueo del CAJÓN es de mostrador con relevos: sólo registra efectivo, y en un negocio
// de servicios eso es una fracción chica de la plata. Para esos tenants el arqueo que
// corresponde es el CIERRE DEL DÍA, que cuenta los tres medios. El ítem ya está oculto del
// menú (`retailOnly`), pero la URL tecleada o un marcador viejo tienen que aterrizar en
// algo útil, no en una pantalla que no les sirve.
//
// El corto en demo NO es opcional: en el sandbox no existe una fila `Tenant` para el
// tenant de demo, así que `getCurrentTenantRubro()` devuelve isRetail=false para TODOS los
// rubros — y `/probar` manda acá a todo rubro que no sea agenda (carnicería, gastronomía).
// Sin este corto, la demo pública de esos rubros aterrizaría en el cierre. Lo encontró la
// validación adversarial de la decisión, no el diseño.
async function redirigirSiNoTieneCajon() {
  if (isDemoSandbox()) return;
  const rubro = await getCurrentTenantRubro();
  if (!rubro.isRetail) redirect("/admin/caja/cierre");
}


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
  await redirigirSiNoTieneCajon();
  // getCajaData aplica requireCapability("orders:read") — guard de la página.
  const { open, recentClosed } = await getCajaData();

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-semibold mb-1 text-strong">Caja</h1>
      <p className="text-muted mb-4 max-w-2xl">
        Abrí el turno con el fondo inicial, registrá ingresos, egresos y retiros durante el día, y
        cerrá haciendo el arqueo: el sistema calcula cuánto efectivo debería haber y lo compara con
        lo que contás en el cajón. Las ventas en efectivo se registran solas.
      </p>
      {/* El arqueo es del CAJÓN (efectivo de un turno). La caja del negocio mes a mes,
          con MP y tarjeta, vive en el libro — dos lecturas del mismo ledger. */}
      <p className="text-muted mb-8 max-w-2xl text-sm">
        ¿Buscás lo que entró y salió en el mes, con MP y tarjeta?{" "}
        <Link href="/admin/caja/libro" className="underline underline-offset-4 hover:text-strong">
          Andá al libro de caja
        </Link>
        .
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
    movements: {
      id: string;
      type: string;
      amount: number;
      method?: string | null;
      reason: string | null;
      createdAt: Date;
    }[];
  };
}) {
  // `method` va SIEMPRE: el esperado en vivo cuenta sólo el efectivo del cajón, igual
  // que el cierre. Sin él, un ingreso por MP del turno inflaría el número que el
  // mostrador mira para contar la plata.
  const movs: CashMovementLike[] = session.movements.map((m) => ({
    type: m.type as CashMovementType,
    amount: m.amount,
    method: (m.method ?? "EFECTIVO") as CashMethod,
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
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 border-t border-line pt-4 text-sm sm:max-w-[28rem]">
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
                // Un movimiento por MP/tarjeta enganchado al turno NO está en el cajón: se
                // lista (es plata del turno, y el libro lo ve) pero sin signo ni color, y con
                // su medio a la vista, para que nadie lo busque en el efectivo esperado.
                const method = (m.method ?? "EFECTIVO") as CashMethod;
                const enCajon = method === "EFECTIVO";
                const sign = enCajon ? movementSignLabel(m.type) : "";
                return (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Badge tone={tone}>{MOVEMENT_LABEL[m.type] ?? m.type}</Badge>
                      {!enCajon && <Badge tone="neutral">{CASH_METHOD_LABEL[method]}</Badge>}
                      {m.reason && <span className="truncate text-muted">{m.reason}</span>}
                      <span className="shrink-0 text-xs text-faint">{fmtShortDate(m.createdAt)}</span>
                    </span>
                    <span
                      className={`shrink-0 tabular-nums ${
                        sign === "+" ? "text-success" : sign === "−" ? "text-danger" : enCajon ? "text-body" : "text-muted"
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
            {/* El texto anterior decía "las ventas en efectivo entran solas" y quedó
                mintiendo por dos lados: hoy entran solos TODOS los cobros de turnos y las
                ventas del mostrador, por cualquier medio (efectivo, MP o transferencia),
                no sólo las de efectivo. Ver src/lib/caja/cobro-turno.ts y cash-sale.ts.
                El riesgo de que mienta es concreto: la recepcionista vuelve a cargar a
                mano lo que el sistema ya asentó y la caja queda con doble conteo. */}
            <CardDescription>
              Gastos, retiros o ingresos sueltos en efectivo. Lo que cobrás desde Turnos o
              desde el mostrador ya entra solo —en efectivo, Mercado Pago o transferencia—:
              no lo vuelvas a cargar acá.
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
