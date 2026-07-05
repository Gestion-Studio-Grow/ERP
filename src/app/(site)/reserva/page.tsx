import { getProfessionalsWithServices } from "@/lib/actions";
import BookingForm from "./BookingForm";

export const dynamic = "force-dynamic";

export default async function ReservaPage() {
  const professionals = await getProfessionalsWithServices();

  return (
    <div className="mx-auto max-w-2xl px-6 py-14">
      <h1 className="font-serif text-3xl sm:text-4xl mb-2" style={{ color: "var(--text-strong)" }}>
        Reservá tu turno
      </h1>
      <p className="mb-10" style={{ color: "var(--text-muted)" }}>
        Elegí profesional, servicio y horario disponible. Te confirmamos por WhatsApp.
      </p>
      <BookingForm professionals={professionals} />
    </div>
  );
}
