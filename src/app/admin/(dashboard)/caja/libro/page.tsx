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
import { requireApp } from "@/lib/require-app";
import { getLibroCajaData } from "@/lib/libro-caja-actions";
import {
  CASH_METHODS,
  CASH_METHOD_LABEL,
  LIBRO_ORIGIN_LABEL,
  totalOf,
  shiftMonth,
  formatMonthKey,
  formatMonthLabel,
  type MethodAmounts,
} from "@/lib/caja/libro-caja";
import { todayInBusinessTz } from "@/lib/datetime";
import { isFrozenDay, nextDayKey } from "@/lib/caja/cierre-diario";
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
import { AddLibroEntryForm, DeleteLibroEntryButton, IrACargarMovimiento } from "./LibroForms";

export const dynamic = "force-dynamic";

const LIBRO_PATH = "/admin/caja/libro";

// Clases del modo TARJETA (móvil) de las tablas de esta pantalla. Viven acá arriba para
// que las dos tablas —Resumen y Movimientos— apilen igual y no se desincronicen.
// OJO con `sm:border-b-0`: NO va. `divide-y` de Tailwind v4 se emite envuelto en `:where(...)`
// —especificidad 0— así que cualquier `border-b-0` de la propia fila le gana y el escritorio se
// queda SIN separadores. El borde de abajo de la fila es el separador en las dos vistas
// (`border-collapse: collapse` viene del preflight, así que el borde del `<tr>` sí se pinta).
const FILA_MOVIMIENTO =
  "block border-b border-line px-4 py-3 last:border-b-0 sm:table-row sm:px-0 sm:py-0";
// `flex` en móvil (rótulo a la izquierda, importe a la derecha) y `table-cell` desde sm:
// la variante del breakpoint gana porque sale después en el CSS.
const CELDA_MOVIMIENTO =
  "flex items-baseline justify-between gap-3 py-0.5 sm:table-cell sm:py-2";
const ROTULO_MOVIL = "text-xs uppercase tracking-wide text-faint sm:hidden";

// Los meses de la navegación: en el celular, toques de 44 px; desde sm, como siempre.
const NAV_MES =
  "inline-flex min-h-11 items-center rounded-md border border-line px-3 py-1.5 text-sm text-body hover:bg-surface-2 sm:min-h-0";

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
  await requireApp("libro-de-caja");
  const { mes } = await searchParams;
  // getLibroCajaData aplica además requireCapability("orders:read"), la misma del registro.
  // Un ?mes inválido cae al mes corriente en vez de romper.
  const { rows, summary, year, month, monthKey, posiblesDuplicados, cerradoHasta } = await getLibroCajaData(mes);
  const duplicados = new Set(posiblesDuplicados);

  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const label = formatMonthLabel(year, month);
  // La fecha por defecto del alta es HOY si estamos parados en el mes corriente; si
  // se está mirando un mes pasado, el día 1 de ESE mes — cargar una fila con la fecha
  // de hoy mientras se mira julio la haría desaparecer de la pantalla.
  const today = todayInBusinessTz();
  const enElMes = today.startsWith(monthKey) ? today : `${monthKey}-01`;
  // Y si ese día quedó CONGELADO por un cierre, se propone el primer día abierto: seguir
  // proponiendo el día cerrado hace que cada intento de carga falle hasta corregir la
  // fecha a mano, que es justo cuando la persona ya cerró y está apurada por irse.
  const defaultDate =
    cerradoHasta && isFrozenDay(enElMes, cerradoHasta) ? nextDayKey(cerradoHasta) : enElMes;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader
        title="Libro de caja"
        description="Todo lo que entra y sale del negocio, mes a mes y por medio de pago. Reemplaza la planilla: el saldo inicial y el saldo corrido los calcula el sistema."
        actions={
          <div className="flex flex-wrap items-center gap-4">
            {/* Pedido explícito de la contadora del cliente: sin export, la única
                alternativa era darle el usuario de la dueña o mandarle 280 renglones
                en capturas. Bajan los MOVIMIENTOS del mes, no totales. */}
            <a
              href={`/admin/caja/libro/export?mes=${monthKey}`}
              className="text-sm text-muted underline underline-offset-4 hover:text-strong"
            >
              Descargar el mes (CSV)
            </a>
            {/* El paso final del día es CERRAR, y desde acá no se llegaba. El otro link va a
                la Caja, que ya no es "el arqueo del mostrador" sino la pantalla del día: la
                tienen los tres rubros, así que no lleva gate. */}
            <Link href="/admin/caja/cierre" className="text-sm text-muted underline underline-offset-4 hover:text-strong">
              Cerrar el día →
            </Link>
            <Link href="/admin/caja" className="text-sm text-muted underline underline-offset-4 hover:text-strong">
              Ir a la caja de hoy
            </Link>
          </div>
        }
      />

      {/* Navegación de mes */}
      <nav aria-label="Período" className="mb-6 flex items-center gap-3">
        <Link
          href={`${LIBRO_PATH}?mes=${formatMonthKey(prev.year, prev.month)}`}
          className={NAV_MES}
          rel="prev"
        >
          <span className="capitalize">← {formatMonthLabel(prev.year, prev.month)}</span>
        </Link>
        <span className="text-sm font-medium capitalize text-strong">{label}</span>
        <Link
          href={`${LIBRO_PATH}?mes=${formatMonthKey(next.year, next.month)}`}
          className={NAV_MES}
          rel="next"
        >
          <span className="capitalize">{formatMonthLabel(next.year, next.month)} →</span>
        </Link>
      </nav>

      <ResumenCard summary={summary} label={label} />

      {/* Alta de movimiento */}
      <Card className="mt-6" id="agregar-movimiento">
        <CardHeader>
          <div>
            <CardTitle>Agregar movimiento</CardTitle>
            <CardDescription>
              Una fila por cobro o por gasto, igual que en la planilla. Se guarda con la fecha que
              pongas, no con la de hoy: podés cargar en diferido.{" "}
              <strong className="font-medium text-body">
                Los turnos cobrados desde Turnos y las ventas del mostrador entran solos
              </strong>
              : acá se carga lo que no pasa por el sistema (señas, gastos, retiros, cobros sueltos).
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
            action={<IrACargarMovimiento />}
          />
        ) : (
          /* TARJETA APILADA EN EL TELÉFONO, TABLA EN LA COMPUTADORA.
              Antes esta tabla llevaba `min-w-[52rem]` (832px) dentro de un Card con
              `overflow-x-auto`: a 412px entraban Fecha, Detalle y parte de Medio, y las
              CUATRO columnas de plata —Ingreso, Egreso, Saldo y Acciones— arrancaban
              después del píxel 412. Quedaban a 470px de scroll lateral sin ninguna señal
              de que el scroll existiera. O sea: la pantalla que reemplaza la planilla no
              mostraba ni un importe en el teléfono, que es desde donde se la mira.
              El `overflow-x-auto` vuelve recién en `sm:`, donde la tabla sí entra. */
          <Card flush className="relative sm:overflow-x-auto">
            {/* `aria-label` en vez de un <caption className="sr-only">: el caption
                absolutamente posicionado se escapaba del contenedor y estiraba el
                documento a 817px en mobile, dejando media pantalla en blanco. */}
            <table
              className="block w-full text-sm sm:table sm:min-w-[52rem]"
              aria-label={`Movimientos de caja de ${label}: fecha, detalle, medio, ingreso, egreso y saldo acumulado`}
            >
              <thead className="hidden sm:table-header-group">
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
              <tbody className="block sm:table-row-group sm:divide-y sm:divide-line">
                {rows.map((r) => {
                  const entra = r.signedAmount > 0;
                  const sale = r.signedAmount < 0;
                  // Solo se puede borrar lo que se cargó a mano en el libro: una VENTA la
                  // escribió el sistema (mostrador o turno cobrado) y una APERTURA el arqueo
                  // (la acción también lo valida).
                  const borrable = r.type === "INGRESO" || r.type === "EGRESO";
                  const origen = r.origin ?? "manual";
                  // Transición desde la planilla: una fila manual con una gemela del sistema
                  // el mismo día (mismo medio y monto) es un doble conteo probable. Se marca
                  // para que se revise y se borre la manual; el sistema nunca la borra solo.
                  const dudosa = duplicados.has(r.id);
                  return (
                    <tr
                      key={r.id}
                      className={`${FILA_MOVIMIENTO} ${dudosa ? "bg-warning-soft/40 hover:bg-surface-2" : "hover:bg-surface-2"}`}
                    >
                      <td className="block whitespace-nowrap text-xs font-medium uppercase tracking-wide tabular-nums text-faint sm:table-cell sm:px-4 sm:py-2 sm:text-sm sm:font-normal sm:normal-case sm:tracking-normal sm:text-muted">
                        {fmtRowDate(r.occurredAt)}
                      </td>
                      <td className="block pt-0.5 text-body sm:table-cell sm:px-4 sm:py-2 sm:pt-2">
                        {r.detail || <span className="text-faint">—</span>}
                        {origen !== "manual" && (
                          <Badge tone="info" className="ml-2">{LIBRO_ORIGIN_LABEL[origen]}</Badge>
                        )}
                        {r.type === "APERTURA" && (
                          <Badge tone="neutral" className="ml-2">Apertura de turno</Badge>
                        )}
                        {dudosa && (
                          <Badge
                            tone="warning"
                            className="ml-2"
                            title="Hay un turno cobrado o una venta del mostrador el mismo día, por el mismo medio y monto. Si es el mismo cobro, borrá esta fila: la del sistema queda."
                          >
                            ¿Duplicado? El sistema ya registró un cobro igual ese día
                          </Badge>
                        )}
                      </td>
                      <td className={`${CELDA_MOVIMIENTO} whitespace-nowrap text-muted sm:px-4 sm:py-2`}>
                        <span className={ROTULO_MOVIL}>Medio</span>
                        {CASH_METHOD_LABEL[r.method]}
                      </td>
                      {/* Las celdas de plata vacías se ocultan en el teléfono: una fila de
                          egreso no tiene por qué gastar un renglón en «Ingreso —». En la
                          tabla de escritorio siguen existiendo, alineadas con su columna. */}
                      <td className={`${CELDA_MOVIMIENTO} tabular-nums text-success sm:px-4 sm:py-2 sm:text-right ${entra ? "" : "hidden"}`}>
                        <span className={ROTULO_MOVIL}>Ingreso</span>
                        {entra ? fmtMoneyARS(r.amount) : ""}
                      </td>
                      <td className={`${CELDA_MOVIMIENTO} tabular-nums text-danger sm:px-4 sm:py-2 sm:text-right ${sale ? "" : "hidden"}`}>
                        <span className={ROTULO_MOVIL}>Egreso</span>
                        {sale ? fmtMoneyARS(r.amount) : ""}
                      </td>
                      <td className={`${CELDA_MOVIMIENTO} font-medium tabular-nums text-strong sm:px-4 sm:py-2 sm:text-right`}>
                        <span className={ROTULO_MOVIL}>Saldo</span>
                        {fmtMoneyARS(r.runningTotal)}
                      </td>
                      <td className="mt-1 flex justify-end sm:table-cell sm:px-2 sm:py-2 sm:text-right">
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
    // Mismo motivo que la tabla de movimientos: con `min-w-[40rem]` la columna Total
    // arrancaba en x=511 a 412px de viewport, así que la fila «Saldo actual» —la que la
    // dueña mira primero— mostraba Efectivo y MP y escondía el total. En móvil cada
    // concepto es una tarjeta con sus cuatro importes rotulados.
    <Card flush className="relative sm:overflow-x-auto">
      <table className="block w-full text-sm sm:table sm:min-w-[40rem]">
        <caption className="block px-4 pt-4 text-left sm:table-caption">
          <span className="font-medium text-strong">Resumen de <span className="capitalize">{label}</span></span>
          <span className="ml-2 text-xs text-faint">
            El saldo inicial sale de todo lo cargado antes de este mes — no se copia a mano.
          </span>
        </caption>
        <thead className="hidden sm:table-header-group">
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
        <tbody className="block sm:table-row-group sm:divide-y sm:divide-line">
          {filas.map((f) => (
            <tr key={f.k} className={FILA_MOVIMIENTO}>
              <th
                scope="row"
                className="block text-left text-xs font-semibold uppercase tracking-wide text-strong sm:table-cell sm:px-4 sm:py-2 sm:text-sm sm:font-normal sm:normal-case sm:tracking-normal sm:text-muted"
              >
                {f.rotulo}
              </th>
              {CASH_METHODS.map((m) => (
                <td
                  key={m}
                  className={`${CELDA_MOVIMIENTO} tabular-nums sm:px-4 sm:text-right ${f.tono || "text-body"}`}
                >
                  <span className={ROTULO_MOVIL}>{CASH_METHOD_LABEL[m]}</span>
                  {fmtMoneyARS(f.valores[m])}
                </td>
              ))}
              <td
                className={`${CELDA_MOVIMIENTO} font-medium tabular-nums sm:px-4 sm:font-normal sm:text-right ${f.tono || "text-body"}`}
              >
                <span className={ROTULO_MOVIL}>Total</span>
                {fmtMoneyARS(totalOf(f.valores))}
              </td>
            </tr>
          ))}
          {/* SALDO ACTUAL: la línea que la dueña mira primero. */}
          <tr className={`${FILA_MOVIMIENTO} border-t-2 bg-surface-2 sm:border-t-2 sm:border-line`}>
            <th
              scope="row"
              className="block text-left text-xs font-semibold uppercase tracking-wide text-strong sm:table-cell sm:px-4 sm:py-3 sm:text-sm sm:normal-case sm:tracking-normal"
            >
              Saldo actual
            </th>
            {CASH_METHODS.map((m) => (
              <td
                key={m}
                className={`${CELDA_MOVIMIENTO} font-medium tabular-nums text-strong sm:px-4 sm:py-3 sm:text-right`}
              >
                <span className={ROTULO_MOVIL}>{CASH_METHOD_LABEL[m]}</span>
                {fmtMoneyARS(summary.saldo[m])}
              </td>
            ))}
            <td className={`${CELDA_MOVIMIENTO} text-base font-semibold tabular-nums text-strong sm:px-4 sm:py-3 sm:text-right`}>
              <span className={ROTULO_MOVIL}>Total</span>
              {fmtMoneyARS(totalOf(summary.saldo))}
            </td>
          </tr>
        </tbody>
      </table>
    </Card>
  );
}
