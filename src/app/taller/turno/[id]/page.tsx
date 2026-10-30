import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { fmtDateTime } from "@/lib/datetime";
import { isAppointmentModifiable } from "@/lib/booking-core";
import { cambioOnlineDelTurno } from "@/lib/turnos/practica.server";
import CancelButton from "@/app/(site)/reserva/turno/[id]/CancelButton";
import RescheduleButton from "@/app/(site)/reserva/turno/[id]/RescheduleButton";
import { Barra, Pie, cargarTaller } from "../../marco";
import { autoDeLaNota } from "../../patente";
import { desde } from "../../reglas";

// «Tu turno» del taller: la confirmación (`?nuevo=1`, a donde lleva /reserva/confirmacion/[id]) y el enlace
// permanente del turno (a donde lleva /reserva/turno/[id]). Misma piel y vocabulario que /taller/turno
// (mecánico, puesto, trabajo), con la patente y el modelo que dejó el cliente (QA AGR 29/10, ALTA-1 y 2).
// Cancelar y reprogramar son los botones de siempre (los de /reserva/turno), con las mismas reglas.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Tu turno", robots: { index: false } };

// El estado en palabras del taller. «Pendiente de pago» no: acá no se cobra nada al pedir el turno.
const ESTADO: Record<string, string> = {
  PENDING: "A confirmar",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  COMPLETED: "Hecho",
  NO_SHOW: "No vino",
};

export default async function TurnoDelTaller({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nuevo?: string }>;
}) {
  const [t, { id }, sp] = await Promise.all([cargarTaller(), params, searchParams]);
  const turno = await prisma.appointment.findFirst({
    where: { id: String(id ?? ""), tenantId: t.tenantId },
    select: {
      id: true,
      status: true,
      startsAt: true,
      notes: true,
      priceAtBooking: true,
      professionalId: true,
      serviceId: true,
      service: { select: { name: true, depositAmount: true } },
      professional: { select: { name: true } },
      box: { select: { name: true } },
    },
  });
  if (!turno) notFound();

  const nuevo = sp.nuevo === "1";
  const { patente, auto } = autoDeLaNota(turno.notes);
  // Seña: sólo si el trabajo la pide. Sin seña no se habla de pago.
  const sena = Math.max(0, turno.service.depositAmount ?? 0);
  const estado = turno.status === "PENDING" && sena > 0 ? "Falta la seña" : (ESTADO[turno.status] ?? turno.status);
  const vivo = isAppointmentModifiable(turno.status, turno.startsAt);
  const { regla, puede } = vivo ? await cambioOnlineDelTurno(turno.startsAt) : { regla: null, puede: false };
  const codigo = turno.id.slice(-6).toUpperCase();

  return (
    <>
      <Barra t={t} />
      <main className="agr-turno">
        <div className="agr-cont agr-turno__grid">
          <div className="agr-turno__cab">
            <p className="agr-etiqueta">Turno {codigo}</p>
            <h1 className="agr-h1">{nuevo ? "Turno pedido" : "Tu turno"}</h1>
            {nuevo ? (
              <p className="agr-turno__bajada">
                {sena > 0
                  ? `Te escribimos por WhatsApp para coordinar la seña de ${desde(sena)} y confirmarlo.`
                  : "Te escribimos por WhatsApp para confirmarlo. No se cobra nada ahora."}
              </p>
            ) : (
              <p className="agr-turno__bajada">Acá está el detalle de tu turno.</p>
            )}
            {nuevo && vivo && <p className="agr-turno__regla">Guardá este enlace para ver, mover o cancelar el turno.</p>}
          </div>

          <aside className="agr-resumen" aria-label="Detalle del turno">
            <h2>{turno.status === "CANCELLED" ? "Turno cancelado" : "Tu turno"}</h2>
            {patente && (
              <div className="agr-minichapa">
                <span aria-hidden="true">Argentina</span>
                <b>{patente}</b>
              </div>
            )}
            <dl>
              {!patente && (
                <>
                  <dt>Patente</dt>
                  <dd>Sin patente</dd>
                </>
              )}
              {auto && (
                <>
                  <dt>Auto</dt>
                  <dd>{auto}</dd>
                </>
              )}
              <dt>Trabajo</dt>
              <dd>{turno.service.name}</dd>
              {turno.priceAtBooking != null && turno.priceAtBooking > 0 && (
                <>
                  <dt>Precio</dt>
                  <dd className="agr-mono">desde {desde(turno.priceAtBooking)}</dd>
                </>
              )}
              <dt>Mecánico</dt>
              <dd>{turno.professional.name}</dd>
              <dt>Puesto</dt>
              <dd>{turno.box.name}</dd>
              <dt>Día y hora</dt>
              <dd>{fmtDateTime(turno.startsAt)}</dd>
              <dt>Estado</dt>
              <dd>{estado}</dd>
            </dl>
          </aside>

          <div className="agr-turno__form">
            {vivo && puede && (
              <div className="agr-turno__acciones">
                <RescheduleButton appointmentId={turno.id} professionalId={turno.professionalId} serviceId={turno.serviceId} />
                <CancelButton appointmentId={turno.id} />
              </div>
            )}
            {regla && <p className="agr-letra-chica">{regla}</p>}
            {turno.priceAtBooking != null && turno.priceAtBooking > 0 && (
              <p className="agr-letra-chica">Mano de obra de referencia. El presupuesto final se confirma al revisar el auto.</p>
            )}
            <div className="agr-botones">
              {nuevo && vivo ? (
                <Link href={`/taller/turno/${turno.id}`} className="agr-btn">Ver mi turno</Link>
              ) : (
                <Link href="/taller/turno" className="agr-btn">Sacar otro turno</Link>
              )}
              <Link href="/taller" className="agr-btn agr-btn--borde">Volver al inicio</Link>
            </div>
          </div>
        </div>
      </main>
      <Pie t={t} />
    </>
  );
}
