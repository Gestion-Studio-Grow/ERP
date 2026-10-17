import type { Metadata } from "next";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import { PageContainer, PageHeader } from "@/components/ui";
import ClubCargador from "./ClubCargador";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Canchas del club",
  // Sello GSG (estándar de marca): el negocio conserva SU marca visible; GSG firma como generador.
  generator: "Gestión Studio Grow",
};

// CANCHAS DEL CLUB — la recepción de un club de pádel (plan BP-2, docs/producto/PLAN-TERMINALES-MOSTRADOR.md
// §4): la agenda de canchas del día y la cuenta de cada turno, con el motor del club. Hoy en MODO DEMO:
// todo corre en el navegador con datos de ejemplo y no toca la base (DEMO → VENTA → INVERSIÓN).
//
// La guardia es la de la app (`requireApp("club")`): rol (agenda:manage), módulo `club` siempre
// exigido (moduloDuro: sin asignación no se abre ni por URL, CH incluida) y la misma regla del menú.
// El servidor sólo resuelve quién mira y de qué negocio, para separar lo que cada uno deja en el
// equipo; el motor nunca corre acá.
export default async function ClubPage() {
  const user = await requireApp("club");
  const slug = await getCurrentTenantSlug();
  return (
    <PageContainer>
      <PageHeader title="Canchas del club" description="Las canchas de hoy, la cuenta de cada turno, el buffet y la caja de 12 a 12." />
      {/* Sin slug (no debería pasar con sesión) el negocio se distingue por su id: la clave nunca queda "de todos". */}
      <ClubCargador negocio={slug ?? user.tenantId} usuario={user.id} rol={user.role} />
    </PageContainer>
  );
}
