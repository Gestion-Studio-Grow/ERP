import { getProfessionalsWithServices } from "@/lib/actions";
import { redirect } from "next/navigation";
import { destinoPropio, rubroDelTurno } from "@/lib/turnos/rubro-del-turno";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import { agendaBookingCopyForSlug } from "@/blueprints/agenda";
import BookingForm from "./BookingForm";
import { reglaVigenteParaLaClienta } from "@/lib/turnos/practica.server";
import { chConDisenoNuevo } from "../_ch/diseno-ch.server";
import { sinPromesaDeWhatsApp } from "../_ch/contacto-ch";
import { getLocation } from "@/lib/settings";
import { metadataCH, nombreDelNegocioCH } from "../_ch/metadata-ch.server";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

// Diseño nuevo de CH (P0-5): el título dice dónde se reserva. Apagado o cualquier otro negocio: la de siempre.
export async function generateMetadata(): Promise<Metadata> {
  if (!(await chConDisenoNuevo())) return {};
  return metadataCH({ titulo: `Reservar turno — ${await nombreDelNegocioCH()}`, descripcion: "Elegí tratamiento, profesional y horario. Reservás online en un minuto." });
}

export default async function ReservaPage() {
  // Identidad por rubro (ronda 2, P0): el taller reserva en su formulario y el profe en su turnero, con su piel y su voz.
  const propio = destinoPropio(await rubroDelTurno(), "reserva");
  if (propio) redirect(propio);
  const [professionals, slug, regla, nuevo] = await Promise.all([
    getProfessionalsWithServices({ reservaOnline: true }),
    getCurrentTenantSlug(),
    reglaVigenteParaLaClienta(),
    // Página compartida (CH y Taller AGR): con el diseño nuevo de CH prendido sólo cambian escala y tokens
    // (`chr`, estilos-ch.ts); ni colores ni textos de CH. Cualquier otro negocio, o apagado: la de siempre.
    chConDisenoNuevo(),
  ]);
  // Copy rubro-aware: un club de pádel dice "cancha", una estética "profesional".
  // Cae al wording histórico para los tenants que no definen su propia voz.
  const copy = agendaBookingCopyForSlug(slug);
  // Sin WhatsApp cargado, la bajada no promete WhatsApp (contacto-ch.ts), con o sin el diseño nuevo (ronda 2).
  const bajada = sinPromesaDeWhatsApp(copy.subtitle, (await getLocation()).whatsapp);

  return (
    <div className={nuevo ? "chr mx-auto max-w-2xl px-6 py-14" : "mx-auto max-w-2xl px-6 py-14"}>
      <h1 className={nuevo ? "chr-h1" : "font-serif text-3xl sm:text-4xl mb-2"} style={{ color: "var(--text-strong)" }}>
        {copy.title}
      </h1>
      <p className={regla ? "mb-3" : "mb-10"} style={{ color: "var(--text-muted)" }}>
        {bajada}
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
