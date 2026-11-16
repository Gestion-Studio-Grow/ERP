import type { Metadata } from "next";
import { requireApp } from "@/lib/require-app";
import { PageContainer, PageHeader } from "@/components/ui";
import TorneoEnCurso from "./TorneoEnCurso";
import { leerTorneo } from "./actions";

// El torneo de pádel guardado en la base (GSG-PLAT-016). La guardia de la página es la de la app (sesión + módulo
// `torneo`); qué puede cambiar cada usuario lo vuelve a decidir cada acción del servidor (actions.ts).

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Torneo",
  // Sello GSG (estándar de marca): el negocio conserva SU marca visible; GSG firma como generador.
  generator: "Gestión Studio Grow",
};

export default async function TorneoPage() {
  await requireApp("torneo");
  const inicial = await leerTorneo(null);
  return (
    <PageContainer>
      <PageHeader title="Torneo" description="Zonas, llave y resultados del torneo en curso. Lo que se carga acá lo ve todo el negocio." />
      <TorneoEnCurso inicial={inicial} />
    </PageContainer>
  );
}
