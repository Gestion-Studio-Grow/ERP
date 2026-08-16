import Image from "next/image";
import PhotoPlaceholder from "./PhotoPlaceholder";
import ReserveButton from "./ReserveButton";
import Reveal from "./Reveal";

// ============================================================================
// VITRINA DE TRATAMIENTOS — la home muestra POCOS, con el precio EXACTO.
// ============================================================================
//
// El cambio de fondo respecto de la versión anterior: la home volcaba la carta
// entera en un acordeón. Eso obliga al visitante a leer una lista de precios
// antes de entender qué se hace acá. La referencia validada es Aesop: un
// tratamiento, sus duraciones, el precio sin rodeos y tres fotos. La carta
// completa sigue existiendo — en /servicios, para quien la vaya a buscar.
//
// INSIGNIA CON PRECIO EXACTO, no "desde": el "desde $X" es una promesa que se
// rompe en el mostrador. Si el tratamiento cuesta $18.000, dice $18.000. Cuando
// hay precio de vecino (ADR-013) va debajo, en el acento, porque es parte de lo
// que convence de reservar y no una letra chica.
//
// TIPOGRAFÍA DEL FLYER: versalitas con 0.2em de espaciado para los rótulos y la
// itálica del display para el número. Es la misma voz del flyer impreso de CH,
// no una tipografía de web genérica.

export type FeaturedService = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  residentPrice: number | null;
  /** Categoría a la que pertenece — se muestra como rótulo arriba del nombre. */
  groupName?: string;
};

/** Versalitas del flyer: mayúsculas espaciadas 0.2em. */
const versalitas: React.CSSProperties = {
  fontFamily: "var(--font-body), system-ui, sans-serif",
  textTransform: "uppercase",
  letterSpacing: ".2em",
  fontWeight: 600,
  fontSize: ".6875rem",
  color: "var(--text-muted)",
};

const pesos = (n: number) => `$${n.toLocaleString("es-AR")}`;

// Paleta CH para los paneles de marca, en tonos distintos para que tres bloques
// seguidos no se lean como el mismo rectángulo repetido.
const GRADIENTES = [
  "linear-gradient(135deg,#C7B49C,#856B52 70%,#5b4636)",
  "linear-gradient(135deg,#D8CBBA,#A98F73 70%,#6d5540)",
  "linear-gradient(135deg,#BFA88E,#7c6248 70%,#4e3c2d)",
];

function Insignia({ price, residentPrice }: { price: number; residentPrice: number | null }) {
  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 2,
        padding: "8px 14px",
        border: "1px solid var(--line-strong)",
        borderRadius: 2,
        background: "var(--surface)",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-display), Georgia, serif",
          fontStyle: "italic",
          fontWeight: 420,
          fontSize: "1.375rem",
          lineHeight: 1.1,
          color: "var(--text-strong)",
          whiteSpace: "nowrap",
        }}
      >
        {pesos(price)}
      </span>
      {residentPrice != null && (
        <span style={{ ...versalitas, fontSize: ".625rem", color: "var(--accent)", letterSpacing: ".18em" }}>
          Vecino/a {pesos(residentPrice)}
        </span>
      )}
    </div>
  );
}

export default function FeaturedTreatments({
  services,
  photos,
  verTodoHref = "/servicios",
}: {
  services: FeaturedService[];
  /** Fotos de acompañamiento, en el mismo orden que los tratamientos. */
  photos?: { src: string; alt: string }[];
  verTodoHref?: string;
}) {
  if (services.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: "clamp(32px,5vw,56px)" }}>
      {services.map((s, i) => {
        const foto = photos?.[i];
        // Alterna el lado de la foto: da ritmo editorial sin necesitar más assets.
        const fotoDerecha = i % 2 === 0;
        return (
          <Reveal key={s.id}>
            <article
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "clamp(20px,4vw,40px)",
                alignItems: "center",
                flexDirection: fotoDerecha ? "row" : "row-reverse",
                borderTop: i === 0 ? "none" : "1px solid var(--line)",
                paddingTop: i === 0 ? 0 : "clamp(24px,4vw,40px)",
              }}
            >
              <div style={{ flex: "1 1 320px", minWidth: 260 }}>
                {s.groupName && <p style={{ ...versalitas, margin: "0 0 10px" }}>{s.groupName}</p>}
                <h3
                  style={{
                    fontFamily: "var(--font-display), Georgia, serif",
                    fontSize: "clamp(1.5rem,2.6vw,2rem)",
                    fontWeight: 500,
                    lineHeight: 1.15,
                    margin: "0 0 12px",
                    color: "var(--text-strong)",
                  }}
                >
                  {s.name}
                </h3>
                <p style={{ ...versalitas, margin: "0 0 20px", color: "var(--text-muted)" }}>
                  {s.durationMin} minutos
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                  <Insignia price={s.price} residentPrice={s.residentPrice} />
                  <ReserveButton>Reservar</ReserveButton>
                </div>
              </div>
              <div style={{ flex: "1 1 280px", minWidth: 240 }}>
                {foto ? (
                  <div style={{ position: "relative", aspectRatio: "4 / 3", borderRadius: 3, overflow: "hidden" }}>
                    <Image
                      src={foto.src}
                      alt={foto.alt}
                      fill
                      sizes="(max-width: 800px) 100vw, 420px"
                      style={{ objectFit: "cover" }}
                    />
                  </div>
                ) : (
                  // Todavía no hay foto de este tratamiento (CH tiene una sola imagen
                  // propia, la de la cabina, y ya vive en el hero). El panel de marca
                  // sostiene la composición de dos columnas sin que se lea como
                  // "sitio sin terminar", y el caption deja escrito qué foto va acá
                  // para cuando se saquen. PROVISIONAL: reemplazar por <Image>.
                  <PhotoPlaceholder
                    ratio="4 / 3"
                    gradient={GRADIENTES[i % GRADIENTES.length]}
                    caption={`Tratamiento "${s.name}" en curso: manos trabajando, piel real, luz de tarde. Sin producto de vitrina, sin caras posadas.`}
                  />
                )}
              </div>
            </article>
          </Reveal>
        );
      })}

      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 28 }}>
        <a
          href={verTodoHref}
          style={{
            ...versalitas,
            color: "color-mix(in srgb, var(--accent) 78%, #000)",
            textDecoration: "underline",
            textUnderlineOffset: 5,
            textDecorationThickness: 1,
          }}
        >
          Ver la carta completa
        </a>
      </div>
    </div>
  );
}
