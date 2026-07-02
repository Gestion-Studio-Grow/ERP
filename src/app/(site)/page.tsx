import Link from "next/link";
import Image from "next/image";
import { getCatalog } from "@/lib/catalog-actions";
import { getPublishedReviews } from "@/lib/reviews-actions";
import ServicesAccordion from "./ServicesAccordion";

export const dynamic = "force-dynamic";

const categories = [
  { n: "01", name: "Masajes", description: "Relajantes, descontracturantes y con piedras calientes." },
  { n: "02", name: "Faciales", description: "Limpiezas profundas, peelings y tratamientos de luminosidad." },
  { n: "03", name: "Corporales", description: "Radiofrecuencia, exfoliación y rituales reafirmantes." },
  { n: "04", name: "Bienestar", description: "Rituales sensoriales para desconectar del día a día." },
];

export default async function Home() {
  const { services, professionals } = await getCatalog();
  const activeServices = services.filter((s) => s.active);
  const activeProfessionals = professionals.filter((p) => p.active);
  const reviews = await getPublishedReviews();

  return (
    <>
      {/* Hero — split asimétrico, no el clásico centrado sobre foto oscura */}
      <section className="grid lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col justify-center px-6 sm:px-12 py-20 lg:py-0 order-2 lg:order-1">
          <p
            className="text-xs uppercase tracking-[0.3em] mb-6"
            style={{ color: "var(--spa-gold)" }}
          >
            Barrio La Alameda, Canning
          </p>
          <h1
            className="font-serif text-5xl sm:text-6xl lg:text-7xl leading-[0.95] mb-8 max-w-lg"
            style={{ color: "var(--spa-ink)" }}
          >
            El tiempo,
            <br />
            para vos.
          </h1>
          <p
            className="max-w-sm mb-10 text-base leading-relaxed"
            style={{ color: "var(--spa-mocha)" }}
          >
            Un espacio de Carolina Haponiuk dedicado al bienestar. Reservá tu
            turno online en menos de un minuto.
          </p>
          <div>
            <Link href="/reserva" className="btn-editorial-solid text-xs uppercase tracking-[0.1em]">
              Reservar turno →
            </Link>
          </div>
        </div>
        <div className="relative h-[50vh] lg:h-auto order-1 lg:order-2">
          <Image
            src="https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1400&q=80"
            alt="Beauty & Spa"
            fill
            priority
            className="object-cover"
          />
        </div>
      </section>

      {/* Categorías — lista editorial numerada, no grilla de 4 tarjetas iguales */}
      <section className="py-24" style={{ borderTop: "1px solid var(--spa-hairline)" }}>
        <div className="mx-auto max-w-6xl px-6 grid lg:grid-cols-[0.9fr_1.1fr] gap-12 items-start">
          <div className="relative aspect-[4/5] lg:sticky lg:top-24">
            <Image
              src="https://images.unsplash.com/photo-1596178065887-1198b6148b2b?auto=format&fit=crop&w=900&q=80"
              alt="Nuestro spa"
              fill
              className="object-cover"
            />
          </div>
          <div>
            <p
              className="text-xs uppercase tracking-[0.3em] mb-3"
              style={{ color: "var(--spa-gold)" }}
            >
              Lo que ofrecemos
            </p>
            <h2
              className="font-serif text-3xl sm:text-4xl mb-10"
              style={{ color: "var(--spa-ink)" }}
            >
              Tratamientos pensados para vos
            </h2>
            <div>
              {categories.map((c) => (
                <div
                  key={c.n}
                  className="flex items-baseline gap-6 py-6"
                  style={{ borderTop: "1px solid var(--spa-hairline)" }}
                >
                  <span
                    className="font-serif text-sm shrink-0"
                    style={{ color: "var(--spa-gold)" }}
                  >
                    {c.n}
                  </span>
                  <div>
                    <h3
                      className="font-serif text-2xl mb-1"
                      style={{ color: "var(--spa-ink)" }}
                    >
                      {c.name}
                    </h3>
                    <p className="text-sm" style={{ color: "var(--spa-mocha)" }}>
                      {c.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Servicios */}
      <section id="servicios" className="py-24" style={{ borderTop: "1px solid var(--spa-hairline)" }}>
        <div className="mx-auto max-w-3xl px-6">
          <div className="mb-14">
            <p
              className="text-xs uppercase tracking-[0.3em] mb-3"
              style={{ color: "var(--spa-gold)" }}
            >
              Menú de servicios
            </p>
            <h2 className="font-serif text-3xl sm:text-4xl" style={{ color: "var(--spa-ink)" }}>
              Precios y duración
            </h2>
          </div>
          {activeServices.length > 0 ? (
            <ServicesAccordion services={activeServices} />
          ) : (
            <p className="text-sm" style={{ color: "var(--spa-mocha)" }}>
              Próximamente vamos a publicar los servicios.
            </p>
          )}
        </div>
      </section>

      {/* Profesionales */}
      <section id="profesionales" className="py-24" style={{ borderTop: "1px solid var(--spa-hairline)" }}>
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-14">
            <p
              className="text-xs uppercase tracking-[0.3em] mb-3"
              style={{ color: "var(--spa-gold)" }}
            >
              Equipo
            </p>
            <h2 className="font-serif text-3xl sm:text-4xl" style={{ color: "var(--spa-ink)" }}>
              Profesionales especializados
            </h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-px" style={{ background: "var(--spa-hairline)" }}>
            {activeProfessionals.map((p) => (
              <div key={p.id} className="p-8" style={{ background: "var(--spa-ivory)" }}>
                <div
                  className="aspect-square mb-5 flex items-center justify-center text-[10px] text-center leading-tight"
                  style={{ border: "1px solid var(--spa-hairline)", color: "var(--spa-mocha)" }}
                >
                  tu foto
                </div>
                <p className="font-serif text-xl mb-1" style={{ color: "var(--spa-ink)" }}>
                  {p.name}
                </p>
                <p
                  className="text-xs uppercase tracking-[0.1em]"
                  style={{ color: "var(--spa-mocha)" }}
                >
                  {p.services.map((s) => s.name).join(" · ") || "Sin servicios asignados"}
                </p>
              </div>
            ))}
            {activeProfessionals.length === 0 && (
              <p className="text-sm p-8" style={{ color: "var(--spa-mocha)" }}>
                Próximamente vamos a publicar el equipo.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Testimonios */}
      {reviews.length > 0 && (
        <section className="py-24" style={{ borderTop: "1px solid var(--spa-hairline)" }}>
          <div className="mx-auto max-w-5xl px-6">
            <div className="mb-14">
              <p
                className="text-xs uppercase tracking-[0.3em] mb-3"
                style={{ color: "var(--spa-gold)" }}
              >
                Testimonios
              </p>
              <h2 className="font-serif text-3xl sm:text-4xl" style={{ color: "var(--spa-ink)" }}>
                Lo que dicen de nosotros
              </h2>
            </div>
            <div className="grid sm:grid-cols-3 gap-10">
              {reviews.map((r) => (
                <div key={r.id}>
                  <p
                    className="font-serif text-4xl leading-none mb-3"
                    style={{ color: "var(--spa-gold)" }}
                  >
                    &ldquo;
                  </p>
                  {r.comment && (
                    <p
                      className="text-sm mb-5 leading-relaxed"
                      style={{ color: "var(--spa-ink)" }}
                    >
                      {r.comment}
                    </p>
                  )}
                  <p
                    className="text-xs uppercase tracking-[0.1em]"
                    style={{ color: "var(--spa-mocha)" }}
                  >
                    {r.clientName} · {r.professional.name}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA final — banda de tinta, sin repetir el patrón de foto+overlay del hero */}
      <section style={{ background: "var(--spa-ink)" }}>
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h2 className="font-serif text-3xl sm:text-4xl mb-8" style={{ color: "var(--spa-ivory)" }}>
            ¿Lista para tu próximo turno?
          </h2>
          <Link
            href="/reserva"
            className="inline-flex items-center gap-2 px-8 py-3.5 text-xs uppercase tracking-[0.1em] transition-opacity hover:opacity-80"
            style={{ background: "var(--spa-gold)", color: "var(--spa-ink)" }}
          >
            Reservar turno →
          </Link>
        </div>
      </section>
    </>
  );
}
