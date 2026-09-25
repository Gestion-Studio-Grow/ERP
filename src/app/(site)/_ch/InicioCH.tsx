// ============================================================================
// LA HOME DE CH CON EL DISEÑO NUEVO — sólo con el interruptor «Diseño nuevo» de CH prendido.
// ============================================================================
//
// CH está en producción: con el interruptor apagado esta pieza no se dibuja y la home es la de
// siempre, byte a byte (lo vigila diseno-nuevo.test.ts). Prenderlo en CH es decisión del dueño.
//
// Lo que cambia (DIRECCION.md §5.2, sitio de CH): la marca queda (marfil, petróleo, Playfair, la foto
// real de la cabina); cambia la estructura. El momento: una vecina de La Alameda con el teléfono,
// que quiere saber qué se hace, cuánto sale, cuánto dura, quién la atiende y pedir el turno.
//   · Todo visible de entrada: nada aparece recién al bajar (sin Reveal).
//   · Los servicios como renglones: nombre, quién lo hace, duración, precio exacto (y el de vecina,
//     ADR-013) y «Reservar», con la tecla de 44 px.
//   · El equipo con sus fotos propias o sus iniciales: nunca avatares generados (el sitio de hoy pide
//     dicebear, que además no carga detrás de un proxy).
//   · «Cómo llegar» con los datos cargados y el enlace al mapa: sin croquis de mentira.
//   · Los nombres del equipo salen de la base, no escritos a mano en el título.
//
// Sin CSS de módulo a propósito: un `import` de CSS se sumaría a la ruta de CH aunque esto no se
// dibuje. La hoja va en un <style> que existe sólo cuando esta pieza se rinde.

import Image from "next/image";
import Link from "next/link";
import ReserveButton from "./ReserveButton";
import type { FeaturedService } from "./FeaturedTreatments";

type Servicio = { id: string; name: string; durationMin: number; price: number; residentPrice: number | null };
type Grupo = { id: string; name: string; services: Servicio[] };
type Profesional = { id: string; name: string; boxName: string | null; serviceIds: string[]; serviceNames: string[] };
type Novedad = { id: string; message: string; createdAt: Date; professional: { name: string } };
type Resena = { id: string; comment: string | null; clientName: string; professional: { name: string } };
type Lugar = {
  shortLabel: string;
  addressLine: string;
  city: string;
  hoursLabel: string;
  email: string | null;
  mapsUrl: string;
};

// Fotos propias del equipo (las mismas que usa la home de hoy). Sin foto: iniciales.
const FOTOS: Record<string, { src: string; rotar?: number }> = {
  "Carolina Haponiuk": { src: "/team/carolina.png" },
  "Macarena Arias": { src: "/team/macarena.png" },
  "Romina Delpardo": { src: "/team/romina.png", rotar: 90 },
};

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;
const fecha = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires" });
const CUANTOS = 8;

function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

/** "Carla, Laura y Marina". */
function enumerar(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

export default function InicioCH({
  groups,
  professionals,
  news,
  reviews,
  location,
  destacados,
}: {
  groups: Grupo[];
  professionals: Profesional[];
  news: Novedad[];
  reviews: Resena[];
  location: Lugar;
  destacados: FeaturedService[];
}) {
  // La carta de la home: primero lo más reservado (dato de la agenda), después la carta en su orden.
  const todos = groups.flatMap((g) => g.services.map((s) => ({ ...s, grupo: g.name })));
  const orden = [...destacados.map((d) => d.id), ...todos.map((s) => s.id)];
  const vistos = new Set<string>();
  const carta = orden
    .filter((id) => (vistos.has(id) ? false : (vistos.add(id), true)))
    .map((id) => todos.find((s) => s.id === id))
    .filter((s): s is (typeof todos)[number] => Boolean(s))
    .slice(0, CUANTOS);
  const quienes = (id: string) => professionals.filter((p) => p.serviceIds.includes(id)).map((p) => p.name.split(" ")[0]);
  const nombresEquipo = professionals.map((p) => p.name.split(" ")[0]);

  return (
    <div className="chn">
      <style href="ch-inicio-nuevo" precedence="default">
        {CSS}
      </style>

      <section className="chn-env chn-hero">
        <div>
          <p className="chn-kicker">{location.shortLabel}</p>
          <h1 className="chn-h1">Estética y spa en La Alameda.</h1>
          <p className="chn-lede">
            Mirá los precios y reservá tu turno online.
            {nombresEquipo.length > 0 && <> Atienden {enumerar(nombresEquipo)}.</>}
          </p>
          <div className="chn-acc">
            <ReserveButton style={{ minHeight: 48 }}>Reservar turno</ReserveButton>
            <a href="#servicios" className="chn-enlace">
              Ver servicios y precios
            </a>
          </div>
          <dl className="chn-datos">
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
        <div className="chn-foto">
          <Image
            src="/tenants/ch-hero-spa.jpg"
            alt="Cabina de CH Estética: camilla con lino crema, plantas y luz de tarde"
            width={686}
            height={858}
            priority
            fetchPriority="high"
            sizes="(max-width: 800px) 100vw, 440px"
          />
        </div>
      </section>

      {news.length > 0 && (
        <section id="novedades" className="chn-env chn-bloque">
          <p className="chn-kicker">Novedades</p>
          <ul className="chn-renglones">
            {news.map((n) => (
              <li key={n.id} className="chn-novedad">
                <span className="chn-folio">
                  {fecha.format(n.createdAt)} · {n.professional.name.split(" ")[0]}
                </span>
                <span>{n.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="servicios" className="chn-env chn-bloque">
        <p className="chn-kicker">Lo que hacemos</p>
        <h2 className="chn-h2">
          Servicios <em>&amp;</em> tratamientos
        </h2>
        {carta.length === 0 ? (
          <p className="chn-lede">Estamos cargando la carta de servicios. Mientras tanto, reservá y te contamos.</p>
        ) : (
          <>
            <p className="chn-baja">Precio exacto y duración. Reservás el horario libre que te muestre la agenda.</p>
            <ul className="chn-renglones">
              {carta.map((s) => {
                const q = quienes(s.id);
                return (
                  <li key={s.id} className="chn-serv">
                    <span className="chn-serv-txt">
                      <span className="chn-serv-nom">{s.name}</span>
                      <span className="chn-serv-meta">{[s.grupo, enumerar(q)].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="chn-dur">{s.durationMin} min</span>
                    <span className="chn-plata">
                      {pesos(s.price)}
                      {s.residentPrice != null && s.residentPrice < s.price && (
                        <small>Vecinas {pesos(s.residentPrice)}</small>
                      )}
                    </span>
                    <ReserveButton
                      style={{
                        minHeight: 44,
                        padding: "0 16px",
                        fontSize: 14,
                        background: "transparent",
                        color: "var(--text-strong)",
                        border: "1px solid var(--line-strong, var(--line))",
                      }}
                    >
                      Reservar
                    </ReserveButton>
                  </li>
                );
              })}
            </ul>
            {todos.length > carta.length && (
              <Link href="/servicios" className="chn-enlace chn-mas">
                Ver la carta completa · {todos.length} servicios
              </Link>
            )}
          </>
        )}
      </section>

      {professionals.length > 0 && (
        <section id="equipo" className="chn-env chn-bloque">
          <p className="chn-kicker">Quién te atiende</p>
          <h2 className="chn-h2">Equipo</h2>
          <ul className="chn-equipo">
            {professionals.map((p) => {
              const foto = FOTOS[p.name];
              return (
                <li key={p.id}>
                  <span className="chn-cara" aria-hidden={!foto}>
                    {foto ? (
                      <Image
                        src={foto.src}
                        alt={p.name}
                        width={56}
                        height={56}
                        style={foto.rotar ? { transform: `rotate(${foto.rotar}deg) scale(1.5)` } : undefined}
                      />
                    ) : (
                      iniciales(p.name)
                    )}
                  </span>
                  <span className="chn-eq-nom">{p.name}</span>
                  <span className="chn-serv-meta">
                    {[p.serviceNames.slice(0, 3).join(" · ") || "Estética integral", p.boxName].filter(Boolean).join(" · ")}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {reviews.some((r) => r.comment) && (
        <section className="chn-env chn-bloque">
          <p className="chn-kicker">Lo que dicen</p>
          <ul className="chn-resenas">
            {reviews
              .filter((r) => r.comment)
              .map((r) => (
                <li key={r.id}>
                  <blockquote>“{r.comment}”</blockquote>
                  <span className="chn-serv-meta">
                    {r.clientName} · con {r.professional.name.split(" ")[0]}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}

      <section id="contacto" className="chn-env chn-bloque">
        <p className="chn-kicker">Dónde</p>
        <h2 className="chn-h2">Cómo llegar</h2>
        <dl className="chn-tabla">
          <div>
            <dt>Dirección</dt>
            <dd>
              {location.addressLine} · {location.city}
            </dd>
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
        <a href={location.mapsUrl} target="_blank" rel="noopener noreferrer" className="chn-enlace chn-mas">
          Abrir en el mapa
        </a>
      </section>
    </div>
  );
}

const CSS = `
.chn{--chn-margen:clamp(16px,4vw,48px);padding-bottom:24px}
.chn *{box-sizing:border-box}
.chn :where(h1,h2,p,ul,dl,dd,blockquote){margin:0}
.chn :where(ul){padding:0;list-style:none}
.chn-env{max-width:1152px;margin:0 auto;padding-inline:var(--chn-margen)}
.chn-kicker{font-family:var(--font-body),system-ui,sans-serif;text-transform:uppercase;letter-spacing:.2em;font-weight:600;font-size:.75rem;color:var(--text-muted)}
.chn-h1{font-family:var(--font-display),Georgia,serif;font-weight:480;font-size:clamp(2.3rem,5vw + 1rem,4rem);line-height:1.04;letter-spacing:-.01em;margin-top:14px}
.chn-h2{font-family:var(--font-display),Georgia,serif;font-weight:520;font-size:clamp(1.9rem,4vw,2.8rem);line-height:1.1;margin-top:8px}
.chn-h2 em{font-weight:340}
.chn-lede{margin-top:18px;font-size:1.0625rem;line-height:1.65;color:var(--text-muted);max-width:32rem}
.chn-baja{margin-top:10px;color:var(--text-muted);max-width:36rem}
.chn-acc{display:flex;flex-wrap:wrap;align-items:center;gap:12px 24px;margin-top:26px}
.chn-enlace{display:inline-flex;align-items:center;min-height:44px;color:color-mix(in srgb,var(--accent) 78%,#000);text-decoration:underline;text-underline-offset:4px;font-weight:500}
.chn-hero{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:clamp(24px,5vw,64px);align-items:center;padding-block:clamp(24px,5vw,56px)}
.chn-foto img{display:block;width:100%;height:auto;aspect-ratio:4/5;object-fit:cover;border-radius:4px}
.chn-datos{display:grid;grid-template-columns:auto 1fr;gap:4px 16px;margin-top:26px;padding-top:14px;border-top:1px solid var(--line);font-size:.9375rem}
.chn-datos div{display:contents}
.chn-datos dt{color:var(--text-muted)}
.chn-bloque{padding-top:clamp(36px,6vw,64px)}
.chn-renglones{margin-top:18px;border-top:1px solid var(--line)}
.chn-renglones li{border-bottom:1px solid var(--line)}
.chn-novedad{display:grid;gap:4px;padding:14px 0}
.chn-folio{font-size:.75rem;letter-spacing:.14em;text-transform:uppercase;color:var(--text-muted)}
.chn-serv{display:grid;grid-template-columns:minmax(0,1fr) 72px 140px auto;gap:6px 20px;align-items:center;min-height:64px;padding:8px 0}
.chn-serv-txt{display:grid;gap:2px;min-width:0}
.chn-serv-nom{font-family:var(--font-display),Georgia,serif;font-size:1.3rem;line-height:1.2;color:var(--text-strong)}
.chn-serv-meta{font-size:.8125rem;color:var(--text-muted)}
.chn-dur{font-size:.8125rem;color:var(--text-muted);text-align:right;font-variant-numeric:tabular-nums}
.chn-plata{display:grid;text-align:right;font-weight:700;font-variant-numeric:tabular-nums;font-size:1.0625rem}
.chn-plata small{font-weight:600;font-size:.75rem;color:color-mix(in srgb,var(--accent) 78%,#000)}
.chn-mas{margin-top:8px}
.chn-equipo{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0 28px;margin-top:18px}
.chn-equipo li{display:grid;grid-template-columns:56px minmax(0,1fr);grid-template-rows:auto auto;column-gap:14px;align-items:center;padding:14px 0;border-top:1px solid var(--line)}
.chn-cara{grid-row:1/span 2;width:56px;height:56px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:var(--surface-sunken);font-family:var(--font-display),Georgia,serif;font-size:1.25rem;color:color-mix(in srgb,var(--accent) 78%,#000)}
.chn-cara img{width:100%;height:100%;object-fit:cover}
.chn-eq-nom{font-family:var(--font-display),Georgia,serif;font-size:1.2rem;align-self:end}
.chn-resenas{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px;margin-top:18px}
.chn-resenas li{display:grid;gap:8px;padding-top:14px;border-top:1px solid var(--line)}
.chn-resenas blockquote{font-size:.9375rem;line-height:1.6;color:var(--text-strong)}
.chn-tabla{margin-top:18px;border-top:1px solid var(--line);max-width:640px}
.chn-tabla div{display:grid;grid-template-columns:140px minmax(0,1fr);gap:16px;padding:12px 0;border-bottom:1px solid var(--line)}
.chn-tabla dt{color:var(--text-muted);font-size:.875rem}
.chn-tabla a{color:inherit}
@media (max-width:800px){
  .chn-hero{grid-template-columns:1fr}
  .chn-foto{order:-1}
  .chn-foto img{aspect-ratio:16/10}
  .chn-serv{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"txt plata" "dur boton"}
  .chn-serv-txt{grid-area:txt}.chn-plata{grid-area:plata}.chn-dur{grid-area:dur;text-align:left}
  .chn-serv button{grid-area:boton;justify-self:end}
  .chn-tabla div{grid-template-columns:110px minmax(0,1fr)}
}
`;
