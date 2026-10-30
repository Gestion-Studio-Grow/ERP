import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { fmtDateTime } from "@/lib/datetime";
import { reglaVigenteParaLaClienta } from "@/lib/turnos/practica.server";
import { chConDisenoNuevo } from "../../../_ch/diseno-ch.server";
import { sinPromesaDeWhatsApp } from "../../../_ch/contacto-ch";
import { getLocation } from "@/lib/settings";

export default async function ConfirmacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: { professional: true, service: true, box: true },
  });

  if (!appointment) notFound();
  const [regla, nuevo] = await Promise.all([reglaVigenteParaLaClienta(), chConDisenoNuevo()]);

  // Diseño nuevo de CH (sólo con su interruptor prendido): la tarjeta del turno en tipografía, sin el «✓» en
  // círculo verde. Mismos datos y mismos textos que la de siempre; ningún texto de CH (página compartida).
  if (nuevo) {
    // Sin WhatsApp cargado no se promete WhatsApp (contacto-ch.ts); sólo en el diseño nuevo.
    const { whatsapp } = await getLocation();
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
          <div>
            <dt>Profesional</dt>
            <dd>{appointment.professional.name}</dd>
          </div>
          <div>
            <dt>Box</dt>
            <dd>{appointment.box.name}</dd>
          </div>
          <div>
            <dt>Fecha y hora</dt>
            <dd>{fmtDateTime(appointment.startsAt)}</dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>
              <span className="chr-estado">Pendiente de pago</span>
            </dd>
          </div>
        </dl>
        <p style={{ color: "var(--text-muted)", margin: "24px 0 0" }}>
          {sinPromesaDeWhatsApp("Te vamos a escribir por WhatsApp para coordinar el pago y confirmar tu turno.", whatsapp)}
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
        <p><span style={{ color: "var(--text-muted)" }}>Profesional:</span> {appointment.professional.name}</p>
        <p><span style={{ color: "var(--text-muted)" }}>Box:</span> {appointment.box.name}</p>
        <p>
          <span style={{ color: "var(--text-muted)" }}>Fecha y hora:</span>{" "}
          {fmtDateTime(appointment.startsAt)}
        </p>
        <p className="pt-1">
          <span
            className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
          >
            Pendiente de pago
          </span>
        </p>
      </div>
      <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>
        Te vamos a escribir por WhatsApp para coordinar el pago y confirmar tu turno.
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
