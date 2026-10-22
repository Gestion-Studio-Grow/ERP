import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { buttonClasses, cn } from "@/components/ui";
import { badgePendientes, semana } from "@/lib/padel/datos.server";
import { fmtCalendarDateLabel, todayInBusinessTz } from "@/lib/datetime";
import { fechaValida, horaHumana } from "@/lib/padel/core";
import { ChipEstado, tarjeta, tonoEstado } from "../_vista";
import { Cabecera } from "../_cabecera";
import { AccionesClase } from "../_acciones";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clases · Semana", manifest: "/clases/app.webmanifest" };

const correr = (fecha: string, dias: number) =>
  new Date(new Date(`${fecha}T12:00:00.000Z`).getTime() + dias * 86_400_000).toISOString().slice(0, 10);

// Siete días, uno abajo del otro (en el celular no entran siete columnas). Cada clase se abre
// con un toque y muestra las mismas acciones que en Hoy.
export default async function ClasesSemana({ searchParams }: { searchParams: Promise<{ desde?: string }> }) {
  await requireApp("padel-clases");
  const { desde: q } = await searchParams;
  const hoy = todayInBusinessTz();
  const desde = q && fechaValida(q) ? q : hoy;
  const [dias, numero] = await Promise.all([semana(desde), badgePendientes()]);
  const total = dias.reduce((s, d) => s + d.clases.length, 0);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <Cabecera titulo="Semana" detalle={`${total} clase${total === 1 ? "" : "s"} del ${fmtCalendarDateLabel(desde)} en adelante.`} pendientes={numero} />

      <div className="mb-4 grid grid-cols-2 gap-2">
        <Link href={`/admin/clases/semana?desde=${correr(desde, -7)}`} className={cn(buttonClasses("outline", "md"), "w-full")}>← Anterior</Link>
        <Link href={`/admin/clases/semana?desde=${correr(desde, 7)}`} className={cn(buttonClasses("outline", "md"), "w-full")}>Siguiente →</Link>
      </div>

      <div className="grid gap-4">
        {dias.map((d) => (
          <section key={d.fecha} aria-label={fmtCalendarDateLabel(d.fecha)}>
            <h2 className="mb-2 text-sm font-bold capitalize text-strong">
              {d.fecha === hoy ? "Hoy · " : ""}{fmtCalendarDateLabel(d.fecha)}
              <span className="font-normal text-muted"> ({d.clases.length})</span>
            </h2>
            {d.clases.length === 0 ? (
              <p className="text-sm text-muted">Libre.</p>
            ) : (
              <ul className="grid gap-2">
                {d.clases.map((c) => (
                  <li key={c.id} className={tarjeta} style={{ borderLeft: `4px solid ${tonoEstado(c.estado)}` }} data-qa="clase-semana">
                    <details>
                      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                        <span className="flex items-baseline gap-2">
                          <span className="font-mono font-bold text-strong">{horaHumana(c.empiezaEn)}</span>
                          <span className="font-semibold text-strong">{c.nombre}</span>
                        </span>
                        <ChipEstado estado={c.estado} pago={c.pagoEstado} />
                      </summary>
                      <div className="mt-3">
                        <AccionesClase c={c} />
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
