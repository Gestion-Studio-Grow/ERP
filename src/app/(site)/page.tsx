import Link from "next/link";
import Image from "next/image";
import { getCatalog } from "@/lib/catalog-actions";
import ServicesAccordion from "./ServicesAccordion";

export const dynamic = "force-dynamic";

const categories = [
  {
    name: "Masajes",
    description: "Relajantes, descontracturantes y con piedras calientes.",
    image:
      "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=800&q=80",
  },
  {
    name: "Faciales",
    description: "Limpiezas profundas, peelings y tratamientos de luminosidad.",
    image:
      "https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=800&q=80",
  },
  {
    name: "Corporales",
    description: "Radiofrecuencia, exfoliación y rituales reafirmantes.",
    image:
      "https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?auto=format&fit=crop&w=800&q=80",
  },
  {
    name: "Bienestar",
    description: "Rituales sensoriales para desconectar del día a día.",
    image:
      "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=800&q=80",
  },
];

export default async function Home() {
  const { services, professionals } = await getCatalog();
  const activeServices = services.filter((s) => s.active);
  const activeProfessionals = professionals.filter((p) => p.active);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=2000&q=80"
            alt=""
            fill
            priority
            className="object-cover"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(47,42,38,0.55) 0%, rgba(47,42,38,0.72) 100%)",
            }}
          />
        </div>

        <div className="relative mx-auto max-w-5xl px-6 py-28 sm:py-36 text-center text-white">
          <p className="text-sm tracking-[0.25em] uppercase mb-4 opacity-90">
            [Acá va tu rubro: ej. Estética · Spa · Bienestar]
          </p>
          <h1 className="font-serif text-4xl sm:text-6xl leading-tight mb-6">
            [Acá va el título principal de tu negocio]
          </h1>
          <p className="max-w-xl mx-auto mb-10 text-base sm:text-lg opacity-90">
            [Acá va la bajada: contale al cliente por qué reservar con vos —
            rapidez, calidad, ubicación, lo que quieras destacar]
          </p>
          <Link
            href="/reserva"
            className="inline-block rounded-full px-8 py-3.5 font-medium transition-transform hover:scale-105"
            style={{ background: "var(--spa-gold)", color: "var(--spa-ink)" }}
          >
            Reservar turno ahora
          </Link>
        </div>
      </section>

      {/* Categorías */}
      <section className="py-20" style={{ background: "var(--spa-ivory)" }}>
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-12">
            <p
              className="text-sm tracking-[0.2em] uppercase mb-2"
              style={{ color: "var(--spa-sage)" }}
            >
              Nuestro spa
            </p>
            <h2 className="font-serif text-3xl sm:text-4xl" style={{ color: "var(--spa-mocha-dark)" }}>
              Tratamientos pensados para vos
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {categories.map((c) => (
              <div key={c.name} className="group relative overflow-hidden rounded-2xl aspect-[3/4]">
                <Image
                  src={c.image}
                  alt={c.name}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(47,42,38,0) 40%, rgba(47,42,38,0.85) 100%)",
                  }}
                />
                <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                  <h3 className="font-serif text-xl mb-1">{c.name}</h3>
                  <p className="text-xs opacity-90 leading-snug">{c.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Servicios */}
      <section id="servicios" className="py-20" style={{ background: "var(--spa-sage-light)" }}>
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center mb-12">
            <p className="text-sm tracking-[0.2em] uppercase mb-2" style={{ color: "var(--spa-mocha)" }}>
              Menú de servicios
            </p>
            <h2 className="font-serif text-3xl sm:text-4xl" style={{ color: "var(--spa-mocha-dark)" }}>
              Precios y duración
            </h2>
            <p className="text-sm mt-3" style={{ color: "var(--spa-mocha)" }}>
              Tocá un servicio para ver el detalle.
            </p>
          </div>
          {activeServices.length > 0 ? (
            <ServicesAccordion services={activeServices} />
          ) : (
            <p className="text-sm text-center" style={{ color: "var(--spa-mocha)" }}>
              Próximamente vamos a publicar los servicios.
            </p>
          )}
        </div>
      </section>

      {/* Profesionales */}
      <section id="profesionales" className="py-20" style={{ background: "var(--spa-ivory)" }}>
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center mb-12">
            <p className="text-sm tracking-[0.2em] uppercase mb-2" style={{ color: "var(--spa-sage)" }}>
              Equipo
            </p>
            <h2 className="font-serif text-3xl sm:text-4xl" style={{ color: "var(--spa-mocha-dark)" }}>
              Profesionales especializados
            </h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {activeProfessionals.map((p) => (
              <div
                key={p.id}
                className="rounded-xl p-6 text-center border"
                style={{ borderColor: "var(--spa-sage-light)" }}
              >
                <div
                  className="h-16 w-16 mx-auto rounded-full border border-dashed mb-4 flex items-center justify-center text-[9px] text-center leading-tight"
                  style={{ borderColor: "var(--spa-gold)", color: "var(--spa-mocha)" }}
                >
                  tu foto
                </div>
                <p className="font-serif text-lg" style={{ color: "var(--spa-mocha-dark)" }}>
                  {p.name}
                </p>
                <p className="text-sm mt-1" style={{ color: "var(--spa-mocha)" }}>
                  {p.services.map((s) => s.name).join(", ") || "Sin servicios asignados"}
                </p>
              </div>
            ))}
            {activeProfessionals.length === 0 && (
              <p className="text-sm" style={{ color: "var(--spa-mocha)" }}>
                Próximamente vamos a publicar el equipo.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1596178065887-1198b6148b2b?auto=format&fit=crop&w=2000&q=80"
            alt=""
            fill
            className="object-cover"
          />
          <div className="absolute inset-0" style={{ background: "rgba(47,42,38,0.68)" }} />
        </div>
        <div className="relative mx-auto max-w-3xl px-6 py-24 text-center text-white">
          <h2 className="font-serif text-3xl sm:text-4xl mb-6">¿Lista para tu próximo turno?</h2>
          <Link
            href="/reserva"
            className="inline-block rounded-full px-8 py-3.5 font-medium transition-transform hover:scale-105"
            style={{ background: "var(--spa-gold)", color: "var(--spa-ink)" }}
          >
            Reservar turno
          </Link>
        </div>
      </section>
    </>
  );
}
