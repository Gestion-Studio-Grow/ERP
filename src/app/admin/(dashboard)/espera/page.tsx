import {
  getWaitlist,
  getWaitlistFormData,
  addToWaitlist,
  markWaitlistNotified,
  cancelWaitlistEntry,
} from "@/lib/waitlist-actions";
import { dateStrInBusinessTz, fmtCalendarDateLabel, fmtShortDate, fmtTime, nextBusinessDays } from "@/lib/datetime";
import { EmptyState, Input, Select, buttonClasses } from "@/components/ui";
import { requireApp } from "@/lib/require-app";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { cargarHuecosLiberados, nombreDelNegocio } from "@/lib/crm/cargas.server";
import { textoHuecoLiberado } from "@/lib/crm/textos";
import { enInicioPorApps } from "../inicio/piloto";
import EntryBooking from "./EntryBooking";
import HuecosLiberados, { type HuecoVista } from "./HuecosLiberados";
import QuitarDeEspera from "./QuitarDeEspera";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { Bloque, Marca, Renglon, Rotulo } from "@/components/ui";

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

  // DISEÑO NUEVO («Renglón»): la lista primero, como libro (una persona por renglón, «Marcar
  // avisada» a la mano, «Quitar» al «⋯» con confirmación) y el alta al pie. Mismos datos y actions.
  if (await disenoNuevo()) {
    const esperando = entries.filter((e) => e.status === "WAITING").length;
    const avisadas = entries.length - esperando;
    const campo = "grid gap-1 text-sm";
    return (
      <main data-ui="pagina" className="mx-auto w-full max-w-4xl px-4 py-6">
        <header data-ui="page-header" className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-strong">Lista de espera</h1>
            <p className="mt-1 text-sm text-muted">
              {entries.length === 0 ? (
                "Nadie esperando."
              ) : (
                <>
                  <strong className="text-strong">{`${esperando} esperando un lugar`}</strong>
                  {avisadas > 0 && ` · ${avisadas} ya ${avisadas === 1 ? "avisada" : "avisadas"}`}
                </>
              )}
            </p>
          </div>
          <a href="#anotar" className={buttonClasses("solid", "md", "min-h-11")}>
            Anotar a alguien
          </a>
        </header>

        <HuecosLiberados huecos={huecos} />

        <Bloque titulo="Quién espera" cuenta={entries.length > 0 ? String(entries.length) : undefined} nota="la más vieja arriba" className="mb-6">
          {entries.length === 0 ? (
            <p className="py-3 text-sm text-muted">
              Cuando alguien quiera un turno y no tengas horario para ofrecerle, anotala abajo: si se libera un lugar, la encontrás acá.
            </p>
          ) : (
            <ul>
              {entries.map((e) => (
                <li key={e.id} className="border-b border-line">
                  <Renglon
                    className="items-start border-b-0 py-2.5"
                    folio={<span className="block w-[4.5rem] tabular-nums">{fmtShortDate(e.createdAt)}</span>}
                    titulo={
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium [overflow-wrap:anywhere]">{e.clientName}</span>
                        <span className="text-[13px] text-muted tabular-nums">{e.clientPhone}</span>
                      </span>
                    }
                    detalle={
                      <>
                        {`${e.service.name} · ${e.professional ? `con ${e.professional.name}` : "con cualquiera"}`}
                        {e.preferenceNote && <span className="block">{`Prefiere: ${e.preferenceNote}`}</span>}
                        {e.notes && <span className="block text-faint">{e.notes}</span>}
                      </>
                    }
                    plata={e.status === "NOTIFIED" ? <Marca tipo="medias">Avisada</Marca> : <Marca tipo="pendiente">Esperando</Marca>}
                    tecla={
                      <span className="inline-flex items-center gap-1">
                        {e.status === "WAITING" && (
                          <form action={markWaitlistNotified}>
                            <input type="hidden" name="id" value={e.id} />
                            <button type="submit" className={buttonClasses("outline", "md", "min-h-11")}>
                              Marcar avisada
                            </button>
                          </form>
                        )}
                        <QuitarDeEspera id={e.id} nombre={e.clientName} />
                      </span>
                    }
                  />
                  <div className="pb-2.5 sm:pl-[6.5rem]">
                    <EntryBooking entryId={e.id} dates={dates} renglon />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Bloque>

        <Bloque titulo="Anotar a alguien" id="anotar" className="scroll-mt-24">
          <form action={addToWaitlist} className="grid gap-3 pt-3 sm:grid-cols-2">
            <label className={campo}>
              <Rotulo as="span">Nombre</Rotulo>
              <Input name="clientName" autoComplete="off" required />
            </label>
            <label className={campo}>
              <Rotulo as="span">Teléfono</Rotulo>
              <Input name="clientPhone" type="tel" inputMode="tel" autoComplete="off" required />
            </label>
            <label className={campo}>
              <Rotulo as="span">Servicio</Rotulo>
              <Select name="serviceId" required>
                <option value="">Elegí un servicio…</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className={campo}>
              <Rotulo as="span">Con quién</Rotulo>
              <Select name="professionalId">
                <option value="">Con cualquiera</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className={campo}>
              <Rotulo as="span">Cuándo le viene bien</Rotulo>
              <Input name="preferenceNote" placeholder="Martes o jueves por la tarde" />
            </label>
            <label className={campo}>
              <Rotulo as="span">Email (si lo da)</Rotulo>
              <Input name="clientEmail" type="email" />
            </label>
            <label className={`${campo} sm:col-span-2`}>
              <Rotulo as="span">Nota para el equipo (si hace falta)</Rotulo>
              <Input name="notes" />
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className={buttonClasses("solid", "md", "min-h-11 w-full sm:w-auto")}>
                Anotarla en la lista
              </button>
            </div>
          </form>
        </Bloque>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-semibold mb-1">Lista de espera</h1>
      <p className="text-muted mb-8">
        Anotá a quien quiere un turno cuando no hay horario. Cuando se libere un lugar (una
        cancelación o una reprogramación), buscá un hueco y reservalo con un clic.
      </p>

      <HuecosLiberados huecos={huecos} />

      {/* Alta */}
      <form
        id="anotar"
        action={addToWaitlist}
        className="scroll-mt-24 rounded-lg border border-line p-4 mb-8 grid gap-3 sm:grid-cols-2"
      >
        <div className="sm:col-span-2 text-sm font-medium text-strong">Anotar a alguien</div>

        <label className="text-sm">
          <span className="block text-muted mb-1">Nombre *</span>
          <Input name="clientName" autoComplete="off" required />
        </label>
        <label className="text-sm">
          <span className="block text-muted mb-1">Teléfono *</span>
          <Input name="clientPhone" type="tel" inputMode="tel" autoComplete="off" required />
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
                  <span className="font-medium text-sm [overflow-wrap:anywhere]">{e.clientName}</span>
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
                    <button type="submit" className="chip-btn text-xs min-h-8 w-full sm:w-auto max-sm:min-h-11!">
                      Marcar avisado
                    </button>
                  </form>
                )}
                <form action={cancelWaitlistEntry}>
                  <input type="hidden" name="id" value={e.id} />
                  <button
                    type="submit"
                    className="chip-btn chip-btn-danger text-xs min-h-8 w-full sm:w-auto max-sm:min-h-11!"
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
          <EmptyState
            title="La lista de espera está vacía"
            description="Cuando alguien quiera un turno y no tengas horario para ofrecerle, anotala: si se libera un lugar, la encontrás acá."
            action={
              <a href="#anotar" className={buttonClasses("outline", "md")}>
                Anotar a alguien
              </a>
            }
          />
        )}
      </div>
    </main>
  );
}
