// Los íconos de las placas de Qué Bien Olés (caramelo, rodaja de limón, corbata, ♀), redibujados como
// trazo para que se "dibujen" al pasar: cada trazo lleva pathLength=1 y el CSS anima el dashoffset.
// Van en un círculo dorado, como en su portada.

import type { Familia } from "./perfumes";

const TRAZO = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", pathLength: 1 } as const;

export function IconoFamilia({ icono, className }: { icono: Familia["icono"]; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="30" {...TRAZO} strokeWidth={1.2} className="qb-icono-aro" />
      {icono === "caramelo" && (
        <g className="qb-icono-dibujo">
          <ellipse cx="32" cy="32" rx="10" ry="8" transform="rotate(-35 32 32)" {...TRAZO} />
          <path d="M23.5 38.5 L15 44 L17 36 Z M40.5 25.5 L49 20 L47 28 Z" {...TRAZO} />
          <path d="M27 36 C30 33 33 30 37 28" {...TRAZO} />
        </g>
      )}
      {icono === "citrico" && (
        <g className="qb-icono-dibujo">
          <path d="M16 40 A18 18 0 0 1 48 24" {...TRAZO} />
          <path d="M16 40 L48 24" {...TRAZO} />
          <path d="M20 37.5 A14 14 0 0 1 44.5 25.5" {...TRAZO} />
          <path d="M32 32 L25 26 M32 32 L31 22 M32 32 L38.5 23.5 M32 32 L21 33.5" {...TRAZO} />
        </g>
      )}
      {icono === "corbata" && (
        <g className="qb-icono-dibujo">
          <path d="M26 14 L38 14 L35 21 L29 21 Z" {...TRAZO} />
          <path d="M29 21 L25 43 L32 51 L39 43 L35 21" {...TRAZO} />
          <path d="M27.5 31 L36.5 28 M26.5 38 L37.5 34.5" {...TRAZO} />
        </g>
      )}
      {icono === "ella" && (
        <g className="qb-icono-dibujo">
          <circle cx="32" cy="26" r="10" {...TRAZO} />
          <path d="M32 36 L32 51 M26 45 L38 45" {...TRAZO} />
        </g>
      )}
    </svg>
  );
}

export function IconoBolsa({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path d="M5 8h14l-1.2 12.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8L5 8Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconoInstagram({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function IconoCerrar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** La corona de la caja, para el sello de la marca. */
export function Corona({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 18" className={className} aria-hidden="true" focusable="false">
      <path d="M2 16 L5 3 L12.5 10 L20 1 L27.5 10 L35 3 L38 16 Z" fill="currentColor" />
    </svg>
  );
}
