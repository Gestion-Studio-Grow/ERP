// FC-01 · EJERCICIO CONTABLE — el año contable del negocio: cuándo arranca y cuándo cierra.
//
// Un ejercicio dura hasta un año (el primero puede ser irregular, más corto) y no se pisa con otro
// (`abrirEjercicio` lo controla con un candado por negocio). El cierre del ejercicio es de una tanda
// posterior. Mismo esquema que el Plan de cuentas: 404 con el interruptor apagado y aviso si falta la
// migración.

import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { Badge, EmptyState, Field, Input, PageHeader, buttonClasses } from "@/components/ui";
import { estadoContabilidadDelNegocio } from "@/lib/contabilidad/modulo.server";
import { listarEjercicios } from "@/lib/contabilidad/repo-plan";
import { diaIso, ejercicioSugerido } from "@/lib/contabilidad/plan-vista";
import { abrirEjercicioAccion } from "../actions";
import { AvisoMigracionPendiente, AvisoResultado } from "../_partes";

export const dynamic = "force-dynamic";

const fecha = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default async function EjercicioContablePage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  await requireApp("ejercicio-contable");
  const tenantId = await getCurrentTenantId();
  const estado = await estadoContabilidadDelNegocio(tenantId);
  if (estado === "OCULTO") notFound();
  const { r } = await searchParams;

  const lista = estado === "LISTO" ? await listarEjercicios(tenantId) : null;
  if (!lista || (!lista.ok && lista.error === "MIGRACION_PENDIENTE")) {
    return (
      <main data-ui="pagina" className="mx-auto w-full max-w-3xl px-4 py-6">
        <PageHeader title="Ejercicio contable" />
        <AvisoMigracionPendiente />
      </main>
    );
  }
  if (!lista.ok) throw new Error(lista.mensaje);
  const sugerido = ejercicioSugerido(lista.ejercicios, new Date());

  return (
    <main data-ui="pagina" className="mx-auto w-full max-w-3xl px-4 py-6">
      <PageHeader
        title="Ejercicio contable"
        description="El año contable del negocio. Si tu cierre no es el 31 de diciembre, poné la fecha que te indique tu contador."
      />
      <div className="mt-4 flex flex-col gap-6">
        <AvisoResultado codigo={r} />

        <section aria-labelledby="abrir-titulo" className="flex flex-col gap-3 rounded-lg border border-line px-4 py-4">
          <h2 id="abrir-titulo" className="text-lg font-semibold text-strong">Abrir un ejercicio</h2>
          <form action={abrirEjercicioAccion} className="flex flex-wrap items-end gap-3">
            <Field label="Arranca el" htmlFor="inicio">
              <Input id="inicio" name="inicio" type="date" required defaultValue={sugerido.inicio} />
            </Field>
            <Field label="Cierra el" htmlFor="cierre" hint="Hasta un año después del inicio.">
              <Input id="cierre" name="cierre" type="date" required defaultValue={sugerido.cierre} />
            </Field>
            <button type="submit" className={buttonClasses("solid", "md")}>Abrir el ejercicio</button>
          </form>
        </section>

        <section aria-labelledby="lista-titulo" className="flex flex-col gap-3">
          <h2 id="lista-titulo" className="text-lg font-semibold text-strong">Ejercicios del negocio</h2>
          {lista.ejercicios.length === 0 ? (
            <EmptyState title="Todavía no abriste ningún ejercicio" description="Sin ejercicio abierto no se pueden anotar asientos. Abrí el primero arriba." />
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
              {lista.ejercicios.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span className="text-body">
                    <time dateTime={diaIso(e.fechaInicio)}>{fecha.format(e.fechaInicio)}</time> al{" "}
                    <time dateTime={diaIso(e.fechaCierre)}>{fecha.format(e.fechaCierre)}</time>
                  </span>
                  {e.estado === "ABIERTO" ? <Badge tone="success">Abierto</Badge> : <Badge tone="neutral">Cerrado</Badge>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
