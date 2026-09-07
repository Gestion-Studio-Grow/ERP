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

export const dynamic = "force-dynamic";

const CIERRE_PATH = "/admin/caja/cierre";

function prevDayKey(day: DayKey): DayKey {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

export default async function CierreCajaPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>;
}) {
  const { dia } = await searchParams;
  const data = await getCierreDiarioData(dia);
  const { preview, day, today, lastClosedDay, since, movements, yaCerrado, enElFuturo } = data;

  const esperadoTotal = preview.total.expected;
  const puedeCerrar = !yaCerrado && !enElFuturo;

  return (
    <div>
      <PageHeader
        title="Cierre de caja"
        description="Contá la plata al final del día y dejá la diferencia asentada. Después de cerrar, el día queda congelado y el siguiente arranca con lo que contaste."
      />

      {/* Navegación por día: links, no formularios. */}
      <nav className="mb-6 flex flex-wrap items-center gap-2" aria-label="Elegir el día">
        <Link href={`${CIERRE_PATH}?dia=${prevDayKey(day)}`} className="rounded-md border border-line px-3 py-1.5 text-sm text-body hover:bg-surface-raised">
          ← {formatDayLabel(prevDayKey(day))}
        </Link>
        <span className="rounded-md bg-surface-raised px-3 py-1.5 text-sm font-medium text-strong">
          {formatDayLabel(day)}
        </span>
        <Link href={`${CIERRE_PATH}?dia=${nextDayKey(day)}`} className="rounded-md border border-line px-3 py-1.5 text-sm text-body hover:bg-surface-raised">
          {formatDayLabel(nextDayKey(day))} →
        </Link>
        {day !== today && (
          <Link href={CIERRE_PATH} className="rounded-md border border-line px-3 py-1.5 text-sm text-body hover:bg-surface-raised">
            Hoy
          </Link>
        )}
        <Link href="/admin/caja/libro" className="ml-auto text-sm text-accent hover:underline">
          Ver el libro del mes →
        </Link>
      </nav>

      {yaCerrado && (
        <p role="status" className="mb-6 rounded-md bg-success-soft px-4 py-3 text-sm text-success">
          El {formatDayLabel(day)} ya está cerrado (último cierre: {formatDayLabel(lastClosedDay!)}).
          Un cierre no se rehace: si apareció algo, va como movimiento con la fecha de hoy.
        </p>
      )}
      {enElFuturo && (
        <p role="status" className="mb-6 rounded-md bg-warning-soft px-4 py-3 text-sm text-warning">
          El {formatDayLabel(day)} todavía no pasó. Se cierra el día cuando terminó.
        </p>
      )}

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Lo que el libro dice que hay</CardTitle>
          <CardDescription>
            {since
              ? `Desde el ${formatDayLabel(since)} hasta el ${formatDayLabel(day)} — ${preview.movementCount} movimiento${preview.movementCount === 1 ? "" : "s"}.`
              : `Todo lo cargado hasta el ${formatDayLabel(day)} — ${preview.movementCount} movimiento${preview.movementCount === 1 ? "" : "s"}. Todavía no hay ningún cierre anterior.`}
          </CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
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
            <tbody>
              {([
                ["Saldo al abrir", "opening"],
                ["Ingresos", "ingresos"],
                ["Egresos", "egresos"],
              ] as const).map(([rotulo, key]) => (
                <tr key={key} className="border-b border-line/60">
                  <th scope="row" className="px-4 py-2 text-left font-normal text-muted">{rotulo}</th>
                  {CASH_METHODS.map((m) => (
                    <td key={m} className="px-4 py-2 text-right tabular-nums text-body">
                      {fmtMoneyARS(preview.porMedio[m][key])}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right tabular-nums text-body">
                    {fmtMoneyARS(preview.total[key])}
                  </td>
                </tr>
              ))}
              <tr className="bg-surface-raised">
                <th scope="row" className="px-4 py-3 text-left font-medium text-strong">Debería haber</th>
                {CASH_METHODS.map((m) => (
                  <td key={m} className="px-4 py-3 text-right font-medium tabular-nums text-strong">
                    {fmtMoneyARS(preview.porMedio[m].expected)}
                  </td>
                ))}
                <td className="px-4 py-3 text-right font-medium tabular-nums text-strong">
                  {fmtMoneyARS(esperadoTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {preview.cobrosCarteraCount > 0 && (
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

      {puedeCerrar && (
        <CerrarDiaForm
          key={day}
          day={day}
          esperado={{
            EFECTIVO: preview.porMedio.EFECTIVO.expected,
            MP: preview.porMedio.MP.expected,
            TARJETA: preview.porMedio.TARJETA.expected,
          }}
        />
      )}

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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th scope="col" className="px-4 py-2 text-left font-medium">Fecha</th>
                  <th scope="col" className="px-4 py-2 text-left font-medium">Detalle</th>
                  <th scope="col" className="px-4 py-2 text-left font-medium">Medio</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Ingreso</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Egreso</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => {
                  const entra = m.type === "INGRESO" || m.type === "VENTA" || m.type === "APERTURA";
                  return (
                    <tr key={m.id} className="border-b border-line/60">
                      <td className="whitespace-nowrap px-4 py-2 tabular-nums text-muted">
                        {formatDayLabel(m.day).slice(0, 5)}
                      </td>
                      <td className="px-4 py-2 text-body">
                        {m.detail || <span className="text-muted">(sin detalle)</span>}
                        {m.origin !== "manual" && (
                          <Badge className="ml-2" tone="neutral">
                            {m.origin === "turno" ? "Turno cobrado" : "Venta del mostrador"}
                          </Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-muted">{CASH_METHOD_LABEL[m.method]}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-body">
                        {entra ? fmtMoneyARS(m.amount) : ""}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-body">
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
    </div>
  );
}
