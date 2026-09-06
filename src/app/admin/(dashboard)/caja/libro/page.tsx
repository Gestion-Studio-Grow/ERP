// LIBRO DE CAJA mensual — la pantalla que reemplaza la planilla de Google Sheets.
//
// Se parece a la planilla A PROPÓSITO: mismo bloque RESUMEN arriba (saldo inicial /
// ingresos / egresos / saldo actual, abierto por medio de pago) y la misma tabla
// abajo (fecha · detalle · ingreso · egreso · saldo corrido). La persona que hoy
// carga la planilla tiene que reconocer la pantalla sin que nadie se la explique.
//
// Lo que la planilla NO hace y esto sí: el saldo inicial del mes se DERIVA del
// historial en vez de copiarse a mano, así no se arrastra un error de tipeo de un mes
// al siguiente, y el saldo corrido no se puede pisar.

import Link from "next/link";
import { getLibroCajaData } from "@/lib/libro-caja-actions";
import {
  CASH_METHODS,
  CASH_METHOD_LABEL,
  totalOf,
  shiftMonth,
  formatMonthKey,
  formatMonthLabel,
  type MethodAmounts,
} from "@/lib/caja/libro-caja";
import { todayInBusinessTz } from "@/lib/datetime";
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
import { AddLibroEntryForm, DeleteLibroEntryButton } from "./LibroForms";

export const dynamic = "force-dynamic";

const LIBRO_PATH = "/admin/caja/libro";

// Fecha de la fila en formato corto (dd/mm), que es como la lee la planilla. Se
// formatea desde el instante UTC en la zona del negocio: el asiento se ancla al
// mediodía, así que ningún corrimiento lo mueve de día.
function fmtRowDate(d: Date): string {
  // `es-AR` ignora el "2-digit" del día para día/mes sueltos y rinde "6/9". Se
  // arma a mano para que la columna quede alineada: "06/09".
  const partes = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
  }).formatToParts(d);
  const dia = partes.find((p) => p.type === "day")?.value ?? "";
  const mes = partes.find((p) => p.type === "month")?.value ?? "";
  return `${dia.padStart(2, "0")}/${mes.padStart(2, "0")}`;
}

export default async function LibroCajaPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  // getLibroCajaData aplica requireCapability("orders:read") — guard de la página.
  // Un ?mes inválido cae al mes corriente en vez de romper.
  const { rows, summary, year, month, monthKey } = await getLibroCajaData(mes);

  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const label = formatMonthLabel(year, month);
  // La fecha por defecto del alta es HOY si estamos parados en el mes corriente; si
  // se está mirando un mes pasado, el día 1 de ESE mes — cargar una fila con la fecha
  // de hoy mientras se mira julio la haría desaparecer de la pantalla.
  const today = todayInBusinessTz();
  const defaultDate = today.startsWith(monthKey) ? today : `${monthKey}-01`;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader
        title="Libro de caja"
        description="Todo lo que entra y sale del negocio, mes a mes y por medio de pago. Reemplaza la planilla: el saldo inicial y el saldo corrido los calcula el sistema."
        actions={
          <Link href="/admin/caja" className="text-sm text-muted underline underline-offset-4 hover:text-strong">
            Ir al arqueo del mostrador
          </Link>
        }
      />

      {/* Navegación de mes */}
      <nav aria-label="Período" className="mb-6 flex items-center gap-3">
        <Link
          href={`${LIBRO_PATH}?mes=${formatMonthKey(prev.year, prev.month)}`}
          className="rounded-md border border-line px-3 py-1.5 text-sm text-body hover:bg-surface-2"
          rel="prev"
        >
          <span className="capitalize">← {formatMonthLabel(prev.year, prev.month)}</span>
        </Link>
        <span className="text-sm font-medium capitalize text-strong">{label}</span>
        <Link
          href={`${LIBRO_PATH}?mes=${formatMonthKey(next.year, next.month)}`}
          className="rounded-md border border-line px-3 py-1.5 text-sm text-body hover:bg-surface-2"
          rel="next"
        >
          <span className="capitalize">{formatMonthLabel(next.year, next.month)} →</span>
        </Link>
      </nav>

      <ResumenCard summary={summary} label={label} />

      {/* Alta de movimiento */}
      <Card className="mt-6">
        <CardHeader>
          <div>
            <CardTitle>Agregar movimiento</CardTitle>
            <CardDescription>
              Una fila por cobro o por gasto, igual que en la planilla. Se guarda con la fecha que
              pongas, no con la de hoy: podés cargar en diferido.
            </CardDescription>
          </div>
        </CardHeader>
        {/* `key` por mes: remonta el formulario al navegar, para que la fecha por
            defecto se re-inicialice. Sin esto, llegar con la flecha y guardar
            mandaba la fila al mes anterior y desaparecía de la pantalla. */}
        <AddLibroEntryForm key={monthKey} defaultDate={defaultDate} viewMonth={monthKey} />
      </Card>

      {/* Detalle del mes */}
      <section className="mt-6">
        <h2 className="mb-3 text-lg font-medium text-strong">
          Movimientos de <span className="capitalize">{label}</span>{" "}
          <span className="text-sm font-normal text-faint">
            ({rows.length} {rows.length === 1 ? "movimiento" : "movimientos"})
          </span>
        </h2>
        {rows.length === 0 ? (
          <EmptyState
            title="Todavía no hay movimientos en este mes"
            description="Cargá el primero con el formulario de arriba, o cambiá de mes."
          />
        ) : (
          <Card flush className="relative overflow-x-auto">
            {/* `aria-label` en vez de un <caption className="sr-only">: el caption
                absolutamente posicionado se escapaba del contenedor y estiraba el
                documento a 817px en mobile, dejando media pantalla en blanco. */}
            <table
              className="w-full min-w-[52rem] text-sm"
              aria-label={`Movimientos de caja de ${label}: fecha, detalle, medio, ingreso, egreso y saldo acumulado`}
            >
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                  <th scope="col" className="px-4 py-2 font-medium">Fecha</th>
                  <th scope="col" className="px-4 py-2 font-medium">Detalle</th>
                  <th scope="col" className="px-4 py-2 font-medium">Medio</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Ingreso</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Egreso</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Saldo</th>
                  <th scope="col" className="px-2 py-2">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const entra = r.signedAmount > 0;
                  const sale = r.signedAmount < 0;
                  // Solo se puede borrar lo que se cargó a mano en el libro: una VENTA la
                  // creó el POS y una APERTURA el arqueo (la acción también lo valida).
                  const borrable = r.type === "INGRESO" || r.type === "EGRESO";
                  return (
                    <tr key={r.id} className="hover:bg-surface-2">
                      <td className="whitespace-nowrap px-4 py-2 tabular-nums text-muted">
                        {fmtRowDate(r.occurredAt)}
                      </td>
                      <td className="px-4 py-2 text-body">
                        {r.detail || <span className="text-faint">—</span>}
                        {r.type === "VENTA" && (
                          <Badge tone="neutral" className="ml-2">Venta del mostrador</Badge>
                        )}
                        {r.type === "APERTURA" && (
                          <Badge tone="neutral" className="ml-2">Apertura de turno</Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-muted">
                        {CASH_METHOD_LABEL[r.method]}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-success">
                        {entra ? fmtMoneyARS(r.amount) : ""}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-danger">
                        {sale ? fmtMoneyARS(r.amount) : ""}
                      </td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums text-strong">
                        {fmtMoneyARS(r.runningTotal)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {borrable && <DeleteLibroEntryButton id={r.id} detail={r.detail} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </main>
  );
}

// --- Bloque RESUMEN: el mismo cuadro que la planilla tiene arriba de todo ---
function ResumenCard({ summary, label }: { summary: { opening: MethodAmounts; ingresos: MethodAmounts; egresos: MethodAmounts; saldo: MethodAmounts }; label: string }) {
  const filas = [
    { k: "opening", rotulo: "Saldo inicial", valores: summary.opening, tono: "" },
    { k: "ingresos", rotulo: "Ingresos (+)", valores: summary.ingresos, tono: "text-success" },
    { k: "egresos", rotulo: "Egresos (−)", valores: summary.egresos, tono: "text-danger" },
  ] as const;

  return (
    <Card flush className="relative overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <caption className="px-4 pt-4 text-left">
          <span className="font-medium text-strong">Resumen de <span className="capitalize">{label}</span></span>
          <span className="ml-2 text-xs text-faint">
            El saldo inicial sale de todo lo cargado antes de este mes — no se copia a mano.
          </span>
        </caption>
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-faint">
            <th scope="col" className="px-4 py-2 text-left font-medium">Concepto</th>
            {CASH_METHODS.map((m) => (
              <th key={m} scope="col" className="px-4 py-2 text-right font-medium">
                {CASH_METHOD_LABEL[m]}
              </th>
            ))}
            <th scope="col" className="px-4 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {filas.map((f) => (
            <tr key={f.k}>
              <th scope="row" className="px-4 py-2 text-left font-normal text-muted">{f.rotulo}</th>
              {CASH_METHODS.map((m) => (
                <td key={m} className={`px-4 py-2 text-right tabular-nums ${f.tono || "text-body"}`}>
                  {fmtMoneyARS(f.valores[m])}
                </td>
              ))}
              <td className={`px-4 py-2 text-right tabular-nums ${f.tono || "text-body"}`}>
                {fmtMoneyARS(totalOf(f.valores))}
              </td>
            </tr>
          ))}
          {/* SALDO ACTUAL: la línea que la dueña mira primero. */}
          <tr className="border-t-2 border-line bg-surface-2">
            <th scope="row" className="px-4 py-3 text-left font-medium text-strong">Saldo actual</th>
            {CASH_METHODS.map((m) => (
              <td key={m} className="px-4 py-3 text-right font-medium tabular-nums text-strong">
                {fmtMoneyARS(summary.saldo[m])}
              </td>
            ))}
            <td className="px-4 py-3 text-right text-base font-semibold tabular-nums text-strong">
              {fmtMoneyARS(totalOf(summary.saldo))}
            </td>
          </tr>
        </tbody>
      </table>
    </Card>
  );
}
