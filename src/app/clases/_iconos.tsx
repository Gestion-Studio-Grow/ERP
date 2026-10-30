// Los íconos de las pantallas públicas del profe: SVG inline de 24 px con `currentColor` (toman el
// color del texto que los rodea), sin emojis y sin librería (cada kilobyte cuenta en la vidriera).
// Decorativos: `aria-hidden`; el texto de al lado dice lo que hacen. Sirven en servidor y en cliente.

import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = (p: P): P => ({ width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false, ...p });

export const IconoWhatsApp = (p: P) => (
  <svg {...base(p)}>
    <path d="M3.5 20.5l1.3-4.1A8.5 8.5 0 1 1 8 19.6l-4.5.9z" />
    <path d="M9 8.6c0 3 2.4 5.8 5.6 6.4l1.2-1.3-1.9-1.1-.9.8a4.6 4.6 0 0 1-2.4-2.4l.8-.9-1.1-1.9L9 8.6z" fill="currentColor" strokeWidth={1.2} />
  </svg>
);

export const IconoInstagram = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const IconoMapa = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.4" />
  </svg>
);

export const IconoReloj = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const IconoTilde = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 12.5l4.2 4.2L19 7" />
  </svg>
);

export const IconoCruz = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 7l10 10M17 7L7 17" />
  </svg>
);

export const IconoFlecha = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 8h9a5 5 0 0 1 0 10h-3" />
    <path d="M8.5 4.5L5 8l3.5 3.5" />
  </svg>
);

export const IconoPunto = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
  </svg>
);

export const IconoCelular = (p: P) => (
  <svg {...base(p)}>
    <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
    <path d="M10.5 18.5h3" />
  </svg>
);

export const IconoCalendario = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);

export const IconoMensaje = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 5.5h16v10.5H9.5L5 20v-4H4z" />
    <path d="M8 9.5h8M8 12.5h5" />
  </svg>
);

/**
 * La pelota (amarillo pelota con la costura en dos arcos): el punto de la «Í» del logotipo, el chip
 * elegido y los «libres». Pinta con `--padel-vivo`; la costura, con el color del fondo de la superficie.
 * Nunca lleva texto encima.
 */
export const Pelota = ({ className, costura = "var(--padel-superficie)" }: { className?: string; costura?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden focusable={false}>
    <circle cx="12" cy="12" r="11" fill="var(--padel-vivo)" />
    <path d="M4.2 4.6a10.5 10.5 0 0 1 0 14.8M19.8 4.6a10.5 10.5 0 0 0 0 14.8" fill="none" stroke={costura} strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
