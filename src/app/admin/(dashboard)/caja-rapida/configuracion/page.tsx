import { redirect } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { roleHasCapability } from "@/lib/capabilities";
import { PageContainer, PageHeader, ButtonLink } from "@/components/ui";
import { leerConfigCaja } from "@/lib/supermercado/config-repo";
import ConfigCaja from "./ConfigCaja";

export const dynamic = "force-dynamic";

// LECTOR Y BALANZA — cómo lee la caja las etiquetas de la balanza de la sección (el formato lo
// configura el técnico de la balanza: acá se copia) y quiénes autorizan anular en la caja.
// Sólo el dueño: cambia cómo se cobra.
export default async function ConfiguracionCajaPage() {
  const user = await requireApp("caja-rapida");
  if (!roleHasCapability(user.role, "catalog:manage")) redirect("/admin/caja-rapida");
  const tenantId = await getCurrentTenantId();
  const [config, usuarios] = await Promise.all([
    leerConfigCaja(prisma, tenantId),
    prisma.user.findMany({
      where: { tenantId, active: true, deletedAt: null, role: "RECEPTION" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);
  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Lector y balanza"
        description="Cómo lee la caja las etiquetas de la balanza y quién autoriza anular un renglón."
        actions={
          <ButtonLink href="/admin/caja-rapida" variant="outline">
            Volver a la caja
          </ButtonLink>
        }
      />
      <ConfigCaja formato={config.formato} encargados={config.encargados} version={config.version} usuarios={usuarios} porDefecto={config.porDefecto} />
    </PageContainer>
  );
}
