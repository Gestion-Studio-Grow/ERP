// ============================================================================
// Tarjeta "Apps del negocio" de la ficha del operador (server component).
// ============================================================================
//
// Muestra qué apps ve el negocio hoy, si su asignación de módulos las reproduce con el
// Inicio por apps prendido, y deja cambiar un módulo SIEMPRE pasando por una vista previa
// que dice qué apps gana y cuáles pierde. Todo lo que se muestra acá lo calcula
// apps-del-negocio.ts con la misma función que arma el Inicio del negocio; esta tarjeta
// sólo lo pinta. Los formularios llevan la asignación que el operador vio (`vistos`): si
// cambió mientras miraba, la action rechaza en vez de pisar.

import Link from "next/link";
import { toggleTenantModule, fijarAsignacionActual } from "@/lib/operator-actions";
import { Badge, Button, buttonClasses } from "@/components/ui";
import type { AppDescriptor } from "@/apps/contract";
import type { Producto } from "@/lib/producto-identidad";
import type {
  AccionModulo,
  DiferenciaDeApps,
  EstadoAppsDelNegocio,
  PlanFijar,
  VistaPreviaDeCambio,
} from "./apps-del-negocio";

export interface FilaModuloFicha {
  id: string;
  nombre: string;
  descripcion: string;
  plugin: boolean;
  activo: boolean;
  /** Apps registradas que abre este módulo. 0 = todavía no abre ninguna pantalla. */
  apps: number;
}

export interface CambioRegistrado {
  id: string;
  cuando: Date;
  actor: string;
  accion: string;
  modulo: string | null;
  sumados: string[];
  /** `null` = la fila no guardó ese dato (auditorías anteriores a la ola 1). */
  antes: string[] | null;
  despues: string[] | null;
}

const NOMBRE_PRODUCTO: Record<Producto, string> = {
  vertical: "el sistema de su rubro",
  comerciante: "Comerciante",
  contador: "Contador (estudio contable)",
  facturita: "Facturita",
};

const fecha = (d: Date) =>
  d.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    dateStyle: "short",
    timeStyle: "short",
  });

function nombres(apps: readonly AppDescriptor[]): string {
  return apps.map((a) => a.nombre).join(", ");
}

/** "+ Stock, + Mermas" / "− Agenda": la diferencia en una línea legible. */
function ListaDeApps({ diff }: { diff: DiferenciaDeApps }) {
  if (diff.gana.length === 0 && diff.pierde.length === 0) {
    return <p className="text-sm text-muted">No cambia ninguna app.</p>;
  }
  return (
    <ul className="space-y-1 text-sm">
      {diff.gana.length > 0 && (
        <li className="text-success break-words">
          <span className="font-medium">Gana:</span> {diff.gana.map((a) => `+ ${a.nombre}`).join(", ")}
        </li>
      )}
      {diff.pierde.length > 0 && (
        <li className="text-danger break-words">
          <span className="font-medium">Pierde:</span> {diff.pierde.map((a) => `− ${a.nombre}`).join(", ")}
        </li>
      )}
    </ul>
  );
}

function textoDelGate(estado: EstadoAppsDelNegocio): string {
  switch (estado.gate) {
    case "piloto":
      return "Está en el Inicio por apps: sus módulos deciden qué apps ve. Un cambio acá se nota apenas lo confirmás.";
    case "producto":
      return "Es un producto con tienda (Comerciante o Contador): sus módulos ya deciden su menú. Un cambio acá se nota apenas lo confirmás.";
    case "registro":
      return "El registro global de módulos está prendido: sus módulos deciden qué apps ve. Un cambio acá se nota apenas lo confirmás.";
    case "sin-gate":
      return estado.enInicioPorApps
        ? "Está en el Inicio por apps pero sin módulos asignados: ve todas las apps de hoy, sin filtro. Fijá la asignación para que los módulos decidan."
        : "Hoy ve el menú de siempre: sus módulos todavía no deciden qué apps ve. Van a decidir cuando GSG le prenda «Trabaja por apps» (arriba, en esta ficha).";
  }
}

export function AppsDelNegocioCard({
  tenantId,
  vistos,
  estado,
  fijar,
  modulos,
  previa,
  historial,
  bloqueo,
}: {
  tenantId: string;
  /** `Tenant.modules` tal como se leyó para armar esta pantalla. */
  vistos: readonly string[];
  estado: EstadoAppsDelNegocio;
  fijar: PlanFijar;
  modulos: FilaModuloFicha[];
  /** La vista previa abierta (`?modulo=`), o `null`. */
  previa: { modulo: FilaModuloFicha | null; moduloId: string; accion: AccionModulo; plan: VistaPreviaDeCambio } | null;
  historial: CambioRegistrado[];
  /** Motivo por el que los módulos no se tocan (CH sin el OK del dueño), o `null`. */
  bloqueo: string | null;
}) {
  const vistosJson = JSON.stringify(vistos);
  const ficha = `/operador/tenants/${tenantId}`;
  const frente = estado.conInicioFrenteAlMenu;
  // La vara del "0 apps perdidas" es el menú sin el Inicio por apps. Antes de prenderlo es
  // lo que ve hoy; ya prendido, es el menú que tenía antes (y al que vuelve si se lo saca).
  const vara = estado.enInicioPorApps ? "su menú de antes" : "lo que ve hoy";
  const nombreModulo = (id: string) => modulos.find((m) => m.id === id)?.nombre ?? id;
  const listaModulos = (ids: readonly string[]) =>
    ids.length === 0 ? "ninguno" : ids.map((id) => nombreModulo(id)).join(", ");

  return (
    <section id="apps" className="scroll-mt-6 rounded-lg border border-line bg-surface-raised p-5 shadow-card space-y-5">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-medium">Apps del negocio</h2>
          <Badge tone="info">
            {estado.hoy.length} apps activas · {vistos.length} {vistos.length === 1 ? "módulo" : "módulos"}
          </Badge>
        </div>
        <p className="text-sm text-muted">{textoDelGate(estado)}</p>
      </div>

      {/* Chequeo de antes de sumarlo al Inicio por apps: tiene que dar 0 apps perdidas. */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">
          {estado.enInicioPorApps
            ? "Frente a su menú de antes del Inicio por apps"
            : "Con el Inicio por apps, frente a lo que ve hoy"}
        </h3>
        {estado.sinAsignacion ? (
          <p role="status" className="rounded-md border border-line px-3 py-2 text-sm text-muted">
            Sin módulos asignados, el Inicio por apps no filtra por módulo y ve lo mismo que hoy. Apenas tenga
            un módulo, ve sólo las apps de sus módulos: por eso primero se fija la asignación actual.
          </p>
        ) : frente.pierde.length === 0 ? (
          <div role="status" className="rounded-md bg-success-soft px-3 py-2 text-sm text-success">
            ✓ 0 apps perdidas frente a {vara}.
            {frente.gana.length > 0 && <span className="block break-words">Además gana: {nombres(frente.gana)}.</span>}
          </div>
        ) : (
          <div role="status" className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
            <b>
              {estado.enInicioPorApps ? "Pierde" : "Perdería"} {frente.pierde.length}{" "}
              {frente.pierde.length === 1 ? "app" : "apps"} frente a {vara}:
            </b>{" "}
            <span className="break-words">{nombres(frente.pierde)}.</span>{" "}
            {estado.enInicioPorApps
              ? "Fijá la asignación actual para devolvérselas."
              : "Fijá la asignación actual antes de prenderle «Trabaja por apps»."}
          </div>
        )}
      </div>

      {/* Fijar asignación actual */}
      <div className="space-y-2 border-t border-line pt-4">
        <h3 className="text-sm font-medium">Fijar asignación actual</h3>
        {!fijar.ok ? (
          <p id="fijar-estado" className="text-sm text-warning">{fijar.motivo}</p>
        ) : fijar.sinCambios ? (
          <p id="fijar-estado" className="text-sm text-muted">
            Con sus módulos ya ve todas las apps de su menú de siempre: no hace falta sumar ninguno.
          </p>
        ) : (
          <p id="fijar-estado" className="text-sm text-muted break-words">
            Suma <b className="text-strong">{listaModulos(fijar.agregados)}</b> para que, con el Inicio por apps,
            no pierda ninguna app de su menú de siempre. No saca ningún módulo.
          </p>
        )}
        {fijar.ok && fijar.noSeRecuperan.length > 0 && (
          <ul className="text-sm text-warning space-y-0.5">
            {fijar.noSeRecuperan.map((x) => (
              <li key={x.app.id}>• {x.app.nombre}: {x.motivo}</li>
            ))}
          </ul>
        )}
        <form action={fijarAsignacionActual}>
          <input type="hidden" name="tenantId" value={tenantId} />
          <input type="hidden" name="vistos" value={vistosJson} />
          <Button type="submit" variant="outline" disabled={!fijar.ok || fijar.sinCambios} aria-describedby="fijar-estado">
            Fijar asignación actual
          </Button>
        </form>
      </div>

      {/* Vista previa de un cambio de módulo */}
      {previa && (
        <div
          role="region"
          aria-label="Vista previa del cambio"
          className="space-y-3 rounded-md border border-line-strong bg-surface-sunken p-4"
        >
          <h3 className="font-medium break-words">
            Vista previa: {previa.accion === "activar" ? "activar" : "apagar"} “{previa.modulo?.nombre ?? previa.moduloId}”
          </h3>
          {!previa.plan.ok ? (
            <div role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              <b>No se puede.</b> {previa.plan.motivo}
            </div>
          ) : previa.plan.sinCambios ? (
            <p className="text-sm text-muted">No hay nada que cambiar.</p>
          ) : (
            <>
              {previa.plan.incluidos.length > 0 && (
                <p className="text-sm">
                  Se activa también: <b>{listaModulos(previa.plan.incluidos)}</b> (lo necesita para funcionar).
                </p>
              )}
              {previa.plan.producto.antes !== previa.plan.producto.despues && (
                <div role="alert" className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
                  <b>Ojo:</b> el negocio pasa de ser {NOMBRE_PRODUCTO[previa.plan.producto.antes]} a{" "}
                  {NOMBRE_PRODUCTO[previa.plan.producto.despues]}. Cambia su pantalla de entrada y su menú apenas confirmás.
                </div>
              )}
              <div className="space-y-1">
                <p className="text-sm font-medium">Qué cambia en sus apps con el Inicio por apps</p>
                <ListaDeApps diff={previa.plan.conInicio} />
              </div>
              <p className="text-sm text-muted">
                {previa.plan.alConfirmar.gana.length === 0 && previa.plan.alConfirmar.pierde.length === 0
                  ? estado.gate === "sin-gate"
                    ? "Hoy no cambia nada de lo que ve: el cambio se nota cuando esté en el Inicio por apps."
                    : "Al confirmar no cambia ninguna de las apps que ve."
                  : `Se nota apenas confirmás: ${[
                      ...previa.plan.alConfirmar.gana.map((a) => `+ ${a.nombre}`),
                      ...previa.plan.alConfirmar.pierde.map((a) => `− ${a.nombre}`),
                    ].join(", ")}.`}
              </p>
              {previa.plan.frenteAlMenu.pierde.length === 0 ? (
                <p className="text-sm text-success">Frente a {vara}: 0 apps perdidas.</p>
              ) : (
                <p className="text-sm text-warning break-words">
                  Frente a {vara}, perdería: {nombres(previa.plan.frenteAlMenu.pierde)}.
                </p>
              )}
            </>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {previa.plan.ok && !previa.plan.sinCambios && (
              <form action={toggleTenantModule}>
                <input type="hidden" name="tenantId" value={tenantId} />
                <input type="hidden" name="module" value={previa.moduloId} />
                <input type="hidden" name="accion" value={previa.accion} />
                <input type="hidden" name="vistos" value={vistosJson} />
                {/* Rótulo corto: el botón no parte línea y a 412 px no puede desbordar. Qué se
                    activa lo dice el título de la vista previa. */}
                <Button type="submit" variant={previa.accion === "activar" ? "solid" : "danger"}>
                  {previa.accion === "activar" ? "Confirmar y activar" : "Confirmar y apagar"}
                </Button>
              </form>
            )}
            <Link href={`${ficha}#apps`} className={buttonClasses("ghost", "md")}>
              {previa.plan.ok && !previa.plan.sinCambios ? "Cancelar" : "Cerrar"}
            </Link>
          </div>
        </div>
      )}

      {/* Módulos: cada cambio pasa por la vista previa */}
      <div className="space-y-2 border-t border-line pt-4">
        <h3 className="text-sm font-medium">Módulos</h3>
        {bloqueo && (
          <p id="modulos-bloqueo" className="text-sm text-warning">
            Los módulos de este negocio no se tocan desde acá. {bloqueo}
          </p>
        )}
        <ul className="grid gap-2 sm:grid-cols-2">
          {modulos.map((m) => (
            <li key={m.id} className="flex flex-col gap-2 rounded-md border border-line p-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{m.nombre}</span>
                  <Badge tone={m.activo ? "success" : "neutral"} dot>
                    {m.activo ? "Activo" : "Apagado"}
                  </Badge>
                </div>
                <p className="text-xs text-muted break-words">{m.descripcion}</p>
                <p className="text-xs text-muted mt-0.5">
                  {m.apps === 0
                    ? "Todavía no abre ninguna app."
                    : `${m.apps} ${m.apps === 1 ? "app" : "apps"}`}
                  {m.plugin ? " · integración" : ""}
                </p>
              </div>
              {bloqueo ? (
                <Button type="button" variant="outline" disabled className="self-start" aria-describedby="modulos-bloqueo">
                  {m.activo ? "Apagar…" : "Activar…"}
                </Button>
              ) : (
                <Link
                  href={`${ficha}?modulo=${encodeURIComponent(m.id)}#apps`}
                  className={buttonClasses("outline", "md", "self-start")}
                >
                  {m.activo ? "Apagar…" : "Activar…"}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Auditoría de los cambios de módulos: el antes y el después */}
      <div className="space-y-2 border-t border-line pt-4">
        <h3 className="text-sm font-medium">Últimos cambios de módulos</h3>
        {historial.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay cambios de módulos registrados desde la consola.</p>
        ) : (
          <ul className="space-y-2">
            {historial.map((h) => (
              <li key={h.id} className="rounded-md border border-line px-3 py-2 text-sm">
                <p className="font-medium break-words">
                  {h.accion === "module.activate"
                    ? `Activó “${nombreModulo(h.modulo ?? "")}”`
                    : h.accion === "module.deactivate"
                      ? `Apagó “${nombreModulo(h.modulo ?? "")}”`
                      : "Fijó la asignación actual"}
                  {h.sumados.length > 0 && ` (+ ${listaModulos(h.sumados)})`}
                </p>
                <p className="text-xs text-muted">
                  {fecha(h.cuando)} · {h.actor}
                </p>
                <p className="text-xs text-muted break-words">Antes: {h.antes ? listaModulos(h.antes) : "sin dato"}</p>
                <p className="text-xs break-words">Después: {h.despues ? listaModulos(h.despues) : "sin dato"}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">
          También quedan en la Auditoría del negocio, con el antes y el después.
        </p>
      </div>
    </section>
  );
}
