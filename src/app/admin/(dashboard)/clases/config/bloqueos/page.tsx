import { requireApp } from "@/lib/require-app";
import { cn } from "@/components/ui";
import { badgePendientes, configCompleta } from "@/lib/padel/datos.server";
import { tarjeta } from "../../_vista";
import { EncabezadoAjuste } from "../_encabezado";
import { FormBloqueo, QuitarBloqueo } from "./Formularios";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clases · Días bloqueados", manifest: "/clases/app.webmanifest" };

const fechaLinda = (d: Date | null) => (d ? d.toISOString().slice(0, 10).split("-").reverse().join("/") : "");

// Ajustes → Días bloqueados: lluvia, viaje, torneo. El turnero deja de ofrecer esas horas.
// Provisional: el diseño los lleva a Semana («🌧 Se suspende» / «Bloquear días», Tanda 3A), que
// además avisa las clases afectadas. Mientras tanto viven acá para no perder la función.
export default async function AjustesBloqueos() {
  await requireApp("padel-clases");
  const [{ bloqueos }, numero] = await Promise.all([configCompleta(), badgePendientes()]);
  const lista = bloqueos.filter((b) => b.tipo === "NO");
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <EncabezadoAjuste titulo="Días bloqueados" detalle="Lluvia, viaje, torneo: el turnero deja de ofrecerlos." pendientes={numero} />
      <section className={cn(tarjeta, "mb-4")} aria-label="Bloquear un día">
        <FormBloqueo />
        <p className="mt-3 text-sm text-muted">Si ya tenés clases ese día, cancelalas o movelas desde Hoy o Semana: el bloqueo no las toca.</p>
      </section>
      {lista.length > 0 ? (
        <ul className="grid gap-2" aria-label="Días bloqueados por delante">
          {lista.map((b) => {
            const etiqueta = `${fechaLinda(b.fecha)} · ${b.desde === "00:00" && b.hasta === "23:59" ? "todo el día" : `${b.desde} a ${b.hasta}`}`;
            return (
              <li key={b.id} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-raised px-3 text-sm text-strong" data-qa="bloqueo">
                <span className="tabular-nums">{etiqueta}</span>
                <QuitarBloqueo id={b.id} etiqueta={etiqueta} />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">No tenés días bloqueados por delante.</p>
      )}
    </main>
  );
}
