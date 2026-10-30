// ============================================================================
// LA HOME DE CH CON EL DISEÑO NUEVO — «La agenda abierta sobre el mostrador» (DISENO.md de CH, 29/10/2026).
// ============================================================================
//
// Sólo con el interruptor «Diseño nuevo» de CH prendido (la dibuja el bloque marcado de page.tsx). Apagado,
// esta pieza no se dibuja y la home es la de siempre, byte a byte (lo vigila diseno-nuevo.test.ts).
//
// La primera pregunta en una estética de barrio es «¿cuánto sale y tenés algo hoy?». La primera pantalla la
// contesta: el titular, el precio exacto a un toque y, al lado, el próximo hueco libre de cada profesional
// (la agenda viva, ProximoHueco). El H1 es el LCP: texto, sin animar. Sin foto de stock en el hero.
//   · Todo lo de la primera pantalla está en el HTML: nada aparece recién al bajar (sin Reveal).
//   · Datos: los mismos de la home de siempre (page.tsx) + la regla de cancelación del negocio.
//   · Nombres del equipo, precios, horarios y dirección salen de la base; nada escrito a mano.
//   · Sin CSS de módulo: la piel es estilos-ch.ts, que el layout sirve una vez (PielCH).

import Link from "next/link";
import { nextBusinessDays } from "@/lib/datetime";
import { reglaVigenteParaLaClienta } from "@/lib/turnos/practica.server";
import ReserveButton from "./ReserveButton";
import ProximoHueco from "./ProximoHueco";
import CartaDestacada from "./CartaDestacada";
import BarraReservar from "./BarraReservar";
import { enumerar, fichasDeHueco, fotoDe, iniciales, nombreDePila } from "./equipo";
import type { FeaturedService } from "./FeaturedTreatments";
import type { BookingGroup, BookingProfessional } from "./types";

type Novedad = { id: string; message: string; createdAt: Date; professional: { name: string } };
type Resena = { id: string; comment: string | null; clientName: string; professional: { name: string } };
type Lugar = {
  shortLabel: string;
  addressLine: string;
  city: string;
  hoursLabel: string;
  email: string | null;
  mapsUrl: string;
  contactNote: string;
};

const fecha = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires" });

export default async function ChFront({
  groups,
  professionals,
  news,
  reviews,
  location,
  destacados,
}: {
  groups: BookingGroup[];
  professionals: BookingProfessional[];
  news: Novedad[];
  reviews: Resena[];
  location: Lugar;
  destacados: FeaturedService[];
}) {
  // La regla de cancelación del negocio (agenda práctica); si la lectura falla, la línea no se dibuja.
  const regla = await reglaVigenteParaLaClienta().catch(() => null);
  const total = groups.reduce((n, g) => n + g.services.length, 0);
  const servicios = groups.flatMap((g) => g.services);
  const nombresEquipo = professionals.map((p) => nombreDePila(p.name));
  const fichas = fichasDeHueco(professionals, groups, destacados.map((d) => d.id));
  // Hoy y mañana en la zona del negocio: los calcula el servidor (el reloj del teléfono puede estar en otra).
  const dias = nextBusinessDays(2);

  // «Antes de venir»: sólo lo que es real para este negocio. Si nada aplica, la sección no existe.
  const antes: string[] = [];
  antes.push("Te confirmamos por WhatsApp con el turno tomado.");
  if (regla) antes.push(regla);
  if (servicios.some((s) => s.depositAmount != null)) antes.push("Algunos tratamientos piden seña: te la mostramos antes de confirmar.");
  if (servicios.some((s) => s.residentPrice != null && s.residentPrice < s.price))
    antes.push("Si sos vecina de La Alameda, marcalo al reservar: el precio de vecina se aplica solo.");

  const conComentario = reviews.filter((r) => r.comment);

  return (
    <div className="chf">
      <section className="chf-env chf-hero" aria-labelledby="chf-titulo">
        <div className="chf-hero-tit">
          <p className="chf-kicker">{location.shortLabel}</p>
          <h1 id="chf-titulo" className="chf-h1">
            Estética y spa en La Alameda.
          </h1>
        </div>
        <div className="chf-hero-txt">
          <p className="chf-lede">Precio exacto, horario libre y quién te atiende. Reservás en un minuto.</p>
          {nombresEquipo.length > 0 && <p className="chf-atienden">Atienden {enumerar(nombresEquipo)}.</p>}
          <div className="chf-acc">
            <ReserveButton clase="chf-btn">Reservar turno</ReserveButton>
            <Link href="/servicios" className="chf-btn-borde">
              Ver la carta
            </Link>
          </div>
          <dl className="chf-datos">
            <div>
              <dt>Horarios</dt>
              <dd>{location.hoursLabel}</dd>
            </div>
            <div>
              <dt>Dónde</dt>
              <dd>{location.addressLine}</dd>
            </div>
          </dl>
        </div>
        {fichas.length > 0 && (
          <div className="chf-agenda">
            <ProximoHueco fichas={fichas} dias={dias} />
          </div>
        )}
      </section>

      <section id="servicios" className="chf-env chf-bloque" aria-labelledby="chf-servicios">
        <p className="chf-kicker">Lo que más se elige</p>
        <h2 id="chf-servicios" className="chf-h2">
          Servicios <em>&amp;</em> precios
        </h2>
        <p className="chf-baja">Sin “desde”: lo que ves es lo que sale.</p>
        <CartaDestacada destacados={destacados} professionals={professionals} total={total} conVecina />
      </section>

      {professionals.length > 0 && (
        <section id="equipo" className="chf-env chf-bloque" aria-labelledby="chf-equipo">
          <p className="chf-kicker">Quién te atiende</p>
          <h2 id="chf-equipo" className="chf-h2">
            Equipo
          </h2>
          <ul className="chf-equipo">
            {professionals.map((p) => {
              const foto = fotoDe(p.name);
              return (
                <li key={p.id}>
                  <span className="chf-foto160" aria-hidden={!foto}>
                    {foto ? (
                      // eslint-disable-next-line @next/next/no-img-element -- WebP propio de 320 px, ya optimizado
                      <img src={foto} alt={p.name} width={160} height={160} loading="lazy" decoding="async" />
                    ) : (
                      iniciales(p.name)
                    )}
                  </span>
                  <span className="chf-eq-nom">{p.name}</span>
                  <span className="chf-serv-meta">
                    {[p.serviceNames.slice(0, 3).join(" · ") || "Estética integral", p.boxName].filter(Boolean).join(" · ")}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {antes.length > 0 && (
        <section className="chf-env chf-bloque" aria-labelledby="chf-antes">
          <p className="chf-kicker">Antes de venir</p>
          <h2 id="chf-antes" className="chf-h2">
            Lo que conviene saber
          </h2>
          <ul className="chf-lista">
            {antes.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      )}

      {news.length > 0 && (
        <section id="novedades" className="chf-env chf-bloque" aria-labelledby="chf-novedades">
          <p className="chf-kicker">Novedades</p>
          <h2 id="chf-novedades" className="chf-h2">
            Lo nuevo
          </h2>
          <ul className="chf-lista">
            {news.map((n) => (
              <li key={n.id}>
                <span className="chf-folio">
                  {fecha.format(n.createdAt)} · {nombreDePila(n.professional.name)}
                </span>
                {n.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {conComentario.length > 0 && (
        <section className="chf-env chf-bloque" aria-labelledby="chf-dicen">
          <p className="chf-kicker">Lo que dicen</p>
          <h2 id="chf-dicen" className="chf-h2">
            Clientas
          </h2>
          <ul className="chf-lista">
            {conComentario.map((r) => (
              <li key={r.id}>
                <blockquote>“{r.comment}”</blockquote>
                <span className="chf-serv-meta">
                  {r.clientName} · con {nombreDePila(r.professional.name)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="contacto" className="chf-env chf-bloque" aria-labelledby="chf-donde">
        <div className="chf-donde">
          <div className="chf-donde-txt">
            <p className="chf-kicker">Dónde</p>
            <h2 id="chf-donde" className="chf-h2">
              Cómo llegar
            </h2>
            <dl className="chf-tabla">
              <div>
                <dt>Dirección</dt>
                <dd>{[location.addressLine, location.city].filter(Boolean).join(" · ")}</dd>
              </div>
              <div>
                <dt>Horarios</dt>
                <dd>{location.hoursLabel}</dd>
              </div>
              <div>
                <dt>Turnos</dt>
                <dd>Online, en un minuto</dd>
              </div>
              {location.email && (
                <div>
                  <dt>Email</dt>
                  <dd>
                    <a href={`mailto:${location.email}`}>{location.email}</a>
                  </dd>
                </div>
              )}
            </dl>
            {location.mapsUrl && (
              <a href={location.mapsUrl} target="_blank" rel="noopener noreferrer" className="chf-btn-borde chf-mas">
                Abrir en el mapa
              </a>
            )}
          </div>
          {/* Foto de banco (provisional a confirmar): sale del hero y queda acá, marcada, hasta tener la cabina real. */}
          <figure className="chf-donde-foto" data-provisoria="">
            {/* eslint-disable-next-line @next/next/no-img-element -- WebP propio con srcset, ya optimizado */}
            <img
              src="/tenants/ch/cabina-provisoria-686.webp"
              srcSet="/tenants/ch/cabina-provisoria-480.webp 480w, /tenants/ch/cabina-provisoria-686.webp 686w"
              sizes="(max-width: 800px) 100vw, 520px"
              width={686}
              height={515}
              alt="Cabina de tratamiento (foto provisoria)"
              loading="lazy"
              decoding="async"
            />
            <figcaption>Imagen ilustrativa.</figcaption>
          </figure>
        </div>
      </section>

      <BarraReservar />
    </div>
  );
}
