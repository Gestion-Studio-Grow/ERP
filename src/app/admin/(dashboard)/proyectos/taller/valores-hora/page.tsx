// TALLER DE STANDS (GSG-MIA-004 · T3) — valor hora POR PERSONA (decisión del dueño), con vigencia desde una fecha.
// Sólo con el taller activo (flag + módulo + rubro) y para quien ve costos; si no, «no encontrado».
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { Button, EmptyState } from "@/components/ui";
import { pesos } from "@/lib/proyectos/core";
import { exigirVer, puede } from "@/lib/proyectos/gestion.server";
import { valorHoraVigente } from "@/lib/taller-stands/horas";
import { personasDelTaller, tallerActivo, valoresHoraDelTaller } from "@/lib/taller-stands/datos.server";
import { guardarValorHora } from "@/lib/taller-stands/acciones";
import { campo, etiqueta, tarjeta } from "../../_vista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Valor hora por persona" };

const fechaCorta = (d: Date) => d.toLocaleDateString("es-AR", { timeZone: "UTC" });
const hoyIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

export default async function ValoresHora({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  await requireApp("proyectos");
  const a = await exigirVer("cotizaciones");
  if (!puede(a, "costos", "ver") || !(await tallerActivo(a.tenantId))) notFound();
  const [{ aviso }, { sinMigrar, valores }, personas] = await Promise.all([searchParams, valoresHoraDelTaller(a.tenantId), personasDelTaller(a.tenantId)]);
  const edita = puede(a, "equipo", "editar") || puede(a, "cotizaciones", "editar");
  const hoy = new Date();
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5">
      <Link href="/admin/proyectos/taller/piezas" className="inline-flex min-h-11 items-center text-sm underline">← Catálogo de piezas</Link>
      <h1 className="mb-1 text-2xl font-bold text-strong">Valor hora por persona</h1>
      <p className="mb-4 text-sm text-muted">Cuánto cuesta una hora de cada persona del taller. Al cargar horas en un stand se congela el valor vigente en esa fecha; cambiarlo después no toca lo ya cargado.</p>
      {aviso && <p role="status" className="mb-4 rounded-lg border border-line bg-surface px-3 py-2 text-sm">{aviso}</p>}

      {sinMigrar ? (
        <EmptyState title="El valor hora todavía no está habilitado" description="Falta un paso de instalación del taller. Ya está anotado; cuando esté, vas a poder cargar el valor hora de cada persona acá." />
      ) : personas.length === 0 ? (
        <EmptyState title="Todavía no hay personas en el equipo" description="Cargá primero a la gente del taller en el equipo de la empresa." />
      ) : (
        <>
          {edita && (
            <form action={guardarValorHora} className={`${tarjeta} mb-4 grid gap-3 sm:grid-cols-[1fr_9rem_10rem_auto] sm:items-end`}>
              <label className={etiqueta}>
                Persona
                <select name="personaId" required className={campo}>
                  {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </label>
              <label className={etiqueta}>Valor hora<input name="valorHora" inputMode="decimal" required className={campo} placeholder="0" /></label>
              <label className={etiqueta}>Rige desde<input type="date" name="vigenteDesde" required defaultValue={hoyIso()} className={campo} /></label>
              <Button type="submit">Guardar</Button>
            </form>
          )}
          <ul className="grid gap-2">
            {personas.map((p) => {
              const suyos = valores.filter((v) => v.personaId === p.id);
              const vigente = valorHoraVigente(suyos, hoy);
              return (
                <li key={p.id} className={tarjeta}>
                  <p className="text-sm"><span className="font-semibold text-strong">{p.nombre}</span> · {vigente == null ? "sin valor hora vigente" : `${pesos(vigente)} la hora`}</p>
                  {suyos.length > 0 && (
                    <ul className="mt-1 text-xs text-muted">
                      {suyos.map((v) => <li key={v.id}>{pesos(v.valorHora)} desde el {fechaCorta(v.vigenteDesde)}</li>)}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
