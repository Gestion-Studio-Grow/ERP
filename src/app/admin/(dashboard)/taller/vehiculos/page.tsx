import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { buttonClasses, cn, EmptyState, Input } from "@/components/ui";
import { listaVehiculos, veLaPlata } from "@/lib/taller/datos.server";
import { BarraTaller, Patente, tarjeta } from "../_vista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Taller · Autos y clientes" };

export default async function VehiculosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireApp("taller");
  const { q = "" } = await searchParams;
  const vehiculos = await listaVehiculos(q);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <h1 className="mb-4 text-2xl font-bold text-strong">Autos y clientes</h1>
      <BarraTaller activa="/admin/taller/vehiculos" conPlata={veLaPlata(user)} />

      <form className="mb-4 flex gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Patente, modelo, nombre o teléfono" aria-label="Buscar" className="h-12 flex-1" autoComplete="off" />
        <button className={buttonClasses("solid", "lg")}>Buscar</button>
      </form>

      {vehiculos.length === 0 ? (
        <EmptyState
          title={q ? "No encontramos nada con eso" : "Todavía no hay autos cargados"}
          description={q ? "Probá con la patente sin espacios o con parte del nombre." : "Los autos se cargan solos al ingresarlos al taller."}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-2">
          {vehiculos.map((v) => (
            <li key={v.id}>
              <Link href={`/admin/taller/vehiculos/${v.id}`} className={cn(tarjeta, "flex items-center justify-between gap-3")}>
                <span className="grid min-w-0 grid-cols-1 gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <Patente valor={v.patente} />
                    <span className="font-semibold text-strong">{`${v.marca} ${v.modelo}`.trim() || "Vehículo"}</span>
                  </span>
                  <span className="truncate text-sm text-muted">
                    {v.client.name} · {v.client.phone}
                    {v.client.tallerEtiquetas.length > 0 && ` · ${v.client.tallerEtiquetas.join(", ")}`}
                  </span>
                </span>
                <span className="shrink-0 text-right text-sm text-muted">{v._count.ordenes} {v._count.ordenes === 1 ? "visita" : "visitas"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
