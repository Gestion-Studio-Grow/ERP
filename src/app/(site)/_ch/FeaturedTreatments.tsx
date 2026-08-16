import ReserveButton from "./ReserveButton";
import Reveal from "./Reveal";

// ============================================================================
// VITRINA DE TRATAMIENTOS — los tres más elegidos, de un vistazo.
// ============================================================================
//
// Primera versión de esta vitrina: tres bloques a lo ancho, cada uno con su
// panel de foto. Con fotos reales habría funcionado (es el formato de Aesop);
// sin ellas eran tres rectángulos marrones de media pantalla cada uno, y ver los
// tres tratamientos costaba cuatro scrolls. Se leía como un sitio sin terminar y
// obligaba a trabajar para entender algo que se cuenta en dos líneas.
//
// Ahora los tres entran en UNA pantalla, en tarjetas parejas: rótulo, nombre,
// duración, precio exacto y el botón. El visitante ve de una qué se hace acá y
// cuánto sale, que es exactamente lo que vino a averiguar. Las fotos vuelven
// cuando existan, dentro de la tarjeta y sin robarle la mitad a la pantalla.
//
// PRECIO EXACTO, no "desde": el "desde $X" es una promesa que se rompe en el
// mostrador. El precio de vecino/a (ADR-013), cuando existe, va debajo y en el
// acento — es parte de lo que convence de reservar, no letra chica.
//
// TIPOGRAFÍA DEL FLYER: versalitas 0.2em en los rótulos, itálica del display
// para el número.

export type FeaturedService = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  residentPrice: number | null;
  /** Categoría a la que pertenece — rótulo arriba del nombre. */
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

function Tarjeta({ s }: { s: FeaturedService }) {
  return (
    <article
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "22px 22px 20px",
        border: "1px solid var(--line)",
        borderRadius: 3,
        background: "var(--surface)",
        height: "100%",
      }}
    >
      {s.groupName && <p style={{ ...versalitas, margin: 0 }}>{s.groupName}</p>}
      <h3
        style={{
          fontFamily: "var(--font-display), Georgia, serif",
          // Los nombres reales de CH son largos ("Combo: bozo + axilas + piernas
          // completas…"). Un display gigante los parte en cinco líneas: acá el
          // tamaño es contenido y `balance` reparte las líneas parejas.
          fontSize: "1.25rem",
          fontWeight: 500,
          lineHeight: 1.22,
          textWrap: "balance",
          margin: 0,
          color: "var(--text-strong)",
        }}
      >
        {s.name}
      </h3>
      <p style={{ ...versalitas, margin: 0 }}>{s.durationMin} minutos</p>

      {/* El precio empuja al fondo de la tarjeta para que las tres queden
          alineadas entre sí aunque los nombres midan distinto. */}
      <div style={{ marginTop: "auto", paddingTop: 14, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <span
            style={{
              display: "block",
              fontFamily: "var(--font-display), Georgia, serif",
              fontStyle: "italic",
              fontWeight: 420,
              fontSize: "1.5rem",
              lineHeight: 1.1,
              color: "var(--text-strong)",
            }}
          >
            {pesos(s.price)}
          </span>
          {s.residentPrice != null && (
            <span style={{ ...versalitas, display: "block", marginTop: 4, fontSize: ".625rem", color: "var(--accent)", letterSpacing: ".18em" }}>
              Vecino/a {pesos(s.residentPrice)}
            </span>
          )}
        </div>
        <ReserveButton>Reservar</ReserveButton>
      </div>
    </article>
  );
}

export default function FeaturedTreatments({
  services,
  verTodoHref = "/servicios",
}: {
  services: FeaturedService[];
  verTodoHref?: string;
}) {
  if (services.length === 0) return null;

  return (
    <div>
      <Reveal>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 20,
            alignItems: "stretch",
          }}
        >
          {services.map((s) => (
            <Tarjeta key={s.id} s={s} />
          ))}
        </div>
      </Reveal>

      <div style={{ marginTop: 28 }}>
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
