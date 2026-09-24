// ============================================================================
// Tarjeta "Trabaja por apps" de la ficha del operador (server component).
// ============================================================================
//
// Prende y apaga el interruptor "inicio-por-apps" de ESTE negocio, sin deploy. Muestra la vista
// previa (qué apps gana y cuáles pierde frente a su menú de siempre, con la misma función que arma
// el Inicio del negocio) y el historial con el nombre del operador y la hora. El botón deshabilitado
// es comodidad: la action (src/lib/operador/interruptores-actions.ts) vuelve a decidir todo con la
// base fresca, incluido el candado de CH y las 0 apps perdidas.

import Link from "next/link";
import { cambiarInterruptor } from "@/lib/operador/interruptores-actions";
import { Badge, Button, Input } from "@/components/ui";
import { INICIO_POR_APPS, interruptorPorId } from "@/cambios/interruptores";
import type { EstadoInterruptor } from "@/cambios/interruptores-core";
import type { EstadoAppsDelNegocio } from "./apps-del-negocio";
import type { CambioDeInterruptor } from "./negocio.server";

const fecha = (d: Date) =>
  d.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    dateStyle: "short",
    timeStyle: "short",
  });

export function InterruptoresCard({
  tenantId,
  slug,
  modulosVistos,
  estado,
  apps,
  historial,
  candado,
}: {
  tenantId: string;
  slug: string;
  /** `Tenant.modules` tal como se leyó para armar esta pantalla. */
  modulosVistos: readonly string[];
  /** El interruptor leído de la base, o `null` si no se pudo leer. */
  estado: EstadoInterruptor | null;
  apps: EstadoAppsDelNegocio;
  historial: CambioDeInterruptor[];
  /**
   * CH: `null` si no tiene candado; si lo tiene, si el operador de esta sesión es el dueño de GSG
   * (el único que puede tocarlo) y su nombre.
   */
  candado: { puedeTocar: boolean; duenio: string } | null;
}) {
  const interruptor = interruptorPorId(INICIO_POR_APPS);
  const frente = apps.conInicioFrenteAlMenu;
  const prendido = estado?.encendido ?? false;
  const perdidas = frente.pierde.map((a) => a.nombre);
  const bloqueadoPorApps = !prendido && perdidas.length > 0;
  const bloqueadoPorCandado = candado !== null && !candado.puedeTocar;

  return (
    <section
      id="interruptores"
      aria-labelledby="interruptores-titulo"
      className="scroll-mt-6 rounded-lg border border-line bg-surface-raised p-5 shadow-card space-y-4"
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="interruptores-titulo" className="font-medium">
            {interruptor.nombre}
          </h2>
          {estado && (
            <Badge tone={prendido ? "success" : "neutral"} dot>
              {prendido ? "Sí" : "No"}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted">{interruptor.queCambia} Se prende y se apaga desde acá, sin deploy.</p>
      </div>

      {!estado ? (
        <p role="alert" className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          No se pudo leer si este negocio trabaja por apps. Recargá la ficha: sin ese dato no se ofrece cambiarlo.
        </p>
      ) : (
        <>
          <div id="interruptor-previa" className="space-y-1 text-sm">
            {prendido ? (
              <p className="text-muted">
                Si lo apagás, vuelve a su menú de siempre en la próxima carga
                {frente.gana.length > 0 ? `, y deja de ver: ${frente.gana.map((a) => a.nombre).join(", ")}` : ""}.
              </p>
            ) : apps.sinAsignacion ? (
              <p className="text-muted">
                No tiene módulos asignados: con el Inicio por apps ve las mismas apps que hoy, sin filtro por
                módulo. Fijá la asignación primero si querés que sus módulos decidan.
              </p>
            ) : perdidas.length === 0 ? (
              <p className="text-success">
                ✓ 0 apps perdidas frente a su menú de siempre.
                {frente.gana.length > 0 && (
                  <span className="block break-words">Además gana: {frente.gana.map((a) => a.nombre).join(", ")}.</span>
                )}
              </p>
            ) : (
              <p className="text-warning break-words">
                <b>
                  Perdería {perdidas.length} {perdidas.length === 1 ? "app" : "apps"}:
                </b>{" "}
                {perdidas.join(", ")}. No se puede prender así:{" "}
                <Link href={`/operador/tenants/${tenantId}#apps`} className="underline">
                  fijá la asignación actual
                </Link>{" "}
                primero.
              </p>
            )}
            {candado && (
              <p className="text-warning">
                Cliente vivo en producción: sólo el dueño de GSG ({candado.duenio}) lo puede prender o apagar,
                escribiendo el slug del negocio.
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
              <label className="block text-sm">
                <span className="text-muted">Escribí «{slug}» para confirmar</span>
                <Input name="slug" autoComplete="off" required disabled={bloqueadoPorCandado} className="font-mono" />
              </label>
            )}
            <Button
              type="submit"
              variant={prendido ? "danger" : "solid"}
              disabled={bloqueadoPorApps || bloqueadoPorCandado}
              aria-describedby="interruptor-previa"
            >
              {prendido ? "Apagar" : "Prender"}
            </Button>
          </form>
        </>
      )}

      <div className="space-y-2 border-t border-line pt-4">
        <h3 className="text-sm font-medium">Historial</h3>
        {historial.length === 0 ? (
          <p className="text-sm text-muted">Nunca se prendió ni se apagó en este negocio.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {historial.map((h) => (
              <li key={h.id} className="break-words">
                {h.encendio ? "Prendió" : "Apagó"} “{interruptorPorId(h.interruptor).nombre}” ·{" "}
                <span className="font-medium">{h.quien}</span> · <span className="text-muted">{fecha(h.cuando)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">
          En la Auditoría del negocio figura como «GSG activó el Inicio por apps», sin el nombre del operador.
        </p>
      </div>
    </section>
  );
}
