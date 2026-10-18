import type { Metadata } from "next";
import { isDemoSandbox } from "@/lib/demo-flag";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import { PageContainer, PageHeader } from "@/components/ui";
import ClubCargador from "./ClubCargador";
import { relojDelClub } from "./jornada-del-club-core";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Canchas del club",
  // Sello GSG (estándar de marca): el negocio conserva SU marca visible; GSG firma como generador.
  generator: "Gestión Studio Grow",
};

// CANCHAS DEL CLUB — la recepción de un club de pádel (plan BP-2, docs/producto/PLAN-TERMINALES-MOSTRADOR.md
// §4): la agenda de canchas del día y la cuenta de cada turno, con el motor del club. El motor corre en el
// navegador. Para los negocios con jornada real (Break Point, desde el 18/10/2026) el club se guarda en la base del
// ERP (la foto, src/lib/club/estado-repo.ts); para el resto, y con `?demo=1` o en el sandbox de preventa, es la DEMO:
// datos de ejemplo que no tocan la base (DEMO → VENTA → INVERSIÓN). La elección es `relojDelClub`
// (jornada-del-club-core.ts).
//
// La guardia es la de la app (`requireApp("club")`): rol (agenda:manage), módulo `club` siempre
// exigido (moduloDuro: sin asignación no se abre ni por URL, CH incluida) y la misma regla del menú.
// El servidor sólo resuelve quién mira y de qué negocio, para separar lo que cada uno deja en el
// equipo; el motor nunca corre acá.


export default async function ClubPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireApp("club");
  const slug = await getCurrentTenantSlug();
  const reloj = relojDelClub({ slug: slug ?? null, sandbox: isDemoSandbox(), demo: (await searchParams).demo });
  return (
    <PageContainer>
      <PageHeader title="Canchas del club" description="Las canchas de hoy, la cuenta de cada turno, el buffet y la caja de 12 a 12." />
      {/* Sin slug (no debería pasar con sesión) el negocio se distingue por su id: la clave nunca queda "de todos". */}
      <ClubCargador negocio={slug ?? user.tenantId} usuario={user.id} rol={user.role} reloj={reloj} />
    </PageContainer>
  );
}
