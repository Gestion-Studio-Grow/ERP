import { getClient } from "@/lib/actions";
import { fmtMoneyARS } from "@/components/ui";
import { notFound } from "next/navigation";
import Link from "next/link";
import { fmtDateTime } from "@/lib/datetime";
import { canCurrentUser } from "@/lib/authz";
import { claseBotonWhatsApp } from "../boton-whatsapp";
import { contactoDeLaFicha } from "../contacto-ficha";
import { requireApp } from "@/lib/require-app";
import EditarClienteForm from "./EditarClienteForm";
import FichaUnica from "./FichaUnica";
import { enInicioPorApps } from "../../inicio/piloto";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import FichaRenglon from "./FichaRenglon";

// "Reservado", igual que la agenda (CalendarGrid, lista): la ficha decía "Pendiente de pago"
// para el mismo estado, y el estado del turno no habla de plata (la seña se cobra al reservar).
const statusLabel: Record<string, string> = {
  PENDING: "Reservado",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  COMPLETED: "Completado",
  NO_SHOW: "No se presentó",
};

export default async function ClienteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireApp("clientes");
  const [{ id }, nuevo] = await Promise.all([params, disenoNuevo()]);
  // DISEÑO NUEVO («Renglón»): la ficha como ciclo de vida (FichaRenglon.tsx), con los datos y las
  // guardias de la ficha única. Apagado (CH hoy), lo de abajo tal cual.
  if (nuevo) return <FichaRenglon id={id} user={user} />;
  // En el Inicio por apps, la ficha única (próximo turno, lo que debe, faltazos, pedidos, fiado,
  // cumpleaños y permiso de mensajes). CH, fuera del piloto, sigue con la ficha de siempre.
  if (await enInicioPorApps()) return <FichaUnica id={id} user={user} />;
  const client = await getClient(id);
  if (!client) notFound();

  // `clients:manage` está otorgada a RECEPTION y hasta acá no la consumía nadie. Esto es
  // sólo para no mostrar un botón que no va a funcionar; la guarda de verdad está en
  // `updateClient` (ADR-017 §2.e: ocultar un botón no es seguridad).
  const puedeEditar = await canCurrentUser("clients:manage");

  // Link directo al chat (549 + teléfono normalizado). Si lo cargado no es un celular, no se abre
  // WhatsApp a un número que no es el de ella: la ficha lo DICE y dice dónde corregirlo, en vez
  // de que el botón simplemente no esté (contacto-ficha.ts).
  const contacto = contactoDeLaFicha({ telefono: client.phone, noQuiere: false, puedeEditar });

  const totalGastado = client.appointments
    .filter((a) => a.payment?.status === "APPROVED")
    .reduce((sum, a) => sum + (a.payment?.amount ?? 0), 0);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <Link href="/admin/clientes" className="text-sm text-muted hover:text-strong hover:underline max-sm:inline-flex max-sm:min-h-11 max-sm:items-center">
        ← Clientes
      </Link>
      <h1 className="text-2xl font-semibold text-strong mt-2 mb-1 [overflow-wrap:anywhere]">{client.name}</h1>
      <p className={`text-muted flex flex-wrap items-center gap-2 ${contacto.tipo === "sin-celular" ? "mb-2" : "mb-6"}`}>
        {/* Un email largo no empuja la pantalla hacia el costado en el celular: corta donde haga falta. */}
        <span className="min-w-0 [overflow-wrap:anywhere]">
          {client.phone} {client.email ? `· ${client.email}` : ""}
        </span>
        {contacto.tipo === "whatsapp" && (
          <a
            href={contacto.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`WhatsApp a ${client.name}`}
            className={claseBotonWhatsApp("outline")}
          >
            WhatsApp
          </a>
        )}
        {client.isResident != null && (
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
              client.isResident ? "bg-accent-soft text-accent-ink" : "bg-surface-sunken text-muted"
            }`}
          >
            {client.isResident ? "Cliente de la zona (precio local)" : "Sin precio local"}
          </span>
        )}
      </p>
      {contacto.tipo === "sin-celular" && <p className="mb-6 text-sm text-warning">{contacto.texto}</p>}

      {puedeEditar && (
        <div className="mb-8">
          <EditarClienteForm
            cliente={{
              id: client.id,
              name: client.name,
              phone: client.phone,
              email: client.email,
              notes: client.notes,
              // `<input type="date">` sólo entiende "yyyy-mm-dd". La fecha se guarda a las
              // 12:00Z justamente para que este recorte dé el mismo día en cualquier huso.
              birthDate: client.birthDate ? client.birthDate.toISOString().slice(0, 10) : null,
            }}
          />
        </div>
      )}

      {client.notes && (
        <div className="mb-8 rounded-lg border border-line bg-surface-raised p-4">
          <p className="text-sm font-medium text-strong mb-1">Notas internas</p>
          <p className="text-sm text-muted whitespace-pre-line">{client.notes}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="rounded-lg border border-line bg-surface-raised shadow-xs p-4">
          <p className="text-sm text-muted">Turnos totales</p>
          <p className="text-2xl font-semibold text-strong">{client.appointments.length}</p>
        </div>
        <div className="rounded-lg border border-line bg-surface-raised shadow-xs p-4">
          <p className="text-sm text-muted">Total gastado</p>
          <p className="text-2xl font-semibold text-strong">{fmtMoneyARS(totalGastado, 0)}</p>
        </div>
      </div>

      <h2 className="text-lg font-medium text-strong mb-3">Historial de turnos</h2>
      <div className="space-y-2">
        {client.appointments.map((a) => (
          <div key={a.id} className="rounded-lg border border-line bg-surface-raised px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-x-2">
              <span className="font-medium text-strong">{a.service.name}</span>
              <span className="text-muted">
                {statusLabel[a.status] ?? a.status}
              </span>
            </div>
            <p className="text-muted">
              {a.professional.name} · {fmtDateTime(a.startsAt)}
            </p>
            {/* La nota de CADA turno: el alta la pide justamente para esto ("Preferencias, tono,
                alergias…") y el historial de la ficha no la mostraba: "qué tono se usó la vez
                pasada" sólo se veía en la fila de ese turno en la agenda. */}
            {a.notes && (
              <p className="mt-1 whitespace-pre-line rounded-md bg-warning-soft px-2 py-1 text-body">{a.notes}</p>
            )}
          </div>
        ))}
        {client.appointments.length === 0 && (
          <p className="text-sm text-muted">Este cliente todavía no tiene turnos.</p>
        )}
      </div>
    </main>
  );
}
