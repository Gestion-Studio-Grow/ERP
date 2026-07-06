import { getProfessionalsWithServices } from "@/lib/actions";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import { agendaBookingCopyForSlug } from "@/blueprints/agenda";
import BookingForm from "./BookingForm";

export const dynamic = "force-dynamic";

export default async function ReservaPage() {
  const [professionals, slug] = await Promise.all([
    getProfessionalsWithServices(),
    getCurrentTenantSlug(),
  ]);
  // Copy rubro-aware: un club de pádel dice "cancha", una estética "profesional".
  // Cae al wording histórico para los tenants que no definen su propia voz.
  const copy = agendaBookingCopyForSlug(slug);

  return (
    <div className="mx-auto max-w-2xl px-6 py-14">
      <h1 className="font-serif text-3xl sm:text-4xl mb-2" style={{ color: "var(--text-strong)" }}>
        {copy.title}
      </h1>
      <p className="mb-10" style={{ color: "var(--text-muted)" }}>
        {copy.subtitle}
      </p>
      <BookingForm professionals={professionals} copy={copy} />
    </div>
  );
}
