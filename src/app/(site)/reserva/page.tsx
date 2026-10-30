import { getProfessionalsWithServices } from "@/lib/actions";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import { agendaBookingCopyForSlug } from "@/blueprints/agenda";
import BookingForm from "./BookingForm";
import { reglaVigenteParaLaClienta } from "@/lib/turnos/practica.server";
import { chConDisenoNuevo } from "../_ch/diseno-ch.server";

export const dynamic = "force-dynamic";

export default async function ReservaPage() {
  const [professionals, slug, regla, nuevo] = await Promise.all([
    getProfessionalsWithServices(),
    getCurrentTenantSlug(),
    reglaVigenteParaLaClienta(),
    // Página compartida (CH y Taller AGR): con el diseño nuevo de CH prendido sólo cambian escala y tokens
    // (`chr`, estilos-ch.ts); ni colores ni textos de CH. Cualquier otro negocio, o apagado: la de siempre.
    chConDisenoNuevo(),
  ]);
  // Copy rubro-aware: un club de pádel dice "cancha", una estética "profesional".
  // Cae al wording histórico para los tenants que no definen su propia voz.
  const copy = agendaBookingCopyForSlug(slug);

  return (
    <div className={nuevo ? "chr mx-auto max-w-2xl px-6 py-14" : "mx-auto max-w-2xl px-6 py-14"}>
      <h1 className={nuevo ? "chr-h1" : "font-serif text-3xl sm:text-4xl mb-2"} style={{ color: "var(--text-strong)" }}>
        {copy.title}
      </h1>
      <p className={regla ? "mb-3" : "mb-10"} style={{ color: "var(--text-muted)" }}>
        {copy.subtitle}
      </p>
      {/* Agenda práctica (T12): la regla de cancelación, a la vista antes de reservar. */}
      {regla && (
        <p className="mb-10 text-sm" style={{ color: "var(--text-muted)" }}>
          {regla}
        </p>
      )}
      <BookingForm professionals={professionals} copy={copy} />
    </div>
  );
}
