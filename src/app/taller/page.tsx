import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getTenantIdentity } from "@/lib/identidad-rubro";
import { getPublishedReviews } from "@/lib/reviews-actions";
import { getCurrentTenantId } from "@/lib/tenant";
import { datosDelNegocio } from "@/lib/taller/datos.server";
import { marcaTaller } from "@/lib/taller/marca";
import { Barra, BarraFija, IconoWhatsApp, Pie, cargarTaller, lemaSinPunto } from "./marco";
import { desde, esTrabajoPublicable } from "./reglas";
import Chapa from "./Chapa";
import Mapa from "./Mapa";
import Etapas from "./Etapas";

// Página pública del taller — «La chapa manda» (DISENO.md de AGR, 29/10/2026). Sólo existe para negocios del
// rubro `taller`; el resto recibe la «no encontrada» de siempre. Todos los «Sacar turno» van a /taller/turno.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const identity = await getTenantIdentity();
  if (identity.blueprintId !== "taller") return {};
  const n = await datosDelNegocio(await getCurrentTenantId());
  const m = marcaTaller(n.slug);
  const barrio = n.direccion.split(",").pop()?.trim() || "tu barrio";
  const descripcion = `Taller mecánico en ${barrio}: motores, frenos, suspensión, inyección y diagnóstico computarizado. ${n.direccion}. Sacá turno online o escribinos por WhatsApp.`;
  return {
    title: `${n.nombre} — ${lemaSinPunto(m)}`,
    description: descripcion,
    manifest: "/taller/app.webmanifest",
    openGraph: {
      title: n.nombre,
      description: descripcion,
      // Relativa a propósito: metadataBase (layout.tsx) la vuelve absoluta con el host del request.
      ...(m.logo ? { images: [{ url: m.logo, width: 498, height: 247, alt: n.nombre }] } : {}),
    },
  };
}

// Una línea por rubro, sin adjetivos (DISENO §9).
// PROVISIONAL [A VALIDAR]: las seis líneas son descripciones genéricas del rubro, no afirmaciones sobre el taller.
// Se confirman con el dueño por WhatsApp antes de darlas por buenas. Un rubro sin línea muestra sólo su nombre.
const QUE_INCLUYE: Record<string, string> = {
  Motores: "Ruidos, pérdidas, temperatura, correa de distribución.",
  Frenos: "Pastillas, discos, líquido. Te mostramos las piezas que salen.",
  "Suspensión y tren delantero": "Amortiguadores, rótulas, bujes y alineación.",
  Inyección: "Limpieza de inyectores, sensores, arranque difícil.",
  "Diagnóstico computarizado": "Escáner y lectura de fallas. Sin adivinar.",
  "Service y mantenimiento": "Aceite, filtros y revisión general. Con planilla.",
};

// Los cuatro pasos de siempre (copy aprobado de la versión anterior), con la cara de la barra de etapas que el
// cliente ve en su link de seguimiento (src/app/seguimiento/[token]/page.tsx).
const PASOS: [string, string][] = [
  ["Traés el auto", "Anotamos qué le pasa y sacamos fotos de cómo llega, para que estés tranquilo."],
  ["Te pasamos el presupuesto", "Por WhatsApp, con el detalle. Aprobás lo que querés hacer, ítem por ítem."],
  ["Seguís el arreglo", "Con un link ves en qué está tu auto, sin llamar ni preguntar."],
  ["Lo retirás con garantía", "Te avisamos cuando está listo y cada trabajo sale con garantía por escrito."],
];

function Estrellas({ n }: { n: number }) {
  return (
    <p className="agr-resena__estrellas" aria-label={`${n} de 5 estrellas`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className={i < n ? undefined : "apagada"}>
          <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />
        </svg>
      ))}
    </p>
  );
}

export default async function TallerLanding() {
  const t = await cargarTaller();
  const { tenantId, negocio, config, marca: m } = t;
  const [servicios, resenas] = await Promise.all([
    prisma.service.findMany({
      where: { tenantId, active: true, deletedAt: null, price: { gt: 0 }, NOT: { name: { contains: "de ejemplo", mode: "insensitive" } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, price: true, durationMin: true },
      take: 12,
    }),
    getPublishedReviews(),
  ]);
  const trabajos = servicios.filter(esTrabajoPublicable);
  const wa = t.wa();
  const mapa = negocio.direccion
    ? `https://www.google.com/maps?q=${encodeURIComponent(`${negocio.nombre}, ${negocio.direccion}`)}&output=embed`
    : null;
  const comoLlegar = m.google?.url ?? negocio.mapsUrl;

  return (
    <>
      <Barra t={t} inicio />
      <main id="inicio">
        {/* Hero: la chapa */}
        <section className="agr-hero" aria-labelledby="agr-h1">
          <div className="agr-cont agr-hero__grid">
            <div>
              <p className="agr-etiqueta">Taller mecánico{t.barrio ? ` · ${t.barrio}` : ""}</p>
              <h1 id="agr-h1" className="agr-h1">
                <span>Te decimos</span>
                <span>qué tiene,</span>
                <span>
                  cuánto sale<span className="agr-punto">.</span>
                </span>
              </h1>
              <p className="agr-bajada">Y cuándo está. Seguís el arreglo desde el celular y no hacemos nada sin tu OK.</p>
              <ul className="agr-hechos">
                {m.google && (
                  <li>
                    {/* Puntaje cargado a mano (src/lib/taller/marca.ts:41), provisional a confirmar al publicar. */}
                    <a href={m.google.url} target="_blank" rel="noopener noreferrer" title="Puntaje leído en Google el 08/10/2026">
                      ★ {m.google.puntaje} en Google
                    </a>
                  </li>
                )}
                <li>Garantía {config.garantiaDias} días por escrito</li>
                <li>Presupuesto válido {config.validezDias} días</li>
              </ul>
            </div>
            <div>
              <Chapa />
              {/* Sin buscador por patente: el token del link es la llave; por chapa no se expone el estado de nadie.
                  El link lleva al chat del taller, que es donde quedó el link de seguimiento. */}
              {wa ? (
                <a href={wa} target="_blank" rel="noopener noreferrer" className="agr-chapa__seguir">
                  ¿Ya está tu auto acá? Abrí el link de seguimiento que te mandamos por WhatsApp
                </a>
              ) : (
                <p className="agr-chapa__seguir">¿Ya está tu auto acá? Abrí el link de seguimiento que te mandamos por WhatsApp.</p>
              )}
            </div>
          </div>
        </section>

        {/* Qué hacemos */}
        <section id="servicios" className="agr-sec" aria-labelledby="agr-servicios">
          <div className="agr-cont">
            <p className="agr-etiqueta">Servicios</p>
            <h2 id="agr-servicios" className="agr-h2">Qué hacemos</h2>
            <ul className="agr-rubros">
              {m.servicios.map((s, i) => (
                <li key={s} className="agr-rubro">
                  <span className="agr-rubro__n" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="agr-h3">{s}</h3>
                  {QUE_INCLUYE[s] && <p>{QUE_INCLUYE[s]}</p>}
                </li>
              ))}
            </ul>

            {trabajos.length > 0 ? (
              <div className="agr-precios">
                <h3 className="agr-h3">Trabajos con precio de referencia</h3>
                <ul className="agr-precios__lista">
                  {trabajos.map((s) => (
                    <li key={s.id}>
                      <details className="agr-precio">
                        <summary>
                          <span className="agr-precio__nombre">{s.name}</span>
                          <span className="agr-precio__dur">{s.durationMin} min</span>
                          <span className="agr-precio__monto">
                            <small>desde</small>
                            <b>{desde(s.price)}</b>
                          </span>
                          <span className="agr-precio__mas" aria-hidden="true" />
                        </summary>
                        <div className="agr-precio__ficha">
                          <ul>
                            <li>Cuánto tarda: alrededor de {s.durationMin} minutos con el auto en el taller.</li>
                            <li>Garantía {config.garantiaDias} días por escrito.</li>
                            <li>Mano de obra de referencia; el presupuesto final se confirma al revisar el auto.</li>
                          </ul>
                          <a href={`/taller/turno?servicio=${encodeURIComponent(s.id)}`} className="agr-btn agr-btn--tinta">
                            Sacar turno para esto
                          </a>
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
                <p className="agr-nota">
                  Mano de obra de referencia. El presupuesto final se confirma al revisar el auto y tiene validez por escrito.
                </p>
              </div>
            ) : (
              wa && (
                <div className="agr-vacio">
                  <p>Los precios de mano de obra los confirmamos por WhatsApp hasta que terminemos de cargar la lista.</p>
                  <a href={wa} target="_blank" rel="noopener noreferrer" className="agr-btn agr-btn--tinta">
                    <IconoWhatsApp tam={22} /> Consultar por WhatsApp
                  </a>
                </div>
              )
            )}
          </div>
        </section>

        {/* Así trabajamos */}
        <section id="trabajamos" className="agr-sec agr-sec--gris" aria-labelledby="agr-trabajamos">
          <div className="agr-cont">
            <p className="agr-etiqueta">Paso a paso</p>
            <h2 id="agr-trabajamos" className="agr-h2">Así trabajamos</h2>
            <Etapas>
              {PASOS.map(([titulo, texto], i) => (
                <li key={titulo} className="agr-etapa">
                  <span className="agr-etapa__n" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 className="agr-h3">{titulo}</h3>
                    <p>{texto}</p>
                  </div>
                </li>
              ))}
            </Etapas>
          </div>
        </section>

        {/* Lo que dicen los vecinos: sólo reseñas publicadas de verdad y el link a Google. Nada inventado. */}
        {(resenas.length > 0 || m.google) && (
          <section id="resenas" className="agr-sec" aria-labelledby="agr-resenas">
            <div className="agr-cont">
              <p className="agr-etiqueta">Reseñas</p>
              <h2 id="agr-resenas" className="agr-h2">Lo que dicen los vecinos</h2>
              {resenas.length > 0 && (
                <ul className="agr-resenas">
                  {resenas.map((r) => (
                    <li key={r.id} className="agr-resena">
                      <Estrellas n={r.rating} />
                      {r.comment && <blockquote>“{r.comment}”</blockquote>}
                      <cite>{r.clientName}</cite>
                    </li>
                  ))}
                </ul>
              )}
              {m.google && (
                <a href={m.google.url} target="_blank" rel="noopener noreferrer" className="agr-btn agr-btn--borde" title="Puntaje leído en Google el 08/10/2026">
                  ★ {m.google.puntaje} en Google — ver reseñas
                </a>
              )}
            </div>
          </section>
        )}

        {/* Dónde estamos */}
        <section id="donde" className="agr-sec agr-oscuro" aria-labelledby="agr-donde">
          <div className="agr-cont agr-donde">
            <div>
              <p className="agr-etiqueta">Dónde estamos</p>
              <h2 id="agr-donde" className="agr-sr">Dónde estamos</h2>
              <p className="agr-direccion">{negocio.direccion || "Dirección a confirmar"}</p>
              <p className="agr-horario">{t.horario}</p>
              <div className="agr-botones">
                {wa && (
                  <a href={wa} target="_blank" rel="noopener noreferrer" className="agr-btn">
                    <IconoWhatsApp tam={22} /> Escribinos por WhatsApp
                  </a>
                )}
                {comoLlegar && (
                  <a href={comoLlegar} target="_blank" rel="noopener noreferrer" className="agr-btn agr-btn--borde">
                    Cómo llegar
                  </a>
                )}
              </div>
              {negocio.instagramUrl && (
                <p className="agr-ig">
                  Seguinos en{" "}
                  <a href={negocio.instagramUrl} target="_blank" rel="noopener noreferrer">
                    {negocio.instagramLabel}
                  </a>
                </p>
              )}
            </div>
            {mapa && <Mapa src={mapa} direccion={negocio.direccion} />}
          </div>
        </section>
      </main>
      <Pie t={t} />
      <BarraFija t={t} />
    </>
  );
}
