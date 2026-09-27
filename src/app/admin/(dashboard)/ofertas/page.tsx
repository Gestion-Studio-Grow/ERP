import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { todayInBusinessTz } from "@/lib/datetime";
import { PageContainer, PageHeader, ButtonLink } from "@/components/ui";
import { leerPromociones } from "@/lib/supermercado/config-repo";
import { gondolasEnTx, productosDeCaja } from "@/lib/supermercado/caja-lectura";
import { diaDeLaSemana } from "@/lib/supermercado/promociones";
import { SECCIONES_SUPERMERCADO } from "@/blueprints/retail/supermercado-tipos";
import Ofertas from "./Ofertas";

export const dynamic = "force-dynamic";

// OFERTAS DE LA SEMANA — las promos que la caja con lector aplica sola y la vidriera muestra.
// Se cargan una vez, con su vigencia, sus días, su prioridad y si se suman a otras.
export default async function OfertasPage() {
  await requireApp("ofertas");
  const tenantId = await getCurrentTenantId();
  const hoy = todayInBusinessTz();
  const [promos, productos] = await Promise.all([
    leerPromociones(prisma, tenantId),
    tenantTransaction(async (tx) => productosDeCaja(tx, tenantId, await gondolasEnTx(tx, tenantId)), { tenantId }),
  ]);
  return (
    <PageContainer>
      <PageHeader
        title="Ofertas de la semana"
        description="La caja las aplica sola, en el renglón de cada producto, y el ticket dice cuál. La vidriera las muestra."
        actions={
          <ButtonLink href="/admin/caja-rapida" variant="outline">
            Ir a la caja
          </ButtonLink>
        }
      />
      <Ofertas
        inicial={promos.map((p) => ({ ...p, actualizada: p.actualizada.toISOString() }))}
        productos={productos.map((p) => ({ id: p.id, name: p.name, seccion: p.seccion, codigo: p.codigo }))}
        secciones={SECCIONES_SUPERMERCADO.map((s) => ({ id: s.id, nombre: s.nombre }))}
        hoy={hoy}
        diaSemana={diaDeLaSemana(hoy)}
      />
    </PageContainer>
  );
}
