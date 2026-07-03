import {
  getReminderPanelData,
  updateServiceReminderConfig,
  upsertMessageTemplate,
  createProfessionalNews,
  broadcastProfessionalNewsAction,
} from "@/lib/reminders-actions";
import { fmtDateTime } from "@/lib/datetime";

export const dynamic = "force-dynamic";

const TEMPLATE_LABELS: Record<string, string> = {
  APPOINTMENT_REMINDER: "Recordatorio de turno",
  PROFESSIONAL_NEWS_BROADCAST: "Difusión de novedad",
};

export default async function RecordatoriosPage() {
  const { services, templates, professionals, news } = await getReminderPanelData();

  const templateFor = (type: string, channel: string) =>
    templates.find((t) => t.type === type && t.channel === channel);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8 space-y-12">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Recordatorios</h1>
        <p className="text-neutral-500">
          Configurá cuándo se avisa a cada cliente, qué dice el mensaje, y difundí novedades de los
          profesionales. El envío real de email/WhatsApp se activa conectando un proveedor (hoy queda
          simulado en el log del servidor).
        </p>
      </div>

      {/* Config por servicio */}
      <section>
        <h2 className="text-lg font-medium mb-3">Recordatorio por servicio</h2>
        <div className="space-y-2">
          {services.map((s) => (
            <form
              key={s.id}
              action={updateServiceReminderConfig}
              className="rounded-lg border p-3 flex flex-wrap items-center gap-3"
            >
              <input type="hidden" name="id" value={s.id} />
              <span className="flex-1 min-w-[160px] text-sm font-medium">{s.name}</span>
              <label className="flex items-center gap-1.5 text-sm text-neutral-600">
                <input type="checkbox" name="reminderEnabled" defaultChecked={s.reminderEnabled} />
                Activado
              </label>
              <label className="flex items-center gap-1.5 text-sm text-neutral-600">
                Avisar
                <input
                  type="number"
                  name="reminderHoursBefore"
                  defaultValue={s.reminderHoursBefore}
                  min={1}
                  className="w-16 rounded border px-2 py-1"
                />
                hs antes
              </label>
              <button type="submit" className="text-sm rounded-md bg-black text-white px-3 py-1.5">
                Guardar
              </button>
            </form>
          ))}
          {services.length === 0 && <p className="text-sm text-neutral-500">Sin servicios activos.</p>}
        </div>
      </section>

      {/* Plantillas de mensaje */}
      <section>
        <h2 className="text-lg font-medium mb-3">Plantillas de mensaje</h2>
        <p className="text-sm text-neutral-500 mb-4">
          Variables disponibles: <code>{"{{clientName}}"}</code> <code>{"{{serviceName}}"}</code>{" "}
          <code>{"{{professionalName}}"}</code> <code>{"{{startsAt}}"}</code> (recordatorio) ·{" "}
          <code>{"{{professionalName}}"}</code> <code>{"{{message}}"}</code> (difusión de novedad).
        </p>
        <div className="space-y-4">
          {(["APPOINTMENT_REMINDER", "PROFESSIONAL_NEWS_BROADCAST"] as const).flatMap((type) =>
            (["EMAIL", "WHATSAPP"] as const)
              .filter((channel) => !(type === "PROFESSIONAL_NEWS_BROADCAST" && channel === "EMAIL"))
              .map((channel) => {
                const t = templateFor(type, channel);
                return (
                  <form
                    key={`${type}-${channel}`}
                    action={upsertMessageTemplate}
                    className="rounded-lg border p-4 space-y-2"
                  >
                    <input type="hidden" name="type" value={type} />
                    <input type="hidden" name="channel" value={channel} />
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {TEMPLATE_LABELS[type]} · {channel === "EMAIL" ? "Email" : "WhatsApp"}
                      </span>
                      <label className="flex items-center gap-1.5 text-xs text-neutral-500">
                        <input type="checkbox" name="active" defaultChecked={t?.active ?? true} />
                        Activa
                      </label>
                    </div>
                    {channel === "EMAIL" && (
                      <input
                        type="text"
                        name="subject"
                        defaultValue={t?.subject ?? ""}
                        placeholder="Asunto del email"
                        className="w-full rounded border px-2 py-1.5 text-sm"
                      />
                    )}
                    <textarea
                      name="body"
                      defaultValue={t?.body ?? ""}
                      rows={2}
                      placeholder="Texto del mensaje…"
                      className="w-full rounded border px-2 py-1.5 text-sm"
                    />
                    <button type="submit" className="text-sm rounded-md bg-black text-white px-3 py-1.5">
                      Guardar plantilla
                    </button>
                  </form>
                );
              })
          )}
        </div>
      </section>

      {/* Novedades por profesional */}
      <section>
        <h2 className="text-lg font-medium mb-3">Novedades por profesional</h2>
        <form action={createProfessionalNews} className="rounded-lg border p-4 flex flex-wrap gap-2 mb-4">
          <select name="professionalId" required className="rounded border px-2 py-1.5 text-sm">
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            name="message"
            required
            placeholder="Ej: Carolina suma horario los sábados por la tarde"
            className="flex-1 min-w-[220px] rounded border px-2 py-1.5 text-sm"
          />
          <button type="submit" className="text-sm rounded-md bg-black text-white px-3 py-1.5">
            Cargar novedad
          </button>
        </form>

        <div className="space-y-2">
          {news.map((n) => (
            <div key={n.id} className="rounded-lg border p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="font-medium">{n.professional.name}</span> — {n.message}
                </p>
                <p className="text-xs text-neutral-400">
                  {fmtDateTime(n.createdAt)}
                  {n.broadcastAt && ` · difundida ${fmtDateTime(n.broadcastAt)}`}
                </p>
              </div>
              {!n.broadcastAt && (
                <form action={broadcastProfessionalNewsAction}>
                  <input type="hidden" name="id" value={n.id} />
                  <button type="submit" className="text-sm rounded-md border px-3 py-1.5 whitespace-nowrap">
                    Difundir
                  </button>
                </form>
              )}
            </div>
          ))}
          {news.length === 0 && <p className="text-sm text-neutral-500">Sin novedades cargadas.</p>}
        </div>
      </section>
    </main>
  );
}
