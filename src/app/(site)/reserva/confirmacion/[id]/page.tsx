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
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-2xl">
        ✓
      </div>
      <h1 className="text-2xl font-semibold mb-2">¡Solicitud enviada!</h1>
      <p className="text-neutral-500 mb-8">
        Gracias, {appointment.client.name}. Tu turno está reservado a la espera de confirmación.
      </p>
      <div className="text-left rounded-lg border p-5 space-y-2 mb-6">
        <p><span className="text-neutral-500">Servicio:</span> {appointment.service.name}</p>
        <p><span className="text-neutral-500">Profesional:</span> {appointment.professional.name}</p>
        <p><span className="text-neutral-500">Box:</span> {appointment.box.name}</p>
        <p>
          <span className="text-neutral-500">Fecha y hora:</span>{" "}
          {appointment.startsAt.toLocaleString("es-AR", {
            dateStyle: "full",
            timeStyle: "short",
          })}
        </p>
        <p className="pt-1">
          <span className="inline-block rounded-full bg-amber-100 text-amber-800 px-2.5 py-0.5 text-xs font-medium">
            Pendiente de pago
          </span>
        </p>
      </div>
      <p className="text-sm text-neutral-500 mb-2">
        Te vamos a escribir por WhatsApp para coordinar el pago y confirmar tu turno.
      </p>
      <p className="text-sm text-neutral-500 mb-8">
        Guardá este link para ver o cancelar tu turno cuando quieras:{" "}
        <Link href={`/reserva/turno/${appointment.id}`} className="underline font-medium">
          ver mi turno
        </Link>
      </p>
      <Link href="/" className="text-sm underline">
        Volver al inicio
      </Link>
    </div>
  );
}
