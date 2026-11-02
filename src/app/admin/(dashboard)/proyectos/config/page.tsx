import { requireApp } from "@/lib/require-app";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { buttonClasses } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { configProyectos, veLaPlata } from "@/lib/proyectos/datos.server";
import { guardarConfig } from "@/lib/proyectos/acciones";
import { COSTO_LABEL, type ClaveCosto } from "@/lib/proyectos/stand";
import { BarraProyectos, campo, etiqueta, tarjeta } from "../_vista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configuración de proyectos" };

export default async function ConfigProyectos() {
  const user = await requireApp("proyectos");
  await requireCapability("agenda:manage");
  const c = await configProyectos(await getCurrentTenantId());

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <h1 className="mb-4 text-2xl font-bold text-strong">Configuración</h1>
      <BarraProyectos activa="/admin/proyectos/config" conPlata={veLaPlata(user)} />
      <form action={guardarConfig} className="grid gap-4">
        <section className={tarjeta} aria-label="Presupuestos">
          <h2 className="mb-3 font-semibold text-strong">Presupuestos</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={etiqueta}>Recargo sobre el costo %<input name="margenPct" inputMode="decimal" defaultValue={String(c.margenPct)} className={campo} /></label>
            <label className={etiqueta}>Validez en días<input name="validezDias" inputMode="numeric" defaultValue={String(c.validezDias)} className={campo} /></label>
            <label className={etiqueta}>IVA %<input name="ivaPct" inputMode="decimal" defaultValue={String(c.ivaPct)} className={campo} /></label>
          </div>
          <label className={`${etiqueta} mt-3`}>
            Condiciones de siempre
            <textarea name="condiciones" rows={4} defaultValue={c.condiciones} className="w-full rounded-lg border border-line bg-surface p-3 text-sm text-strong" />
          </label>
        </section>
        <section className={tarjeta} aria-label="Costos del armador">
          <h2 className="font-semibold text-strong">Costos del armador de stands</h2>
          <p className="mb-3 text-sm text-muted">Son de referencia, provisionales: cargá los tuyos antes de presupuestar con ellos.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(COSTO_LABEL) as ClaveCosto[]).map((k) => (
              <label key={k} className={etiqueta}>{COSTO_LABEL[k]}<input name={`costo_${k}`} inputMode="decimal" defaultValue={String(c.costos[k])} className={campo} /></label>
            ))}
          </div>
        </section>
        <SubmitButton className={buttonClasses("solid", "lg")}>Guardar configuración</SubmitButton>
      </form>
    </main>
  );
}
