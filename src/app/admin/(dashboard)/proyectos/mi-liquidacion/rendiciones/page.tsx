import Link from "next/link";
import { cn } from "@/components/ui";
import { requireApp } from "@/lib/require-app";
import { actorActual } from "@/lib/proyectos/gestion.server";
import { misRendiciones } from "@/lib/proyectos/rendiciones.server";
import { SIN_MIGRACION } from "@/lib/proyectos/rendiciones-core";
import { formatearPesos } from "@/lib/rendiciones/dinero";
import { tarjeta } from "../../_vista";
import { ListaRendiciones } from "../../[id]/_rendiciones";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mis rendiciones" };

// Vive junto a «Mi liquidación» (misma app, la de todo el equipo): lo que se reintegra termina ahí.
export default async function MisRendiciones() {
  await requireApp("gestion-mi-liquidacion");
  const a = await actorActual();
  // Se lee siempre por la persona de la sesión: no hay manera de pedir las de otro desde acá.
  const r = await misRendiciones(a);
  const porRevisar = r.filas.filter((f) => f.estado === "enviada");
  const aprobadas = r.filas.filter((f) => f.estado === "aprobada");
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5">
      <Link href="/admin/proyectos/mi-liquidacion" className="inline-flex min-h-11 items-center text-sm underline">← Mi liquidación</Link>
      <h1 className="mb-4 text-2xl font-bold text-strong">Mis rendiciones</h1>
      {!a.personaId ? (
        <p className={cn(tarjeta, "text-sm text-muted")}>Tu usuario no está vinculado a una persona del equipo. Pedile a Dirección que te vincule en Equipo y permisos.</p>
      ) : !r.disponible ? (
        <p className={cn(tarjeta, "text-sm text-muted")}>{SIN_MIGRACION}</p>
      ) : (
        <section className={tarjeta} aria-label="Mis rendiciones">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-muted">Para revisar</dt><dd className="text-lg font-semibold tabular-nums text-strong">{formatearPesos(porRevisar.reduce((s, f) => s + f.montoCentavos, 0))}</dd></div>
            <div><dt className="text-muted">Aprobado, a reintegrar</dt><dd className="text-lg font-semibold tabular-nums text-strong">{formatearPesos(aprobadas.filter((f) => f.medio === "PROPIO").reduce((s, f) => s + f.montoCentavos, 0))}</dd></div>
          </dl>
          <p className="mt-2 text-sm text-muted">Para rendir un gasto, entrá al proyecto y abrí la pestaña «Rendiciones».</p>
          <ListaRendiciones filas={r.filas} conProyecto vacio="Todavía no rendiste gastos." />
        </section>
      )}
    </main>
  );
}
