import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/authz";
import { requireApp } from "@/lib/require-app";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { todayInBusinessTz } from "@/lib/datetime";
import { leerEstadoLotesYDespiece } from "@/lib/carniceria/schema-probe";
import { leerLote } from "@/lib/carniceria/lotes-loader";
import { avgPackageWeight, diaDelLote, expiryState, fmtDia } from "@/lib/carniceria/lotes";
import { cargarProductosParaPrecios } from "@/lib/catalogo/precios-lectura";
import { precioDeVenta } from "@/lib/catalogo/aumento-core";
import { leerConfigCaja } from "@/lib/supermercado/config-repo";
import { nombreVisibleDelNegocio } from "@/lib/marca-demo";
import { EmptyState, PageHeader, buttonClasses } from "@/components/ui";
import EtiquetasDelLote from "./EtiquetasDelLote";

export const dynamic = "force-dynamic";

const TITULO = "Etiquetas del lote";

// ETIQUETAS DE LOS PAQUETES DE UN LOTE AL VACÍO: nombre, peso, $/kg, total, lote, envasado,
// vence y un código de balanza que la caja lee con su formato (leerConfigCaja). Misma guardia
// que Lotes y vencimientos: sin la migración cárnica, "En preparación".
export default async function EtiquetasDelLotePage({ params }: { params: Promise<{ id: string }> }) {
  if ((await leerEstadoLotesYDespiece()) === "falta-migracion") {
    await requireUser();
    return (
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
        <PageHeader title={TITULO} />
        <EmptyState title="En preparación" description="Los lotes al vacío se activan cuando se aplique la actualización de la base de tu negocio." />
      </main>
    );
  }
  await requireApp("lotes-y-vencimientos");
  const { id } = await params;
  const tenantId = await getCurrentTenantId();
  const lote = await leerLote(tenantId, id);
  if (!lote) notFound();
  const [productos, config, tenant] = await Promise.all([
    cargarProductosParaPrecios(tenantId),
    leerConfigCaja(prisma, tenantId),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, slug: true } }),
  ]);
  const producto = lote.productId ? productos.find((p) => p.id === lote.productId) ?? null : null;
  const precioPorKilo = producto && producto.saleUnit === "WEIGHT" ? precioDeVenta(producto) : null;

  const hoy = todayInBusinessTz();
  const vence = diaDelLote(lote.expiresAt);
  const bloqueo =
    lote.status === "WITHDRAWN"
      ? `El lote ${lote.code} está retirado: no se etiqueta.`
      : lote.status === "EXPIRED" || expiryState(lote.expiresAt, hoy) === "expired"
        ? `El lote ${lote.code} está vencido${vence ? ` (venció el ${fmtDia(vence)})` : ""}: no se etiqueta ni se vende. Marcalo como retirado en Lotes y vencimientos.`
        : null;

  const volver = (
    <Link href="/admin/lotes" className={buttonClasses("outline", "md", "min-h-11")}>
      Volver a Lotes
    </Link>
  );

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader
        title={TITULO}
        description={`Lote ${lote.code} · ${lote.productName} · ${lote.packages} ${lote.packages === 1 ? "paquete" : "paquetes"}. Una etiqueta por paquete, con el código que lee la caja.`}
        actions={volver}
      />
      {!producto || precioPorKilo === null ? (
        <EmptyState
          title="Falta el precio por kilo"
          description={
            producto
              ? `"${producto.name}" no tiene precio por kilo (o se vende por unidad). Cargalo en el catálogo y volvé.`
              : "El lote no tiene un producto del catálogo. Sin producto no hay precio ni código para la etiqueta."
          }
        />
      ) : (
        <EtiquetasDelLote
          lote={{
            code: lote.code,
            packedAt: lote.packedAt ? lote.packedAt.toISOString() : null,
            expiresAt: lote.expiresAt ? lote.expiresAt.toISOString() : null,
            packages: lote.packages,
            pesoPromedioKg: avgPackageWeight(lote.netWeightKg, lote.packages),
          }}
          producto={{ nombre: producto.name, codigo: producto.codigo ?? null, precioPorKilo }}
          formato={config.formato}
          negocio={nombreVisibleDelNegocio(tenant?.slug, tenant?.name, "")}
          bloqueo={bloqueo}
          etiquetaGuardada={config.etiquetaPaquete}
          version={config.version}
        />
      )}
    </main>
  );
}
