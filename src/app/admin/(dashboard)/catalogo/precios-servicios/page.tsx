import Link from "next/link";
import { redirect } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { homeRoute } from "@/lib/capabilities";
import { getCurrentTenantId } from "@/lib/tenant";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import { getCurrentTenantRubro } from "@/lib/carniceria/rubro";
import { todayInBusinessTz } from "@/lib/datetime";
import { ConDiseno } from "@/lib/diseno/ConDiseno";
import { esteticaBackoffice } from "@/lib/estetica-backoffice";
import { textoUltimoAumentoServicios } from "@/lib/catalogo/aumento-servicios";
import { cargarServiciosParaAumento, cargarUltimoAumentoServicios } from "@/lib/catalogo/aumento-servicios-tx";
import PielPropia from "../../armazon/PielPropia";
import SubirPrecios from "./SubirPrecios";

export const dynamic = "force-dynamic";

// SUBIR PRECIOS DE SERVICIOS (reingeniería CH, Tanda 3 · 3-D · CH-039). Sólo la dueña: la app es la
// del Catálogo (rol, módulo, rubro) y además se exige el rol OWNER, igual que la acción (CH-052). Va
// con la piel «Renglón» propia (diseño CH §0.2): CH la ve bien con «Diseño nuevo» apagado.
export default async function SubirPreciosServiciosPage() {
  const user = await requireApp("catalogo");
  if (user.role !== "OWNER") redirect(homeRoute(user.role));
  // Un mostrador no tiene servicios: su aumento es el de productos.
  if ((await getCurrentTenantRubro()).isRetail) redirect("/admin/catalogo/precios");

  const tenantId = await getCurrentTenantId();
  const [servicios, ultimo, slug] = await Promise.all([
    cargarServiciosParaAumento(tenantId),
    cargarUltimoAumentoServicios(tenantId, todayInBusinessTz()),
    getCurrentTenantSlug(),
  ]);

  return (
    <ConDiseno nuevo precargarLetra={false}>
      <PielPropia pantalla="subir-precios-servicios" letraDelNegocio={esteticaBackoffice(slug) !== null} className="min-h-full bg-surface text-body">
        <main data-ui="pagina" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
          <header data-ui="page-header" className="mb-6">
            <h1 className="text-2xl font-semibold text-strong">Subir precios</h1>
            <p className="mt-1 text-sm text-muted">
              {`${textoUltimoAumentoServicios(ultimo)} Los turnos ya dados conservan su precio. `}
              <Link href="/admin/catalogo" className="inline-flex min-h-11 items-center font-medium text-accent-ink underline underline-offset-2">
                Volver al catálogo
              </Link>
            </p>
          </header>
          {servicios.length === 0 ? (
            <p className="border-b border-line py-4 text-sm text-muted">
              Todavía no hay servicios en el catálogo. Cargalos con su precio y volvé para subirlos todos juntos.{" "}
              <Link href="/admin/catalogo?agregar=1" className="inline-flex min-h-11 items-center font-medium text-accent-ink underline underline-offset-2">
                Agregar un servicio
              </Link>
            </p>
          ) : (
            <SubirPrecios servicios={servicios} />
          )}
        </main>
      </PielPropia>
    </ConDiseno>
  );
}
