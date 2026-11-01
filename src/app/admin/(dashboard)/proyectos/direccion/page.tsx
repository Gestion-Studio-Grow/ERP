import { Pestanas } from "@/components/ui";
import { requireApp } from "@/lib/require-app";
import { exigirVer } from "@/lib/proyectos/gestion.server";
import { TabTablero } from "./_tablero";
import { TabEventos } from "./_eventos";
import { TabComerciales } from "./_comerciales";
import { TabCarga } from "./_carga";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dirección" };

const TABS = [
  { id: "tablero", label: "Tablero" },
  { id: "eventos", label: "Por evento" },
  { id: "comerciales", label: "Comerciales" },
  { id: "carga", label: "Carga del equipo" },
] as const;

export default async function Direccion({ searchParams }: { searchParams: Promise<{ tab?: string; proyecto?: string }> }) {
  await requireApp("proyectos");
  const a = await exigirVer("direccion");
  const sp = await searchParams;
  const tab = TABS.some((t) => t.id === sp.tab) ? sp.tab : "tablero";
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5">
      <h1 className="mb-4 text-2xl font-bold text-strong">Dirección</h1>
      <Pestanas pestanas={TABS.map((t) => ({ href: `/admin/proyectos/direccion?tab=${t.id}`, etiqueta: t.label, actual: t.id === tab }))} etiqueta="Vistas de Dirección" conRaya className="mb-4" />
      {tab === "tablero" && <TabTablero tenantId={a.tenantId} />}
      {tab === "eventos" && <TabEventos tenantId={a.tenantId} abierto={sp.proyecto} />}
      {tab === "comerciales" && <TabComerciales tenantId={a.tenantId} />}
      {tab === "carga" && <TabCarga tenantId={a.tenantId} />}
    </main>
  );
}
