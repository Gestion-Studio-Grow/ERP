// Íconos de la vidriera: trazo de 1,75 px, sin relleno, heredan el color. Dibujados acá (no una
// librería: cinco dibujos no justifican una dependencia). Siempre decorativos: el texto de al lado
// o el aria-label del botón dice qué hacen.

type P = { className?: string; size?: number };

function Svg({ className, size = 18, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="square"
      className={className}
    >
      {children}
    </svg>
  );
}

/** El globo de WhatsApp, en trazo (el logo oficial relleno no se usa como adorno). */
export function IconoWhatsApp(p: P) {
  return (
    <Svg {...p}>
      <path d="M4.5 19.5l1.2-3.6A8 8 0 1 1 8.4 18.6z" strokeLinejoin="round" />
      <path
        d="M9.2 8.6c.3 2.9 2.4 5.3 5.4 6l1-1.4-1.9-1-.9.8c-.9-.4-1.7-1.2-2.1-2.1l.8-.9-1-1.9z"
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IconoLupa(p: P) {
  return (
    <Svg {...p}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </Svg>
  );
}

export function IconoCerrar(p: P) {
  return (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function IconoBolsa(p: P) {
  return (
    <Svg {...p}>
      <path d="M5 8h14l-1 12H6z" strokeLinejoin="round" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </Svg>
  );
}

export function IconoFlecha(p: P) {
  return (
    <Svg {...p}>
      <path d="M5 12h13M13 7l5 5-5 5" />
    </Svg>
  );
}

export function IconoTilde(p: P) {
  return (
    <Svg {...p}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  );
}
