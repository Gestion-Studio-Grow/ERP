import Link from "next/link";
import { redirect } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { homeRoute } from "@/lib/capabilities";
import { getCurrentTenantId } from "@/lib/tenant";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import { ConDiseno } from "@/lib/diseno/ConDiseno";
import { esteticaBackoffice } from "@/lib/estetica-backoffice";
import { cargarReglasDelMostrador } from "@/lib/mi-negocio/mi-negocio.server";
import PielPropia from "../../armazon/PielPropia";
import MiNegocioForm from "./MiNegocioForm";

export const dynamic = "force-dynamic";

// MI NEGOCIO (reingeniería CH, Tanda 3 · 3-D): las reglas del mostrador de turnos que fija la dueña.
// Sólo la dueña (la app pide `location:manage`, y además el rol OWNER, igual que la acción). Lee y
// graba por `tenantId` (CH-068). Sin la migración M2 muestra el placeholder D2/D5 «pendiente de
// activar» y no deja guardar (CH-053). Piel «Renglón» propia (diseño CH §0.2).
export default async function MiNegocioPage() {
  const user = await requireApp("mi-negocio");
  if (user.role !== "OWNER") redirect(homeRoute(user.role));
  const tenantId = await getCurrentTenantId();
  const [{ reglas }, slug] = await Promise.all([cargarReglasDelMostrador(tenantId), getCurrentTenantSlug()]);

  return (
    <ConDiseno nuevo precargarLetra={false}>
      <PielPropia pantalla="mi-negocio" letraDelNegocio={esteticaBackoffice(slug) !== null} className="min-h-full bg-surface text-body">
        <main data-ui="pagina" className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          <header data-ui="page-header" className="mb-6">
            <h1 className="text-2xl font-semibold text-strong">Mi negocio</h1>
            <p className="mt-1 text-sm text-muted">
              Las reglas de la seña y de la recepción. La dirección y el WhatsApp del local están en{" "}
              <Link href="/admin/localizacion" className="inline-flex min-h-11 items-center font-medium text-accent-ink underline underline-offset-2">
                Localización
              </Link>
              .
            </p>
          </header>
          <MiNegocioForm reglas={reglas} />
        </main>
      </PielPropia>
    </ConDiseno>
  );
}
