import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { exigirCasa } from "@/lib/multilocal/casa.server";
import { catalogoDeLaMarcaAction } from "@/lib/multilocal/multilocal-actions";
import { NOMBRE_APP_CATALOGO, divergeDeLaLista, resumenDeLaVista } from "@/lib/multilocal/catalogo-marca-core";
import { AvisoError, Badge, EmptyState, KpiTile, PageContainer, PageHeader, buttonClasses, fmtNumberAR } from "@/components/ui";
import { LocalesSinLeer, NoEsCasa, NoSePudoLeer, SinLocales, SolapasLocales } from "../partes";
import { AplicarCatalogo, type LocalParaAplicar } from "./AplicarCatalogo";

export const dynamic = "force-dynamic";

// CATÁLOGO DE LA MARCA — una sola lista de productos y precios: la de la casa.
//
// La pantalla ES la vista previa y la de diferencias: para cada local dice qué precios cambiarían,
// qué productos de la casa no tiene (se crean), cuáles tiene sólo él (no se tocan) y qué impide
// aplicar. "Aplicar" escribe local por local, todo o nada en cada uno, y sólo si su catálogo no
// cambió desde esta vista (la huella viaja con el formulario). Lo decide multilocal-actions.ts con
// la misma planilla que usa cada local (catalogo/planilla-core.ts): no hay reglas nuevas.
//
// GUARDIA: `requireApp` (rol, rubro de mostrador y el módulo `multilocal` aun con el gate
// apagado) y `exigirCasa`, que relee el módulo de la base. La action lo repite.

export default async function CatalogoDeLaMarcaPage() {
  const user = await requireApp("catalogo-de-la-marca");
  const casa = await exigirCasa("multilocal:manage");
  const titulo = NOMBRE_APP_CATALOGO;
  if (!casa.ok) {
    return (
      <PageContainer>
        <PageHeader title={titulo} />
        <NoEsCasa error={casa.error} noSeLeyo={casa.noSeLeyo} />
      </PageContainer>
    );
  }
  const r = await catalogoDeLaMarcaAction();
  if (!r.ok) {
    return (
      <PageContainer>
        <PageHeader title={titulo} />
        <NoSePudoLeer error={r.error} />
      </PageContainer>
    );
  }

  const distintos = r.locales.filter((l) => divergeDeLaLista(l.vista)).length;
  const locales: LocalParaAplicar[] = r.locales.map(({ local, vista }) => ({
    localTenantId: local.localTenantId,
    alias: local.alias,
    resumen: resumenDeLaVista(local.alias, vista),
    ...vista,
  }));

  return (
    <PageContainer>
      <PageHeader
        title={titulo}
        badge={<Badge tone="accent">{r.casa}</Badge>}
        description={
          "Tu lista (el catálogo de la casa) es la lista de la marca. Acá ves en qué se diferencia cada local y se la mandás: " +
          "cambian los precios y se crean los productos que le faltan. El stock de cada local no se toca."
        }
      />
      <SolapasLocales activa="catalogo-de-la-marca" role={user.role} />
      <LocalesSinLeer sinLeer={r.sinLeer} ruta="/admin/locales/catalogo" />

      {r.lista.repetidos.length > 0 && (
        <AvisoError
          className="mb-lg"
          titulo={`Tu lista tiene productos con el mismo nombre: ${r.lista.repetidos.join(", ")}`}
          comoSeguir="Así no se puede mandar: cada local no sabría cuál es cuál. Renombrá uno desde el Catálogo y volvé acá."
          accion={
            <Link href="/admin/catalogo" className={buttonClasses("outline", "md")}>
              Ir al Catálogo
            </Link>
          }
        />
      )}
      {r.lista.sinPrecio.length > 0 && (
        <AvisoError
          className="mb-lg"
          tono="aviso"
          titulo={`${fmtNumberAR(r.lista.sinPrecio.length)} ${r.lista.sinPrecio.length === 1 ? "producto no tiene" : "productos no tienen"} precio y no se ${r.lista.sinPrecio.length === 1 ? "manda" : "mandan"}`}
          comoSeguir={`${r.lista.sinPrecio.join(", ")}. Cargale el precio en el Catálogo si querés que llegue a los locales.`}
        />
      )}

      {r.locales.length === 0 ? (
        r.sinLeer.length === 0 && <SinLocales />
      ) : r.lista.incluidos === 0 ? (
        <EmptyState
          title="Tu lista está vacía"
          description="La lista de la marca son los productos activos y con precio del catálogo de la casa. Cargalos en el Catálogo y volvé acá para mandarlos."
          action={
            <Link href="/admin/catalogo" className={buttonClasses("solid", "md")}>
              Ir al Catálogo
            </Link>
          }
        />
      ) : (
        <>
          <section aria-label="La lista y los locales" className="mb-lg grid grid-cols-1 gap-[14px] sm:grid-cols-3">
            <KpiTile label="Productos en tu lista" value={fmtNumberAR(r.lista.incluidos)} sub="activos y con precio" />
            <KpiTile
              label="Locales con precios distintos"
              value={fmtNumberAR(distintos)}
              sub={distintos === 0 ? "todos tienen tu lista" : `de ${fmtNumberAR(r.locales.length)} ${r.locales.length === 1 ? "local" : "locales"}`}
            />
            <KpiTile
              label="Al día"
              value={fmtNumberAR(r.locales.length - distintos)}
              sub={r.locales.length - distintos === 1 ? "local con tu lista" : "locales con tu lista"}
            />
          </section>
          <AplicarCatalogo locales={locales} bloqueada={r.lista.repetidos.length > 0} />
        </>
      )}
    </PageContainer>
  );
}
