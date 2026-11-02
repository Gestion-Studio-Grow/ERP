import Link from "next/link";
import { buttonClasses, cn } from "@/components/ui";
import { requireApp } from "@/lib/require-app";
import { actorActual } from "@/lib/proyectos/gestion.server";
import { fechaCorta, pesos } from "@/lib/proyectos/core";
import { etiquetaMes, leerExtras, totalDeExtras } from "@/lib/proyectos/empresa-core";
import { misLiquidaciones } from "@/lib/proyectos/empresa.server";
import { tarjeta } from "../_vista";
import { MarcarVista } from "../administracion/_controles";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mi liquidación" };

export default async function MiLiquidacion({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  await requireApp("gestion-mi-liquidacion");
  const a = await actorActual();
  const { periodo } = await searchParams;
  // Se lee siempre por la persona de la sesión: no hay manera de pedir la de otro desde acá.
  const lista = a.personaId ? await misLiquidaciones(a.tenantId, a.personaId) : [];
  const elegida = lista.find((l) => l.periodo === periodo) ?? lista[0];
  const extras = elegida ? leerExtras(elegida.extras) : [];
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-5">
      <h1 className="mb-4 text-2xl font-bold text-strong">Mi liquidación</h1>
      {!a.personaId ? (
        <p className={cn(tarjeta, "text-sm text-muted")}>Tu usuario no está vinculado a una persona del equipo, así que no hay liquidaciones para mostrar. Pedile a Dirección que te vincule en Equipo y permisos.</p>
      ) : !elegida ? (
        <p className={cn(tarjeta, "text-sm text-muted")}>Todavía no tenés liquidaciones publicadas. Cuando Administración publique una, te llega un aviso y aparece acá.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
          <nav aria-label="Períodos" className="grid content-start gap-1">
            {lista.map((l) => (
              <Link key={l.id} href={`/admin/proyectos/mi-liquidacion?periodo=${l.periodo}`} prefetch={false} aria-current={l.id === elegida.id ? "page" : undefined} className={cn("flex min-h-11 items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm", l.id === elegida.id ? "bg-accent text-on-accent" : "bg-surface-raised text-strong")}>
                <span className="first-letter:uppercase">{etiquetaMes(l.periodo)}</span>
                <span className="tabular-nums">{pesos(l.total)}</span>
              </Link>
            ))}
          </nav>
          <section className={tarjeta}>
            <MarcarVista id={elegida.id} />
            <h2 className="font-semibold text-strong first-letter:uppercase">{etiquetaMes(elegida.periodo)}</h2>
            <p className="text-sm text-muted">{elegida.persona.nombre}{elegida.persona.puesto ? ` · ${elegida.persona.puesto}` : ""}</p>
            <p className="my-3 text-3xl font-bold tabular-nums text-strong">{pesos(elegida.total)}</p>
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between gap-2 border-t border-line pt-2"><dt className="text-muted">Sueldo base</dt><dd className="tabular-nums text-strong">{pesos(elegida.base)}</dd></div>
              <div className="flex justify-between gap-2 border-t border-line pt-2"><dt className="text-muted">Extras por evento</dt><dd className="tabular-nums text-strong">{pesos(totalDeExtras(extras))}</dd></div>
              {extras.map((e, i) => (
                <div key={i} className="flex justify-between gap-2 pl-3 text-xs"><dt className="min-w-0 break-words text-muted">{e.nombre}</dt><dd className="tabular-nums text-muted">{pesos(e.monto)}</dd></div>
              ))}
              <div className="flex justify-between gap-2 border-t border-line pt-2"><dt className="text-muted">Factura a</dt><dd className="min-w-0 break-words text-right text-strong">{elegida.facturaA || "—"}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-muted">Publicada el {fechaCorta(elegida.publicadaEl)}.</p>
            <Link href={`/admin/proyectos/imprimir-liquidacion/${elegida.id}`} prefetch={false} className={cn(buttonClasses("solid", "md"), "mt-3 min-h-11")}>Descargar PDF</Link>
          </section>
        </div>
      )}
    </main>
  );
}
