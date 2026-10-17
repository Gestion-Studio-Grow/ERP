import type { Metadata } from "next";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import { ButtonLink } from "@/components/ui/Button";
import { PageContainer, PageHeader } from "@/components/ui";
import AprobadorCargador from "./AprobadorCargador";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Aprobar un crédito",
  // Sello GSG (estándar de marca): el negocio conserva SU marca visible; GSG firma como generador.
  generator: "Gestión Studio Grow",
  robots: { index: false, follow: false },
};

// EL APROBADOR DEL DUEÑO — la pantalla que abre el link de WhatsApp «Avisar a <dueño>» (../aprobar-core.ts): el
// dueño ve el pedido, pone su PIN y le sale el código de 6 letras para mandarle a recepción.
//
// Guardia: la de la app (`requireApp("club")`: rol con agenda:manage y módulo `club` asignado; sin asignación no se
// abre ni por URL) y, además, un OWNER del ERP: aprobar crédito es del dueño. El pedido viaja en el FRAGMENTO del
// link (#aprobar&…): no llega al servidor; lo lee el navegador (../aprobar-core.ts documenta qué lleva).
//
// DEMO / REAL: hoy siempre DEMO (los dueños y PIN de ejemplo de la demo de este equipo). El modo real se prende el
// día de corte sumando el negocio a esta lista, junto con NEGOCIOS_CON_JORNADA_REAL de ../page.tsx: entonces lee los
// dueños de la jornada guardada en la base (BP-3, `leerFotoDelClub`) para verificar el PIN acá con el tope del
// bloqueo; si la base todavía no tiene la jornada, el código sale igual y lo verifica la compu del club (como hoy).
const NEGOCIOS_CON_APROBADOR_REAL: readonly string[] = [];

export default async function AprobarPage() {
  const user = await requireApp("club");
  const slug = await getCurrentTenantSlug();
  if (user.role !== "OWNER") {
    return (
      <PageContainer width="narrow">
        <PageHeader title="Aprobar un crédito" />
        <div className="flex flex-col gap-3">
          <p className="text-sm text-body">Aprobar un crédito es del dueño: este link se abre con la cuenta de un dueño del club.</p>
          <ButtonLink href="/admin/club" variant="outline" className="self-start">
            Volver al club
          </ButtonLink>
        </div>
      </PageContainer>
    );
  }
  const modo = NEGOCIOS_CON_APROBADOR_REAL.includes(slug ?? "") ? "real" : "demo";
  return (
    <PageContainer width="narrow">
      <PageHeader title="Aprobar un crédito" description="Recepción te pide el OK para fiar o para abrir una cuenta corriente." />
      {/* Sin slug (no debería pasar con sesión) el negocio se distingue por su id: la clave nunca queda "de todos". */}
      <AprobadorCargador negocio={slug ?? user.tenantId} usuario={user.id} modo={modo} />
    </PageContainer>
  );
}
