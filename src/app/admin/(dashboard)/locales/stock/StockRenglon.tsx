// ============================================================================
// STOCK POR LOCAL — diseño nuevo («Renglón»). Servidor, sin lecturas propias.
// ============================================================================
//
// Los mismos datos que la pantalla de siempre (stockDeLaRedAction + filtrarMatriz). Un renglón
// por producto: en la PC, la matriz producto × local con las cantidades alineadas a la derecha
// (se compara bajando la vista por una columna); en el celular, el mismo renglón con cada local
// en una línea corta. Lo que falta se marca con forma y palabra, no con una pastilla de color.
// No hay plata: la abre también el encargado de la casa.

import Link from "next/link";
import type { CeldaStock, FilaStock } from "@/lib/multilocal/multilocal-core";
import { Marca, Rotulo, buttonClasses, cn, fmtNumberAR } from "@/components/ui";

type Columna = { id: string; nombre: string; esCasa: boolean };

function cantidad(c: CeldaStock, f: FilaStock): string {
  const n = fmtNumberAR(c.stock, f.saleUnit === "WEIGHT" ? 2 : 0);
  return f.saleUnit === "WEIGHT" ? `${n} kg` : `${n} ${f.unidad || "u."}`;
}

function Cantidad({ c, f }: { c: CeldaStock | null; f: FilaStock }) {
  if (!c) return <span className="text-[13px] text-muted">no lo tiene</span>;
  return (
    <span className="inline-flex flex-col items-end">
      <span className={cn("tabular-nums whitespace-nowrap", c.negativo ? "font-semibold text-danger" : c.bajo ? "font-semibold text-strong" : "text-strong")}>
        {cantidad(c, f)}
      </span>
      {c.negativo ? <Marca tipo="atencion">en negativo</Marca> : c.bajo ? <Marca tipo="pendiente">bajo el mínimo</Marca> : null}
    </span>
  );
}

export function CabeceraStock({ casa, bajo, negativo, locales }: { casa: string; bajo: { productos: number; locales: number }; negativo: number; locales: number }) {
  return (
    <header data-ui="page-header" className="mb-4">
      <h1 className="text-2xl font-bold text-strong">Stock por local</h1>
      {locales > 0 && (
        <p className="mt-1 text-sm text-muted">
          {casa}
          {" · "}
          <strong className="text-strong">{`${fmtNumberAR(bajo.productos)} bajo el mínimo`}</strong>
          {` en ${fmtNumberAR(bajo.locales)} ${bajo.locales === 1 ? "local" : "locales"}`}
          {negativo > 0 && <span className="text-danger">{` · ${fmtNumberAR(negativo)} en negativo: hay que recontarlos en el local`}</span>}
        </p>
      )}
    </header>
  );
}

export function FiltroStock({ q, soloBajo }: { q: string; soloBajo: boolean }) {
  return (
    <form method="get" role="search" className="mb-4 flex flex-wrap items-end gap-x-3 gap-y-2 border-b border-line pb-3">
      <label className="grid min-w-0 flex-1 basis-56 gap-1">
        <Rotulo as="span">Buscar un producto</Rotulo>
        <input
          name="q"
          defaultValue={q}
          placeholder="Parte del nombre"
          autoComplete="off"
          className="h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-[15px] text-strong placeholder:text-muted focus-visible:outline-2 focus-visible:outline-focus"
        />
      </label>
      <label className="flex h-11 items-center gap-2 text-sm text-strong">
        <input type="checkbox" name="bajo" value="1" defaultChecked={soloBajo} className="size-5 accent-[var(--accent)]" />
        Sólo lo que falta
      </label>
      <button type="submit" className={buttonClasses("outline", "md", "min-h-11")}>
        Ver
      </button>
    </form>
  );
}

function Trasladar({ f, className }: { f: FilaStock; className?: string }) {
  return (
    <Link href={`/admin/locales/traslados?producto=${encodeURIComponent(f.clave)}`} className={buttonClasses("ghost", "md", cn("min-h-11", className))}>
      Trasladar<span className="sr-only"> {f.nombre}</span>
    </Link>
  );
}

export function MatrizStock({ filas, columnas, veTraslados, total }: { filas: FilaStock[]; columnas: Columna[]; veTraslados: boolean; total: number }) {
  const conTraslado = veTraslados && columnas.length > 1;
  return (
    <section aria-labelledby="stock-red">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line-strong pb-2">
        <h2 id="stock-red" className="text-[15px] font-semibold text-strong">
          Cada producto en cada local
        </h2>
        <span className="text-[13px] text-muted">
          {filas.length === total ? `${fmtNumberAR(total)} productos` : `${fmtNumberAR(filas.length)} de ${fmtNumberAR(total)} productos`}
        </span>
      </div>

      {/* Celular: el producto y, debajo, una línea por local con la cantidad a la derecha. */}
      <ul className="md:hidden" aria-label="Stock de cada producto">
        {filas.map((f) => (
          <li key={f.clave} className="border-b border-line py-2.5">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 font-medium text-strong break-words">
                {f.nombre} <span className="text-[13px] font-normal text-muted">{f.saleUnit === "WEIGHT" ? "· por kilo" : "· por unidad"}</span>
              </p>
              {conTraslado && <Trasladar f={f} className="-my-1.5 shrink-0" />}
            </div>
            <dl className="mt-1">
              {columnas.map((col, i) => (
                <div key={col.id} className="flex items-start justify-between gap-3 py-0.5 text-sm">
                  <dt className="text-muted">{col.esCasa ? `${col.nombre} (casa)` : col.nombre}</dt>
                  <dd className="text-right">
                    <Cantidad c={f.celdas[i]} f={f} />
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>

      {/* PC: la matriz, una columna por local, las cantidades a la derecha. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Stock de cada producto en la casa y en cada local</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="py-1.5 pr-3 text-left">
                <Rotulo as="span">Producto</Rotulo>
              </th>
              {columnas.map((col) => (
                <th key={col.id} scope="col" className="py-1.5 pl-4 text-right">
                  <Rotulo as="span">{col.esCasa ? `${col.nombre} · casa` : col.nombre}</Rotulo>
                </th>
              ))}
              {conTraslado && (
                <th scope="col" className="py-1.5">
                  <span className="sr-only">Trasladar</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.clave} className="border-b border-line align-top">
                <th scope="row" className="py-2 pr-3 text-left font-medium text-strong">
                  {f.nombre}
                  <span className="block text-[13px] font-normal text-muted">{f.saleUnit === "WEIGHT" ? "por kilo" : "por unidad"}</span>
                </th>
                {columnas.map((col, i) => (
                  <td key={col.id} className="py-2 pl-4 text-right">
                    <Cantidad c={f.celdas[i]} f={f} />
                  </td>
                ))}
                {conTraslado && (
                  <td className="py-1 pl-3 text-right">
                    <Trasladar f={f} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
