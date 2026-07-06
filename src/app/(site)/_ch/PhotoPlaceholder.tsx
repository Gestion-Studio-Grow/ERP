// Panel de marca CH para los espacios que llevarán fotografía real. Mientras no
// haya foto, NO se ve como una "caja vacía": es un elemento editorial deliberado
// —gradiente tonal + grano + viñeta + monograma fantasma— a tono con la paleta.
// Apenas hay foto real, se reemplaza este componente por <Image>.
//
// `caption` es una nota de dirección de arte para quien cargue la foto: describe
// qué imagen va en cada lugar. NO se muestra al visitante (antes aparecía en
// hover y leía como "sitio sin terminar"); queda como documentación en el código.

const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/></svg>\")";

export default function PhotoPlaceholder({
  gradient,
  ratio = "4 / 5",
  rounded = true,
  pin = false,
  monogram = "CH",
}: {
  gradient: string;
  /** Nota de dirección de arte (documentación en código, no se renderiza). */
  caption: string;
  ratio?: string;
  rounded?: boolean;
  pin?: boolean;
  monogram?: string;
}) {
  return (
    <div
      // Decorativo: no aporta información que no esté ya en el texto de la sección.
      aria-hidden
      style={{
        position: "relative",
        aspectRatio: ratio,
        borderRadius: rounded ? 4 : 0,
        overflow: "hidden",
        background: gradient,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* Grano fino: rompe el gradiente plano, da textura de superficie real. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          mixBlendMode: "overlay",
          opacity: 0.28,
          backgroundImage: GRAIN,
        }}
      />
      {/* Viñeta: hunde apenas los bordes para dar profundidad (menos "sticker"). */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(120% 100% at 50% 30%, transparent 55%, rgba(20,16,12,.22) 100%)",
        }}
      />
      {/* Monograma fantasma: firma editorial que vuelve el panel intencional. */}
      {!pin && (
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            fontFamily: "var(--font-display), Georgia, serif",
            fontSize: "clamp(3.5rem, 12vw, 7rem)",
            fontWeight: 480,
            letterSpacing: "-.02em",
            color: "rgba(255,255,255,.14)",
            userSelect: "none",
          }}
        >
          {monogram}
        </span>
      )}
      {pin && (
        <div
          style={{
            position: "absolute",
            top: "42%",
            left: "50%",
            transform: "translate(-50%,-50%)",
            width: 14,
            height: 14,
            borderRadius: 9999,
            background: "var(--accent)",
            boxShadow:
              "0 0 0 6px color-mix(in srgb, var(--text-on-accent) 35%, transparent), 0 2px 6px rgba(0,0,0,.3)",
          }}
        />
      )}
    </div>
  );
}
