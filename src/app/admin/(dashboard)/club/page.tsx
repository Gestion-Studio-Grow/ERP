import type { Metadata } from "next";
import { isDemoSandbox } from "@/lib/demo-flag";
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
//
// JORNADA REAL: para los negocios de esta lista /admin/club abre la jornada real (hora de este equipo, una pestaña por
// equipo, guardada en la base); la demo queda en `?demo=1`, como en el club vanilla. Break Point entra el 18/10/2026
// como prueba gratis en el plan actual (decisión del dueño, G12 en docs/tenants/breakpoint/PARIDAD-REACT.md).
// En el sandbox de preventa nunca se abre la jornada real. Es la llave del corte, no una opción para el usuario.
const NEGOCIOS_CON_JORNADA_REAL: readonly string[] = ["breakpoint"];

export default async function ClubPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireApp("club");
  const slug = await getCurrentTenantSlug();
  const reloj = NEGOCIOS_CON_JORNADA_REAL.includes(slug ?? "") && !isDemoSandbox() && (await searchParams).demo !== "1" ? "real" : "demo";
  return (
    <PageContainer>
      <PageHeader title="Canchas del club" description="Las canchas de hoy, la cuenta de cada turno, el buffet y la caja de 12 a 12." />
      {/* Sin slug (no debería pasar con sesión) el negocio se distingue por su id: la clave nunca queda "de todos". */}
      <ClubCargador negocio={slug ?? user.tenantId} usuario={user.id} rol={user.role} reloj={reloj} />
    </PageContainer>
  );
}
