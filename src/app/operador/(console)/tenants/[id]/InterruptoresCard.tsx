// ============================================================================
// «Interruptores» de la ficha del negocio (pestaña Plan y apps). Server component.
// ============================================================================
//
// Prende y apaga, sin deploy, CADA interruptor del catálogo (src/cambios/interruptores.ts) en ESTE
// negocio: hoy «Trabaja por apps» y «Diseño nuevo». Uno nuevo en el catálogo aparece acá solo.
// Un renglón por interruptor: su estado (forma + palabra), qué cambia, la vista previa y UNA tecla.
//   · Los que cambian qué apps ve cada persona (`cambiaLasApps`) dicen qué apps gana y cuáles
//     pierde frente a su menú de siempre (la misma función que arma el Inicio del negocio).
//   · Los que sólo cambian cómo se ve (el diseño) dicen eso, y nada los frena por apps.
// La tecla deshabilitada es comodidad: la action (src/lib/operador/interruptores-actions.ts)
// vuelve a decidir todo con la base fresca, incluido el candado de CH (sólo el dueño, escribiendo
// el slug) y las 0 apps perdidas. El historial vive en la pestaña Historial.
//   · Fuera de CH, si prender «Trabaja por apps» le saca apps, el operador puede aceptarlo marcando
//     UNA POR UNA las que pierde (una casilla por app): el servidor exige la lista exacta y la guarda
//     en la fila. En CH no se ofrece (y el servidor lo rechaza igual).
// «Apps ocultas» (`AppsOcultasCard`): una lista cerrada de apps que GSG puede esconder en este negocio
// (menú, buscador y ruta). Nunca en CH.

import Link from "next/link";
import { cambiarAppOculta, cambiarInterruptor } from "@/lib/operador/interruptores-actions";
import { Bloque, Button, Input, Marca } from "@/components/ui";
import { APPS_OCULTABLES, INTERRUPTORES, type Interruptor } from "@/cambios/interruptores";
import type { EstadoInterruptores } from "@/cambios/interruptores-core";
import type { EstadoAppsDelNegocio } from "./apps-del-negocio";

interface Props {
  tenantId: string;
  slug: string;
  /** `Tenant.modules` tal como se leyó para armar esta pantalla. */
  modulosVistos: readonly string[];
  apps: EstadoAppsDelNegocio;
  /** Todos los interruptores leídos de la base, o `null` si no se pudo. */
  estados: EstadoInterruptores | null;
  /** Negocio vivo con candado (CH): quién puede tocarlo y si esta sesión puede. */
  candado: { puedeTocar: boolean; duenio: string } | null;
}

export function InterruptoresCard({ estados, ...resto }: Props) {
  return (
    <Bloque id="interruptores" titulo="Interruptores" nota="Se nota la próxima vez que abran su panel, sin publicar nada nuevo" className="scroll-mt-24">
      {!estados ? (
        <p role="alert" className="border-b border-line py-3 text-sm text-warning">
          No se pudo leer el estado de los interruptores de este negocio. Recargá la ficha: sin ese dato no se ofrece
          cambiarlos.
        </p>
      ) : (
        INTERRUPTORES.map((i) => <RenglonDeInterruptor key={i.id} {...resto} interruptor={i} prendido={estados[i.id].encendido} />)
      )}
    </Bloque>
  );
}

function RenglonDeInterruptor({
  tenantId,
  slug,
  modulosVistos,
  apps,
  candado,
  interruptor,
  prendido,
}: Omit<Props, "estados"> & { interruptor: Interruptor; prendido: boolean }) {
  const frente = apps.conInicioFrenteAlMenu;
  const perdidasApps = interruptor.cambiaLasApps ? frente.pierde : [];
  const perdidas = perdidasApps.map((a) => a.nombre);
  // Fuera de CH se puede prender aceptando a mano lo que pierde; en CH, como siempre, se frena.
  const aceptaAMano = !prendido && perdidas.length > 0 && candado === null;
  const bloqueadoPorApps = !prendido && perdidas.length > 0 && !aceptaAMano;
  const bloqueadoPorCandado = candado !== null && !candado.puedeTocar;
  const previa = `interruptor-${interruptor.id}-previa`;
  const formId = `interruptor-${interruptor.id}-form`;

  const texto = !interruptor.cambiaLasApps ? (
    <span className="text-muted">
      {prendido ? "Si lo apagás, en la próxima carga se ve como siempre." : "No cambia qué apps ve cada persona ni sus datos: sólo cómo se ven."}
    </span>
  ) : prendido ? (
    <span className="text-muted">
      Si lo apagás, vuelve a su menú de siempre en la próxima carga
      {frente.gana.length > 0 ? `, y deja de ver: ${frente.gana.map((a) => a.nombre).join(", ")}` : ""}.
    </span>
  ) : apps.sinAsignacion ? (
    <span className="text-muted">
      No tiene módulos asignados: con el Inicio por apps ve las mismas apps que hoy, sin filtro por módulo. Fijá la
      asignación primero si querés que sus módulos decidan.
    </span>
  ) : perdidas.length === 0 ? (
    <span className="text-success">
      0 apps perdidas frente a su menú de siempre.
      {frente.gana.length > 0 && <> Además gana: {frente.gana.map((a) => a.nombre).join(", ")}.</>}
    </span>
  ) : (
    <span className="text-warning">
      <b>
        Perdería {perdidas.length} {perdidas.length === 1 ? "app" : "apps"}:
      </b>{" "}
      {perdidas.join(", ")}.{" "}
      {aceptaAMano ? (
        <>
          Para prenderlo igual, marcá abajo una por una las que acepta perder (queda en el historial), o{" "}
          <Link href={`/operador/tenants/${tenantId}?pestana=plan#apps`} className="underline">
            fijá la asignación actual
          </Link>{" "}
          primero.
        </>
      ) : (
        <>
          No se puede prender así:{" "}
          <Link href={`/operador/tenants/${tenantId}?pestana=plan#apps`} className="underline">
            fijá la asignación actual
          </Link>{" "}
          primero.
        </>
      )}
    </span>
  );

  return (
    <div role="group" aria-labelledby={`interruptor-${interruptor.id}-titulo`} className="grid gap-x-4 gap-y-2 border-b border-line py-3 lg:grid-cols-[var(--col-folio,5.5rem)_minmax(0,1fr)_auto] lg:items-start">
      <span className="pt-0.5">
        <Marca tipo={prendido ? "hecho" : "pendiente"}>{prendido ? "Prendido" : "Apagado"}</Marca>
      </span>
      <div className="min-w-0">
        <h3 id={`interruptor-${interruptor.id}-titulo`} className="text-[15px] font-semibold text-strong">
          {interruptor.nombre}
        </h3>
        <p className="text-[13px] text-muted">{interruptor.queCambia}</p>
        <p id={previa} className="mt-1 break-words text-[13px]">
          {texto}
        </p>
        {aceptaAMano && (
          <fieldset className="mt-2 grid gap-1 text-[13px]">
            <legend className="mb-1 font-semibold text-strong">
              Acepto que deje de ver estas {perdidas.length} {perdidas.length === 1 ? "app" : "apps"}:
            </legend>
            {perdidasApps.map((a) => (
              <label key={a.id} className="flex items-center gap-2">
                {/* `form`: la casilla vive en esta columna pero viaja con el formulario de la tecla. */}
                <input type="checkbox" name="perdidaAceptada" value={a.id} form={formId} required />
                <span>{a.nombre}</span>
              </label>
            ))}
          </fieldset>
        )}
        {candado && (
          <p className="mt-1 text-[13px] text-warning">
            Cliente vivo en producción: sólo el dueño de GSG ({candado.duenio}) lo puede prender o apagar, escribiendo el nombre
            corto del negocio para confirmar.
          </p>
        )}
      </div>
      <form id={formId} action={cambiarInterruptor} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="tenantId" value={tenantId} />
        <input type="hidden" name="interruptor" value={interruptor.id} />
        <input type="hidden" name="accion" value={prendido ? "apagar" : "encender"} />
        <input type="hidden" name="visto" value={prendido ? "encendido" : "apagado"} />
        <input type="hidden" name="modulosVistos" value={JSON.stringify(modulosVistos)} />
        {candado && (
          <label className="block text-[13px]">
            <span className="text-muted">Escribí «{slug}»</span>
            <Input name="slug" autoComplete="off" required disabled={bloqueadoPorCandado} className="font-mono" />
          </label>
        )}
        <Button
          type="submit"
          size="sm"
          variant={prendido ? "danger" : "solid"}
          disabled={bloqueadoPorApps || bloqueadoPorCandado}
          aria-label={`${prendido ? "Apagar" : "Prender"} «${interruptor.nombre}»`}
          aria-describedby={previa}
          // El mismo ancho prendido o apagado: los campos de todos los interruptores quedan alineados.
          className="min-w-[5.5rem]"
        >
          {prendido ? "Apagar" : "Prender"}
        </Button>
      </form>
    </div>
  );
}

// ── Apps ocultas ─────────────────────────────────────────────────────────────

/**
 * «Apps ocultas»: las apps de la lista cerrada (APPS_OCULTABLES) que GSG esconde en ESTE negocio,
 * del menú, del buscador y de su dirección. La tecla es comodidad: la action vuelve a decidir con la
 * base fresca y nunca toca un negocio con candado del dueño (CH).
 */
export function AppsOcultasCard({
  tenantId,
  ocultas,
  clienteVivo,
}: {
  tenantId: string;
  /** Las apps ocultas leídas de la base, o `null` si no se pudo. */
  ocultas: ReadonlySet<string> | null;
  /** Negocio con candado del dueño (CH): no se ofrece. */
  clienteVivo: boolean;
}) {
  return (
    <Bloque id="apps-ocultas" titulo="Apps ocultas" nota="Lo que este negocio no usa: sale del menú, del buscador y de su dirección" className="scroll-mt-24">
      {clienteVivo ? (
        <p className="border-b border-line py-3 text-[13px] text-warning">
          Cliente vivo en producción: sus apps no se ocultan desde la consola. Su menú queda como siempre.
        </p>
      ) : !ocultas ? (
        <p role="alert" className="border-b border-line py-3 text-sm text-warning">
          No se pudo leer qué apps están ocultas en este negocio. Recargá la ficha: sin ese dato no se ofrece cambiarlas.
        </p>
      ) : (
        APPS_OCULTABLES.map((a) => {
          const oculta = ocultas.has(a.id);
          return (
            <div key={a.id} role="group" aria-labelledby={`oculta-${a.id}-titulo`} className="grid gap-x-4 gap-y-2 border-b border-line py-3 lg:grid-cols-[var(--col-folio,5.5rem)_minmax(0,1fr)_auto] lg:items-center">
              <span>
                <Marca tipo={oculta ? "pendiente" : "hecho"}>{oculta ? "Oculta" : "A la vista"}</Marca>
              </span>
              <h3 id={`oculta-${a.id}-titulo`} className="text-[15px] font-semibold text-strong">
                {a.nombre}
              </h3>
              <form action={cambiarAppOculta}>
                <input type="hidden" name="tenantId" value={tenantId} />
                <input type="hidden" name="app" value={a.id} />
                <input type="hidden" name="accion" value={oculta ? "mostrar" : "ocultar"} />
                <input type="hidden" name="visto" value={oculta ? "oculta" : "visible"} />
                <Button type="submit" size="sm" variant={oculta ? "solid" : "danger"} aria-label={`${oculta ? "Mostrar" : "Ocultar"} «${a.nombre}»`} className="min-w-[5.5rem]">
                  {oculta ? "Mostrar" : "Ocultar"}
                </Button>
              </form>
            </div>
          );
        })
      )}
    </Bloque>
  );
}
