import {
  getReminderPanelData,
  createProfessionalNews,
  broadcastProfessionalNewsAction,
} from "@/lib/reminders-actions";
import Link from "next/link";
import { fmtDateTime, todayInBusinessTz } from "@/lib/datetime";
import ReminderServicesTree from "./ReminderServicesTree";
import TemplatesSection from "./TemplatesSection";
import SubmitButton from "@/components/SubmitButton";
import { buttonClasses } from "@/components/ui";
import { requireApp } from "@/lib/require-app";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { diaSiguiente, rangoDelDia } from "@/lib/turnos/turno-abierto";
import { leerAvisosDeManana } from "@/lib/crm/lecturas";
import { enInicioPorApps } from "../inicio/piloto";
import { appPermitida } from "@/apps/visibles";
import { appPorId } from "@/apps/registro";
import { getNegocioApps } from "@/apps/contexto.server";

export const dynamic = "force-dynamic";

// La cobertura REAL de los avisos de mañana (Inicio por apps), con la misma lectura que el
// número del Inicio (`leerAvisosDeManana`). El aviso automático por WhatsApp está simulado y el
// barrido diario llega a pocos turnos: lo que cuenta es lo que la recepción mandó a mano desde
// "Confirmar turnos de mañana". Mostrarlo evita creer que "se avisa solo".
async function CoberturaDeManana() {
  const tenantId = await getCurrentTenantId();
  const c = await leerAvisosDeManana(prisma, tenantId, rangoDelDia(diaSiguiente(todayInBusinessTz())));
  const pct = c.total > 0 ? Math.round((c.avisados / c.total) * 100) : null;
  return (
    <section className="rounded-lg border border-line bg-surface-raised p-4">
      <h2 className="text-lg font-medium text-strong">Avisos de mañana</h2>
      <p className="mt-1 text-sm text-muted">
        {pct === null
          ? "Mañana no hay turnos reservados ni confirmados."
          : `${c.avisados} de ${c.total} turnos de mañana ya tienen el aviso (${pct}%).`}{" "}
        El envío automático por WhatsApp todavía no está conectado: los avisos que cuentan son los que se mandan desde
        &ldquo;Confirmar turnos de mañana&rdquo;.
      </p>
      {pct !== null && c.avisados < c.total && (
        <Link href="/admin/turnos/manana" className={buttonClasses("outline", "md", "mt-3")}>
          Avisar a los que faltan
        </Link>
      )}
    </section>
  );
}

export default async function RecordatoriosPage() {
  const user = await requireApp("recordatorios");
  const [{ services, templates, professionals, news }, piloto, negocio] = await Promise.all([
    getReminderPanelData(),
    enInicioPorApps(),
    getNegocioApps(user.role),
  ]);
  // Sin servicios no hay a qué ponerle recordatorio: el paso es cargarlos en el Catálogo, si
  // quien mira lo puede abrir (si no, un link que termina en "App no disponible").
  const abreCatalogo = appPermitida(appPorId("catalogo"), negocio);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 space-y-12">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Recordatorios</h1>
        <p className="text-muted">
          Configurá cuándo se avisa a cada cliente, qué dice el mensaje, y difundí novedades de los
          profesionales. El envío real de email/WhatsApp se activa conectando un proveedor (hoy queda
          simulado en el log del servidor).
        </p>
      </div>

      {piloto && <CoberturaDeManana />}

      {/* Config por servicio — árbol por categoría, config bajo demanda */}
      <section>
        <h2 className="text-lg font-medium mb-1">Recordatorio por servicio</h2>
        <p className="text-sm text-muted mb-3">
          Tocá una categoría y después el servicio que quieras configurar.
        </p>
        <ReminderServicesTree services={services} abreCatalogo={abreCatalogo} />
      </section>

      {/* Plantillas de mensaje — tarjetas colapsadas */}
      <section>
        <h2 className="text-lg font-medium mb-1">Plantillas de mensaje</h2>
        <p className="text-sm text-muted mb-3">
          El texto de cada aviso. Abrí una plantilla para editarla — las variables se insertan
          tocándolas y se reemplazan por el dato real al enviar.
        </p>
        <TemplatesSection templates={templates} />
      </section>

      {/* Novedades por profesional */}
      <section>
        <h2 className="text-lg font-medium mb-1">Novedades por profesional</h2>
        <p className="text-sm text-muted mb-3">
          Al cargarla queda publicada en la sección “Novedades” de la web (30 días). “Difundir” todavía
          no manda mensajes: el envío por WhatsApp no está conectado, así que sólo queda registrada a
          cuántas clientas le llegaría (las que no pidieron dejar de recibir mensajes).
        </p>
        {/* Controles compactos en la PC; en el celular, 44 px (el piso táctil) y la novedad a lo ancho. */}
        <form action={createProfessionalNews} className="rounded-lg border border-line p-4 flex flex-wrap gap-2 mb-4">
          <select name="professionalId" required aria-label="Profesional" className="rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-strong focus:border-accent max-sm:h-11 max-sm:w-full">
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
            aria-label="Novedad a publicar"
            placeholder="Ej.: Carolina suma horario los sábados por la tarde"
            className="flex-1 min-w-[220px] rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-strong focus:border-accent max-sm:h-11 max-sm:w-full"
          />
          <SubmitButton pendingText="Cargando…" className={buttonClasses("solid", "sm", "max-sm:w-full")}>
            Cargar novedad
          </SubmitButton>
        </form>

        <div className="space-y-2">
          {news.map((n) => (
            <div key={n.id} className="rounded-lg border border-line p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="font-medium">{n.professional.name}</span> — {n.message}
                </p>
                <p className="text-xs text-faint">
                  {fmtDateTime(n.createdAt)} · publicada en la web
                  {/* No dice "difundida": el envío es simulado y no salió ningún mensaje. */}
                  {n.broadcastAt && ` · difusión simulada el ${fmtDateTime(n.broadcastAt)}: no salió ningún mensaje`}
                </p>
              </div>
              {!n.broadcastAt && (
                <form action={broadcastProfessionalNewsAction}>
                  <input type="hidden" name="id" value={n.id} />
                  <SubmitButton
                    pendingText="Registrando…"
                    className={buttonClasses("outline", "sm", "whitespace-nowrap")}
                  >
                    Difundir (simulado)
                  </SubmitButton>
                </form>
              )}
            </div>
          ))}
          {news.length === 0 && (
            <p className="text-sm text-muted">Sin novedades cargadas. Escribí la primera arriba y tocá “Cargar novedad”.</p>
          )}
        </div>
      </section>
    </main>
  );
}
