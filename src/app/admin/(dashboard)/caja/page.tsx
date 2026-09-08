import Link from "next/link";
import { getCajaData } from "@/lib/caja-actions";
import { getCierreDiarioData } from "@/lib/cierre-diario-actions";
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
import { CASH_METHODS, CASH_METHOD_LABEL } from "@/lib/caja/libro-caja";
import { frozenDayMessage } from "@/lib/caja/cierre-diario";
import { OpenCajaForm, CloseCajaForm } from "./CajaForms";
import { AddLibroEntryForm } from "./libro/LibroForms";

export const dynamic = "force-dynamic";

// QUÉ ES ESTA PANTALLA. La Caja es donde quien atiende pasa el día: cuánto hay ahora por
// cada medio, qué se movió hoy, y los gastos o retiros sueltos. Es CORE — la tiene todo
// negocio que maneje plata.
//
// El TURNO DE CAJERO (fondo inicial, arqueo del cajón, relevo) es otra cosa: es de mostrador
// con cajón físico. Se muestra sólo donde existe. En un negocio de servicios ese arqueo lo
// hace el CIERRE DEL DÍA, que cuenta los tres medios en vez de sólo el efectivo.
//
// Antes esto se resolvía sacando la pantalla entera del menú para no-retail y redirigiendo
// al cierre. Era demasiado: lo que sobraba era el turno de cajero, no la Caja. Ahora la
// pantalla existe siempre y adentro se adapta.
//
// El corto en demo NO es opcional: en el sandbox no existe fila `Tenant` para el tenant de
// demo, así que `getCurrentTenantRubro()` devuelve isRetail=false para TODOS los rubros, y
// `/probar` manda acá a carnicería y gastronomía. Sin el corto, la demo de un mostrador se
// quedaría sin el turno de cajero, que es justo lo que va a mirar.
async function tieneCajonFisico(): Promise<boolean> {
  if (isDemoSandbox()) return true;
  return (await getCurrentTenantRubro()).isRetail;
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
  const conCajon = await tieneCajonFisico();
  // Mismo loader que el Cierre del día: la aritmética del resumen es LA MISMA
  // (`buildCierreDiario`), así que lo que se lee acá a las 16 es exactamente lo que va a
  // aparecer a las 20 al cerrar. Cero cálculo nuevo, cero segunda verdad.
  const dia = await getCierreDiarioData();
  // El turno de cajero sólo se consulta donde existe: sin cajón, es una query al pedo.
  const caja = conCajon ? await getCajaData() : null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-semibold mb-1 text-strong">Caja</h1>
      <p className="text-muted mb-6 max-w-2xl">
        Lo que hay ahora por cada medio de pago y todo lo que se movió hoy. Los cobros de
        turnos y las ventas del mostrador entran solos, por cualquier medio: acá se cargan
        únicamente los gastos, retiros e ingresos sueltos.
      </p>

      <ResumenDelDia dia={dia} />

      {!dia.yaCerrado && <MovimientoSuelto dia={dia.day} />}

      {caja && <TurnoDeCajero caja={caja} />}
    </main>
  );
}

// --- Lo que hay ahora, por medio ------------------------------------------------------
//
// El número que la pantalla vieja NO podía dar. `expectedCash` cuenta SÓLO el efectivo del
// cajón (cash-register.ts): en un negocio de servicios eso es una fracción de la plata. Acá
// se muestran los tres medios con el mismo `preview` que congela el cierre.
//
// El período NO es "hoy": es lo que falta arquear desde el último cierre (puede abarcar
// varios días si nadie cerró). Se dice con esas palabras en vez de rotularlo "hoy" y mentir.
function ResumenDelDia({ dia }: { dia: Awaited<ReturnType<typeof getCierreDiarioData>> }) {
  // UN DÍA CERRADO NO SE RENDERIZA COMO UN DÍA VACÍO. Cuando el día ya se cerró, el loader
  // devuelve el preview en cero y la lista de movimientos vacía a propósito: el período ya
  // está adentro del cierre. Pintar eso con las tres columnas daba "$0,00 / $0,00 / $0,00" y
  // "Todavía no se movió plata hoy" sobre un día en el que sí se movió — dos afirmaciones
  // falsas, encontradas en el recorrido. Va el comprobante en su lugar.
  if (dia.yaCerrado) return <DiaCerrado dia={dia} />;

  const { preview, movements, day, since, lastClosedDay } = dia;
  const deHoy = movements.filter((m) => m.day === day);
  const periodo = !since
    ? "Desde el origen: todavía no hubo ningún cierre"
    : since === day
      ? `Del día ${fmtDayKey(day)}`
      : `Desde el ${fmtDayKey(since)}${lastClosedDay ? ` · último cierre: ${fmtDayKey(lastClosedDay)}` : ""}`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Lo que hay ahora</CardTitle>
            <CardDescription>{periodo}</CardDescription>
          </div>
          <Badge tone="success" dot>
            Día abierto
          </Badge>
        </CardHeader>

        {/* aria-live: al registrar un movimiento la revalidación re-renderiza este bloque
            con los nuevos saldos y el lector de pantalla los anuncia. */}
        <div
          className="grid gap-3 border-t border-line pt-4 sm:grid-cols-3"
          aria-live="polite"
          aria-atomic="true"
        >
          {CASH_METHODS.map((m) => {
            const med = preview.porMedio[m];
            return (
              <div key={m} className="rounded-lg border border-line px-3 py-2.5">
                <p className="text-xs text-muted">{CASH_METHOD_LABEL[m]}</p>
                <p className="text-xl font-semibold tabular-nums text-strong">
                  {fmtMoneyARS(med.expected)}
                </p>
                <p className="mt-1 text-xs tabular-nums text-faint">
                  <span className="text-success">+ {fmtMoneyARS(med.ingresos)}</span>
                  {" · "}
                  <span className="text-danger">− {fmtMoneyARS(med.egresos)}</span>
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm">
          <span className="text-muted">
            Total{" "}
            <span className="font-medium tabular-nums text-strong">
              {fmtMoneyARS(preview.total.expected)}
            </span>
          </span>
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/admin/caja/libro" className="underline underline-offset-4 hover:text-strong">
              Ver el mes en el libro
            </Link>
            <Link
              href="/admin/caja/cierre"
              className="font-medium underline underline-offset-4 hover:text-strong"
            >
              Cerrar el día →
            </Link>
          </span>
        </div>
      </Card>

      {/* Movimientos de HOY. La recepcionista ve entrar cada cobro sin ir al libro: es lo
          que hace que no vuelva a cargarlo a mano y duplique la plata. */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Movimientos de hoy</CardTitle>
            <CardDescription>
              {deHoy.length === 0
                ? "Todavía no se movió plata hoy."
                : `${deHoy.length} ${deHoy.length === 1 ? "movimiento" : "movimientos"} · los cobros y las ventas entran solos.`}
            </CardDescription>
          </div>
        </CardHeader>
        {deHoy.length > 0 && (
          <ul className="divide-y divide-line border-t border-line text-sm">
            {deHoy.map((m) => {
              const tone = MOVEMENT_TONE[m.type] ?? "neutral";
              const sign = movementSignLabel(m.type);
              return (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <Badge tone={tone}>{MOVEMENT_LABEL[m.type] ?? m.type}</Badge>
                    <Badge tone="neutral">{CASH_METHOD_LABEL[m.method]}</Badge>
                    <span className="truncate text-muted">{m.detail || ORIGIN_LABEL[m.origin]}</span>
                  </span>
                  <span
                    className={`shrink-0 tabular-nums ${sign === "+" ? "text-success" : sign === "−" ? "text-danger" : "text-body"}`}
                  >
                    {sign && `${sign} `}
                    {fmtMoneyARS(m.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

// El día ya está cerrado y contado: lo que corresponde mostrar es el comprobante, no un
// tablero en cero. `registro` puede venir null cuando este día quedó ABSORBIDO por un cierre
// posterior (cerrar el 07 arquea también el 05 y el 06), y eso también se dice con palabras.
function DiaCerrado({ dia }: { dia: Awaited<ReturnType<typeof getCierreDiarioData>> }) {
  const { day, registro } = dia;
  const resumen = registro?.resumen ?? null;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>El día {fmtDayKey(day)} ya está cerrado</CardTitle>
          <CardDescription>
            {registro
              ? `Lo cerró ${registro.quien} · ${fmtShortDate(registro.cerradoEl)}`
              : "Quedó adentro de un cierre posterior, así que no tiene comprobante propio."}
          </CardDescription>
        </div>
        <Badge tone="neutral" dot>
          Día cerrado
        </Badge>
      </CardHeader>

      {resumen && (
        <div className="border-t border-line pt-4 text-sm">
          <p className="text-body">{resumen.titulo}</p>
          <ul className="mt-2 space-y-1 text-muted">
            {resumen.medios.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          {resumen.nota && <p className="mt-2 text-muted italic">{resumen.nota}</p>}
        </div>
      )}

      {/* El texto de "qué hago ahora" NO se escribe acá: es `frozenDayMessage`, el MISMO que
          devuelven las acciones cuando rechazan una escritura sobre un día cerrado. Que la
          pantalla y el error digan lo mismo es lo que evita que alguien pruebe tres veces. */}
      <p className="mt-4 border-t border-line pt-4 text-sm text-muted">
        {dia.lastClosedDay ? frozenDayMessage(day, dia.lastClosedDay) : null}
      </p>
      <p className="mt-2 text-sm">
        <Link href="/admin/caja/libro" className="text-muted underline underline-offset-4 hover:text-strong">
          Ver el mes en el libro
        </Link>{" "}
        <span className="text-faint">·</span>{" "}
        <Link href="/admin/caja/cierre" className="text-muted underline underline-offset-4 hover:text-strong">
          Ver el cierre
        </Link>
      </p>
    </Card>
  );
}

const ORIGIN_LABEL: Record<string, string> = {
  manual: "Movimiento cargado a mano",
  pos: "Venta del mostrador",
  turno: "Turno cobrado",
};

// dd/mm a partir de una clave de día AAAA-MM-DD, sin construir un Date (la clave YA está en
// la zona del negocio; pasarla por Date es como se corren los días de lugar).
function fmtDayKey(day: string): string {
  const [, mes, dia] = day.split("-");
  return `${dia}/${mes}`;
}

// --- Gasto, retiro o ingreso suelto ---------------------------------------------------
//
// Escribe por `addLibroEntry`, NO por `addCashMovement`. Un solo camino de escritura manual
// para toda la plata del negocio, y el único que ya trae medio de pago, fecha contable,
// guarda de día congelado y guarda de duplicado contra las ventas que el sistema ya asentó.
// `addCashMovement` además exige un turno de cajero abierto: en un negocio de servicios no
// hay ninguno, así que desde acá no se podía registrar un gasto en absoluto.
//
// No hay tipo RETIRO en el libro a propósito: un retiro es un EGRESO con su detalle
// ("retiro a caja fuerte"). Agregar un tercer tipo obligaba a tocar la aritmética del mes,
// el export y la guarda de borrado, a cambio de una palabra.
function MovimientoSuelto({ dia }: { dia: string }) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <div>
          <CardTitle>Registrar un movimiento</CardTitle>
          <CardDescription>
            Gastos, retiros o ingresos que no vienen de una venta. Lo que cobrás desde Turnos
            o desde el mostrador ya entra solo —en efectivo, Mercado Pago o transferencia—:
            no lo vuelvas a cargar acá.
          </CardDescription>
        </div>
      </CardHeader>
      <AddLibroEntryForm defaultDate={dia} viewMonth={dia.slice(0, 7)} />
    </Card>
  );
}

// --- Turno de cajero (sólo donde hay cajón físico) ------------------------------------
function TurnoDeCajero({ caja }: { caja: Awaited<ReturnType<typeof getCajaData>> }) {
  const { open, recentClosed } = caja;
  return (
    <section className="mt-10">
      <h2 className="text-lg font-medium text-strong">Turno de cajero</h2>
      <p className="mb-4 max-w-2xl text-sm text-muted">
        El arqueo del cajón físico: fondo inicial, relevo y conteo del efectivo. Cuenta sólo
        efectivo — el arqueo de los tres medios es el{" "}
        <Link href="/admin/caja/cierre" className="underline underline-offset-4 hover:text-strong">
          cierre del día
        </Link>
        .
      </p>

      {open ? <OpenSession session={open} /> : <ClosedState />}

      {recentClosed.length > 0 && (
        <div className="mt-8">
          <h3 className="text-base font-medium mb-3 text-strong">Turnos cerrados recientes</h3>
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
        </div>
      )}
    </section>
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
