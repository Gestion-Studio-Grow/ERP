import { requireApp } from "@/lib/require-app";
import { requireCapabilityFueraDeLaAgenda } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { buttonClasses } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { configProyectos, veLaPlata } from "@/lib/proyectos/datos.server";
import { guardarConfig } from "@/lib/proyectos/acciones";
import { COSTO_LABEL, type ClaveCosto } from "@/lib/proyectos/stand";
import Link from "next/link";
import { guardarFormulaPrecio } from "@/lib/proyectos/acciones-precio";
import { formulaDelNegocio } from "@/lib/proyectos/precio-capas.server";
import { AVISO_PROVISIONAL, CLAVES_PARAMETRO, ETIQUETA_PARAMETRO, PARAMETROS_PROVISIONALES, textoDeBp } from "@/lib/proyectos/precio-capas-core";
import { BarraProyectos, campo, etiqueta, tarjeta } from "../_vista";
import { FormAccion } from "../[id]/_cliente";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configuración de proyectos" };

export default async function ConfigProyectos() {
  const user = await requireApp("proyectos");
  await requireCapabilityFueraDeLaAgenda("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const [c, formula] = await Promise.all([configProyectos(tenantId), formulaDelNegocio(tenantId)]);

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

      {/* MIA T1: fórmula de precio por capas, tras el interruptor de la Etapa 2 `proyectos-precio-capas` (apagado por
          defecto: la pantalla queda como en main). Prendido, la fórmula también arranca apagada hasta que Dirección la usa. */}
      {formula.encendida && (
      <section className={`${tarjeta} mt-4`} aria-labelledby="titulo-formula">
        <h2 id="titulo-formula" className="font-semibold text-strong">Precio por capas y comisiones</h2>
        {!formula.disponible ? (
          <p className="text-sm text-muted">Todavía no está habilitado en este negocio: falta actualizar la base.</p>
        ) : (
          <FormAccion accion={guardarFormulaPrecio} className="grid gap-3">
            <p className="text-sm text-muted">
              Costo → + rentabilidad → + comisiones (un % de la rentabilidad) → + margen de error → + Ingresos Brutos y gastos sobre la venta → precio sugerido.
              Los valores que vienen cargados son los de la planilla de MIA.
            </p>
            {PARAMETROS_PROVISIONALES && <p role="note" className="text-sm font-medium text-strong">{AVISO_PROVISIONAL}</p>}
            <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-strong">
              <input type="checkbox" name="activa" defaultChecked={formula.config.activa} className="size-5" />
              Usar esta fórmula en las fichas de los proyectos
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              {CLAVES_PARAMETRO.map((k) => (
                <label key={k} className={etiqueta}>{ETIQUETA_PARAMETRO[k]} %<input name={k} inputMode="decimal" defaultValue={textoDeBp(formula.config[k])} className={campo} /></label>
              ))}
            </div>
            <div><SubmitButton className={buttonClasses("solid", "md")}>Guardar la fórmula</SubmitButton></div>
          </FormAccion>
        )}
        {formula.vigente && (
          <p className="mt-3 text-sm">
            <Link href="/admin/proyectos/importar" className="inline-flex min-h-11 items-center underline">Importar la planilla de status (CSV)</Link>
          </p>
        )}
      </section>
      )}
    </main>
  );
}
