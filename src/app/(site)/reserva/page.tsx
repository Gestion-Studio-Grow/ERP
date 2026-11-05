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
import { getTenantBrand } from "@/lib/branding";
import { leerQueryDelLink, metaDelLink, resolverPreeleccion } from "@/lib/link-reserva";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Link para redes (docs/producto/link-servicio/PLAN.md §5): con servicio/profesional en la URL, el título y la tarjeta
// dicen qué se reserva y con quién, para cualquier negocio. Sin preelección (o sin resolver): lo de siempre.
// Diseño nuevo de CH (P0-5): el título dice dónde se reserva. Apagado o cualquier otro negocio: la de siempre.
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = leerQueryDelLink(await searchParams);
  if (q.servicio || q.profesional) {
    try {
      const [professionals, marca] = await Promise.all([getProfessionalsWithServices(), getTenantBrand()]);
      const meta = metaDelLink(professionals, resolverPreeleccion(professionals, q), marca.name);
      if (meta) {
        const imagen = { url: meta.imagen, width: 1200, height: 630, alt: meta.titulo };
        return {
          title: meta.titulo,
          description: meta.descripcion,
          openGraph: { type: "website", locale: "es_AR", siteName: marca.name, title: meta.titulo, description: meta.descripcion, images: [imagen] },
          twitter: { card: "summary_large_image", title: meta.titulo, description: meta.descripcion, images: [meta.imagen] },
        };
      }
    } catch {
      // La metadata es cosmética: si algo falla, sigue la de siempre.
    }
  }
  if (!(await chConDisenoNuevo())) return {};
  return metadataCH({ titulo: `Reservar turno — ${await nombreDelNegocioCH()}`, descripcion: "Elegí tratamiento, profesional y horario. Reservás online en un minuto." });
}

export default async function ReservaPage({ searchParams }: Props) {
  // Identidad por rubro (ronda 2, P0): el taller reserva en su formulario y el profe en su turnero, con su piel y su voz.
  const propio = destinoPropio(await rubroDelTurno(), "reserva");
  if (propio) redirect(propio);
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
  // Sin WhatsApp cargado, la bajada no promete WhatsApp (contacto-ch.ts), con o sin el diseño nuevo (ronda 2).
  // Link para redes: lo que viene en la URL arranca elegido; lo que no resuelve, aviso y formulario normal.
  const q = leerQueryDelLink(await searchParams);
  const preeleccion = resolverPreeleccion(professionals, q);
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
      {preeleccion.aviso && (
        <p role="status" className="mb-6 p-4 text-sm" style={{ background: "var(--surface-sunken)", color: "var(--text-strong)" }}>
          {preeleccion.aviso}
        </p>
      )}
      <BookingForm professionals={professionals} copy={copy} preeleccion={preeleccion} utm={q.utm} />
    </div>
  );
}
