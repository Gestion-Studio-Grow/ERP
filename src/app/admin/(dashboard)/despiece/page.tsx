import Link from "next/link";
import { requireUser } from "@/lib/authz";
import { requireApp } from "@/lib/require-app";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { fmtShortDate } from "@/lib/datetime";
import { leerEstadoLotesYDespiece } from "@/lib/carniceria/schema-probe";
import { listarDespieces } from "@/lib/carniceria/despiece-loader";
import { getProductExtras } from "@/lib/carniceria/product-extras";
import { costosFijadosAMano, esDeKilo, precioPorKiloDe, rendimientoDelPeriodo } from "@/lib/carniceria/despiece";
import { SELECT_INGRESOS, costosVigentesDe } from "@/lib/stock/costo";
import { getNegocioApps } from "@/apps/contexto.server";
import { appPermitida } from "@/apps/visibles";
import { appPorId } from "@/apps/registro";
import { PageHeader, EmptyState, KpiTile, buttonClasses, fmtMoneyARS } from "@/components/ui";
import DespieceClient, { type ProductoDeDespiece, type RunView } from "./DespieceClient";

export const dynamic = "force-dynamic";

const TITULO = "Despiece";
const DIAS_DE_RENDIMIENTO = 30;

// DESPIECE. Como Lotes: un negocio que vende perecederos y todavía no tiene la migración cárnica
// ve "En preparación" (MAGRA en producción hasta la ola 9), decidido antes de la guardia de la
// app; todo lo demás pasa por `requireApp`.
export default async function DespiecePage() {
  if ((await leerEstadoLotesYDespiece()) === "falta-migracion") {
    // Sólo un aviso fijo, sin un dato del negocio: alcanza con la sesión.
    await requireUser();
    return (
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
        <PageHeader title={TITULO} description="De la media res a los cortes, con el rendimiento real." />
        <EmptyState
          title="En preparación"
          description="El despiece con rendimiento y costo por corte se activa cuando se aplique la actualización de la base de tu negocio."
        />
      </main>
    );
  }
  const user = await requireApp("despiece");
  const tenantId = await getCurrentTenantId();
  const [runs, filas, extras, negocio] = await Promise.all([
    listarDespieces(tenantId),
    prisma.product.findMany({
      where: { tenantId, deletedAt: null, active: true },
      select: { id: true, name: true, unit: true, saleUnit: true, price: true, pricePerKg: true, stock: true, ...SELECT_INGRESOS },
      orderBy: { name: "asc" },
    }),
    getProductExtras(),
    getNegocioApps(user.role),
  ]);

  // Pieza y cortes se cuentan en kilos: un producto por unidad (una hamburguesa) no entra acá.
  const deKilo = filas.filter(esDeKilo);
  const costoDelCatalogo = new Map<string, number>();
  for (const [id, e] of extras) if (e.cost != null) costoDelCatalogo.set(id, e.cost);
  const costos = costosVigentesDe(deKilo, costoDelCatalogo);
  const products: ProductoDeDespiece[] = deKilo.map((p) => ({
    id: p.id,
    name: p.name,
    stock: p.stock,
    precioPorKg: precioPorKiloDe(p),
    costoPorKg: costos[p.id] ?? null,
  }));

  // El número de la pantalla: rendimiento de los últimos 30 días (kg obtenidos / kg de entrada).
  const desde = new Date().getTime() - DIAS_DE_RENDIMIENTO * 24 * 60 * 60 * 1000;
  const rendimiento = rendimientoDelPeriodo(runs.filter((r) => r.createdAt.getTime() >= desde));

  // Dato viejo: un costo fijado a mano en el catálogo le gana al del despiece (y hasta la ola 2
  // lo escribía el despiece mismo). Se avisa, no se borra.
  const nombre = new Map(filas.map((p) => [p.id, p.name]));
  const deCortes = new Set(runs.flatMap((r) => r.outputs.flatMap((o) => (o.productId ? [o.productId] : []))));
  const fijados = costosFijadosAMano(
    [...deCortes].map((id) => ({ id, nombre: nombre.get(id) ?? "Producto borrado", costoFijado: extras.get(id)?.cost ?? null })),
    runs.map((r) => ({
      code: r.code,
      createdAt: r.createdAt,
      costPerSellableKg: r.costPerSellableKg,
      productIds: r.outputs.flatMap((o) => (o.productId ? [o.productId] : [])),
    })),
  );
  const veCatalogo = appPermitida(appPorId("catalogo"), negocio);

  const runViews: RunView[] = runs.map((r) => ({
    id: r.id,
    code: r.code,
    inputName: r.inputName,
    inputWeightKg: r.inputWeightKg,
    inputCost: r.inputCost,
    totalOutputKg: r.totalOutputKg,
    mermaKg: r.mermaKg,
    mermaPct: r.inputWeightKg > 0 ? r.mermaKg / r.inputWeightKg : 0,
    costPerSellableKg: r.costPerSellableKg,
    createdAtLabel: fmtShortDate(r.createdAt),
    outputs: r.outputs,
  }));

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader
        title={TITULO}
        description="Cargá la pieza que entró (media res, cuarto o pieza al vacío) y los cortes que sacaste. Sale la pieza del stock, entra cada corte con su costo, y queda el rendimiento."
      />
      <div className="mb-6 grid grid-cols-2 gap-3">
        <KpiTile
          label={`Rendimiento ${DIAS_DE_RENDIMIENTO} días`}
          value={rendimiento === null ? "—" : `${Math.round(rendimiento * 100)}%`}
          sub={rendimiento === null ? "Sin despieces en los últimos 30 días" : "kilos de cortes sobre kilos de pieza"}
        />
        <KpiTile label="Despieces registrados" value={runs.length} />
      </div>

      {fijados.length > 0 && (
        <section
          aria-labelledby="costo-fijado"
          className="mb-6 rounded-lg border border-warning-soft bg-warning-soft/40 px-4 py-3 text-sm"
        >
          <h2 id="costo-fijado" className="font-medium text-strong">
            {fijados.length === 1 ? "Un corte tiene el costo fijado a mano" : `${fijados.length} cortes tienen el costo fijado a mano`}
          </h2>
          <p className="mt-1 text-muted">
            Ese costo manda sobre el que sale del despiece y de las compras. Si no lo pusiste vos, borralo en el catálogo y
            el corte pasa a tomar el costo de su último despiece o compra.
          </p>
          <ul className="mt-2 space-y-1">
            {fijados.map((f) => (
              <li key={f.productId} className="text-body">
                <span className="font-medium">{f.nombre}</span>: {fmtMoneyARS(f.costo)} el kilo
                {f.despiece
                  ? ` — lo fijó el despiece #${f.despiece.code} del ${fmtShortDate(f.despiece.fecha)}`
                  : " — fijado a mano en el catálogo"}
              </li>
            ))}
          </ul>
          {veCatalogo && (
            <Link href="/admin/catalogo" className={buttonClasses("outline", "md", "mt-3")}>
              Ir al catálogo
            </Link>
          )}
        </section>
      )}

      {products.length === 0 ? (
        <EmptyState
          title="No hay productos que se cuenten en kilos"
          description="La pieza y los cortes del despiece se cuentan en kilos. Cargalos en el catálogo como venta por peso y volvé."
          action={
            veCatalogo ? (
              <Link href="/admin/catalogo" className={buttonClasses("solid", "md")}>
                Ir al catálogo
              </Link>
            ) : undefined
          }
        />
      ) : (
        <DespieceClient runs={runViews} products={products} />
      )}
    </main>
  );
}
