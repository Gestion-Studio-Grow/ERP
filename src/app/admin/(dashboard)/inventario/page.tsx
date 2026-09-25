import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { getNegocioApps } from "@/apps/contexto.server";
import { appPermitida } from "@/apps/visibles";
import { appPorId } from "@/apps/registro";
import { getProductExtras } from "@/lib/carniceria/product-extras";
import { getInventory } from "@/lib/inventario/loader";
import type { InventoryRow } from "@/lib/inventario/valuation";
import { classifyCorte, categoriaMeta, CORTE_CATEGORIAS, type CorteCategoria } from "@/lib/carniceria/cortes";
import { PageHeader, EmptyState, Badge, fmtMoneyARS, buttonClasses, AvisoError, Bloque, Renglon as RenglonUI, Seccion, Plata } from "@/components/ui";
import { getMermaDeLaSemana } from "@/lib/inventario/merma-loader";
import { cortesEnNegativo, renglonSinCosto, semanaHasta, MOTIVOS_DE_MERMA, type Renglon, type ResumenDeMerma, type Semana } from "@/lib/stock/merma-core";
import { hrefMovimientos } from "@/lib/inventario/movimientos";
import { formatearCantidad } from "@/lib/pos-peso";
import { todayInBusinessTz } from "@/lib/datetime";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { getCurrentTenantRubro } from "@/lib/carniceria/rubro";
import { vocabularioDelRubro } from "../catalogo/vocabulario";
import StockRenglon from "./StockRenglon";
import { aFilaDeStock, hrefContar, leerParametrosStock, paginaDeStock } from "./stock-core";

export const dynamic = "force-dynamic";

function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  className = "",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "warning";
  className?: string;
}) {
  const toneClass = tone === "warning" ? "text-warning" : "text-strong";
  // `min-w-0` + `break-words`: una cifra que no entra en la columna se corta en dos renglones
  // en vez de estirar la tarjeta y empujar la página de costado.
  return (
    <div className={`min-w-0 rounded-lg border border-line p-4 ${className}`}>
      <p className="text-sm text-muted">{label}</p>
      <p className={`break-words text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

// STOCK (ADR-060 D5): qué hay de cada producto y cuánto vale, a COSTO VIGENTE (el mismo número
// que el Catálogo y el Margen, stock/costo.ts). Es de mostrador: la guardia de la app
// (`requireApp`) deja afuera a un negocio de servicios con el mismo criterio que el menú.
// Quien no tiene `costs:read` (el encargado) ve cantidades, avisos y mermas en kilos, sin un
// peso: los costos ni se leen para esa persona. Read-only; los movimientos (merma, recuento)
// viven en sus apps.
export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireApp("inventario");
  const [{ rows, summary, conCostos }, extras, sp, negocio] = await Promise.all([
    getInventory(),
    getProductExtras(),
    searchParams,
    getNegocioApps(user.role),
  ]);
  const puede = {
    recontar: appPermitida(appPorId("recuento"), negocio),
    mermas: appPermitida(appPorId("mermas"), negocio),
    movimientos: appPermitida(appPorId("movimientos"), negocio),
  };

  // Merma de la semana y productos en negativo (la definición única: controlan stock y
  // quedaron bajo cero).
  const hastaParam = Array.isArray(sp.hasta) ? sp.hasta[0] : sp.hasta;
  const hoy = todayInBusinessTz();
  const semana = semanaHasta(hastaParam, hoy);
  const merma = await getMermaDeLaSemana(semana, { rows, conCostos });
  const negativos = cortesEnNegativo(rows.filter((r) => r.negative));
  const recontarHref = (productId: string) =>
    puede.recontar
      ? `/admin/ajustes/recuento?producto=${encodeURIComponent(productId)}`
      : `/admin/ajustes?producto=${encodeURIComponent(productId)}&motivo=RECUENTO`;

  if (await disenoNuevo()) {
    const carniceria = vocabularioDelRubro((await getCurrentTenantRubro()).rubro).carniceria;
    const todas = rows.map((r) => ({
      ...aFilaDeStock(r, extras.get(r.productId)?.category, carniceria),
      contar: hrefContar(r.productId, puede),
      movimientos: puede.movimientos ? hrefMovimientos({ producto: r.productId }) : null,
    }));
    const p = leerParametrosStock(sp, conCostos);
    const pag = paginaDeStock(todas, p);
    return (
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
        {/* En el celular: el título y «Contar» (la tecla de Stock) en una fila, sin párrafo de
            ayuda; «Cargar merma» y «Movimientos» van al «⋯» de la lista (StockRenglon). */}
        <PageHeader
          title="Stock"
          className="max-sm:mb-4 max-sm:flex-row max-sm:items-center max-sm:justify-between"
          actions={
            <>
              {puede.recontar && (
                <Link href="/admin/ajustes/recuento" className={buttonClasses("solid", "md")}>
                  Contar
                </Link>
              )}
              {puede.mermas && (
                <Link href="/admin/ajustes" className={buttonClasses("outline", "md") + " max-sm:hidden"}>
                  Cargar merma
                </Link>
              )}
              {puede.movimientos && (
                <Link href="/admin/inventario/movimientos" className={buttonClasses("outline", "md") + " max-sm:hidden"}>
                  Movimientos
                </Link>
              )}
            </>
          }
        />

        {negativos.length > 0 && p.vista !== "negativo" && (
          <AvisoError
            tono="aviso"
            className="mb-4"
            titulo={negativos.length === 1 ? "1 producto en negativo" : `${negativos.length} productos en negativo`}
            comoSeguir="Se vendió más de lo que había cargado. Contalos para que el stock vuelva a ser el real."
            accion={
              <Link href="/admin/inventario?vista=negativo" className={buttonClasses("outline", "md")}>
                {negativos.length === 1 ? "Verlo" : `Ver los ${negativos.length}`}
              </Link>
            }
          />
        )}

        {rows.length === 0 ? (
          <EmptyState
            title="Todavía no hay productos que se cuenten"
            description="El stock aparece cuando cargues productos en el catálogo y registres lo que llega del proveedor."
            action={
              <Link href="/admin/compras" className={buttonClasses("solid", "md")}>
                Recibir mercadería
              </Link>
            }
          />
        ) : (
          <StockRenglon
            filas={pag.filas}
            coinciden={pag.coinciden}
            conBusqueda={pag.conBusqueda}
            total={todas.length}
            pagina={pag.pagina}
            paginas={pag.paginas}
            porVista={pag.porVista}
            q={p.q}
            vista={p.vista}
            conCostos={conCostos}
            carniceria={carniceria}
            valuacionTotal={summary.valuacionTotal}
            sinCosto={summary.sinCosto}
            masAcciones={[
              ...(puede.mermas ? [{ etiqueta: "Cargar merma", href: "/admin/ajustes" }] : []),
              ...(puede.movimientos ? [{ etiqueta: "Movimientos", href: "/admin/inventario/movimientos" }] : []),
            ]}
          />
        )}

        <MermaRenglon semana={semana} merma={merma} hoy={hoy} conCostos={conCostos} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader
        title="Stock"
        description={
          conCostos
            ? "Stock actual y su valuación por producto, al costo vigente (el mismo que usan el Catálogo y el Margen)."
            : "Stock actual de cada producto y lo que está bajo el mínimo."
        }
      />

      <div className="mb-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Productos" value={String(summary.productos)} />
        {/* En el celular, la valuación va arriba y a lo ancho: "$ 25.312.480,50" no entra en media
            pantalla (medido a 412 px: la página quedaba 13 px más ancha que el teléfono). En la PC,
            en su lugar de siempre. */}
        {conCostos && (
          <Stat
            label="Valuación total"
            value={fmtMoneyARS(summary.valuacionTotal)}
            className="order-first col-span-2 lg:order-none lg:col-span-1"
          />
        )}
        <Stat label="Stock bajo" value={String(summary.bajoStock)} tone={summary.bajoStock > 0 ? "warning" : "neutral"} hint="en el mínimo o por debajo" />
        {conCostos ? (
          <Stat label="Sin costo" value={String(summary.sinCosto)} hint="con stock y sin costo: valuación incompleta" />
        ) : (
          <Stat label="En negativo" value={String(summary.enNegativo)} tone={summary.enNegativo > 0 ? "warning" : "neutral"} hint="hay que recontarlos" />
        )}
      </div>

      {/* Primero lo que está mal: un producto en negativo es una venta que salió con más de lo
          que el sistema creía que había. Hay que recontarlo antes de mirar cualquier otra cosa. */}
      {negativos.length > 0 && <EnNegativo filas={negativos} recontarHref={recontarHref} puedeRecontar={puede.recontar || puede.mermas} />}

      <MermaDeLaSemana semana={semana} merma={merma} hoy={hoy} conCostos={conCostos} />

      {/* Accesos a lo que mueve el stock por fuera de la venta y la compra. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-sunken px-4 py-3">
        <p className="text-sm text-muted">
          ¿Contaste, tiraste algo o se echó a perder? Registralo para que el stock quede fiel.
        </p>
        <div className="flex flex-wrap gap-2">
          {puede.recontar && (
            <Link href="/admin/ajustes/recuento" className={buttonClasses("outline", "md")}>
              Recuento
            </Link>
          )}
          {puede.mermas && (
            <Link href="/admin/ajustes" className={buttonClasses("outline", "md")}>
              Cargar merma
            </Link>
          )}
          {puede.movimientos && (
            <Link href="/admin/inventario/movimientos" className={buttonClasses("outline", "md")}>
              Movimientos
            </Link>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Todavía no hay productos"
          description="El stock se muestra cuando cargues productos en el catálogo y registres lo que llega del proveedor."
          action={
            <Link href="/admin/compras" className={buttonClasses("solid", "md")}>
              Recibir mercadería
            </Link>
          }
        />
      ) : (
        // Vista por GÓNDOLA (Stock es de mostrador): cada producto bajo su categoría (explícita
        // o derivada del nombre), con stock, costo vigente y valuación. Stock bajo resaltado.
        <PorGondola rows={rows} extras={extras} conCostos={conCostos} conMovimientos={puede.movimientos} />
      )}
    </main>
  );
}

function EnNegativo({
  filas,
  recontarHref,
  puedeRecontar,
}: {
  filas: InventoryRow[];
  recontarHref: (id: string) => string;
  puedeRecontar: boolean;
}) {
  return (
    <section aria-labelledby="negativos-titulo" className="mb-6 rounded-lg border border-danger/30 bg-danger-soft p-4">
      <h2 id="negativos-titulo" className="text-base font-semibold text-danger">
        {filas.length === 1 ? "1 producto en negativo" : `${filas.length} productos en negativo`}
      </h2>
      <p className="mt-1 text-sm text-body">
        Se vendió más de lo que el sistema tenía cargado. Recontalos para que el stock vuelva a ser el real.
      </p>
      <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-surface-raised">
        {filas.map((r) => (
          <li key={r.productId} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
            <span className="text-sm text-strong">
              {r.name}{" "}
              <span className="tabular-nums font-medium text-danger">
                {formatearCantidad(r.stock)} {r.unit}
              </span>
            </span>
            {puedeRecontar && (
              <Link href={recontarHref(r.productId)} className={buttonClasses("outline", "md")}>
                Recontar
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "1,5 kg · 3 u" — kilos y unidades no se suman entre sí. */
function cantidades(r: { kg: number; unidades: number }): string {
  const partes: string[] = [];
  if (r.kg !== 0) partes.push(`${formatearCantidad(r.kg)} kg`);
  if (r.unidades !== 0) partes.push(`${formatearCantidad(r.unidades)} u`);
  return partes.length > 0 ? partes.join(" · ") : "0";
}

/** Pesos de un renglón: "sin costo" si no se pudo valuar nada; nunca un $0 inventado. */
function pesosDe(r: Renglon): string {
  if (r.movimientos === 0) return fmtMoneyARS(0);
  if (renglonSinCosto(r)) return "sin costo";
  return r.sinCosto > 0 ? `${fmtMoneyARS(r.pesos)} + ${r.sinCosto} sin costo` : fmtMoneyARS(r.pesos);
}

function RenglonMerma({
  titulo,
  detalle,
  r,
  tono,
  conCostos,
}: {
  titulo: string;
  detalle: string;
  r: Renglon;
  tono: "neutral" | "danger";
  conCostos: boolean;
}) {
  const color = tono === "danger" && r.movimientos > 0 ? "text-danger" : "text-strong";
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-3">
      <span className="min-w-0">
        <span className={`block text-sm font-medium ${color}`}>{titulo}</span>
        <span className="block text-xs text-muted">{detalle}</span>
      </span>
      <span className="text-right tabular-nums">
        <span className={`block text-sm font-semibold ${color}`}>{cantidades(r)}</span>
        {conCostos && (
          <span className={`block text-xs ${renglonSinCosto(r) ? "text-faint" : "text-body"}`}>{pesosDe(r)}</span>
        )}
      </span>
    </li>
  );
}

/** "2026-09-17" → "17/09". */
const ddmm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

function MermaDeLaSemana({
  semana,
  merma,
  hoy,
  conCostos,
}: {
  semana: Semana;
  merma: ResumenDeMerma & { truncado: boolean };
  hoy: string;
  conCostos: boolean;
}) {
  const pm = merma.mermaPorMotivo;
  const detalleMerma =
    MOTIVOS_DE_MERMA.filter((m) => pm[m].kg !== 0 || pm[m].unidades !== 0)
      .map((m) => `${m}: ${cantidades(pm[m])}`)
      .join(" · ") || "Merma, vencimiento, rotura, decomiso, consumo interno y degustación";
  const devoluciones = merma.excluidos["devolucion-anulacion"] + merma.excluidos["devolucion-edicion"];
  const rango = `del ${ddmm(semana.desde)} al ${ddmm(semana.hasta)}`;

  return (
    <section aria-labelledby="merma-titulo" className="mb-6 rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="merma-titulo" className="text-base font-semibold text-strong">
            Merma y faltante {semana.esLaActual ? "de los últimos 7 días" : "de la semana"}
          </h2>
          <p className="text-xs text-muted">
            {rango}
            {conCostos && " · a costo del día de cada movimiento"}
          </p>
        </div>
        <nav aria-label="Elegir semana" className="flex gap-2">
          <Link href={`/admin/inventario?hasta=${semana.anterior}`} className={buttonClasses("outline", "md")}>
            ‹ Anterior
          </Link>
          {semana.siguiente && (
            <Link
              href={semana.siguiente === hoy ? "/admin/inventario" : `/admin/inventario?hasta=${semana.siguiente}`}
              className={buttonClasses("outline", "md")}
            >
              Siguiente ›
            </Link>
          )}
        </nav>
      </div>

      <ul className="mt-3 divide-y divide-line rounded-md border border-line">
        <RenglonMerma titulo="Merma declarada" detalle={detalleMerma} r={merma.merma} tono="neutral" conCostos={conCostos} />
        <RenglonMerma
          titulo="Faltante de recuento"
          detalle="Lo que el sistema tenía y al contar no estaba. No se explica: es lo que hay que mirar."
          r={merma.faltante}
          tono="danger"
          conCostos={conCostos}
        />
        <RenglonMerma
          titulo="Sobrante de recuento"
          detalle="Al contar había más de lo cargado."
          r={merma.sobrante}
          tono="neutral"
          conCostos={conCostos}
        />
        {merma.otro.movimientos > 0 && (
          <RenglonMerma
            titulo="Otras correcciones"
            detalle="Ajustes con motivo Otro, neto con su signo."
            r={merma.otro}
            tono="neutral"
            conCostos={conCostos}
          />
        )}
      </ul>

      {conCostos && merma.top.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-strong">Los que más pierden</h3>
          <ol className="mt-2 divide-y divide-line rounded-md border border-line">
            {merma.top.map((c) => (
              <li key={c.productId} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2 text-sm">
                <span className="text-strong">{c.nombre}</span>
                <span className="tabular-nums text-body">
                  {c.merma > 0 && `merma ${formatearCantidad(c.merma)} ${c.kilo ? "kg" : "u"}`}
                  {c.merma > 0 && c.faltante > 0 && " · "}
                  {c.faltante > 0 && <span className="text-danger">faltante {formatearCantidad(c.faltante)} {c.kilo ? "kg" : "u"}</span>}
                  {" · "}
                  <span className="font-medium text-strong">{fmtMoneyARS(c.pesos)}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {conCostos && merma.perdidaSinCosto.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          Con pérdida y sin costo cargado (no se pueden ordenar en pesos):{" "}
          {merma.perdidaSinCosto.map((c) => `${c.nombre} ${formatearCantidad(c.merma + c.faltante)} ${c.kilo ? "kg" : "u"}`).join(" · ")}.
        </p>
      )}
      {devoluciones > 0 && (
        <p className="mt-2 text-xs text-faint">
          No se cuentan {devoluciones === 1 ? "1 devolución" : `${devoluciones} devoluciones`} de ventas anuladas o pedidos
          reajustados: esa mercadería volvió, no sobró.
        </p>
      )}
      {merma.excluidos.traslado > 0 && (
        <p className="mt-2 text-xs text-faint">
          {merma.excluidos.traslado === 1 ? "1 traslado" : `${merma.excluidos.traslado} traslados`} a otros locales: no{" "}
          {merma.excluidos.traslado === 1 ? "es" : "son"} merma, la mercadería se mudó.
        </p>
      )}
      {merma.excluidos.despiece > 0 && (
        <p className="mt-2 text-xs text-faint">
          {merma.excluidos.despiece === 1 ? "1 pieza despostada" : `${merma.excluidos.despiece} piezas despostadas`}: no{" "}
          {merma.excluidos.despiece === 1 ? "es" : "son"} merma, se convirtieron en cortes.
        </p>
      )}
      {merma.truncado && (
        <p className="mt-2 text-xs text-warning">Hay más movimientos de los que entran en este resumen: la semana está incompleta.</p>
      )}
    </section>
  );
}

function PorGondola({
  rows,
  extras,
  conCostos,
  conMovimientos,
}: {
  rows: InventoryRow[];
  extras: Map<string, { category: string | null; cost: number | null }>;
  conCostos: boolean;
  conMovimientos: boolean;
}) {
  const VALID = new Set<CorteCategoria>(CORTE_CATEGORIAS.map((c) => c.id));
  const catOf = (r: InventoryRow): CorteCategoria => {
    const explicit = extras.get(r.productId)?.category;
    if (explicit && VALID.has(explicit as CorteCategoria)) return explicit as CorteCategoria;
    return classifyCorte(r.name);
  };
  const grupos = CORTE_CATEGORIAS.map((c) => ({
    categoria: c,
    items: rows.filter((r) => catOf(r) === c.id).sort((a, b) => a.name.localeCompare(b.name, "es")),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-8">
      {grupos.map(({ categoria, items }) => (
        <div key={categoria.id}>
          <div className="flex items-baseline gap-2 mb-2">
            <span aria-hidden className="text-accent">{categoriaMeta(categoria.id).glyph}</span>
            <h2 className="text-base font-semibold text-strong">{categoria.label}</h2>
            <span className="text-xs text-faint">{items.length} producto{items.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="sm:overflow-x-auto sm:rounded-lg sm:border sm:border-line">
            <table className="block sm:table w-full text-left">
              <thead className="hidden sm:table-header-group">
                <tr className="border-b bg-surface-sunken text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2 font-medium">Producto</th>
                  <th className="px-4 py-2 font-medium">Stock</th>
                  {conCostos && <th className="px-4 py-2 font-medium">Costo</th>}
                  {conCostos && <th className="px-4 py-2 font-medium text-right">Valuación</th>}
                  {conMovimientos && <th className="px-4 py-2 font-medium"><span className="sr-only">Movimientos</span></th>}
                </tr>
              </thead>
              <tbody className="block sm:table-row-group">
                {items.map((r) => (
                  <tr key={r.productId} className="block sm:table-row rounded-lg border sm:border-0 sm:border-b sm:rounded-none sm:last:border-b-0 mb-3 sm:mb-0 px-3 py-2.5 sm:px-0 sm:py-0">
                    <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm text-strong">{r.name}</td>
                    <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm">
                      <span className="sm:hidden text-xs uppercase tracking-wide text-faint mr-1.5">Stock:</span>
                      <span className={`tabular-nums ${r.belowLowStock ? "text-danger font-medium" : "text-body"}`}>
                        {formatearCantidad(r.stock)} {r.unit}
                      </span>
                      {r.belowLowStock && <Badge tone="danger" className="ml-2">Stock bajo</Badge>}
                    </td>
                    {conCostos && (
                      <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm tabular-nums text-body">
                        <span className="sm:hidden text-xs uppercase tracking-wide text-faint mr-1.5">Costo:</span>
                        {r.sinCosto ? <span className="text-faint">sin costo</span> : `${fmtMoneyARS(r.unitCost)}/${r.unit}`}
                      </td>
                    )}
                    {conCostos && (
                      <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm tabular-nums sm:text-right text-body">
                        <span className="sm:hidden text-xs uppercase tracking-wide text-faint mr-1.5">Valuación:</span>
                        {r.sinCosto ? "—" : fmtMoneyARS(r.valuation)}
                      </td>
                    )}
                    {conMovimientos && (
                      <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-1.5 text-sm sm:text-right">
                        <Link
                          href={hrefMovimientos({ producto: r.productId })}
                          className="inline-flex min-h-11 items-center text-accent underline-offset-2 hover:underline"
                        >
                          Movimientos
                        </Link>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Diseño nuevo («Renglón») ────────────────────────────────────────────────────────────────────
// La semana de pérdidas como renglones del cuaderno, no como tarjeta: los mismos números que
// `MermaDeLaSemana` (getMermaDeLaSemana), la misma semana en la URL (?hasta=).

/** Los renglones de la semana no tienen folio: sin esto, el hueco del folio los corre a la derecha. */
const SIN_FOLIO = "[&>[data-parte=folio]:empty]:hidden";

function CifraMerma({ r, tono, conCostos }: { r: Renglon; tono: "neutral" | "danger"; conCostos: boolean }) {
  const color = tono === "danger" && r.movimientos > 0 ? "text-danger" : "text-strong";
  return (
    <span className="block text-right tabular-nums">
      <span className={`block font-semibold ${color}`}>{cantidades(r)}</span>
      {conCostos && <span className={`block text-[13px] ${renglonSinCosto(r) ? "text-muted" : "text-body"}`}>{pesosDe(r)}</span>}
    </span>
  );
}

function MermaRenglon({
  semana,
  merma,
  hoy,
  conCostos,
}: {
  semana: Semana;
  merma: ResumenDeMerma & { truncado: boolean };
  hoy: string;
  conCostos: boolean;
}) {
  const pm = merma.mermaPorMotivo;
  const detalleMerma =
    MOTIVOS_DE_MERMA.filter((m) => pm[m].kg !== 0 || pm[m].unidades !== 0)
      .map((m) => `${m}: ${cantidades(pm[m])}`)
      .join(" · ") || "Merma, vencimiento, rotura, decomiso, consumo interno y degustación";
  const devoluciones = merma.excluidos["devolucion-anulacion"] + merma.excluidos["devolucion-edicion"];
  const notas: string[] = [];
  if (devoluciones > 0)
    notas.push(
      `No se cuentan ${devoluciones === 1 ? "1 devolución" : `${devoluciones} devoluciones`} de ventas anuladas o pedidos reajustados: esa mercadería volvió, no sobró.`,
    );
  if (merma.excluidos.traslado > 0)
    notas.push(
      `${merma.excluidos.traslado === 1 ? "1 traslado" : `${merma.excluidos.traslado} traslados`} a otros locales: no ${merma.excluidos.traslado === 1 ? "es" : "son"} merma, la mercadería se mudó.`,
    );
  if (merma.excluidos.despiece > 0)
    notas.push(
      `${merma.excluidos.despiece === 1 ? "1 pieza despostada" : `${merma.excluidos.despiece} piezas despostadas`}: no ${merma.excluidos.despiece === 1 ? "es" : "son"} merma, se convirtieron en cortes.`,
    );

  return (
    <Bloque id="merma" titulo={`Merma y faltante ${semana.esLaActual ? "de los últimos 7 días" : "de la semana"}`} className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
        <p className="text-[13px] text-muted">
          Del {ddmm(semana.desde)} al {ddmm(semana.hasta)}
          {conCostos && " · a costo del día de cada movimiento"}
        </p>
        <nav aria-label="Elegir semana" className="flex gap-2">
          <Link href={`/admin/inventario?hasta=${semana.anterior}#merma`} className={buttonClasses("ghost", "md")}>
            ‹ Anterior
          </Link>
          {semana.siguiente && (
            <Link
              href={semana.siguiente === hoy ? "/admin/inventario#merma" : `/admin/inventario?hasta=${semana.siguiente}#merma`}
              className={buttonClasses("ghost", "md")}
            >
              Siguiente ›
            </Link>
          )}
        </nav>
      </div>
      <RenglonUI className={SIN_FOLIO} titulo="Merma declarada" detalle={detalleMerma} plata={<CifraMerma r={merma.merma} tono="neutral" conCostos={conCostos} />} />
      <RenglonUI
        titulo="Faltante de recuento"
        detalle="Lo que el sistema tenía y al contar no estaba. No se explica: es lo que hay que mirar."
        plata={<CifraMerma r={merma.faltante} tono="danger" conCostos={conCostos} />}
      />
      <RenglonUI
        titulo="Sobrante de recuento"
        detalle="Al contar había más de lo cargado."
        plata={<CifraMerma r={merma.sobrante} tono="neutral" conCostos={conCostos} />}
      />
      {merma.otro.movimientos > 0 && (
        <RenglonUI
          className={SIN_FOLIO}
          titulo="Otras correcciones"
          detalle="Ajustes con motivo Otro, neto con su signo."
          plata={<CifraMerma r={merma.otro} tono="neutral" conCostos={conCostos} />}
        />
      )}

      {conCostos && merma.top.length > 0 && (
        <Seccion titulo="Los que más pierden" className="mt-6">
          <ol>
            {merma.top.map((c, i) => (
              <RenglonUI
                key={c.productId}
                folio={`${i + 1}.`}
                as="li"
                titulo={c.nombre}
                detalle={
                  <>
                    {c.merma > 0 && `merma ${formatearCantidad(c.merma)} ${c.kilo ? "kg" : "u"}`}
                    {c.merma > 0 && c.faltante > 0 && " · "}
                    {c.faltante > 0 && <span className="text-danger">faltante {formatearCantidad(c.faltante)} {c.kilo ? "kg" : "u"}</span>}
                  </>
                }
                plata={c.pesos != null ? <Plata valor={c.pesos} /> : <span className="text-muted">—</span>}
              />
            ))}
          </ol>
        </Seccion>
      )}
      {conCostos && merma.perdidaSinCosto.length > 0 && (
        <p className="mt-2 text-[13px] text-muted">
          Con pérdida y sin costo cargado (no se pueden ordenar en pesos):{" "}
          {merma.perdidaSinCosto.map((c) => `${c.nombre} ${formatearCantidad(c.merma + c.faltante)} ${c.kilo ? "kg" : "u"}`).join(" · ")}.
        </p>
      )}
      {notas.map((n) => (
        <p key={n} className="mt-2 text-[13px] text-muted">
          {n}
        </p>
      ))}
      {merma.truncado && (
        <p className="mt-2 text-[13px] font-medium text-warning">Hay más movimientos de los que entran en este resumen: la semana está incompleta.</p>
      )}
    </Bloque>
  );
}
