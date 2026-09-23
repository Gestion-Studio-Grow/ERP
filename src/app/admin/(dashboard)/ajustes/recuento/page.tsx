import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { getNegocioApps } from "@/apps/contexto.server";
import { appPermitida } from "@/apps/visibles";
import { appPorId } from "@/apps/registro";
import { getCurrentTenantRubro } from "@/lib/carniceria/rubro";
import { getRecuentoData } from "@/lib/inventario/ajustes-loader";
import { topeDeMermaPorCarga } from "@/lib/stock/adjustment-core";
import { EmptyState, PageHeader, buttonClasses } from "@/components/ui";
import RecuentoForm from "./RecuentoForm";

export const dynamic = "force-dynamic";

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

// RECUENTO por góndola. Se cuenta con el local abierto: cada línea guarda la hora en que se
// contó y el servidor compara contra lo que el sistema tenía A ESA HORA (lo que se vendió
// mientras se contaba no aparece como sobrante). Es de mostrador: un negocio de servicios
// sigue recontando desde Ajustes, como siempre.
export default async function RecuentoPage({
  searchParams,
}: {
  searchParams: Promise<{ producto?: string | string[] }>;
}) {
  const user = await requireApp("recuento");
  const [sp, rubro, negocio] = await Promise.all([searchParams, getCurrentTenantRubro(), getNegocioApps(user.role)]);
  const ve = {
    catalogo: appPermitida(appPorId("catalogo"), negocio),
    movimientos: appPermitida(appPorId("movimientos"), negocio),
  };
  const sustantivo = rubro.rubro?.wording.itemNoun?.trim() || "producto";
  const plural = sustantivo.endsWith("s") ? sustantivo : `${sustantivo}s`;
  const datos = await getRecuentoData({ carniceria: rubro.rubro?.id === "carniceria", sustantivoPlural: plural });
  const total = datos.gondolas.reduce((s, g) => s + g.productos.length, 0);

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader
        title="Recuento"
        description={`Contá la góndola y cargá lo que hay. Lo que se venda mientras contás no cambia la diferencia: se compara con lo que había a la hora de contar cada ${sustantivo}.`}
        actions={
          ve.movimientos ? (
            <Link href="/admin/inventario/movimientos" className={buttonClasses("outline", "md")}>
              Ver movimientos
            </Link>
          ) : undefined
        }
      />
      {total === 0 ? (
        <EmptyState
          title={`No hay ${plural} para contar`}
          description={
            ve.catalogo
              ? `Se cuentan los ${plural} activos que controlan stock. Activá el control de stock en el catálogo y volvé.`
              : `Se cuentan los ${plural} activos que controlan stock. Pedile a la dueña o al dueño que active el control de stock en el catálogo.`
          }
          action={
            ve.catalogo ? (
              <Link href="/admin/catalogo" className={buttonClasses("solid", "md")}>
                Ir al catálogo
              </Link>
            ) : undefined
          }
        />
      ) : (
        <RecuentoForm
          gondolas={datos.gondolas}
          conCostos={datos.conCostos}
          ahoraServidor={datos.ahoraServidor}
          productoInicial={uno(sp.producto) || null}
          conTope={topeDeMermaPorCarga(user.role) !== null}
        />
      )}
    </main>
  );
}
