import { getAppointments, getFichasParaAlta, getProfessionalsWithServices } from "@/lib/actions";
import AppointmentRow from "../AppointmentRow";
import AppointmentsHistoryList from "./AppointmentsHistoryList";
import NewAppointmentForm from "../NewAppointmentForm";
import Link from "next/link";
import { requireCapability } from "@/lib/authz";
import { esCuentaACobrar, estadoCobroTurno } from "@/lib/turnos/cobros";
import { seccionDeLista } from "@/lib/turnos/turno-abierto";

export const dynamic = "force-dynamic";

// "Reservado" y no "Pendiente de pago": la seña se cobra al reservar y el estado del turno
// no dice nada de la plata (eso lo dice cobrado/saldo en la fila).
export const statusLabel: Record<string, string> = {
  PENDING: "Reservado",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  COMPLETED: "Completado",
  NO_SHOW: "No se presentó",
};

// ─────────────────────────────────────────────────────────────────────────────
// PROYECCIÓN DEL PAYLOAD — lo que cruza el borde RSC hacia el navegador.
// ─────────────────────────────────────────────────────────────────────────────
//
// QUÉ PASABA ANTES: esta página le pasaba a `AppointmentRow` y a
// `AppointmentsHistoryList` —los dos son componentes CLIENTE— el objeto ENTERO que
// devuelve `getAppointments()`, con `client`, `professional`, `service`, `box` y
// `payment` completos colgados por el `include` de Prisma. React serializa cada campo
// de cada turno aunque nadie lo lea: `tenantId`, `createdAt`, `updatedAt`,
// `Client.email/notes/birthDate`, `Service.description`, `couponCode`, `isResidentBooking`…
// Medido con los ~1.000 turnos/año que factura CH, el documento pesaba 3,73 MB (2,21 MB
// sólo de payload RSC). Y como la página es `force-dynamic`, no hay caché que lo amortice:
// se paga entero en CADA apertura, y la recepción la abre muchas veces por día. Crece
// lineal con la facturación: el doble de turnos es el doble de MB.
//
// POR QUÉ A MANO Y CAMPO POR CAMPO: la lista de abajo es exactamente el `type Appointment`
// que declara `AppointmentRow` (AppointmentRow.tsx) — ni un campo más. NO usar spread
// (`...a`, `...a.client`): un spread vuelve a arrastrar el objeto entero de Prisma y el
// payload se infla de nuevo sin que nadie lo note hasta que la pantalla se cuelga.
// `proyeccion-payload.test.ts`, al lado de este archivo, monta guardia sobre las dos cosas.
//
// Paginar el historial es OTRA cosa y quedó afuera a propósito: el buscador de
// `AppointmentsHistoryList` filtra en el cliente y necesita el set completo. Con proyectar
// alcanza hasta ~2.000 turnos/año; pasado eso hay que mover el buscador al servidor.
type TurnoDelLoader = Awaited<ReturnType<typeof getAppointments>>[number];

function proyectarTurno(a: TurnoDelLoader) {
  return {
    id: a.id,
    startsAt: a.startsAt,
    status: a.status,
    professionalId: a.professionalId,
    serviceId: a.serviceId,
    priceAtBooking: a.priceAtBooking,
    notes: a.notes,
    client: { name: a.client.name, phone: a.client.phone },
    professional: { name: a.professional.name, cobraEnMostrador: a.professional.cobraEnMostrador },
    service: { name: a.service.name, price: a.service.price, depositAmount: a.service.depositAmount },
    box: { name: a.box.name },
    payment: a.payment
      ? {
          method: a.payment.method,
          comprobanteNro: a.payment.comprobanteNro,
          amount: a.payment.amount,
          status: a.payment.status,
        }
      : null,
    // `collections` ya viene proyectada desde el loader (id/amount/method/note/createdAt,
    // con el `Decimal` convertido a `number` en el borde del repositorio): pasa tal cual.
    collections: a.collections,
  };
}

// El reloj se lee UNA vez por carga, afuera del cuerpo del componente: las tres secciones
// se parten con el mismo "ahora" y un turno no puede caer en dos.
function instanteDeCarga() {
  return new Date();
}

export default async function TurnosListaPage() {
  // La lista (historial completo + alta manual) es gestión de agenda: solo
  // OWNER/RECEPTION. El PROFESSIONAL cae acá a su calendario propio.
  const user = await requireCapability("agenda:manage");
  // Quién mira. Alimenta la misma regla que aplica el servidor al cobrar, para que la fila no
  // ofrezca un cobro que después se rechaza.
  const viewer = { role: user.role, professionalId: user.professionalId };
  const [appointments, professionals, fichas] = await Promise.all([
    getAppointments(),
    getProfessionalsWithServices(),
    getFichasParaAlta(),
  ]);
  // Único punto donde se lee el resultado crudo del loader: de acá para abajo se trabaja
  // siempre con `turnos`, que es lo que el navegador va a recibir.
  const turnos = appointments.map(proyectarTurno);
  // La sección "Reservados" se PARTE en dos (regla pura `seccionDeLista`, con test):
  //   · pasados sin cerrar: Reservados Y Confirmados con la hora ya pasada. Antes el Confirmado
  //     de ayer se iba al Historial como si estuviera resuelto, y era un saldo sin cobrar o
  //     una ausencia sin marcar;
  //   · a confirmar: los Reservados que todavía no llegaron.
  // Un turno cae en una sola: nada se repite en el Historial.
  const ahora = instanteDeCarga();
  const sinCerrar = turnos.filter((a) => seccionDeLista(a, ahora) === "sin-cerrar");
  const pending = turnos.filter((a) => seccionDeLista(a, ahora) === "a-confirmar");
  // Cuentas a cobrar DERIVADAS: turnos prestados (COMPLETED) con saldo > 0. No es un estado
  // nuevo del enum (decisión de producto): es precio − Σ cobros, en la fila y acá.
  const aCobrar = turnos.filter((a) => {
    const plata = estadoCobroTurno({
      precio: a.priceAtBooking ?? a.service.price,
      cobros: a.collections,
      pagoLegado: a.payment,
    });
    return esCuentaACobrar({ status: a.status, saldo: plata.saldo });
  });
  const rest = turnos.filter((a) => seccionDeLista(a, ahora) === "historial");

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex items-center gap-4 mb-1">
        <h1 className="text-2xl font-semibold text-strong">Agenda</h1>
      </div>
      <div className="flex gap-4 text-sm mb-6 border-b border-line">
        <Link href="/admin/turnos" className="px-1 pb-2 text-muted hover:text-strong">
          Calendario
        </Link>
        <Link href="/admin/turnos/lista" className="px-1 pb-2 border-b-2 border-accent text-strong font-medium">
          Lista
        </Link>
      </div>
      <p className="text-muted mb-6">
        La seña se cobra al reservar (o registrala cuando llegue el comprobante por WhatsApp);
        confirmá el turno cuando la clienta confirme, y al completarlo se cobra el resto.
      </p>

      <NewAppointmentForm professionals={professionals} fichas={fichas} />

      {sinCerrar.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-medium text-strong mb-1">Pasados sin cerrar ({sinCerrar.length})</h2>
          <p className="text-sm text-muted mb-3">
            Ya pasó la hora y siguen reservados o confirmados: completalos (y cobrá el saldo) o
            marcá que no se presentó.
          </p>
          <div className="space-y-3">
            {sinCerrar.map((a) => (
              <AppointmentRow key={a.id} appointment={a} statusLabel={statusLabel} viewer={viewer} ancla />
            ))}
          </div>
        </section>
      )}

      <section className="mb-10">
        <h2 className="text-lg font-medium text-strong mb-3">
          Reservados, a confirmar ({pending.length})
        </h2>
        {pending.length === 0 && (
          <p className="text-sm text-muted">No hay reservas por confirmar.</p>
        )}
        <div className="space-y-3">
          {pending.map((a) => (
            <AppointmentRow key={a.id} appointment={a} statusLabel={statusLabel} viewer={viewer} ancla />
          ))}
        </div>
      </section>

      {aCobrar.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-medium text-strong mb-3">Saldos a cobrar ({aCobrar.length})</h2>
          <p className="text-sm text-muted mb-3">Turnos ya realizados con plata pendiente.</p>
          <div className="space-y-3">
            {aCobrar.map((a) => (
              <AppointmentRow key={a.id} appointment={a} statusLabel={statusLabel} viewer={viewer} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-medium text-strong mb-3">Historial</h2>
        <AppointmentsHistoryList appointments={rest} statusLabel={statusLabel} />
      </section>
    </main>
  );
}
