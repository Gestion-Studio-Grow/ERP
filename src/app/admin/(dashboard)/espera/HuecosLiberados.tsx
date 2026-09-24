"use client";

// HUECOS LIBERADOS — un turno cancelado en las últimas 48 h que le sirve a alguien de la lista.
// Por cada anotado: WhatsApp con el texto armado (queda "avisado por Ana 14:32", la constancia)
// y "Reservar este hueco", que pasa por la misma validación que el resto de las reservas desde
// la espera (`bookFromWaitlist`): si alguien lo tomó en el medio, lo dice en la fila.
//
// Sin imports de valor de Prisma: es un componente cliente. Las fechas llegan como ISO.

import { useState, useTransition } from "react";
import { avisarHuecoPorWhatsApp, reservarHuecoLiberado } from "@/lib/waitlist-actions";
import { buttonClasses } from "@/components/ui";
import { fmtCalendarDateLabel, fmtTime } from "@/lib/datetime";
import { claseBotonWhatsApp } from "../clientes/boton-whatsapp";

export type AnotadoVista = {
  id: string;
  nombre: string;
  telefono: string;
  preferencia: string | null;
  wa: string | null;
  avisado: { el: string; por: string | null } | null;
};

export type HuecoVista = {
  appointmentId: string;
  startsAt: string;
  dia: string;
  servicio: string;
  profesional: string;
  professionalId: string;
  anotados: AnotadoVista[];
};

function FilaAnotado({ hueco, a }: { hueco: HuecoVista; a: AnotadoVista }) {
  const [avisado, setAvisado] = useState(a.avisado);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [reservando, start] = useTransition();

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-sm">
        <p className="font-medium text-strong">{a.nombre}</p>
        <p className="text-muted">
          {a.telefono}
          {a.preferencia ? ` · prefiere ${a.preferencia}` : ""}
        </p>
        {avisado && (
          <p className="text-xs text-success">
            avisado {avisado.por ? `por ${avisado.por} ` : ""}
            {fmtTime(avisado.el)}
          </p>
        )}
        {!a.wa && <p className="text-xs text-warning">El teléfono cargado ({a.telefono}) no es un celular válido.</p>}
        {mensaje && (
          <p role={mensaje.ok ? "status" : "alert"} className={mensaje.ok ? "text-xs text-success" : "text-xs text-danger"}>
            {mensaje.texto}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2 max-sm:flex-col max-sm:items-stretch">
        {a.wa && (
          <a
            href={a.wa}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${avisado ? "WhatsApp de nuevo" : "WhatsApp"} a ${a.nombre}`}
            className={claseBotonWhatsApp(avisado ? "outline" : "solid")}
            onClick={async () => {
              setMensaje(null);
              try {
                const r = await avisarHuecoPorWhatsApp(a.id, hueco.appointmentId);
                if (r.ok) setAvisado({ el: r.avisadoEl, por: r.por });
                else setMensaje({ ok: false, texto: r.error });
              } catch {
                setMensaje({ ok: false, texto: "Se abrió WhatsApp pero no quedó anotado el aviso. Tocá de nuevo." });
              }
            }}
          >
            {avisado ? "WhatsApp de nuevo" : "WhatsApp"}
          </a>
        )}
        <button
          type="button"
          disabled={reservando}
          className={buttonClasses("outline", "md", "whitespace-nowrap max-sm:w-full")}
          onClick={() =>
            start(async () => {
              setMensaje(null);
              const fd = new FormData();
              fd.set("entryId", a.id);
              fd.set("professionalId", hueco.professionalId);
              fd.set("startsAt", hueco.startsAt);
              try {
                const r = await reservarHuecoLiberado(fd);
                setMensaje(r.ok ? { ok: true, texto: "Reservado: el turno ya está en la agenda." } : { ok: false, texto: r.error });
              } catch {
                setMensaje({ ok: false, texto: "No se pudo reservar. Revisá la conexión y probá de nuevo." });
              }
            })
          }
        >
          {reservando ? "Reservando…" : "Reservar este hueco"}
        </button>
      </div>
    </li>
  );
}

export default function HuecosLiberados({ huecos }: { huecos: HuecoVista[] }) {
  if (huecos.length === 0) return null;
  return (
    <section className="mb-8 rounded-lg border border-accent/30 bg-surface-raised" aria-labelledby="huecos-liberados">
      <div className="border-b border-line px-4 py-3">
        <h2 id="huecos-liberados" className="text-base font-medium text-strong">
          Huecos liberados
        </h2>
        <p className="text-sm text-muted">
          Turnos cancelados en las últimas 48 horas que le sirven a alguien de la lista (mismo servicio y profesional, o
          cualquiera). Avisá por WhatsApp y reservá acá mismo.
        </p>
      </div>
      <ul className="divide-y divide-line/60">
        {huecos.map((h) => (
          <li key={h.appointmentId} className="px-4 py-3">
            <p className="text-sm font-medium text-strong">
              <span className="capitalize">{fmtCalendarDateLabel(h.dia)}</span> · {fmtTime(h.startsAt)} · {h.servicio} con {h.profesional}
            </p>
            <ul className="divide-y divide-line/60">
              {h.anotados.map((a) => (
                <FilaAnotado key={a.id} hueco={h} a={a} />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
