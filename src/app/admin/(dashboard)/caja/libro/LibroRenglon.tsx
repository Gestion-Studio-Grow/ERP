// ============================================================================
// LIBRO DE CAJA — el libro del mes, un día por hoja (diseño nuevo «Renglón»). Servidor.
// ============================================================================
//
// Los MISMOS datos que la pantalla de siempre (`getLibroCajaData`: filas del mes con su saldo
// corrido, el resumen por medio con el saldo inicial derivado, los posibles duplicados) pero leído
// como un libro, no como una planilla de 280 renglones seguidos (en MAGRA medía 38.737 px en un
// celular):
//
//   · arriba, el resumen del mes por medio en una tabla chica (saldo inicial · entró · salió ·
//     saldo actual), con el total;
//   · debajo, UN PLIEGO POR DÍA, del más nuevo al más viejo: «Jueves 24 · 12 movimientos · entró
//     $X · salió $Y · saldo $Z». El último día abierto y los días con un posible duplicado vienen
//     desplegados; los demás, plegados (se abren con un toque);
//   · adentro, los renglones del día en el orden en que se cargaron, con el saldo corrido.
//
// Cargar y borrar son los de siempre: el alta del libro (AddLibroEntryForm, en un cajón) y el
// borrado en dos toques de lo cargado a mano (DeleteLibroEntryButton).

import Link from "next/link";
import type { getLibroCajaData } from "@/lib/libro-caja-actions";
import { CASH_METHODS, CASH_METHOD_LABEL, LIBRO_ORIGIN_LABEL, totalOf } from "@/lib/caja/libro-caja";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { LineaDeEstado, Marca, Plata, Rotulo, atributosBoton, buttonClasses } from "@/components/ui";
import { PasoDePeriodo } from "@/components/ui/PasoDePeriodo";
import { diaLargo, mesLargo, nombreMes } from "../_renglon/fechas";
import { CargarMovimiento } from "../CargarMovimiento";
import { DeleteLibroEntryButton } from "./LibroForms";

type Datos = Awaited<ReturnType<typeof getLibroCajaData>>;
type Fila = Datos["rows"][number];

const RUTA = "/admin/caja/libro";

function Resumen({ d }: { d: Datos }) {
  const { summary } = d;
  const filas = [
    { k: "opening", rotulo: "Saldo inicial", v: summary.opening },
    { k: "ingresos", rotulo: "Entró", v: summary.ingresos },
    { k: "egresos", rotulo: "Salió", v: summary.egresos, resta: true },
  ] as const;
  return (
    <section aria-labelledby="resumen-mes" className="max-w-5xl">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line-strong pb-2">
        <h2 id="resumen-mes" className="text-[15px] font-semibold text-strong">
          Resumen de {nombreMes(d.monthKey)}
        </h2>
        <span className="text-[13px] text-muted">El saldo inicial sale de todo lo cargado antes: no se copia a mano</span>
      </div>
      {/* Celular: un renglón por medio, con el saldo a la derecha y el detalle debajo. */}
      <ul className="sm:hidden">
        {CASH_METHODS.filter((m) => summary.opening[m] !== 0 || summary.ingresos[m] !== 0 || summary.egresos[m] !== 0).map((m) => (
          <li key={m} className="flex items-baseline justify-between gap-3 border-b border-line py-2.5">
            <span className="min-w-0">
              <span className="block font-medium text-strong">{CASH_METHOD_LABEL[m]}</span>
              <span className="block text-[13px] text-muted">
                inicial <Plata valor={summary.opening[m]} sinCentavos /> · entró <Plata valor={summary.ingresos[m]} sinCentavos /> · salió{" "}
                <Plata valor={summary.egresos[m]} sinCentavos />
              </span>
            </span>
            <span className="shrink-0 text-right font-semibold">
              <Plata valor={summary.saldo[m]} />
            </span>
          </li>
        ))}
        <li className="flex items-baseline justify-between gap-3 border-t-2 border-line-strong py-2.5 font-semibold text-strong">
          <span>Saldo actual</span>
          <Plata valor={totalOf(summary.saldo)} />
        </li>
      </ul>
      <div className="max-sm:hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="py-1.5 text-left">
                <span className="sr-only">Concepto</span>
              </th>
              {CASH_METHODS.map((m) => (
                <th key={m} scope="col" className="py-1.5 text-right">
                  <Rotulo as="span">{CASH_METHOD_LABEL[m]}</Rotulo>
                </th>
              ))}
              <th scope="col" className="py-1.5 text-right">
                <Rotulo as="span">Total</Rotulo>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.k} className="border-b border-line">
                <th scope="row" className="py-2 pr-3 text-left font-normal text-body">
                  {f.rotulo}
                </th>
                {CASH_METHODS.map((m) => (
                  <td key={m} className="py-2 text-right">
                    <Plata valor={"resta" in f && f.v[m] !== 0 ? -f.v[m] : f.v[m]} />
                  </td>
                ))}
                <td className="py-2 text-right">
                  <Plata valor={"resta" in f && totalOf(f.v) !== 0 ? -totalOf(f.v) : totalOf(f.v)} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line-strong">
              <th scope="row" className="py-2.5 text-left font-semibold text-strong">
                Saldo actual
              </th>
              {CASH_METHODS.map((m) => (
                <td key={m} className="py-2.5 text-right font-semibold">
                  <Plata valor={summary.saldo[m]} />
                </td>
              ))}
              <td className="py-2.5 text-right font-semibold">
                <Plata valor={totalOf(summary.saldo)} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function RenglonDelLibro({ r, dudosa }: { r: Fila; dudosa: boolean }) {
  const borrable = r.type === "INGRESO" || r.type === "EGRESO";
  const origen = r.origin ?? "manual";
  return (
    <li
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 border-b border-line py-2 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_8.5rem_2.75rem] ${
        dudosa ? "bg-warning-soft/50" : ""
      }`}
    >
      <span className="min-w-0">
        <span className="block text-strong">{r.detail || <span className="text-muted">(sin detalle)</span>}</span>
        <span className="block text-[13px] text-muted">
          {CASH_METHOD_LABEL[r.method]}
          {origen !== "manual" ? ` · ${LIBRO_ORIGIN_LABEL[origen].toLowerCase()}` : " · cargado a mano"}
          {r.type === "APERTURA" ? " · apertura de turno" : ""}
        </span>
        {dudosa && (
          <span className="mt-0.5 block text-[13px]">
            <Marca tipo="atencion">¿Duplicado?</Marca>{" "}
            <span className="text-body">El sistema ya registró un cobro igual ese día, por el mismo medio y monto. Si es el mismo, borrá esta fila.</span>
          </span>
        )}
      </span>
      <span className={`text-right ${r.signedAmount >= 0 ? "sm:col-start-2" : "sm:col-start-3"}`}>
        <Plata valor={r.signedAmount} />
      </span>
      <span className="col-span-2 text-right text-[13px] text-muted sm:col-span-1 sm:col-start-4 sm:text-sm sm:text-body">
        <span className="sm:hidden">saldo </span>
        <Plata valor={r.runningTotal} />
      </span>
      <span className="col-span-2 flex justify-end sm:col-span-1 sm:col-start-5">
        {borrable && <DeleteLibroEntryButton id={r.id} detail={r.detail} />}
      </span>
    </li>
  );
}

export default function LibroRenglon({ d, defaultDate, hoy }: { d: Datos; defaultDate: string; hoy: string }) {
  const { rows, monthKey, posiblesDuplicados, cerradoHasta } = d;
  const duplicados = new Set(posiblesDuplicados);
  const [y, m] = monthKey.split("-").map(Number);
  const anterior = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
  const siguiente = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`;
  const mesActual = hoy.slice(0, 7);

  // Un pliego por día (las filas vienen en el orden del libro; los días, del más nuevo al más viejo).
  const dias = new Map<string, Fila[]>();
  for (const r of rows) {
    const dia = dateStrInBusinessTz(new Date(r.occurredAt));
    dias.set(dia, [...(dias.get(dia) ?? []), r]);
  }
  const pliegos = [...dias.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  const ultimo = pliegos[0]?.[0];

  return (
    <main data-ui="pagina" className="mx-auto w-full px-4 py-6">
      <header data-ui="page-header" className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-strong">Libro de caja</h1>
          <LineaDeEstado
            datos={[
              <strong key="m">{mesLargo(monthKey)}</strong>,
              `${rows.length} ${rows.length === 1 ? "movimiento" : "movimientos"}`,
              duplicados.size > 0 ? <Marca key="d" tipo="atencion">{duplicados.size === 1 ? "1 posible duplicado" : `${duplicados.size} posibles duplicados`}</Marca> : null,
              cerradoHasta ? `cerrado hasta el ${cerradoHasta.slice(8, 10)}/${cerradoHasta.slice(5, 7)}` : "ningún día cerrado",
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PasoDePeriodo
            etiqueta="Mes"
            actual={mesLargo(monthKey)}
            anterior={{ href: `${RUTA}?mes=${anterior}`, texto: nombreMes(anterior) }}
            siguiente={siguiente <= mesActual ? { href: `${RUTA}?mes=${siguiente}`, texto: nombreMes(siguiente) } : null}
            volver={monthKey !== mesActual ? { href: RUTA, texto: "Este mes" } : null}
          />
          <CargarMovimiento dia={defaultDate} mes={monthKey} />
          {/* <a>: es un archivo (Link lo precargaría). */}
          <a href={`${RUTA}/export?mes=${monthKey}`} className={buttonClasses("ghost", "md")} {...atributosBoton("ghost", "md")}>
            Bajar el mes (CSV)
          </a>
        </div>
      </header>

      <Resumen d={d} />

      <section aria-labelledby="dias-del-mes" className="mt-8 max-w-5xl">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line-strong pb-2">
          <h2 id="dias-del-mes" className="text-[15px] font-semibold text-strong">
            Día por día
          </h2>
          <span className="text-[13px] text-muted">
            {pliegos.length === 0 ? "sin movimientos" : `${pliegos.length} ${pliegos.length === 1 ? "día" : "días"} con movimientos`}
          </span>
        </div>
        {pliegos.length > 0 && (
          <div aria-hidden className="hidden grid-cols-[minmax(0,1fr)_8rem_8rem_8.5rem_2.75rem] gap-x-4 border-b border-line py-1.5 sm:grid">
            <Rotulo as="span">Día</Rotulo>
            <Rotulo as="span" className="text-right">
              Entró
            </Rotulo>
            <Rotulo as="span" className="text-right">
              Salió
            </Rotulo>
            <Rotulo as="span" className="text-right">
              Saldo
            </Rotulo>
          </div>
        )}
        {pliegos.length === 0 && (
          <p className="py-3 text-sm text-muted">
            Todavía no hay movimientos en {nombreMes(monthKey)}. Las ventas y los turnos cobrados entran solos; lo demás se carga con «Cargar un gasto o retiro».
          </p>
        )}
        {pliegos.map(([dia, filas]) => {
          const entra = filas.reduce((s, r) => s + (r.signedAmount > 0 ? r.signedAmount : 0), 0);
          const sale = filas.reduce((s, r) => s + (r.signedAmount < 0 ? -r.signedAmount : 0), 0);
          const saldo = filas[filas.length - 1].runningTotal;
          const conDudas = filas.some((r) => duplicados.has(r.id));
          return (
            <details key={dia} className="group border-b border-line" open={dia === ultimo || conDudas}>
              <summary className="grid min-h-12 cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_8.5rem_2.75rem]">
                <span className="min-w-0">
                  <span className="font-semibold text-strong">{diaLargo(dia)}</span>
                  <span className="block text-[13px] text-muted">
                    {filas.length} {filas.length === 1 ? "movimiento" : "movimientos"}
                    {conDudas ? " · con un posible duplicado" : ""}
                    {cerradoHasta && dia <= cerradoHasta ? " · cerrado" : ""}
                  </span>
                </span>
                <span className="hidden text-right sm:block">
                  <Plata valor={entra} sinCentavos />
                </span>
                <span className="text-right text-[13px] sm:col-start-3 sm:text-sm">
                  <span className="text-muted sm:hidden">salió </span>
                  <Plata valor={sale === 0 ? 0 : -sale} sinCentavos />
                </span>
                <span className="col-span-2 text-right text-sm font-semibold sm:col-span-1 sm:col-start-4">
                  <span className="font-normal text-muted sm:hidden">saldo </span>
                  <Plata valor={saldo} />
                </span>
                <span aria-hidden className="hidden text-center text-muted transition-transform group-open:rotate-90 sm:col-start-5 sm:block">
                  ›
                </span>
              </summary>
              <ol className="border-t border-line pb-2">
                {filas.map((r) => (
                  <RenglonDelLibro key={r.id} r={r} dudosa={duplicados.has(r.id)} />
                ))}
              </ol>
            </details>
          );
        })}
        {pliegos.length > 0 && (
          <p className="mt-3 text-sm text-muted">
            ¿Terminó el día?{" "}
            <Link href="/admin/caja/cierre" className="font-medium text-accent-ink underline underline-offset-4">
              Cerrar el día
            </Link>
          </p>
        )}
      </section>
    </main>
  );
}
