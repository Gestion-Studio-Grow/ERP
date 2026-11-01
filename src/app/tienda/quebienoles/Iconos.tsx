// Los íconos de las placas de Qué Bien Olés (caramelo, rodaja de limón, corbata, ♀), redibujados como
// trazo para que se "dibujen" al pasar: cada trazo lleva pathLength=1 y el CSS anima el dashoffset.
// Van en un círculo dorado, como en su portada.

import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import type { Familia } from "./perfumes";
import { SIZES_FRASCO } from "./tokens";

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

/** La gota de la pastilla de rociar (en el teléfono va sola, sin texto). */
export function IconoGota({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path d="M12 3.5c3 4.2 5.6 7.4 5.6 10.6a5.6 5.6 0 0 1-11.2 0C6.4 10.9 9 7.7 12 3.5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9.4 14.6a2.7 2.7 0 0 0 2.4 2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * La Q con corona de su caja, en TINTA: la ilustración de marca para un perfume que el dueño cargó desde
 * el panel y todavía no tiene foto (nunca un degradé con la inicial). Mismos trazos que el sello de gracias.
 */
export function QConCorona({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <path d="M23 17.5 L25.2 10.5 L28.6 14.6 L32 8.5 L35.4 14.6 L38.8 10.5 L41 17.5 Z" fill="currentColor" />
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M32 19.5c-9.6 0-16.5 7.4-16.5 16.6S22.4 52.7 32 52.7s16.5-7.4 16.5-16.6S41.6 19.5 32 19.5Zm0 1.6c-4.6 0-7.2 6.7-7.2 15s2.6 15 7.2 15 7.2-6.7 7.2-15-2.6-15-7.2-15Z"
      />
      <path d="M33.5 50.8c3.4 3.8 7.8 5.6 13.2 5.2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** «Frasco de Khamrah, de Lattafa»: el `alt` de toda foto de producto (nunca vacío). */
export function altDeFrasco(nombre: string, casa: string | null): string {
  return `Frasco de ${nombre}${casa ? `, de ${casa}` : ""}`;
}

/**
 * La foto chica de un frasco, con el `sizes` común (tokens.ts → SIZES_FRASCO): la tarjeta, el abanico, la
 * guía, el regalo y los parecidos piden la MISMA URL al optimizador.
 */
export function FotoDeFrasco({
  src,
  nombre,
  casa,
  className,
  style,
  sizes,
}: {
  src: string;
  nombre: string;
  casa: string | null;
  className?: string;
  style?: CSSProperties;
  /** Sólo para fotos que se ven mucho más chicas (el abanico de las puertas): medido, compartir la URL
   *  con la tarjeta sumaba 66 KB a la carga inicial del teléfono sin ahorrar nada después. */
  sizes?: string;
}) {
  return <Image src={src} alt={altDeFrasco(nombre, casa)} width={480} height={600} sizes={sizes ?? SIZES_FRASCO} className={className} style={style} />;
}

/**
 * LA TIRITA: la tira de papel secante que el vendedor rocía y te da para oler. Apoyada sobre la mesa de
 * mármol, sale por detrás del frasco hacia arriba; lleva el nombre escrito a mano. Sin foto, la tirita va
 * sola con la Q con corona en tinta. `giro` alterna la inclinación (par/impar) para que no parezcan clones.
 */
export function Tirita({
  children,
  sinFoto = false,
  apagada = false,
  giro = -1.5,
  como: Etiqueta = "span",
}: {
  children: ReactNode;
  sinFoto?: boolean;
  apagada?: boolean;
  giro?: number;
  /** "div" cuando lleva un título adentro (la tarjeta); "span" dentro de un botón. */
  como?: "div" | "span";
}) {
  return (
    <Etiqueta className="qb-tirita" data-sinfoto={sinFoto || undefined} data-apagada={apagada || undefined} style={{ "--giro": `${giro}deg` } as CSSProperties}>
      {children}
      {sinFoto && <QConCorona className="qb-tirita-q" />}
    </Etiqueta>
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
