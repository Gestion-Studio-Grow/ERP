import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { getNegocioApps } from "@/apps/contexto.server";
import { appPermitida } from "@/apps/visibles";
import { appPorId } from "@/apps/registro";
import { getCurrentTenantRubro } from "@/lib/carniceria/rubro";
import { getRecuentoData } from "@/lib/inventario/ajustes-loader";
import { topeDeMermaPorCarga } from "@/lib/stock/adjustment-core";
import { EmptyState, PageContainer, PageHeader, buttonClasses } from "@/components/ui";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import RecuentoForm from "./RecuentoForm";
import { claveDelBorrador } from "./borrador";

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
  const [sp, rubro, negocio, nuevo] = await Promise.all([searchParams, getCurrentTenantRubro(), getNegocioApps(user.role), disenoNuevo()]);
  const ve = {
    catalogo: appPermitida(appPorId("catalogo"), negocio),
    movimientos: appPermitida(appPorId("movimientos"), negocio),
  };
  const sustantivo = rubro.rubro?.wording.itemNoun?.trim() || "producto";
  const plural = sustantivo.endsWith("s") ? sustantivo : `${sustantivo}s`;
  const datos = await getRecuentoData({ carniceria: rubro.rubro?.id === "carniceria", sustantivoPlural: plural });
  const total = datos.gondolas.reduce((s, g) => s + g.productos.length, 0);

  const planilla = (
    <RecuentoForm
      gondolas={datos.gondolas}
      conCostos={datos.conCostos}
      ahoraServidor={datos.ahoraServidor}
      productoInicial={uno(sp.producto) || null}
      conTope={topeDeMermaPorCarga(user.role) !== null}
      claveBorrador={claveDelBorrador(user.tenantId, user.id)}
      renglon={nuevo}
    />
  );

  // DISEÑO NUEVO («Renglón»): el encargado con el celular en una mano frente a la heladera. El
  // encabezado dice cuánto hay para contar y dónde; la planilla arranca enseguida, sin párrafo de
  // ayuda (la regla de la hora va plegada al pie de la planilla). La misma lectura y la misma acción.
  if (nuevo) {
    const gondolas = datos.gondolas.length;
    return (
      <PageContainer width="narrow">
        <PageHeader
          title="Recuento"
          estado={
            total === 0
              ? undefined
              : [
                  <strong key="t">{total === 1 ? `1 ${sustantivo} para contar` : `${total} ${plural} para contar`}</strong>,
                  gondolas > 1 ? <span key="g">en {gondolas} góndolas</span> : null,
                ]
          }
          actions={
            ve.movimientos ? (
              <Link href="/admin/inventario/movimientos" className={buttonClasses("outline", "md")}>
                Movimientos
              </Link>
            ) : undefined
          }
        />
        {total === 0 ? (
          <p data-ui="vacio" className="border-y border-line py-4 text-sm text-body">
            No hay {plural} para contar: se cuentan los activos que controlan stock.{" "}
            {ve.catalogo ? (
              <Link href="/admin/catalogo" className="inline-flex min-h-11 items-center font-medium underline underline-offset-2">
                Activá el control de stock en el catálogo
              </Link>
            ) : (
              "Pedile a la dueña o al dueño que lo active en el catálogo."
            )}
          </p>
        ) : (
          planilla
        )}
      </PageContainer>
    );
  }

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
        planilla
      )}
    </main>
  );
}
