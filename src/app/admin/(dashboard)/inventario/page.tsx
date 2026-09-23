import Link from "next/link";
import { requireCapability } from "@/lib/authz";
import { getActiveProfile } from "@/lib/profile-gating";
import { getCurrentTenantRubro } from "@/lib/carniceria/rubro";
import { getProductExtras } from "@/lib/carniceria/product-extras";
import { getInventory } from "@/lib/inventario/loader";
import { classifyCorte, categoriaMeta, CORTE_CATEGORIAS, type CorteCategoria } from "@/lib/carniceria/cortes";
import { PageHeader, EmptyState, Badge, fmtMoneyARS, buttonClasses } from "@/components/ui";
import { InventoryTable } from "@/components/inventario/InventoryTable";
import { getMermaDeLaSemana } from "@/lib/inventario/merma-loader";
import { cortesEnNegativo, renglonSinCosto, semanaHasta, type Renglon, type ResumenDeMerma, type Semana } from "@/lib/stock/merma-core";
import { formatearCantidad } from "@/lib/pos-peso";
import { todayInBusinessTz } from "@/lib/datetime";

export const dynamic = "force-dynamic";

function Stat({ label, value, hint, tone = "neutral" }: { label: string; value: string; hint?: string; tone?: "neutral" | "warning" }) {
  const toneClass = tone === "warning" ? "text-warning" : "text-strong";
  return (
    <div className="rounded-lg border border-line p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

// Inventario (recuento/valuación, ADR-060 D5). Se enciende para el rubro RETAIL/carnicería
// (Magra) además del canal Empresa: un mostrador vive del control de stock. En servicios (CH,
// no-retail, motor de perfiles OFF) queda EXACTAMENTE como antes ("En preparación") → nav y
// pantalla byte-idénticas. Read-only; los movimientos (ajuste/merma) viven en /admin/ajustes.
export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<{ hasta?: string | string[] }>;
}) {
  await requireCapability("catalog:read");
  const [profile, rubro] = await Promise.all([getActiveProfile(), getCurrentTenantRubro()]);

  // Gate: retail (Magra) O motor de perfiles encendido. CH (servicios) no cumple ninguno.
  if (!rubro.isRetail && profile === null) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8">
        <PageHeader title="Inventario" description="Niveles de stock y su valuación." />
        <EmptyState title="En preparación" description="El inventario valuado se activa junto con las nuevas funciones del panel." />
      </main>
    );
  }

  const [{ rows, summary }, extras, sp] = await Promise.all([getInventory(), getProductExtras(), searchParams]);

  // Merma de la semana y cortes en negativo: sólo retail (MAGRA). El perfil sin rubro retail
  // ve la pantalla como estaba.
  const hastaParam = Array.isArray(sp.hasta) ? sp.hasta[0] : sp.hasta;
  const hoy = todayInBusinessTz();
  const semana = rubro.isRetail ? semanaHasta(hastaParam, hoy) : null;
  const merma = semana ? await getMermaDeLaSemana(semana, { rows, extras }) : null;
  const negativos = rubro.isRetail ? cortesEnNegativo(rows) : [];

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader
        title="Inventario"
        description="Stock actual y su valuación por corte (solo lectura). La valuación usa el último costo de compra conocido."
      />

      <div className="mb-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Cortes / productos" value={String(summary.productos)} />
        <Stat label="Valuación total" value={fmtMoneyARS(summary.valuacionTotal)} />
        <Stat label="Stock bajo" value={String(summary.bajoStock)} tone={summary.bajoStock > 0 ? "warning" : "neutral"} hint="en o bajo el umbral" />
        <Stat label="Sin costo" value={String(summary.sinCosto)} hint="valuación incompleta" />
      </div>

      {/* Primero lo que está mal: un corte en negativo es una venta que salió con más de lo
          que el sistema creía que había. Hay que recontarlo antes de mirar cualquier otra cosa. */}
      {negativos.length > 0 && <CortesEnNegativo filas={negativos} />}

      {semana && merma && <MermaDeLaSemana semana={semana} merma={merma} hoy={hoy} />}

      {/* Acceso al tercer flujo del inventario: ajustes y MERMAS (recuento/rotura). */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-sunken px-4 py-3">
        <p className="text-sm text-muted">
          ¿Recontaste, tiraste algo o se echó a perder? Registrá un <span className="text-body font-medium">ajuste o merma</span> para que el stock quede fiel.
        </p>
        <Link href="/admin/ajustes" className={buttonClasses("outline", "sm")}>
          Registrar ajuste / merma
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="En preparación"
          description="El inventario valuado (niveles de stock + costo por corte) se muestra cuando cargues productos y compras."
        />
      ) : rubro.isRetail ? (
        // Vista por GÓNDOLA para carnicería: cada corte bajo su categoría (explícita o
        // derivada del nombre), con stock, último costo y valuación. Stock bajo resaltado.
        <CarniceriaInventory rows={rows} extras={extras} />
      ) : (
        <InventoryTable rows={rows} />
      )}
    </main>
  );
}

type Row = Awaited<ReturnType<typeof getInventory>>["rows"][number];

const recontarHref = (productId: string) =>
  `/admin/ajustes?producto=${encodeURIComponent(productId)}&motivo=RECUENTO`;

function CortesEnNegativo({ filas }: { filas: Row[] }) {
  return (
    <section aria-labelledby="negativos-titulo" className="mb-6 rounded-lg border border-danger/30 bg-danger-soft p-4">
      <h2 id="negativos-titulo" className="text-base font-semibold text-danger">
        {filas.length === 1 ? "1 corte en negativo" : `${filas.length} cortes en negativo`}
      </h2>
      <p className="mt-1 text-sm text-body">
        Se vendió más de lo que el sistema tenía cargado. Recontá estos cortes para que el stock vuelva a ser el real.
      </p>
      <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-surface-raised">
        {filas.map((r) => (
          <li key={r.productId} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="text-sm text-strong">
              {r.name}{" "}
              <span className="tabular-nums font-medium text-danger">
                {formatearCantidad(r.stock)} {r.unit}
              </span>
            </span>
            <Link href={recontarHref(r.productId)} className={buttonClasses("outline", "md")}>
              Recontar
            </Link>
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

function RenglonMerma({ titulo, detalle, r, tono }: { titulo: string; detalle: string; r: Renglon; tono: "neutral" | "danger" }) {
  const color = tono === "danger" && r.movimientos > 0 ? "text-danger" : "text-strong";
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-3">
      <span className="min-w-0">
        <span className={`block text-sm font-medium ${color}`}>{titulo}</span>
        <span className="block text-xs text-muted">{detalle}</span>
      </span>
      <span className="text-right tabular-nums">
        <span className={`block text-sm font-semibold ${color}`}>{cantidades(r)}</span>
        <span className={`block text-xs ${renglonSinCosto(r) ? "text-faint" : "text-body"}`}>{pesosDe(r)}</span>
      </span>
    </li>
  );
}

/** "2026-09-17" → "17/09". */
const ddmm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

function MermaDeLaSemana({ semana, merma, hoy }: { semana: Semana; merma: ResumenDeMerma & { truncado: boolean }; hoy: string }) {
  const pm = merma.mermaPorMotivo;
  const detalleMerma =
    (["Merma", "Vencimiento", "Rotura"] as const)
      .filter((m) => pm[m].kg !== 0 || pm[m].unidades !== 0)
      .map((m) => `${m}: ${cantidades(pm[m])}`)
      .join(" · ") || "Merma, vencimiento y rotura";
  const devoluciones = merma.excluidos["devolucion-anulacion"] + merma.excluidos["devolucion-edicion"];
  const rango = `del ${ddmm(semana.desde)} al ${ddmm(semana.hasta)}`;

  return (
    <section aria-labelledby="merma-titulo" className="mb-6 rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="merma-titulo" className="text-base font-semibold text-strong">
            Merma y faltante {semana.esLaActual ? "de los últimos 7 días" : "de la semana"}
          </h2>
          <p className="text-xs text-muted">{rango} · a costo vigente</p>
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
        <RenglonMerma titulo="Merma declarada" detalle={detalleMerma} r={merma.merma} tono="neutral" />
        <RenglonMerma
          titulo="Faltante de recuento"
          detalle="Lo que el sistema tenía y al contar no estaba. No se explica: es lo que hay que mirar."
          r={merma.faltante}
          tono="danger"
        />
        <RenglonMerma titulo="Sobrante de recuento" detalle="Al contar había más de lo cargado." r={merma.sobrante} tono="neutral" />
        {merma.otro.movimientos > 0 && (
          <RenglonMerma titulo="Otras correcciones" detalle="Ajustes con motivo Otro, neto con su signo." r={merma.otro} tono="neutral" />
        )}
      </ul>

      {merma.top.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-strong">Los cortes que más pierden</h3>
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
      {merma.perdidaSinCosto.length > 0 && (
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
      {merma.truncado && (
        <p className="mt-2 text-xs text-warning">Hay más movimientos de los que entran en este resumen: la semana está incompleta.</p>
      )}
    </section>
  );
}

function CarniceriaInventory({
  rows,
  extras,
}: {
  rows: Row[];
  extras: Map<string, { category: string | null; cost: number | null }>;
}) {
  const VALID = new Set<CorteCategoria>(CORTE_CATEGORIAS.map((c) => c.id));
  const catOf = (r: Row): CorteCategoria => {
    const explicit = extras.get(r.productId)?.category;
    if (explicit && VALID.has(explicit as CorteCategoria)) return explicit as CorteCategoria;
    return classifyCorte(r.name);
  };
  const grupos = CORTE_CATEGORIAS.map((c) => ({
    categoria: c,
    items: rows.filter((r) => catOf(r) === c.id),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-8">
      {grupos.map(({ categoria, items }) => (
        <div key={categoria.id}>
          <div className="flex items-baseline gap-2 mb-2">
            <span aria-hidden className="text-accent">{categoriaMeta(categoria.id).glyph}</span>
            <h2 className="text-base font-semibold text-strong">{categoria.label}</h2>
            <span className="text-xs text-faint">{items.length} corte{items.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="sm:overflow-x-auto sm:rounded-lg sm:border sm:border-line">
            <table className="block sm:table w-full text-left">
              <thead className="hidden sm:table-header-group">
                <tr className="border-b bg-surface-sunken text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2 font-medium">Corte</th>
                  <th className="px-4 py-2 font-medium">Stock</th>
                  <th className="px-4 py-2 font-medium">Último costo</th>
                  <th className="px-4 py-2 font-medium text-right">Valuación</th>
                </tr>
              </thead>
              <tbody className="block sm:table-row-group">
                {items.map((r) => (
                  <tr key={r.productId} className="block sm:table-row rounded-lg border sm:border-0 sm:border-b sm:rounded-none sm:last:border-b-0 mb-3 sm:mb-0 px-3 py-2.5 sm:px-0 sm:py-0">
                    <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm text-strong">{r.name}</td>
                    <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm">
                      <span className="sm:hidden text-xs uppercase tracking-wide text-faint mr-1.5">Stock:</span>
                      <span className={`tabular-nums ${r.belowLowStock ? "text-danger font-medium" : "text-body"}`}>
                        {r.stock} {r.unit}
                      </span>
                      {r.belowLowStock && <Badge tone="danger" className="ml-2">Stock bajo</Badge>}
                    </td>
                    <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm tabular-nums text-body">
                      <span className="sm:hidden text-xs uppercase tracking-wide text-faint mr-1.5">Costo:</span>
                      {r.sinCosto ? <span className="text-faint">sin costo</span> : `${fmtMoneyARS(r.unitCost)}/${r.unit}`}
                    </td>
                    <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm tabular-nums sm:text-right text-body">
                      <span className="sm:hidden text-xs uppercase tracking-wide text-faint mr-1.5">Valuación:</span>
                      {r.sinCosto ? "—" : fmtMoneyARS(r.valuation)}
                    </td>
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
