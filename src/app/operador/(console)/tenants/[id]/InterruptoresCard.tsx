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

import Link from "next/link";
import { cambiarInterruptor } from "@/lib/operador/interruptores-actions";
import { Bloque, Button, Input, Marca } from "@/components/ui";
import { INTERRUPTORES, type Interruptor } from "@/cambios/interruptores";
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
  const perdidas = interruptor.cambiaLasApps ? frente.pierde.map((a) => a.nombre) : [];
  const bloqueadoPorApps = !prendido && perdidas.length > 0;
  const bloqueadoPorCandado = candado !== null && !candado.puedeTocar;
  const previa = `interruptor-${interruptor.id}-previa`;

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
      {perdidas.join(", ")}. No se puede prender así:{" "}
      <Link href={`/operador/tenants/${tenantId}?pestana=plan#apps`} className="underline">
        fijá la asignación actual
      </Link>{" "}
      primero.
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
        {candado && (
          <p className="mt-1 text-[13px] text-warning">
            Cliente vivo en producción: sólo el dueño de GSG ({candado.duenio}) lo puede prender o apagar, escribiendo el nombre
            corto del negocio para confirmar.
          </p>
        )}
      </div>
      <form action={cambiarInterruptor} className="flex flex-wrap items-end gap-2">
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
