import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ButtonLink, PageContainer, PageHeader } from "@/components/ui";
import { leerConfigEnvios } from "@/lib/envios/config";
import { motivoTiendaPausada } from "@/lib/envios/tarifa";
import { pausaVigente } from "@/lib/envios/modelo";
import EnviosForm from "./EnviosForm";

export const dynamic = "force-dynamic";

// ENVÍOS — retiro en el local, pedido mínimo, zonas con su costo y «gratis desde», franjas y la
// tienda pausada (magra-DISENO.md §2.3). Lo configura el dueño (app «Datos del negocio»,
// `location:manage`); la tienda y el mostrador lo leen al instante (config en AuditLog,
// src/lib/envios/config.ts). Sin nada guardado, todo sigue como siempre.
export default async function EnviosPage() {
  await requireApp("datos-del-negocio");
  const tenantId = await getCurrentTenantId();
  const config = await leerConfigEnvios(prisma, tenantId);
  const ahora = new Date();
  const pausa = motivoTiendaPausada(config, ahora);
  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Envíos"
        estado={[
          pausa ? "Tienda pausada" : "Tienda tomando pedidos",
          config.zonas.length ? `${config.zonas.length} ${config.zonas.length === 1 ? "zona" : "zonas"} de envío` : "Sin zonas propias",
          config.retiroEnLocal ? "con retiro en el local" : "sin retiro",
        ]}
        actions={
          <ButtonLink href="/admin/localizacion" variant="outline">
            Datos del negocio
          </ButtonLink>
        }
      />
      <EnviosForm
        inicial={{
          retiroEnLocal: config.retiroEnLocal,
          horarioRetiro: config.horarioRetiro,
          pedidoMinimoEnvio: config.pedidoMinimoEnvio,
          zonas: config.zonas,
          franjasRetiro: config.franjasRetiro,
          // Una pausa con «hasta» vencido ya no rige: la pantalla la muestra abierta.
          tiendaPausada: pausaVigente(config.tiendaPausada, ahora) ? config.tiendaPausada : null,
        }}
        version={config.version}
      />
    </PageContainer>
  );
}
