import { requireUser } from "@/lib/authz";
import { requireApp } from "@/lib/require-app";
import { roleHasCapability } from "@/lib/capabilities";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { todayInBusinessTz } from "@/lib/datetime";
import { leerEstadoLotesYDespiece } from "@/lib/carniceria/schema-probe";
import { listarLotes } from "@/lib/carniceria/lotes-loader";
import {
  avgPackageWeight,
  daysUntil,
  diaDelLote,
  expiryState,
  fmtDia,
  plataEnRiesgo,
  summarizeBatches,
} from "@/lib/carniceria/lotes";
import { whereProveedoresActivos } from "@/lib/suppliers/supplier";
import { PageHeader, EmptyState, Marca, PageContainer, buttonClasses, fmtMoneyARS } from "@/components/ui";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import LotesClient, { type LoteView } from "./LotesClient";

export const dynamic = "force-dynamic";

const TITULO = "Lotes y vencimientos";

// LOTES Y VENCIMIENTOS. Un negocio que vende perecederos y todavía no tiene la migración cárnica
// ve "En preparación" (así sigue MAGRA en producción hasta la ola 9): se decide ANTES de la
// guardia de la app, porque `requireApp` lo mandaría a "App no disponible" con un porqué menos
// claro. Todo lo demás pasa por `requireApp` (rol, módulo, rubro de perecederos y migración).
export default async function LotesPage() {
  if ((await leerEstadoLotesYDespiece()) === "falta-migracion") {
    // Sólo un aviso fijo, sin un dato del negocio: alcanza con la sesión.
    await requireUser();
    if (await disenoNuevo()) {
      return (
        <PageContainer width="narrow">
          <PageHeader title={TITULO} estado={["En preparación"]} />
          <p data-ui="vacio" className="border-y border-line py-4 text-sm text-body">
            Los lotes al vacío se activan cuando se aplique la actualización de la base de tu negocio. Mientras tanto, los vencimientos se siguen controlando como hasta ahora.
          </p>
        </PageContainer>
      );
    }
    return (
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
        <PageHeader title={TITULO} description="Trazabilidad, vencimientos y peso de cada lote al vacío." />
        <EmptyState
          title="En preparación"
          description="Los lotes al vacío se activan cuando se aplique la actualización de la base de tu negocio. Mientras tanto, los vencimientos se siguen controlando como hasta ahora."
        />
      </main>
    );
  }
  const user = await requireApp("lotes-y-vencimientos");
  const conCostos = roleHasCapability(user.role, "costs:read");
  const tenantId = await getCurrentTenantId();
  const hoy = todayInBusinessTz();
  const [batches, products, suppliers] = await Promise.all([
    listarLotes(tenantId, conCostos),
    prisma.product.findMany({ where: { tenantId, deletedAt: null, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: whereProveedoresActivos(tenantId), select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const views: LoteView[] = batches.map((b) => {
    const envasado = diaDelLote(b.packedAt);
    const vence = diaDelLote(b.expiresAt);
    return {
      id: b.id,
      code: b.code,
      productName: b.productName,
      supplierName: b.supplierName,
      packedAtLabel: envasado ? fmtDia(envasado) : null,
      expiresAtLabel: vence ? fmtDia(vence) : null,
      expiryState: expiryState(b.expiresAt, hoy),
      daysToExpiry: daysUntil(b.expiresAt, hoy),
      netWeightKg: b.netWeightKg,
      packages: b.packages,
      avgPackageKg: avgPackageWeight(b.netWeightKg, b.packages),
      unitCost: b.unitCost,
      status: b.status,
    };
  });

  // DISEÑO NUEVO («Renglón»): la heladera ordenada por el que vence antes. Los cuatro números de
  // arriba pasan a la línea de estado (los que piden acción, con su marca); cada lote es un renglón
  // con el vencimiento en el folio, el costo por kilo en la columna de plata y «Se terminó» como
  // tecla. La misma lectura, las mismas acciones.
  if (await disenoNuevo()) {
    const summary = summarizeBatches(batches, hoy);
    const riesgo = conCostos ? plataEnRiesgo(batches, hoy) : null;
    const kg = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(summary.totalKg);
    const puedeCargar = roleHasCapability(user.role, "stock:receive");
    return (
      <PageContainer>
        <PageHeader
          title={TITULO}
          estado={[
            <strong key="d">
              {summary.available === 1 ? "1 lote disponible" : `${summary.available} lotes disponibles`} · {kg} kg
            </strong>,
            summary.expired > 0 ? (
              <Marca key="v" tipo="anulado">
                {summary.expired === 1 ? "1 vencido en la heladera" : `${summary.expired} vencidos en la heladera`}
              </Marca>
            ) : null,
            summary.soon > 0 ? (
              <Marca key="p" tipo="atencion">
                {summary.soon === 1 ? "1 vence" : `${summary.soon} vencen`} en 3 días o menos
                {riesgo && riesgo.lotes > 0 ? ` (${fmtMoneyARS(riesgo.pesos, 0)}${riesgo.sinCosto > 0 ? `, ${riesgo.sinCosto} sin costo` : ""})` : ""}
              </Marca>
            ) : null,
          ]}
          actions={
            puedeCargar ? (
              <a href="#cargar" className={buttonClasses("solid", "md")}>
                Cargar un lote
              </a>
            ) : undefined
          }
        />
        <LotesClient
          renglon
          views={views}
          summary={summary}
          riesgo={riesgo}
          products={products}
          suppliers={suppliers}
          conCostos={conCostos}
          puedeCargar={puedeCargar}
        />
      </PageContainer>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader
        title={TITULO}
        description="Cada lote al vacío con su fecha de envasado, su vencimiento, su peso real y su trazabilidad. Ordenados por el que vence antes."
      />
      <LotesClient
        views={views}
        summary={summarizeBatches(batches, hoy)}
        riesgo={conCostos ? plataEnRiesgo(batches, hoy) : null}
        products={products}
        suppliers={suppliers}
        conCostos={conCostos}
        puedeCargar={roleHasCapability(user.role, "stock:receive")}
      />
    </main>
  );
}
