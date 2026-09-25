import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { exigirCasa } from "@/lib/multilocal/casa.server";
import { stockDeLaRedAction } from "@/lib/multilocal/multilocal-actions";
import { filtrarMatriz, type CeldaStock, type FilaStock } from "@/lib/multilocal/multilocal-core";
import { Badge, Button, Card, EmptyState, Field, Input, PageContainer, PageHeader, buttonClasses, cn, fmtNumberAR } from "@/components/ui";
import { appPorId } from "@/apps/registro";
import { appPermitida } from "@/apps/visibles";
import { getNegocioApps } from "@/apps/contexto.server";
import { LocalesSinLeer, NoEsCasa, NoSePudoLeer, SinLocales, SolapasLocales } from "../partes";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { CabeceraStock, FiltroStock, MatrizStock } from "./StockRenglon";

export const dynamic = "force-dynamic";

// STOCK POR LOCAL — cada producto en la casa (el obrador) y en cada local: dónde sobra y dónde
// falta. Desde acá se decide qué mandar a cada local: "Trasladar" abre el traslado con ese
// producto ya elegido (sólo si la persona puede trasladar).
//
// Los productos se cruzan por nombre (sin acentos ni mayúsculas) más la unidad de venta: un
// renombre en un local lo muestra como otra fila. "Bajo el mínimo" y "en negativo" son las
// reglas de la pantalla de Stock de cada local (valuation.ts), no una segunda definición.
//
// La abre también el encargado de la casa (RECEPTION): no hay costos ni plata en la pantalla,
// ni en lo que la action le devuelve.

type Columna = { id: string; nombre: string; esCasa: boolean };

function una(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** "12,5 kg" / "8 unidades". */
function cantidad(c: CeldaStock, f: FilaStock): string {
  const n = fmtNumberAR(c.stock, f.saleUnit === "WEIGHT" ? 2 : 0);
  return f.saleUnit === "WEIGHT" ? `${n} kg` : `${n} ${f.unidad || "unidades"}`;
}

function Celda({ c, f }: { c: CeldaStock | null; f: FilaStock }) {
  if (!c) return <span className="text-faint">No lo tiene</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={cn("tabular-nums", c.negativo ? "text-danger font-semibold" : c.bajo ? "text-warning font-semibold" : "text-strong")}>
        {cantidad(c, f)}
      </span>
      {c.negativo ? <Badge tone="danger">en negativo</Badge> : c.bajo ? <Badge tone="warning">bajo el mínimo</Badge> : null}
    </span>
  );
}

export default async function StockPorLocalPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; bajo?: string | string[] }>;
}) {
  const user = await requireApp("stock-por-local");
  const casa = await exigirCasa("stock:read");
  const titulo = "Stock por local";
  if (!casa.ok) {
    return (
      <PageContainer>
        <PageHeader title={titulo} />
        <NoEsCasa error={casa.error} noSeLeyo={casa.noSeLeyo} />
      </PageContainer>
    );
  }
  const r = await stockDeLaRedAction();
  if (!r.ok) {
    return (
      <PageContainer>
        <PageHeader title={titulo} />
        <NoSePudoLeer error={r.error} />
      </PageContainer>
    );
  }

  const sp = await searchParams;
  const q = una(sp.q)?.trim() ?? "";
  // El atajo a Traslados, con la misma regla que su guardia: un botón que rebota es un callejón.
  const veTraslados = appPermitida(appPorId("traslados"), await getNegocioApps(user.role));
  const soloBajo = una(sp.bajo) === "1";
  const filas = filtrarMatriz(r.filas, { q, soloBajo });
  const { stockBajo, stockNegativo } = r.resumen;

  // DISEÑO NUEVO («Renglón»): la matriz como libro, un renglón por producto. Mismos datos.
  if (await disenoNuevo()) {
    return (
      <main data-ui="pagina" className="mx-auto w-full px-4 py-6">
        <CabeceraStock casa={r.casa} bajo={stockBajo} negativo={stockNegativo.productos} locales={r.locales} />
        <SolapasLocales activa="stock-por-local" role={user.role} />
        <LocalesSinLeer sinLeer={r.sinLeer} ruta="/admin/locales/stock" />
        {r.locales === 0 ? (
          r.sinLeer.length === 0 && <SinLocales />
        ) : (
          <>
            <FiltroStock q={q} soloBajo={soloBajo} />
            {filas.length === 0 ? (
              <p className="py-3 text-sm text-muted">
                {r.filas.length === 0 ? (
                  "Ningún local tiene productos cargados todavía. Cuando cada local cargue su catálogo, acá aparece cuánto tiene de cada cosa."
                ) : (
                  <>
                    {"Nada con ese filtro. "}
                    <Link href="/admin/locales/stock" className="inline-flex min-h-11 items-center font-medium text-accent-ink underline underline-offset-2">
                      Ver todo el stock
                    </Link>
                  </>
                )}
              </p>
            ) : (
              <MatrizStock filas={filas} columnas={r.columnas} veTraslados={veTraslados} total={r.filas.length} />
            )}
          </>
        )}
      </main>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={titulo}
        badge={<Badge tone="accent">{r.casa}</Badge>}
        description={
          r.locales === 0
            ? undefined
            : `${fmtNumberAR(stockBajo.productos)} bajo el mínimo en ${fmtNumberAR(stockBajo.locales)} ${stockBajo.locales === 1 ? "local" : "locales"}` +
              (stockNegativo.productos > 0 ? ` · ${fmtNumberAR(stockNegativo.productos)} en negativo (hay que recontarlos en el local)` : "") +
              "."
        }
      />
      <SolapasLocales activa="stock-por-local" role={user.role} />
      <LocalesSinLeer sinLeer={r.sinLeer} ruta="/admin/locales/stock" />
      {r.locales === 0 ? (
        r.sinLeer.length === 0 && <SinLocales />
      ) : (
        <>
          <form method="get" className="mb-lg grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_auto]">
            <Field label="Buscar un producto" htmlFor="stock-q">
              <Input id="stock-q" name="q" defaultValue={q} placeholder="Escribí parte del nombre" autoComplete="off" />
            </Field>
            <label className="flex h-11 items-center gap-2 text-sm text-strong">
              <input type="checkbox" name="bajo" value="1" defaultChecked={soloBajo} className="size-5 accent-[var(--accent)]" />
              Sólo lo que falta
            </label>
            <Button type="submit" variant="outline">
              Ver
            </Button>
          </form>

          {filas.length === 0 ? (
            <EmptyState
              title={r.filas.length === 0 ? "Ningún local tiene productos cargados" : "Nada con ese filtro"}
              description={
                r.filas.length === 0
                  ? "Cuando cada local cargue su catálogo, acá aparece cuánto tiene de cada cosa."
                  : "Probá con otro nombre o sacá «Sólo lo que falta»."
              }
              action={
                r.filas.length === 0 ? (
                  <Link href="/admin" className={buttonClasses("outline", "md")}>
                    Ir al inicio
                  </Link>
                ) : (
                  <Link href="/admin/locales/stock" className={buttonClasses("outline", "md")}>
                    Ver todo el stock
                  </Link>
                )
              }
            />
          ) : (
            <>
              <Tarjetas filas={filas} columnas={r.columnas} veTraslados={veTraslados} />
              <Tabla filas={filas} columnas={r.columnas} veTraslados={veTraslados} />
            </>
          )}
        </>
      )}
    </PageContainer>
  );
}

/** "Trasladar" con el producto ya elegido en el formulario de traslado. */
function Trasladar({ f, className }: { f: FilaStock; className?: string }) {
  return (
    <Link
      href={`/admin/locales/traslados?producto=${encodeURIComponent(f.clave)}`}
      className={buttonClasses("outline", "md", className)}
    >
      Trasladar<span className="sr-only"> {f.nombre}</span>
    </Link>
  );
}

/** En el celular: una tarjeta por producto con cada local debajo (sin tabla ancha). */
function Tarjetas({ filas, columnas, veTraslados }: { filas: FilaStock[]; columnas: Columna[]; veTraslados: boolean }) {
  return (
    <ul className="space-y-3 md:hidden" aria-label="Stock de cada producto">
      {filas.map((f) => (
        <li key={f.clave}>
          <Card className="p-4">
            <p className="font-medium text-strong break-words">
              {f.nombre} <span className="text-xs font-normal text-muted">· {f.saleUnit === "WEIGHT" ? "por kilo" : "por unidad"}</span>
            </p>
            <dl className="mt-2 space-y-1.5">
              {columnas.map((col, i) => (
                <div key={col.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <dt className="text-muted">{col.esCasa ? `${col.nombre} (casa)` : col.nombre}</dt>
                  <dd>
                    <Celda c={f.celdas[i]} f={f} />
                  </dd>
                </div>
              ))}
            </dl>
            {veTraslados && columnas.length > 1 && <Trasladar f={f} className="mt-3 w-full" />}
          </Card>
        </li>
      ))}
    </ul>
  );
}

/** En pantallas anchas: la matriz producto × local. */
function Tabla({ filas, columnas, veTraslados }: { filas: FilaStock[]; columnas: Columna[]; veTraslados: boolean }) {
  const conTraslado = veTraslados && columnas.length > 1;
  return (
    <Card flush className="hidden overflow-x-auto md:block">
      <table className="w-full text-sm">
        <caption className="sr-only">Stock de cada producto en la casa y en cada local</caption>
        <thead>
          <tr className="border-b border-line text-left">
            <th scope="col" className="px-4 py-3 font-medium text-muted">
              Producto
            </th>
            {columnas.map((col) => (
              <th key={col.id} scope="col" className="px-4 py-3 font-medium text-muted">
                {col.nombre}
                {col.esCasa && <span className="block text-xs font-normal">casa</span>}
              </th>
            ))}
            {conTraslado && (
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">Trasladar</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {filas.map((f) => (
            <tr key={f.clave}>
              <th scope="row" className="px-4 py-2.5 text-left font-medium text-strong">
                {f.nombre}
                <span className="block text-xs font-normal text-muted">{f.saleUnit === "WEIGHT" ? "por kilo" : "por unidad"}</span>
              </th>
              {columnas.map((col, i) => (
                <td key={col.id} className="px-4 py-2.5">
                  <Celda c={f.celdas[i]} f={f} />
                </td>
              ))}
              {conTraslado && (
                <td className="px-4 py-2.5 text-right">
                  <Trasladar f={f} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
