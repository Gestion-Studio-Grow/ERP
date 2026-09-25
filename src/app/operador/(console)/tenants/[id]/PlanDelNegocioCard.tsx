// ============================================================================
// TARJETA "PLAN DEL NEGOCIO" — ficha del operador (R2-F4).
// ============================================================================
//
// Elegir el plan con la vista previa de lo que gana y lo que pierde, y ajustar un límite para este
// negocio. Cambiar de plan sólo prende o apaga pantallas: los datos quedan. En CH (beauty-spa) sólo
// muestra el motivo, sin formulario. Server component: se exporta para montarlo en la ficha
// (page.tsx lo monta el frente del pase a real), con `id="plan"` para volver con el mensaje.

import { Bloque, Button, Franja, Marca, Renglon } from "@/components/ui";
import type { AppDescriptor } from "@/apps/contract";
import { catalogo } from "@/modules/catalog";
import { PROMESA_SIN_PERDER_DATOS } from "@/modules/perfil-datos";
import { LIMITE_IDS, PLAN_IDS, esPlanId, planPorId, type Tope } from "@/planes/catalogo";
import { LIMITES, limitesDelNegocio, type FilaDeLimite } from "@/planes/limites";
import { ESTADO_DE_LOS_PRECIOS, PRECIOS_PROVISIONALES } from "@/planes/precios";
import { aplicarPlanDelNegocio, ajustarLimiteDelNegocio } from "@/lib/operador/plan-actions";
import { leerFilasDeLimites, leerNegocioParaPlan } from "@/lib/operador/plan-escritura.server";
import { VALOR_SIN_TOPE } from "@/lib/operador/plan-formulario";
import { flagsDeApps, leerInterruptoresDe } from "./negocio.server";
import { requiereOkDelDuenio, type FlagsDeApps } from "./apps-del-negocio";
import { MOTIVO_PLAN_OK_DEL_DUENIO, vistaPreviaDePlan, type NegocioParaPlan } from "./plan-del-negocio";

export interface PlanDelNegocioCardProps {
  tenantId: string;
  /** Los flags de apps ya leídos por la ficha; si no llegan, la tarjeta los lee. */
  flags?: FlagsDeApps;
  /** `?plan=` de la URL: abre la vista previa de ese plan (vuelve abierta tras un error). */
  planAbierto?: string | null;
}

function pesos(n: number): string {
  return `$ ${n.toLocaleString("es-AR")}`;
}

function textoDeTope(t: Tope): string {
  return t === null ? "sin tope" : String(t);
}

function nombres(apps: readonly AppDescriptor[]): string {
  return apps.map((a) => a.nombre).join(", ");
}

function Diferencia({ gana, pierde }: { gana: readonly AppDescriptor[]; pierde: readonly AppDescriptor[] }) {
  if (gana.length === 0 && pierde.length === 0) return <p className="text-sm text-muted">No cambia ninguna app.</p>;
  return (
    <ul className="space-y-1 text-sm">
      {gana.length > 0 && (
        <li className="break-words text-success">
          <span className="font-semibold">Gana:</span> {nombres(gana)}
        </li>
      )}
      {pierde.length > 0 && (
        <li className="break-words text-danger">
          <span className="font-semibold">Deja de ver:</span> {nombres(pierde)}
        </li>
      )}
    </ul>
  );
}

function PrecioDelPlan({ plan }: { plan: string }) {
  if (!esPlanId(plan)) return null;
  const p = PRECIOS_PROVISIONALES[plan];
  return (
    <span className="text-sm text-muted">
      {pesos(p.mensual)} por mes ({pesos(p.anualPorMes)} pagando el año)
      {p.adicional ? ` · ${pesos(p.adicional.precio)} por cada ${p.adicional.por} de más` : ""} ·{" "}
      <b className="text-warning">{ESTADO_DE_LOS_PRECIOS}</b>
    </span>
  );
}

function OpcionDePlan({
  n,
  plan,
  flags,
  filas,
  abierto,
}: {
  n: NegocioParaPlan;
  plan: string;
  flags: FlagsDeApps;
  filas: readonly FilaDeLimite[];
  abierto: boolean;
}) {
  const previa = vistaPreviaDePlan(n, plan, flags, catalogo(), filas);
  const nombre = esPlanId(plan) ? planPorId(plan).nombre : plan;
  return (
    <details open={abierto} className="border-b border-line py-2">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-strong">
        Plan {nombre}
        {previa.ok && previa.sinCambios && <Marca tipo="hecho">Su plan de hoy</Marca>}
      </summary>
      <div className="space-y-3 pb-3 pt-1">
        <PrecioDelPlan plan={plan} />
        {!previa.ok ? (
          <Franja tono="atencion">{previa.motivo}</Franja>
        ) : previa.sinCambios ? (
          <p className="text-sm text-muted">Ya tiene este plan con sus pantallas al día. No hay nada que cambiar.</p>
        ) : (
          <form action={aplicarPlanDelNegocio} className="space-y-3">
            <input type="hidden" name="tenantId" value={n.id} />
            <input type="hidden" name="plan" value={previa.plan} />
            <input type="hidden" name="planVisto" value={n.plan ?? ""} />
            <input type="hidden" name="modulosVistos" value={JSON.stringify(n.modules)} />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-strong">Qué cambia en su Inicio apenas lo apliques</p>
              <Diferencia gana={previa.alAplicar.gana} pierde={previa.alAplicar.pierde} />
            </div>
            {!previa.trabajaPorApps && (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-strong">Cuando trabaje por apps</p>
                <p className="text-sm text-muted">
                  Hoy no tiene prendido «Trabaja por apps»: el plan todavía no filtra su Inicio. Con el interruptor prendido:
                </p>
                <Diferencia gana={previa.conInicio.gana} pierde={previa.conInicio.pierde} />
              </div>
            )}
            {previa.datosQueQuedan.length > 0 && (
              <ul className="space-y-1 text-sm text-muted">
                {previa.datosQueQuedan.map((t) => (
                  <li key={t} className="break-words">
                    {t}
                  </li>
                ))}
              </ul>
            )}
            {previa.excepcionesQueSeCierran.length > 0 && (
              <Franja tono="atencion">
                Se cierran {previa.excepcionesQueSeCierran.length === 1 ? "el ajuste" : "los ajustes"} de límites que tenía:{" "}
                {previa.excepcionesQueSeCierran
                  .map((e) => `${LIMITES[e.limite].nombre} (${textoDeTope(e.valor)}, plan ${planPorId(e.plan).nombre})`)
                  .join(", ")}
                . Con el plan nuevo valen sus topes.
              </Franja>
            )}
            <p className="text-sm text-strong">{PROMESA_SIN_PERDER_DATOS}</p>
            {previa.alAplicar.pierde.length > 0 && (
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" name="entiendo" value="si" className="h-5 w-5" required />
                Entiendo que deja de ver {previa.alAplicar.pierde.length === 1 ? "esa app" : "esas apps"} y que sus datos quedan guardados.
              </label>
            )}
            <Button type="submit" size="sm">
              Pasar al plan {previa.nombre}
            </Button>
          </form>
        )}
      </div>
    </details>
  );
}

function LimitesDelPlan({ n, filas }: { n: NegocioParaPlan; filas: readonly FilaDeLimite[] }) {
  const l = limitesDelNegocio({ slug: n.slug, plan: n.plan }, filas);
  if (!l.plan) {
    return <p className="border-b border-line py-3 text-sm text-muted">Sin plan del catálogo no se aplica ningún límite: se comporta como hoy.</p>;
  }
  const plan = l.plan;
  return (
    <>
      {LIMITE_IDS.map((id) => {
        const t = l.topes[id];
        return (
          <Renglon
            key={id}
            folio={<Marca tipo={t.origen === "excepcion" ? "atencion" : "info"}>{t.origen === "excepcion" ? "Ajustado" : "Del plan"}</Marca>}
            titulo={LIMITES[id].nombre}
            detalle={
              <form action={ajustarLimiteDelNegocio} className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted">
                  Vale {textoDeTope(t.valor)}
                  {t.origen === "excepcion" ? ` (el plan trae ${textoDeTope(t.delPlan)}; lo ajustó ${t.quien ?? "un operador"})` : ""}.
                </span>
                <input type="hidden" name="tenantId" value={n.id} />
                <input type="hidden" name="planVisto" value={plan} />
                <input type="hidden" name="limite" value={id} />
                <label className="sr-only" htmlFor={`limite-${id}`}>
                  Tope nuevo de {LIMITES[id].nombre}
                </label>
                <input
                  id={`limite-${id}`}
                  name="valor"
                  inputMode="numeric"
                  placeholder={`número, ${VALOR_SIN_TOPE} o vacío`}
                  className="h-11 w-44 rounded border border-line bg-surface px-2 text-sm sm:h-9"
                />
                <Button type="submit" variant="outline" size="sm">
                  Guardar
                </Button>
              </form>
            }
          />
        );
      })}
    </>
  );
}

export default async function PlanDelNegocioCard({ tenantId, flags, planAbierto }: PlanDelNegocioCardProps) {
  const n = await leerNegocioParaPlan(tenantId);
  if (!n) return null;
  const titulo = "Plan del negocio";
  if (requiereOkDelDuenio(n.slug)) {
    return (
      <div id="plan" className="scroll-mt-24">
        <Bloque titulo={titulo} cuenta="Con candado">
          <Franja tono="atencion">{MOTIVO_PLAN_OK_DEL_DUENIO}</Franja>
        </Bloque>
      </div>
    );
  }
  const [filas, interruptores] = await Promise.all([
    leerFilasDeLimites(tenantId).catch(() => null),
    flags ? Promise.resolve(null) : leerInterruptoresDe(tenantId),
  ]);
  const flagsReales = flags ?? (interruptores ? flagsDeApps(interruptores.estado) : null);
  const hoy = esPlanId(n.plan) ? `Plan ${planPorId(n.plan).nombre}` : "Sin plan del catálogo";
  return (
    <div id="plan" className="scroll-mt-24">
      <Bloque titulo={titulo} cuenta={hoy} nota="Cambiar de plan sólo prende o apaga pantallas. Los datos quedan.">
        {filas === null || flagsReales === null ? (
          <Franja tono="peligro">No pudimos leer sus límites o sus interruptores. Recargá la ficha para ver los planes.</Franja>
        ) : (
          <>
            {PLAN_IDS.map((p) => (
              <OpcionDePlan key={p} n={n} plan={p} flags={flagsReales} filas={filas} abierto={planAbierto === p} />
            ))}
            <LimitesDelPlan n={n} filas={filas} />
          </>
        )}
      </Bloque>
    </div>
  );
}
