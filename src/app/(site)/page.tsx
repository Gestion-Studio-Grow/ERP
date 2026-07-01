import Link from "next/link";
import { getCatalog } from "@/lib/catalog-actions";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { services, professionals } = await getCatalog();
  const activeServices = services.filter((s) => s.active);
  const activeProfessionals = professionals.filter((p) => p.active);

  return (
    <>
      <section className="mx-auto max-w-5xl px-6 py-20 text-center">
        <p className="text-sm font-medium text-neutral-400 mb-3">
          [Acá va tu rubro: ej. Estética · Masajes · Spa]
        </p>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight mb-5 text-neutral-400">
          [Acá va el título principal de tu negocio]
        </h1>
        <p className="text-neutral-400 max-w-lg mx-auto mb-8">
          [Acá va la bajada: contale al cliente por qué reservar con vos —
          rapidez, calidad, ubicación, lo que quieras destacar]
        </p>
        <div className="mx-auto mb-8 flex h-56 max-w-xl items-center justify-center rounded-lg border border-dashed border-neutral-300 text-sm text-neutral-400">
          [Acá va tu foto o video de portada]
        </div>
        <Link
          href="/reserva"
          className="inline-block rounded-md bg-black text-white px-6 py-3 font-medium"
        >
          Reservar turno ahora
        </Link>
      </section>

      <section id="servicios" className="border-t bg-neutral-50">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-2xl font-semibold mb-1">Servicios</h2>
          <p className="text-neutral-500 mb-8">Precios y duración de cada tratamiento.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {activeServices.map((s) => (
              <div key={s.id} className="rounded-lg border bg-white p-5 flex items-center justify-between">
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-sm text-neutral-500">{s.durationMin} min</p>
                </div>
                <p className="font-semibold">${s.price.toLocaleString("es-AR")}</p>
              </div>
            ))}
            {activeServices.length === 0 && (
              <p className="text-sm text-neutral-500">Próximamente vamos a publicar los servicios.</p>
            )}
          </div>
        </div>
      </section>

      <section id="profesionales" className="border-t">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-2xl font-semibold mb-1">Nuestro equipo</h2>
          <p className="text-neutral-500 mb-8">Profesionales especializados en cada tratamiento.</p>
          <div className="grid sm:grid-cols-3 gap-4">
            {activeProfessionals.map((p) => (
              <div key={p.id} className="rounded-lg border p-5">
                <div className="h-12 w-12 rounded-full border border-dashed border-neutral-300 mb-3 flex items-center justify-center text-[9px] text-neutral-400 text-center leading-tight">
                  tu foto
                </div>
                <p className="font-medium">{p.name}</p>
                <p className="text-sm text-neutral-500">
                  {p.services.map((s) => s.name).join(", ") || "Sin servicios asignados"}
                </p>
              </div>
            ))}
            {activeProfessionals.length === 0 && (
              <p className="text-sm text-neutral-500">Próximamente vamos a publicar el equipo.</p>
            )}
          </div>
        </div>
      </section>

      <section className="border-t">
        <div className="mx-auto max-w-5xl px-6 py-16 text-center">
          <h2 className="text-2xl font-semibold mb-3">¿Lista para tu próximo turno?</h2>
          <Link
            href="/reserva"
            className="inline-block rounded-md bg-black text-white px-6 py-3 font-medium"
          >
            Reservar turno
          </Link>
        </div>
      </section>
    </>
  );
}
