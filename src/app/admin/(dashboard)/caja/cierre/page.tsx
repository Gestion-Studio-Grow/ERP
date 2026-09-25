// CIERRE DE CAJA DEL DÍA — contar la plata y dejar la diferencia asentada.
//
// Es la pieza que faltaba para que el libro reemplace de verdad a la planilla. El libro
// dice cuánto DEBERÍA haber; acá la persona escribe cuánto HAY, y el sistema asienta la
// diferencia como una fila más. La auditoría de la planilla de CH Estética encontró un
// faltante de $154.500 anotado al margen en marzo y nunca aplicado, con abril abriendo
// como si la plata estuviera. Después de cerrar acá, el día siguiente abre con lo que se
// contó.
//
// La pantalla es de LECTURA: todo el cálculo viene renderizado del servidor y cambiar de
// día es un link, no un submit. La única escritura es el botón de cerrar. Es a propósito:
// el bug del Server Action que colgaba el libro castiga las pantallas con muchas
// escrituras interactivas (ver el encabezado de LibroForms.tsx).

import Link from "next/link";
import { getCierreDiarioData } from "@/lib/cierre-diario-actions";
import {
  CASH_METHODS,
  CASH_METHOD_LABEL,
  totalOf,
} from "@/lib/caja/libro-caja";
import { formatDayLabel, nextDayKey, type DayKey } from "@/lib/caja/cierre-diario";
import { fmtDateTime, fmtTime } from "@/lib/datetime";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  PageHeader,
  EmptyState,
  fmtMoneyARS,
} from "@/components/ui";
import { CerrarDiaForm } from "./CierreForm";
import { requireApp } from "@/lib/require-app";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import CierreRenglon from "./CierreRenglon";

export const dynamic = "force-dynamic";

const CIERRE_PATH = "/admin/caja/cierre";

// Clases del modo TARJETA (móvil) de las dos tablas de esta pantalla: misma forma que
// las del libro de caja, para que las cuatro tablas de caja se lean igual en el teléfono.
// OJO con `sm:border-b-0`: NO va. Las filas traen su propio `border-b border-line/60 sm:border-b`
// y las dos utilidades tienen la MISMA especificidad, así que decide el orden del CSS generado:
// `border-b-0` se emite después y gana. Con esa clase acá, el escritorio quedaba sin separadores
// por más que cada fila pidiera el suyo.
const FILA_TARJETA =
  "block px-4 py-3 last:border-b-0 sm:table-row sm:px-0 sm:py-0";
// `flex` en móvil (rótulo a la izquierda, importe a la derecha) y `table-cell` desde sm:
// la variante del breakpoint gana porque sale después en el CSS.
const CELDA_TARJETA =
  "flex items-baseline justify-between gap-3 py-0.5 sm:table-cell sm:py-2";
const ROTULO_MOVIL = "text-xs uppercase tracking-wide text-faint sm:hidden";

// Los días de la navegación: en el celular, toques de 44 px (se cambia de día con el pulgar);
// desde sm, como siempre.
const NAV_DIA =
  "inline-flex min-h-11 items-center rounded-md border border-line px-3 py-1.5 text-sm text-body hover:bg-surface-raised sm:min-h-0";

function prevDayKey(day: DayKey): DayKey {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

export default async function CierreCajaPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>;
}) {
  // Guardia de la app (ADR-098): una app oculta no es una app protegida.
  await requireApp("cierre-del-dia");
  const { dia } = await searchParams;
  // «Diseño nuevo»: la lectura de interruptores del layout (cacheada), a la par de los datos.
  const [data, nuevo] = await Promise.all([getCierreDiarioData(dia, { conTurnosSinCerrar: true }), disenoNuevo()]);
  // DISEÑO NUEVO («Renglón»): contar primero y cerrar deslizando. Mismos datos, mismas acciones.
  if (nuevo) return <CierreRenglon d={data} />;
  const { preview, day, today, lastClosedDay, since, movements, yaCerrado, enElFuturo, registro, turnosSinCerrar } = data;

  const esperadoTotal = preview.total.expected;
  const puedeCerrar = !yaCerrado && !enElFuturo;

  return (
    // Antes era un `<div>` pelado: ni el shell (`AdminShell`) ni `PageHeader` aportan
    // padding, así que a 412px el título y los campos donde se escribe la plata contada
    // arrancaban en el píxel 0 y llegaban al 412. Mismo contenedor que `caja/page.tsx` y
    // `caja/libro/page.tsx`, que son las pantallas hermanas.
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Cierre de caja"
        description="Contá la plata al final del día y dejá la diferencia asentada. Después de cerrar, el día queda congelado y el siguiente arranca con lo que contaste."
      />

      {/* Navegación por día: links, no formularios. */}
      <nav className="mb-6 flex flex-wrap items-center gap-2" aria-label="Elegir el día">
        <Link href={`${CIERRE_PATH}?dia=${prevDayKey(day)}`} className={NAV_DIA}>
          ← {formatDayLabel(prevDayKey(day))}
        </Link>
        <span className="inline-flex min-h-11 items-center rounded-md bg-surface-raised px-3 py-1.5 text-sm font-medium text-strong sm:min-h-0">
          {formatDayLabel(day)}
        </span>
        <Link href={`${CIERRE_PATH}?dia=${nextDayKey(day)}`} className={NAV_DIA}>
          {formatDayLabel(nextDayKey(day))} →
        </Link>
        {day !== today && (
          <Link href={CIERRE_PATH} className={NAV_DIA}>
            Hoy
          </Link>
        )}
        <Link href="/admin/caja/libro" className="ml-auto inline-flex min-h-11 items-center text-sm text-accent hover:underline sm:min-h-0">
          Ver el libro del mes →
        </Link>
      </nav>

      {/* Un día cerrado muestra SU COMPROBANTE, no un panel vacío. El QA encontró que
          quedaba diciendo "0 movimientos · se puede cerrar igual" justo debajo del cartel
          de cerrado — la pantalla se contradecía a sí misma en el momento más importante
          del día, y no quedaba rastro de lo que se había contado. */}
      {yaCerrado && registro && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Cerrado</CardTitle>
            <CardDescription>
              El {formatDayLabel(day)} se cerró el {fmtDateTime(registro.cerradoEl)} por {registro.quien}.
              Un cierre no se rehace: si apareció algo, cargalo con fecha{" "}
              {formatDayLabel(nextDayKey(lastClosedDay!))} y aclaralo en el detalle.
            </CardDescription>
          </CardHeader>
          <div className="flex flex-col gap-1 px-4 pb-4 text-sm">
            <p className="text-strong">{registro.resumen!.titulo}</p>
            {registro.resumen!.medios.map((m) => (
              <p key={m} className="text-body tabular-nums">{m}</p>
            ))}
            {registro.resumen!.nota && (
              <p className="mt-1 text-muted">“{registro.resumen!.nota}”</p>
            )}
          </div>
          {/* EL ARCHIVO DEL DÍA, acá y no en otra pantalla. El cierre es el momento en que el
              día queda congelado: es el único instante en que bajar el libro sirve de verdad,
              porque a partir de ahí ese archivo ya no puede cambiar. Pedido del dueño: "que
              saque el excel del libro cada vez que se cierra".
              Son dos alcances porque son dos usos distintos: el del día es el respaldo del
              cierre (con los ajustes que acaba de asentar adentro); el del mes es lo que
              recibe la contadora. Abren los dos con doble clic en Excel y se importan en
              Google Sheets sin tocar nada (CSV con BOM UTF-8). */}
          <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-line px-4 py-3 text-sm">
            <a
              href={`/admin/caja/libro/export?dia=${day}`}
              className="font-medium underline underline-offset-4 hover:text-strong"
            >
              Bajar el libro de este día
            </a>
            <a
              href={`/admin/caja/libro/export?mes=${day.slice(0, 7)}`}
              className="text-muted underline underline-offset-4 hover:text-strong"
            >
              Bajar el mes completo
            </a>
          </div>
        </Card>
      )}
      {yaCerrado && !registro && (
        <p role="status" className="mb-6 rounded-md bg-success-soft px-4 py-3 text-sm text-success">
          El {formatDayLabel(day)} quedó dentro del cierre del {formatDayLabel(lastClosedDay!)}:
          cerrar un día arquea todo lo que quedó desde el cierre anterior, así que este día no
          tiene un cierre propio.{" "}
          <Link href={`${CIERRE_PATH}?dia=${lastClosedDay}`} className="underline">
            Ver ese cierre
          </Link>
          .
        </p>
      )}
      {enElFuturo && (
        <p role="status" className="mb-6 rounded-md bg-warning-soft px-4 py-3 text-sm text-warning">
          El {formatDayLabel(day)} todavía no pasó. Se cierra el día cuando terminó.
        </p>
      )}

      {!yaCerrado && (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Lo que el libro dice que hay</CardTitle>
          <CardDescription>
            {since
              ? `Desde el ${formatDayLabel(since)} hasta el ${formatDayLabel(day)} — ${preview.movementCount} movimiento${preview.movementCount === 1 ? "" : "s"}.`
              : `Todo lo cargado hasta el ${formatDayLabel(day)} — ${preview.movementCount} movimiento${preview.movementCount === 1 ? "" : "s"}. Todavía no hay ningún cierre anterior.`}
          </CardDescription>
        </CardHeader>
        {/* Mismo arreglo que el libro: con `min-w-[36rem]` la columna Total arrancaba en
            x=469 a 412px de viewport, así que la fila «Debería haber» —que es contra la
            que se cuenta la plata— mostraba Efectivo y MP y escondía Tarjeta y Total. */}
        <div className="sm:overflow-x-auto">
          <table className="block w-full text-sm sm:table sm:min-w-[36rem]">
            <thead className="hidden sm:table-header-group">
              <tr className="border-b border-line text-muted">
                <th scope="col" className="px-4 py-2 text-left font-medium">Concepto</th>
                {CASH_METHODS.map((m) => (
                  <th key={m} scope="col" className="px-4 py-2 text-right font-medium">
                    {CASH_METHOD_LABEL[m]}
                  </th>
                ))}
                <th scope="col" className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="block sm:table-row-group">
              {([
                ["Saldo al abrir", "opening"],
                ["Ingresos", "ingresos"],
                ["Egresos", "egresos"],
              ] as const).map(([rotulo, key]) => (
                <tr key={key} className={`${FILA_TARJETA} border-b border-line/60 sm:border-b`}>
                  <th
                    scope="row"
                    className="block text-left text-xs font-semibold uppercase tracking-wide text-strong sm:table-cell sm:px-4 sm:py-2 sm:text-sm sm:font-normal sm:normal-case sm:tracking-normal sm:text-muted"
                  >
                    {rotulo}
                  </th>
                  {CASH_METHODS.map((m) => (
                    <td key={m} className={`${CELDA_TARJETA} tabular-nums text-body sm:px-4 sm:text-right`}>
                      <span className={ROTULO_MOVIL}>{CASH_METHOD_LABEL[m]}</span>
                      {fmtMoneyARS(preview.porMedio[m][key])}
                    </td>
                  ))}
                  <td className={`${CELDA_TARJETA} font-medium tabular-nums text-body sm:px-4 sm:font-normal sm:text-right`}>
                    <span className={ROTULO_MOVIL}>Total</span>
                    {fmtMoneyARS(preview.total[key])}
                  </td>
                </tr>
              ))}
              <tr className={`${FILA_TARJETA} bg-surface-raised`}>
                <th
                  scope="row"
                  className="block text-left text-xs font-semibold uppercase tracking-wide text-strong sm:table-cell sm:px-4 sm:py-3 sm:text-sm sm:normal-case sm:tracking-normal"
                >
                  Debería haber
                </th>
                {CASH_METHODS.map((m) => (
                  <td key={m} className={`${CELDA_TARJETA} font-medium tabular-nums text-strong sm:px-4 sm:py-3 sm:text-right`}>
                    <span className={ROTULO_MOVIL}>{CASH_METHOD_LABEL[m]}</span>
                    {fmtMoneyARS(preview.porMedio[m].expected)}
                  </td>
                ))}
                <td className={`${CELDA_TARJETA} font-medium tabular-nums text-strong sm:px-4 sm:py-3 sm:text-right`}>
                  <span className={ROTULO_MOVIL}>Total</span>
                  {fmtMoneyARS(esperadoTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {!yaCerrado && preview.cobrosCarteraCount > 0 && (
          <p className="border-t border-line px-4 py-3 text-xs text-muted">
            De los ingresos, {preview.cobrosCarteraCount} vinieron de cuentas a cobrar
            ({fmtMoneyARS(totalOf({
              EFECTIVO: preview.porMedio.EFECTIVO.cobrosCartera,
              MP: preview.porMedio.MP.cobrosCartera,
              TARJETA: preview.porMedio.TARJETA.cobrosCartera,
            }))}). Ya están contados una sola vez acá arriba.
          </p>
        )}
      </Card>
      )}

      {/* TURNOS SIN CERRAR del día que se cierra: avisa, no traba. Un turno Reservado o
          Confirmado cuya hora ya pasó es un saldo que no entró o una ausencia sin marcar, y
          hasta acá ninguna pantalla lo mostraba. Va ANTES del botón de cerrar porque es el
          momento en que todavía se puede cobrar ese saldo con fecha de hoy. */}
      {turnosSinCerrar && turnosSinCerrar.length > 0 && (
        <TurnosSinCerrar day={day} turnos={turnosSinCerrar} />
      )}

      {puedeCerrar && (
        <CerrarDiaForm
          key={day}
          day={day}
          diaLabel={formatDayLabel(day)}
          esperado={{
            EFECTIVO: preview.porMedio.EFECTIVO.expected,
            MP: preview.porMedio.MP.expected,
            TARJETA: preview.porMedio.TARJETA.expected,
          }}
        />
      )}

      {!yaCerrado && (
        <>
      <h2 className="mb-3 mt-10 text-lg font-medium text-strong">
        Movimientos del período
      </h2>
      {movements.length === 0 ? (
        <EmptyState
          title="No hay movimientos en el período"
          description="Se puede cerrar igual: el cierre confirma que lo que hay es lo que el libro dice."
        />
      ) : (
        <Card>
          <div className="sm:overflow-x-auto">
            <table className="block w-full text-sm sm:table sm:min-w-[40rem]">
              <thead className="hidden sm:table-header-group">
                <tr className="border-b border-line text-muted">
                  <th scope="col" className="px-4 py-2 text-left font-medium">Fecha</th>
                  <th scope="col" className="px-4 py-2 text-left font-medium">Detalle</th>
                  <th scope="col" className="px-4 py-2 text-left font-medium">Medio</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Ingreso</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Egreso</th>
                </tr>
              </thead>
              <tbody className="block sm:table-row-group">
                {movements.map((m) => {
                  const entra = m.type === "INGRESO" || m.type === "VENTA" || m.type === "APERTURA";
                  return (
                    <tr key={m.id} className={`${FILA_TARJETA} border-b border-line/60 sm:border-b`}>
                      <td className="block whitespace-nowrap text-xs font-medium uppercase tracking-wide tabular-nums text-faint sm:table-cell sm:px-4 sm:py-2 sm:text-sm sm:font-normal sm:normal-case sm:tracking-normal sm:text-muted">
                        {formatDayLabel(m.day).slice(0, 5)}
                      </td>
                      <td className="block pt-0.5 text-body sm:table-cell sm:px-4 sm:py-2 sm:pt-2">
                        {m.detail || <span className="text-muted">(sin detalle)</span>}
                        {m.origin !== "manual" && (
                          <Badge className="ml-2" tone="neutral">
                            {m.origin === "turno" ? "Turno cobrado" : "Venta del mostrador"}
                          </Badge>
                        )}
                      </td>
                      <td className={`${CELDA_TARJETA} whitespace-nowrap text-muted sm:px-4`}>
                        <span className={ROTULO_MOVIL}>Medio</span>
                        {CASH_METHOD_LABEL[m.method]}
                      </td>
                      {/* La celda de plata vacía no ocupa renglón en el teléfono; en la
                          tabla de escritorio sigue estando, alineada con su columna. */}
                      <td className={`${CELDA_TARJETA} tabular-nums text-body sm:px-4 sm:text-right ${entra ? "" : "hidden"}`}>
                        <span className={ROTULO_MOVIL}>Ingreso</span>
                        {entra ? fmtMoneyARS(m.amount) : ""}
                      </td>
                      <td className={`${CELDA_TARJETA} tabular-nums text-body sm:px-4 sm:text-right ${entra ? "hidden" : ""}`}>
                        <span className={ROTULO_MOVIL}>Egreso</span>
                        {entra ? "" : fmtMoneyARS(m.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
        </>
      )}
    </main>
  );
}

function TurnosSinCerrar({ day, turnos }: { day: DayKey; turnos: NonNullable<Awaited<ReturnType<typeof getCierreDiarioData>>["turnosSinCerrar"]> }) {
  return (
    <Card className="mb-8 border-warning/40">
      <CardHeader>
        <CardTitle>Turnos sin cerrar ({turnos.length})</CardTitle>
        <CardDescription>
          Turnos del {formatDayLabel(day)} que siguen reservados o confirmados con la hora pasada.
          Cada uno es un cobro que no se registró o una ausencia sin marcar. Se puede cerrar la
          caja igual; completalos o marcá la ausencia desde la agenda.
        </CardDescription>
      </CardHeader>
      <ul className="divide-y divide-line/60 border-t border-line text-sm">
        {turnos.map((t) => (
          <li key={t.id}>
            <Link
              href={`/admin/turnos/lista#turno-${t.id}`}
              className="flex min-h-11 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 py-2.5 hover:bg-surface-raised"
            >
              <span className="text-body">
                <span className="tabular-nums font-medium text-strong">{fmtTime(t.startsAt)}</span>{" "}
                {t.clienta} · {t.servicio} · {t.profesional}
                <span className="ml-2 text-xs text-muted">{t.status === "PENDING" ? "Reservado" : "Confirmado"}</span>
              </span>
              <span className="tabular-nums text-muted">
                {t.saldo === null
                  ? "saldo no disponible"
                  : t.saldo > 0
                    ? `saldo ${fmtMoneyARS(t.saldo)}`
                    : "saldado"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
