import { prisma } from "@/lib/prisma";
import { comoSigueElTurno, destinoPropio, estadoPublicoDelTurno, nombrePublico, rubroDelTurno } from "@/lib/turnos/rubro-del-turno";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { fmtDateTime } from "@/lib/datetime";
import { reglaVigenteParaLaClienta } from "@/lib/turnos/practica.server";
import { chConDisenoNuevo } from "../../../_ch/diseno-ch.server";
import { getLocation } from "@/lib/settings";

export default async function ConfirmacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // El taller tiene su propia página del turno (piel, puesto, patente; sin «Pendiente de pago»): QA AGR 29/10.
  // Ronda 2: por el rubro del alta (blueprint), no sólo por el slug; el profe va a su turnero.
  const propio = destinoPropio(await rubroDelTurno(), "confirmacion", id);
  if (propio) redirect(propio);
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: { professional: true, service: true, box: true },
  });

  if (!appointment) notFound();
  const [regla, nuevo, { whatsapp }] = await Promise.all([reglaVigenteParaLaClienta(), chConDisenoNuevo(), getLocation()]);
  // Lo que es cierto de ESTE turno (ronda 2): «Pendiente de pago» sólo si el servicio pide seña; WhatsApp sólo si el
  // negocio lo cargó; el box sólo si tiene nombre propio (no el «Box de ejemplo (editable)» del alta).
  const estado = estadoPublicoDelTurno(appointment.service.depositAmount);
  const comoSigue = comoSigueElTurno({ conSena: estado.conSena, hayWhatsApp: Boolean(whatsapp) });
  const box = nombrePublico(appointment.box?.name);
  const profesional = nombrePublico(appointment.professional?.name);

  // Diseño nuevo de CH (sólo con su interruptor prendido): la tarjeta del turno en tipografía, sin el «✓» en
  // círculo verde. Mismos datos y mismos textos que la de siempre; ningún texto de CH (página compartida).
  if (nuevo) {
    return (
      <div className="chr mx-auto px-6 py-16">
        <p className="chf-kicker">Turno {appointment.id.slice(-6).toUpperCase()}</p>
        <h1 className="chr-h1" style={{ marginTop: 16 }}>
          ¡Solicitud enviada!
        </h1>
        <p style={{ color: "var(--text-muted)", margin: 0 }}>¡Gracias! Tu turno está reservado a la espera de confirmación.</p>
        <dl className="chr-tarjeta">
          <div>
            <dt>Servicio</dt>
            <dd>{appointment.service.name}</dd>
          </div>
          {profesional && (
            <div>
              <dt>Profesional</dt>
              <dd>{profesional}</dd>
            </div>
          )}
          {box && (
            <div>
              <dt>Box</dt>
              <dd>{box}</dd>
            </div>
          )}
          <div>
            <dt>Fecha y hora</dt>
            <dd>{fmtDateTime(appointment.startsAt)}</dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>
              <span className="chr-estado">{estado.texto}</span>
            </dd>
          </div>
        </dl>
        <p style={{ color: "var(--text-muted)", margin: "24px 0 0" }}>
          {comoSigue}
        </p>
        <p style={{ color: "var(--text-muted)", margin: "8px 0 0" }}>
          {regla ? regla : "Guardá el enlace de tu turno para verlo o cancelarlo cuando quieras."}
        </p>
        <div className="chr-acc">
          <Link href={`/reserva/turno/${appointment.id}`} className="chf-btn">
            Ver mi turno
          </Link>
          <Link href="/">Volver al inicio</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-20 text-center">
      <div
        className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full text-2xl"
        style={{ background: "var(--success-soft)", color: "var(--success)" }}
      >
        ✓
      </div>
      <h1 className="font-serif text-3xl mb-2" style={{ color: "var(--text-strong)" }}>
        ¡Solicitud enviada!
      </h1>
      <p className="mb-8" style={{ color: "var(--text-muted)" }}>
        ¡Gracias! Tu turno está reservado a la espera de confirmación.
      </p>
      <div
        className="text-left rounded-lg p-5 space-y-2 mb-6"
        style={{ background: "var(--surface-sunken)", color: "var(--text-strong)" }}
      >
        <p><span style={{ color: "var(--text-muted)" }}>Servicio:</span> {appointment.service.name}</p>
        {profesional && <p><span style={{ color: "var(--text-muted)" }}>Profesional:</span> {profesional}</p>}
        {box && <p><span style={{ color: "var(--text-muted)" }}>Box:</span> {box}</p>}
        <p>
          <span style={{ color: "var(--text-muted)" }}>Fecha y hora:</span>{" "}
          {fmtDateTime(appointment.startsAt)}
        </p>
        <p className="pt-1">
          <span
            className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
          >
            {estado.texto}
          </span>
        </p>
      </div>
      <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>
        {comoSigue}
      </p>
      <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
        {regla ? `${regla} Guardá este link para verlo:` : "Guardá este link para ver o cancelar tu turno cuando quieras:"}{" "}
        <Link href={`/reserva/turno/${appointment.id}`} className="underline font-medium">
          ver mi turno
        </Link>
      </p>
      <Link href="/" className="text-sm underline" style={{ color: "var(--text-strong)" }}>
        Volver al inicio
      </Link>
    </div>
  );
}
