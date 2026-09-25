// ============================================================================
// «Apps del negocio» de la ficha (pestaña Plan y apps). Server component.
// ============================================================================
//
// Qué apps ve el negocio hoy, si su asignación de módulos las reproduce con el Inicio por apps, y
// cambiar un módulo SIEMPRE pasando por una vista previa que dice qué apps gana y cuáles pierde.
// Todo lo que se muestra lo calcula apps-del-negocio.ts con la misma función que arma el Inicio del
// negocio; esto sólo lo pinta, con la anatomía de «Renglón»: un módulo por renglón, su estado con
// forma y palabra, y una tecla («Activar…» / «Apagar…») que abre la vista previa. Los formularios
// llevan la asignación que el operador vio (`vistos`): si cambió mientras miraba, la action rechaza
// en vez de pisar. Los cambios hechos viven en la pestaña Historial (`frasesDeCambioDeModulo`).

import Link from "next/link";
import { toggleTenantModule, fijarAsignacionActual } from "@/lib/operator-actions";
import { Bloque, Button, Franja, Marca, Renglon, atributosBoton } from "@/components/ui";
import type { AppDescriptor } from "@/apps/contract";
import type { Producto } from "@/lib/producto-identidad";
import { motivoSiPierdeAppsConInicio } from "./apps-del-negocio";
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

function nombres(apps: readonly AppDescriptor[]): string {
  return apps.map((a) => a.nombre).join(", ");
}

/** «+ Stock, + Mermas» / «− Agenda»: la diferencia en una línea legible. */
function ListaDeApps({ diff }: { diff: DiferenciaDeApps }) {
  if (diff.gana.length === 0 && diff.pierde.length === 0) {
    return <p className="text-sm text-muted">No cambia ninguna app.</p>;
  }
  return (
    <ul className="space-y-1 text-sm">
      {diff.gana.length > 0 && (
        <li className="break-words text-success">
          <span className="font-semibold">Gana:</span> {diff.gana.map((a) => `+ ${a.nombre}`).join(", ")}
        </li>
      )}
      {diff.pierde.length > 0 && (
        <li className="break-words text-danger">
          <span className="font-semibold">Pierde:</span> {diff.pierde.map((a) => `− ${a.nombre}`).join(", ")}
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
        : "Hoy ve el menú de siempre: sus módulos todavía no deciden qué apps ve. Van a decidir cuando GSG le prenda «Trabaja por apps» (arriba).";
  }
}

/** Un cambio de módulos en palabras: la frase, quién y el antes y el después. Para el Historial. */
export function frasesDeCambioDeModulo(h: CambioRegistrado, modulos: readonly Pick<FilaModuloFicha, "id" | "nombre">[]) {
  const nombreModulo = (id: string) => modulos.find((m) => m.id === id)?.nombre ?? id;
  const lista = (ids: readonly string[]) => (ids.length === 0 ? "ninguno" : ids.map(nombreModulo).join(", "));
  const frase =
    h.accion === "module.activate"
      ? `Activó «${nombreModulo(h.modulo ?? "")}»`
      : h.accion === "module.deactivate"
        ? `Apagó «${nombreModulo(h.modulo ?? "")}»`
        : "Fijó la asignación actual";
  return {
    frase: h.sumados.length > 0 ? `${frase} (+ ${lista(h.sumados)})` : frase,
    antesYDespues: `Antes: ${h.antes ? lista(h.antes) : "sin dato"} · Después: ${h.despues ? lista(h.despues) : "sin dato"}`,
  };
}

export function AppsDelNegocioCard({
  tenantId,
  vistos,
  estado,
  fijar,
  modulos,
  previa,
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
  /** Motivo por el que los módulos no se tocan (CH sin el OK del dueño), o `null`. */
  bloqueo: string | null;
}) {
  const vistosJson = JSON.stringify(vistos);
  // Si trabaja por apps, un cambio que le saque apps que ve no se ofrece (el servidor lo rechaza igual).
  const frenoPorInicio = previa ? motivoSiPierdeAppsConInicio(previa.plan, estado.enInicioPorApps) : null;
  const ficha = `/operador/tenants/${tenantId}`;
  const frente = estado.conInicioFrenteAlMenu;
  // La vara del «0 apps perdidas» es el menú sin el Inicio por apps. Antes de prenderlo es lo que
  // ve hoy; ya prendido, es el menú que tenía antes (y al que vuelve si se lo saca).
  const vara = estado.enInicioPorApps ? "su menú de antes" : "lo que ve hoy";
  const nombreModulo = (id: string) => modulos.find((m) => m.id === id)?.nombre ?? id;
  const listaModulos = (ids: readonly string[]) => (ids.length === 0 ? "ninguno" : ids.map((id) => nombreModulo(id)).join(", "));
  const activos = modulos.filter((m) => m.activo);

  return (
    <div id="apps" className="scroll-mt-24 space-y-8">
      <Bloque
        titulo="Apps del negocio"
        cuenta={`${estado.hoy.length} apps · ${vistos.length} ${vistos.length === 1 ? "módulo" : "módulos"}`}
      >
        <p className="border-b border-line py-3 text-sm text-muted">{textoDelGate(estado)}</p>

        {/* Chequeo de antes de sumarlo al Inicio por apps: tiene que dar 0 apps perdidas. */}
        <Renglon
          folio={
            estado.sinAsignacion ? (
              <Marca tipo="pendiente">Sin asignar</Marca>
            ) : frente.pierde.length === 0 ? (
              <Marca tipo="hecho">0 perdidas</Marca>
            ) : (
              <Marca tipo="atencion">{frente.pierde.length} perdidas</Marca>
            )
          }
          titulo={estado.enInicioPorApps ? "Frente a su menú de antes del Inicio por apps" : "Con el Inicio por apps, frente a lo que ve hoy"}
          detalle={
            estado.sinAsignacion
              ? "Sin módulos asignados, el Inicio por apps no filtra y ve lo mismo que hoy. Apenas tenga uno, ve sólo las apps de sus módulos: por eso primero se fija la asignación."
              : frente.pierde.length === 0
                ? `0 apps perdidas frente a ${vara}.${frente.gana.length > 0 ? ` Además gana: ${nombres(frente.gana)}.` : ""}`
                : `${estado.enInicioPorApps ? "Pierde" : "Perdería"}: ${nombres(frente.pierde)}. ${
                    estado.enInicioPorApps ? "Fijá la asignación actual para devolvérselas." : "Fijá la asignación actual antes de prenderle «Trabaja por apps»."
                  }`
          }
        />

        {/* Fijar asignación actual */}
        <Renglon
          folio={<Marca tipo={!fijar.ok ? "atencion" : fijar.sinCambios ? "hecho" : "pendiente"}>{!fijar.ok ? "No se puede" : fijar.sinCambios ? "Al día" : "Para fijar"}</Marca>}
          titulo="Fijar la asignación actual"
          detalle={
            !fijar.ok ? (
              <span className="text-warning">{fijar.motivo}</span>
            ) : fijar.sinCambios ? (
              "Con sus módulos ya ve todas las apps de su menú de siempre: no hace falta sumar ninguno."
            ) : (
              <>
                Suma <b className="text-strong">{listaModulos(fijar.agregados)}</b> para que, con el Inicio por apps, no pierda ninguna app de su
                menú de siempre. No saca ningún módulo.
                {fijar.noSeRecuperan.length > 0 && (
                  <span className="mt-1 block text-warning">
                    {fijar.noSeRecuperan.map((x) => `${x.app.nombre}: ${x.motivo}`).join(" · ")}
                  </span>
                )}
              </>
            )
          }
          tecla={
            <form action={fijarAsignacionActual}>
              <input type="hidden" name="tenantId" value={tenantId} />
              <input type="hidden" name="vistos" value={vistosJson} />
              <Button type="submit" variant="outline" size="sm" disabled={!fijar.ok || fijar.sinCambios}>
                Fijar
              </Button>
            </form>
          }
        />
      </Bloque>

      {/* Vista previa de un cambio de módulo */}
      {previa && (
        <section role="region" aria-label="Vista previa del cambio" className="space-y-3 border-y-2 border-line-strong bg-surface-raised px-4 py-4">
          <h3 className="break-words text-[15px] font-semibold text-strong">
            Vista previa: {previa.accion === "activar" ? "activar" : "apagar"} «{previa.modulo?.nombre ?? previa.moduloId}»
          </h3>
          {!previa.plan.ok ? (
            <Franja tono="peligro">
              <b>No se puede.</b> {previa.plan.motivo}
            </Franja>
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
                <Franja tono="atencion">
                  <b>Ojo:</b> el negocio pasa de ser {NOMBRE_PRODUCTO[previa.plan.producto.antes]} a {NOMBRE_PRODUCTO[previa.plan.producto.despues]}.
                  Cambia su pantalla de entrada y su menú apenas confirmás.
                </Franja>
              )}
              <div className="space-y-1">
                <p className="text-sm font-semibold text-strong">Qué cambia en sus apps con el Inicio por apps</p>
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
                <p className="break-words text-sm text-warning">Frente a {vara}, perdería: {nombres(previa.plan.frenteAlMenu.pierde)}.</p>
              )}
            </>
          )}
          {frenoPorInicio && (
            <Franja tono="peligro">
              <b>No se puede.</b> {frenoPorInicio}
            </Franja>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {previa.plan.ok && !previa.plan.sinCambios && !frenoPorInicio && (
              <form action={toggleTenantModule}>
                <input type="hidden" name="tenantId" value={tenantId} />
                <input type="hidden" name="module" value={previa.moduloId} />
                <input type="hidden" name="accion" value={previa.accion} />
                <input type="hidden" name="vistos" value={vistosJson} />
                {/* Rótulo corto: el botón no parte línea y a 412 px no puede desbordar. */}
                <Button type="submit" variant={previa.accion === "activar" ? "solid" : "danger"}>
                  {previa.accion === "activar" ? "Confirmar y activar" : "Confirmar y apagar"}
                </Button>
              </form>
            )}
            <Link href={`${ficha}?pestana=plan#apps`} {...atributosBoton("ghost", "md")} className="inline-flex items-center">
              {previa.plan.ok && !previa.plan.sinCambios ? "Cancelar" : "Cerrar"}
            </Link>
          </div>
        </section>
      )}

      {/* Módulos: cada cambio pasa por la vista previa */}
      <Bloque titulo="Módulos" cuenta={`${activos.length} de ${modulos.length} activos`}>
        {bloqueo && <p className="border-b border-line py-3 text-sm text-warning">Los módulos de este negocio no se tocan desde acá. {bloqueo}</p>}
        {modulos.map((m) => (
          <Renglon
            key={m.id}
            folio={<Marca tipo={m.activo ? "hecho" : "pendiente"}>{m.activo ? "Activo" : "Apagado"}</Marca>}
            titulo={m.nombre}
            detalle={`${m.apps === 0 ? "Todavía no abre ninguna app" : `${m.apps} ${m.apps === 1 ? "app" : "apps"}`}${m.plugin ? " · integración" : ""} · ${m.descripcion}`}
            tecla={
              bloqueo ? (
                <Button type="button" variant="outline" size="sm" disabled>
                  {m.activo ? "Apagar…" : "Activar…"}
                </Button>
              ) : (
                <Link
                  href={`${ficha}?pestana=plan&modulo=${encodeURIComponent(m.id)}#apps`}
                  {...atributosBoton("outline", "sm")}
                  className="inline-flex items-center"
                  aria-label={`${m.activo ? "Apagar" : "Activar"} ${m.nombre}: ver qué cambia`}
                >
                  {m.activo ? "Apagar…" : "Activar…"}
                </Link>
              )
            }
          />
        ))}
      </Bloque>
    </div>
  );
}
