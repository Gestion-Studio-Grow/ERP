// Placeholder de foto: gradiente tonal + grano SVG + caption de dirección de
// arte que aparece en hover. Reemplazar por fotografía real (el caption describe
// qué foto va en cada lugar). Puro CSS, sin JS.

const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/></svg>\")";

export default function PhotoPlaceholder({
  gradient,
  caption,
  ratio = "4 / 5",
  rounded = true,
  pin = false,
}: {
  gradient: string;
  caption: string;
  ratio?: string;
  rounded?: boolean;
  pin?: boolean;
}) {
  return (
    <div
      className="group"
      style={{
        position: "relative",
        aspectRatio: ratio,
        borderRadius: rounded ? 2 : 0,
        overflow: "hidden",
        background: gradient,
      }}
    >
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
            boxShadow: "0 0 0 6px color-mix(in srgb, var(--text-on-accent) 35%, transparent), 0 2px 6px rgba(0,0,0,.3)",
          }}
        />
      )}
      <div
        className="opacity-0 transition-opacity duration-300 group-hover:opacity-85"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "flex-end",
          padding: 14,
          color: "var(--text-on-accent)",
          fontSize: ".6rem",
          letterSpacing: ".05em",
          lineHeight: 1.4,
          textShadow: "0 1px 3px rgba(0,0,0,.3)",
        }}
      >
        {caption}
      </div>
    </div>
  );
}
