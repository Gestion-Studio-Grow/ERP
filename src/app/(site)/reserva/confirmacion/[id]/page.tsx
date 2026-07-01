import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";

export default async function ConfirmacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: { client: true, professional: true, service: true, box: true },
  });

  if (!appointment) notFound();

  return (
    <div className="mx-auto max-w-lg px-6 py-20 text-center">
      <div
        className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full text-2xl"
        style={{ background: "var(--spa-sage-light)", color: "var(--spa-sage)" }}
      >
        ✓
      </div>
      <h1 className="font-serif text-3xl mb-2" style={{ color: "var(--spa-mocha-dark)" }}>
        ¡Solicitud enviada!
      </h1>
      <p className="mb-8" style={{ color: "var(--spa-mocha)" }}>
        Gracias, {appointment.client.name}. Tu turno está reservado a la espera de confirmación.
      </p>
      <div
        className="text-left rounded-lg p-5 space-y-2 mb-6"
        style={{ background: "var(--spa-sage-light)", color: "var(--spa-mocha-dark)" }}
      >
        <p><span style={{ color: "var(--spa-mocha)" }}>Servicio:</span> {appointment.service.name}</p>
        <p><span style={{ color: "var(--spa-mocha)" }}>Profesional:</span> {appointment.professional.name}</p>
        <p><span style={{ color: "var(--spa-mocha)" }}>Box:</span> {appointment.box.name}</p>
        <p>
          <span style={{ color: "var(--spa-mocha)" }}>Fecha y hora:</span>{" "}
          {appointment.startsAt.toLocaleString("es-AR", {
            dateStyle: "full",
            timeStyle: "short",
          })}
        </p>
        <p className="pt-1">
          <span
            className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{ background: "var(--spa-gold)", color: "var(--spa-ink)" }}
          >
            Pendiente de pago
          </span>
        </p>
      </div>
      <p className="text-sm mb-2" style={{ color: "var(--spa-mocha)" }}>
        Te vamos a escribir por WhatsApp para coordinar el pago y confirmar tu turno.
      </p>
      <p className="text-sm mb-8" style={{ color: "var(--spa-mocha)" }}>
        Guardá este link para ver o cancelar tu turno cuando quieras:{" "}
        <Link href={`/reserva/turno/${appointment.id}`} className="underline font-medium">
          ver mi turno
        </Link>
      </p>
      <Link href="/" className="text-sm underline" style={{ color: "var(--spa-mocha-dark)" }}>
        Volver al inicio
      </Link>
    </div>
  );
}
