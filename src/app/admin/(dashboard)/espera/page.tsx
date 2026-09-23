import {
  getWaitlist,
  getWaitlistFormData,
  addToWaitlist,
  markWaitlistNotified,
  cancelWaitlistEntry,
} from "@/lib/waitlist-actions";
import { dateStrInBusinessTz, fmtCalendarDateLabel, fmtShortDate, fmtTime, nextBusinessDays } from "@/lib/datetime";
import { Input, Select, buttonClasses } from "@/components/ui";
import { requireApp } from "@/lib/require-app";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { cargarHuecosLiberados, nombreDelNegocio } from "@/lib/crm/cargas.server";
import { textoHuecoLiberado } from "@/lib/crm/textos";
import { enInicioPorApps } from "../inicio/piloto";
import EntryBooking from "./EntryBooking";
import HuecosLiberados, { type HuecoVista } from "./HuecosLiberados";

export const dynamic = "force-dynamic";

// Los huecos liberados, listos para la pantalla: el texto de WhatsApp de cada anotado armado en
// el servidor (con el nombre del negocio) y las fechas en ISO.
async function huecosParaMostrar(): Promise<HuecoVista[]> {
  const [huecos, negocio] = await Promise.all([cargarHuecosLiberados(), nombreDelNegocio()]);
  return huecos.map((h) => {
    const dia = dateStrInBusinessTz(h.startsAt);
    const cuando = `el ${fmtCalendarDateLabel(dia)} a las ${fmtTime(h.startsAt)}`;
    return {
      appointmentId: h.appointmentId,
      startsAt: h.startsAt.toISOString(),
      dia,
      servicio: h.servicio,
      profesional: h.profesional,
      professionalId: h.professionalId,
      anotados: h.anotados.map((a) => ({
        id: a.id,
        nombre: a.clientName,
        telefono: a.clientPhone,
        preferencia: a.preferenceNote,
        wa: waLinkClienta(
          a.clientPhone,
          textoHuecoLiberado({ nombre: a.clientName, negocio, servicio: h.servicio, profesional: h.profesional, cuando }),
        ),
        avisado: a.status === "NOTIFIED" && a.notifiedAt ? { el: a.notifiedAt.toISOString(), por: a.avisadoPor } : null,
      })),
    };
  });
}

export default async function EsperaPage() {
  // La guardia es la app (rol, módulo y rubro); getWaitlist además pide waitlist:manage.
  await requireApp("lista-de-espera");
  const [entries, { services, professionals }, huecos] = await Promise.all([
    getWaitlist(),
    getWaitlistFormData(),
    // Inicio por apps: los huecos que dejó una cancelación. CH, fuera del piloto, sin cambios.
    enInicioPorApps().then((piloto) => (piloto ? huecosParaMostrar() : [])),
  ]);
  const dates = nextBusinessDays(30);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold mb-1">Lista de espera</h1>
      <p className="text-muted mb-8">
        Anotá a quien quiere un turno cuando no hay horario. Cuando se libere un lugar (una
        cancelación o una reprogramación), buscá un hueco y reservalo con un clic.
      </p>

      <HuecosLiberados huecos={huecos} />

      {/* Alta */}
      <form
        action={addToWaitlist}
        className="rounded-lg border border-line p-4 mb-8 grid gap-3 sm:grid-cols-2"
      >
        <div className="sm:col-span-2 text-sm font-medium text-strong">Anotar a alguien</div>

        <label className="text-sm">
          <span className="block text-muted mb-1">Nombre *</span>
          <Input name="clientName" required />
        </label>
        <label className="text-sm">
          <span className="block text-muted mb-1">Teléfono *</span>
          <Input name="clientPhone" required />
        </label>

        <label className="text-sm">
          <span className="block text-muted mb-1">Email (opcional)</span>
          <Input name="clientEmail" type="email" />
        </label>
        <label className="text-sm">
          <span className="block text-muted mb-1">Servicio *</span>
          <Select name="serviceId" required>
            <option value="">Elegí un servicio…</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </label>

        <label className="text-sm">
          <span className="block text-muted mb-1">Profesional preferido</span>
          <Select name="professionalId">
            <option value="">Cualquiera</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm">
          <span className="block text-muted mb-1">Preferencia de día/horario</span>
          <Input
            name="preferenceNote"
            placeholder="ej: martes o jueves por la tarde"
          />
        </label>

        <label className="text-sm sm:col-span-2">
          <span className="block text-muted mb-1">Nota interna (opcional)</span>
          <Input name="notes" />
        </label>

        <div className="sm:col-span-2">
          <button
            type="submit"
            className={buttonClasses("solid", "md")}
          >
            Anotar en la lista
          </button>
        </div>
      </form>

      {/* Listado */}
      <div className="space-y-3">
        {entries.map((e) => (
          <div key={e.id} className="rounded-lg border border-line p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{e.clientName}</span>
                  <span className="text-xs text-faint">· {e.clientPhone}</span>
                  {e.status === "NOTIFIED" && (
                    <span className="rounded-full bg-warning-soft text-warning px-2 py-0.5 text-[11px] font-medium">
                      Avisado
                    </span>
                  )}
                </div>
                <p className="text-sm text-body mt-1">
                  {e.service.name}
                  {" · "}
                  {e.professional ? e.professional.name : "cualquier profesional"}
                </p>
                {e.preferenceNote && (
                  <p className="text-xs text-muted mt-0.5">Prefiere: {e.preferenceNote}</p>
                )}
                {e.notes && <p className="text-xs text-faint mt-0.5">{e.notes}</p>}
                <p className="text-xs text-faint mt-1">Anotado el {fmtShortDate(e.createdAt)}</p>
              </div>

              <div className="flex flex-col gap-2 items-stretch sm:items-end whitespace-nowrap">
                {e.status === "WAITING" && (
                  <form action={markWaitlistNotified}>
                    <input type="hidden" name="id" value={e.id} />
                    <button type="submit" className="chip-btn text-xs min-h-8 w-full sm:w-auto">
                      Marcar avisado
                    </button>
                  </form>
                )}
                <form action={cancelWaitlistEntry}>
                  <input type="hidden" name="id" value={e.id} />
                  <button
                    type="submit"
                    className="chip-btn chip-btn-danger text-xs min-h-8 w-full sm:w-auto"
                  >
                    Quitar
                  </button>
                </form>
              </div>
            </div>

            <EntryBooking entryId={e.id} dates={dates} />
          </div>
        ))}

        {entries.length === 0 && (
          <p className="text-sm text-muted">
            La lista de espera está vacía. Anotá a alguien arriba cuando no tengas horario para
            ofrecerle.
          </p>
        )}
      </div>
    </main>
  );
}
