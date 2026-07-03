import {
  getReminderPanelData,
  createProfessionalNews,
  broadcastProfessionalNewsAction,
} from "@/lib/reminders-actions";
import { fmtDateTime } from "@/lib/datetime";
import ReminderServicesTree from "./ReminderServicesTree";
import TemplatesSection from "./TemplatesSection";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

export default async function RecordatoriosPage() {
  const { services, templates, professionals, news } = await getReminderPanelData();

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

      {/* Config por servicio — árbol por categoría, config bajo demanda */}
      <section>
        <h2 className="text-lg font-medium mb-1">Recordatorio por servicio</h2>
        <p className="text-sm text-neutral-500 mb-3">
          Tocá una categoría y después el servicio que quieras configurar.
        </p>
        <ReminderServicesTree services={services} />
      </section>

      {/* Plantillas de mensaje — tarjetas colapsadas */}
      <section>
        <h2 className="text-lg font-medium mb-1">Plantillas de mensaje</h2>
        <p className="text-sm text-neutral-500 mb-3">
          El texto de cada aviso. Abrí una plantilla para editarla — las variables se insertan
          tocándolas y se reemplazan por el dato real al enviar.
        </p>
        <TemplatesSection templates={templates} />
      </section>

      {/* Novedades por profesional */}
      <section>
        <h2 className="text-lg font-medium mb-1">Novedades por profesional</h2>
        <p className="text-sm text-neutral-500 mb-3">
          Al cargarla queda publicada en la sección «Novedades» de la web (30 días). «Difundir»
          además la envía por WhatsApp a la base de clientes (hoy simulado).
        </p>
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
          <SubmitButton pendingText="Cargando…" className="text-sm rounded-md bg-black text-white px-3 py-1.5">
            Cargar novedad
          </SubmitButton>
        </form>

        <div className="space-y-2">
          {news.map((n) => (
            <div key={n.id} className="rounded-lg border p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="font-medium">{n.professional.name}</span> — {n.message}
                </p>
                <p className="text-xs text-neutral-400">
                  {fmtDateTime(n.createdAt)} · publicada en la web
                  {n.broadcastAt && ` · difundida ${fmtDateTime(n.broadcastAt)}`}
                </p>
              </div>
              {!n.broadcastAt && (
                <form action={broadcastProfessionalNewsAction}>
                  <input type="hidden" name="id" value={n.id} />
                  <SubmitButton
                    pendingText="Difundiendo…"
                    className="text-sm rounded-md border px-3 py-1.5 whitespace-nowrap"
                  >
                    Difundir
                  </SubmitButton>
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
