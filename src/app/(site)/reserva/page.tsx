import { getProfessionalsWithServices } from "@/lib/actions";
import BookingForm from "./BookingForm";

export default async function ReservaPage() {
  const professionals = await getProfessionalsWithServices();

  return (
    <div className="mx-auto max-w-2xl px-6 py-14">
      <h1 className="text-3xl font-semibold mb-1">Reservá tu turno</h1>
      <p className="text-neutral-500 mb-10">
        Elegí profesional, servicio y horario disponible. Te confirmamos por WhatsApp.
      </p>
      <BookingForm professionals={professionals} />
    </div>
  );
}
