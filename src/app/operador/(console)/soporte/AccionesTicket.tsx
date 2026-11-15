"use client";

// Lo que Soporte hace con un ticket desde su ficha: tomarlo, cambiar estado o prioridad, dejar una
// nota interna, guardar la respuesta y pedirle a la IA una sugerencia (que queda como BORRADOR: el
// botón «Usar el borrador» sólo copia el texto al campo; guardar es siempre a mano). Cada formulario
// manda el negocio y el número; la sesión y la guardia de CH las mira la acción.

import { useActionState, useState } from "react";
import { Button, Select, Textarea } from "@/components/ui";
import { Franja } from "@/components/ui/Renglon";
import { Marca } from "@/components/ui/Marca";
import { ESTADO, PRIORIDAD, PRIORIDADES, NOTA_INTERNA_MAX, RESPUESTA_MAX, TIPO, type EstadoTicket, type Prioridad } from "@/lib/soporte/config";
import type { SugerenciaIa } from "@/lib/soporte/tickets-core";
import type { VistaDelDespacho } from "@/lib/soporte/vista-despacho-core";
import { cambiarTicketAction, prepararConIaAction, sugerirConIaAction, traerPedidosAction, type ResultadoTicket } from "./actions";

const T44 = "min-h-11";

function Resultado({ r, id }: { r: ResultadoTicket | null; id: string }) {
  if (!r) return null;
  return (
    <Franja tono={r.ok ? undefined : "peligro"}>
      <span id={id} role="status">
        {r.ok ? r.mensaje : r.error}
      </span>
    </Franja>
  );
}

function Ocultos({ negocio, numero }: { negocio: string; numero: number }) {
  return (
    <>
      <input type="hidden" name="negocio" value={negocio} />
      <input type="hidden" name="numero" value={numero} />
    </>
  );
}

export function CambiarEstadoYPrioridad({ negocio, numero, estado, prioridad, asignadoA, operador }: {
  negocio: string;
  numero: number;
  estado: EstadoTicket;
  prioridad: Prioridad;
  asignadoA: string | null;
  operador: string;
}) {
  const [r, accion, pendiente] = useActionState<ResultadoTicket | null, FormData>(cambiarTicketAction, null);
  const id = `ticket-${negocio}-${numero}-cambio`;
  return (
    <div className="grid gap-3">
      <form action={accion} className="flex flex-wrap items-end gap-2">
        <Ocultos negocio={negocio} numero={numero} />
        <input type="hidden" name="que" value="estado" />
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-strong">Pasar a</span>
          <Select name="valor" defaultValue={ESTADO[estado].pasa[0]} className={T44} aria-describedby={id}>
            {ESTADO[estado].pasa.map((e) => (
              <option key={e} value={e}>
                {ESTADO[e].nombre}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit" size="md" variant="outline" className={T44} disabled={pendiente}>
          Cambiar estado
        </Button>
      </form>
      <form action={accion} className="flex flex-wrap items-end gap-2">
        <Ocultos negocio={negocio} numero={numero} />
        <input type="hidden" name="que" value="prioridad" />
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-strong">Prioridad</span>
          <Select name="valor" defaultValue={prioridad} className={T44} aria-describedby={id}>
            {PRIORIDADES.map((p) => (
              <option key={p} value={p}>
                {p} · {PRIORIDAD[p].nombre}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit" size="md" variant="outline" className={T44} disabled={pendiente}>
          Cambiar prioridad
        </Button>
      </form>
      {asignadoA !== operador && (
        <form action={accion}>
          <Ocultos negocio={negocio} numero={numero} />
          <input type="hidden" name="que" value="tomar" />
          <Button type="submit" size="md" variant="ghost" className={T44} disabled={pendiente}>
            {asignadoA ? `Tomarlo (hoy lo tiene ${asignadoA})` : "Tomarlo yo"}
          </Button>
        </form>
      )}
      <Resultado r={r} id={id} />
    </div>
  );
}

export function NotaInterna({ negocio, numero }: { negocio: string; numero: number }) {
  const [r, accion, pendiente] = useActionState<ResultadoTicket | null, FormData>(cambiarTicketAction, null);
  const id = `ticket-${negocio}-${numero}-nota`;
  return (
    <form action={accion} className="grid gap-2">
      <Ocultos negocio={negocio} numero={numero} />
      <input type="hidden" name="que" value="nota" />
      <label htmlFor={`${id}-texto`} className="text-sm font-medium text-strong">
        Nota interna (sólo la ve Soporte)
      </label>
      <Textarea id={`${id}-texto`} name="texto" maxLength={NOTA_INTERNA_MAX} rows={3} aria-describedby={id} />
      <div>
        <Button type="submit" size="md" variant="outline" className={T44} disabled={pendiente}>
          {pendiente ? "Guardando…" : "Guardar nota"}
        </Button>
      </div>
      <Resultado r={r} id={id} />
    </form>
  );
}

/**
 * Aprobar o descartar el borrador (D5/D6), atado a su versión: si otro lo reemplazó o ya lo aprobó, el
 * servidor lo rechaza. Aprobar lo pasa a la respuesta guardada; no se envía nada.
 */
function DecidirBorrador({ negocio, numero, version, puedeAprobar }: { negocio: string; numero: number; version: string | null; puedeAprobar: boolean }) {
  const [r, accion, pendiente] = useActionState<ResultadoTicket | null, FormData>(cambiarTicketAction, null);
  const id = `ticket-${negocio}-${numero}-borrador`;
  if (!version) return null;
  if (!puedeAprobar) return <p className="text-[13px] text-muted">Este borrador lo aprueba sólo el dueño de GSG.</p>;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <form action={accion}>
          <Ocultos negocio={negocio} numero={numero} />
          <input type="hidden" name="que" value="aprobar_borrador" />
          <input type="hidden" name="version" value={version} />
          <Button type="submit" size="md" className={T44} disabled={pendiente} aria-describedby={id}>
            Aprobar como respuesta
          </Button>
        </form>
        <form action={accion}>
          <Ocultos negocio={negocio} numero={numero} />
          <input type="hidden" name="que" value="descartar_borrador" />
          <input type="hidden" name="version" value={version} />
          <Button type="submit" size="md" variant="ghost" className={T44} disabled={pendiente} aria-describedby={id}>
            Descartar el borrador
          </Button>
        </form>
      </div>
      <p className="text-[13px] text-muted">Aprobar no le manda nada al cliente: queda como respuesta guardada y la mandás vos.</p>
      <Resultado r={r} id={id} />
    </div>
  );
}

/** La respuesta al cliente + la sugerencia de la IA (borrador). */
export function Respuesta({ negocio, numero, respuesta, borrador, borradorVersion, puedeAprobar, enlaceWhatsapp }: {
  negocio: string;
  numero: number;
  respuesta: string | null;
  borrador: SugerenciaIa | null;
  /** Huella del contenido del borrador (la calcula el servidor): aprobar o descartar va atado a ella. */
  borradorVersion: string | null;
  /** En CH (o negocio desconocido) sólo el dueño; la regla la vuelve a aplicar el servidor. */
  puedeAprobar: boolean;
  /** wa.me del negocio con la respuesta guardada, o null si no tiene WhatsApp cargado. */
  enlaceWhatsapp: string | null;
}) {
  const [r, accion, pendiente] = useActionState<ResultadoTicket | null, FormData>(cambiarTicketAction, null);
  const [ria, sugerir, pensando] = useActionState<ResultadoTicket | null, FormData>(sugerirConIaAction, null);
  const [texto, setTexto] = useState(respuesta ?? "");
  // Si la respuesta guardada cambia (p. ej. se aprobó el borrador), el campo muestra la nueva.
  const [guardada, setGuardada] = useState(respuesta);
  if (guardada !== respuesta) {
    setGuardada(respuesta);
    setTexto(respuesta ?? "");
  }
  const id = `ticket-${negocio}-${numero}-respuesta`;
  return (
    <div className="grid gap-4">
      <form action={sugerir} className="grid gap-2">
        <Ocultos negocio={negocio} numero={numero} />
        <div>
          <Button type="submit" size="md" variant="outline" className={T44} disabled={pensando}>
            {pensando ? "Pensando…" : "Sugerir clasificación y respuesta"}
          </Button>
        </div>
        <p className="text-[13px] text-muted">La IA sólo deja un borrador: no cambia nada ni le contesta al cliente.</p>
        <Resultado r={ria} id={`${id}-ia`} />
      </form>
      {borrador && (
        <section aria-label="Borrador de la IA" className="grid gap-2 rounded border border-dashed border-line p-3 text-sm">
          <p className="font-medium text-strong">Borrador de la IA (sin revisar)</p>
          <p>
            Sugiere: {TIPO[borrador.tipo].nombre} · {borrador.prioridad} ({PRIORIDAD[borrador.prioridad].nombre})
          </p>
          {borrador.motivo && <p className="text-muted">Por qué: {borrador.motivo}</p>}
          <p className="whitespace-pre-wrap break-words">{borrador.respuesta}</p>
          <div>
            <Button type="button" size="md" variant="ghost" className={T44} onClick={() => setTexto(borrador.respuesta)}>
              Usar el borrador en la respuesta
            </Button>
          </div>
          <DecidirBorrador negocio={negocio} numero={numero} version={borradorVersion} puedeAprobar={puedeAprobar} />
        </section>
      )}
      <form action={accion} className="grid gap-2">
        <Ocultos negocio={negocio} numero={numero} />
        <input type="hidden" name="que" value="respuesta" />
        <label htmlFor={`${id}-texto`} className="text-sm font-medium text-strong">
          Respuesta al cliente
        </label>
        <Textarea
          id={`${id}-texto`}
          name="texto"
          maxLength={RESPUESTA_MAX}
          rows={5}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          aria-describedby={id}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="md" className={T44} disabled={pendiente}>
            {pendiente ? "Guardando…" : "Guardar respuesta"}
          </Button>
          {enlaceWhatsapp && (
            <a href={enlaceWhatsapp} target="_blank" rel="noopener noreferrer" className={`inline-flex ${T44} items-center rounded px-2 underline focus-visible:outline focus-visible:outline-2`}>
              Mandar la respuesta guardada por WhatsApp
            </a>
          )}
        </div>
        <Resultado r={r} id={id} />
      </form>
    </div>
  );
}

/**
 * «Preparar con IA» (MANT-004): el estado del despacho n1 en criollo, con el enlace a la sesión si hay,
 * y el botón cuando corresponde (la vista la arma el servidor: vistaDelDespacho). El estado vive en una
 * región aria-live: al revalidar la ficha, el lector de pantalla lee el cambio.
 */
export function PrepararConIa({ negocio, numero, vista }: { negocio: string; numero: number; vista: VistaDelDespacho }) {
  const [r, accion, pendiente] = useActionState<ResultadoTicket | null, FormData>(prepararConIaAction, null);
  const id = `ticket-${negocio}-${numero}-despacho`;
  return (
    <div className="grid gap-2">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm" aria-live="polite" id={`${id}-estado`}>
        <span className="font-medium text-strong">Borrador con IA:</span>
        <Marca tipo={vista.tono}>{vista.estado}</Marca>
        {vista.sesionUrl && (
          <a href={vista.sesionUrl} target="_blank" rel="noopener noreferrer" className={`inline-flex ${T44} items-center underline underline-offset-4 focus-visible:outline focus-visible:outline-2`}>
            Ver la sesión de la IA
          </a>
        )}
      </p>
      {vista.boton && (
        <form action={accion} className="grid gap-2">
          <Ocultos negocio={negocio} numero={numero} />
          <div>
            <Button type="submit" size="md" variant="outline" className={T44} disabled={pendiente} aria-describedby={`${id}-estado ${id}`}>
              {pendiente ? "Pidiendo a la IA…" : vista.etiqueta}
            </Button>
          </div>
          <p className="text-[13px] text-muted">La IA prepara un borrador para revisar: no le contesta al cliente ni cambia el ticket.</p>
        </form>
      )}
      <Resultado r={r} id={id} />
    </div>
  );
}

export function TraerPedidos() {
  const [r, accion, pendiente] = useActionState<ResultadoTicket | null, FormData>(traerPedidosAction, null);
  return (
    <form action={accion} className="grid gap-2">
      <div>
        <Button type="submit" size="md" variant="outline" className={T44} disabled={pendiente}>
          {pendiente ? "Trayendo…" : "Traer pedidos sin ticket"}
        </Button>
      </div>
      <Resultado r={r} id="soporte-traer" />
    </form>
  );
}
