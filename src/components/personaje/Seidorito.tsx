// ============================================================================
// Seidorito — el personaje, dibujado inline para poder cambiarle la boca.
// ============================================================================
//
// Recuperado del deploy `seidorito-console` (Vercel, dpl_2Vjc58iSeFPH2rVThpo2mZJLoGFY,
// `public/seidorito.svg`, rediseño 2026-07). El original está en
// docs/lab/seidorito/recuperado/seidorito.svg; si cambia el dibujo, se cambian los dos.
//
// MARCA: Seidorito lleva la identidad de Seidor (consultora SAP). Es material INTERNO: vive en la
// consola del operador (/operador/lab/seidorito) y NO se muestra en la vidriera de ningún negocio.
// Exponerlo en un producto GSG es decisión del dueño (docs/lab/seidorito/README.md).
//
// Lo que se agregó al original: la boca deja de ser una sonrisa fija y pasa a ser un sprite por
// forma de Rhubarb (A–H, X). En reposo (X) es la misma sonrisa ladeada del dibujo original.

import { useId } from "react";
import type { Boca } from "./lipsync";

const TINTA = "#12222F";
const AZUL = "#3857A3";
const CELESTE = "#3DC0F0";
const LENGUA = "#E07A86";

function BocaSeidorito({ forma }: { forma: Boca }) {
  switch (forma) {
    case "A": // labios cerrados: P, B, M
      return <path d="M 82 121 Q 101 127 120 118" fill="none" stroke={TINTA} strokeWidth={4.5} strokeLinecap="round" />;
    case "B": // apenas abierta
      return <path d="M 82 119 Q 101 133 120 116 Q 101 124 82 119 Z" fill={TINTA} stroke={TINTA} strokeWidth={3} strokeLinejoin="round" />;
    case "C": // abierta
      return (
        <g>
          <path d="M 82 117 Q 101 140 120 114 Q 101 121 82 117 Z" fill={TINTA} stroke={TINTA} strokeWidth={3} strokeLinejoin="round" />
          <path d="M 92 128 Q 101 133 110 127" fill="none" stroke={LENGUA} strokeWidth={3} strokeLinecap="round" />
        </g>
      );
    case "D": // bien abierta
      return (
        <g>
          <path d="M 81 115 Q 101 148 121 112 Q 101 118 81 115 Z" fill={TINTA} stroke={TINTA} strokeWidth={3} strokeLinejoin="round" />
          <ellipse cx="101" cy="134" rx="9" ry="4.5" fill={LENGUA} />
        </g>
      );
    case "E": // redondeada
      return <ellipse cx="101" cy="123" rx="11" ry="9" fill={TINTA} stroke={TINTA} strokeWidth={2} />;
    case "F": // fruncida
      return <ellipse cx="101" cy="123" rx="6" ry="7" fill={TINTA} stroke={TINTA} strokeWidth={2} />;
    case "G": // dientes sobre el labio: F, V
      return (
        <g>
          <path d="M 83 119 Q 101 131 119 116 Q 101 123 83 119 Z" fill={TINTA} stroke={TINTA} strokeWidth={3} strokeLinejoin="round" />
          <rect x="92" y="117.5" width="18" height="5" rx="1.5" fill="#fff" />
        </g>
      );
    case "H": // lengua arriba: L
      return (
        <g>
          <path d="M 82 117 Q 101 140 120 114 Q 101 121 82 117 Z" fill={TINTA} stroke={TINTA} strokeWidth={3} strokeLinejoin="round" />
          <path d="M 94 121 Q 101 116 108 120 L 106 126 Q 101 128 96 126 Z" fill={LENGUA} />
        </g>
      );
    case "X":
    default: // reposo: la sonrisa ladeada original (la comisura de la ceja alzada sube más)
      return <path d="M 78 119 Q 101 137 122 114" fill="none" stroke={TINTA} strokeWidth={4.5} strokeLinecap="round" />;
  }
}

export type SeidoritoProps = {
  boca?: Boca;
  /** Saluda con la mano (el gesto del original). Apagado = brazo quieto. */
  saluda?: boolean;
  className?: string;
  /** Texto alternativo; sin él el dibujo es decorativo (el subtítulo ya dice lo que habla). */
  titulo?: string;
};

export function Seidorito({ boca = "X", saluda = true, className, titulo }: SeidoritoProps) {
  // Ids únicos por instancia: dos Seidoritos en la misma página no se pisan los degradés.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const cuerpo = `sdt-cuerpo-${id}`;
  const estela = `sdt-estela-${id}`;

  return (
    <svg
      viewBox="0 0 200 220"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={titulo ? "img" : undefined}
      aria-hidden={titulo ? undefined : true}
      aria-label={titulo}
      data-boca={boca}
    >
      <defs>
        <linearGradient id={cuerpo} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={CELESTE} />
          <stop offset="1" stopColor={AZUL} />
        </linearGradient>
        <linearGradient id={estela} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={CELESTE} stopOpacity="0.35" />
          <stop offset="1" stopColor={CELESTE} stopOpacity="0" />
        </linearGradient>
      </defs>
      <style>{`
        .sdt-flota { animation: sdt-flota 3.2s ease-in-out infinite; transform-origin: 100px 110px; }
        @keyframes sdt-flota { 0%,100% { transform: translateY(0) rotate(-1deg); } 50% { transform: translateY(-7px) rotate(1.2deg); } }
        .sdt-parpadeo { animation: sdt-parpadeo 4.6s infinite; transform-origin: center; transform-box: fill-box; }
        @keyframes sdt-parpadeo { 0%, 91%, 100% { transform: scaleY(1); } 94%, 96% { transform: scaleY(0.08); } }
        .sdt-saludo { animation: sdt-saludo 2.6s ease-in-out infinite; transform-origin: 156px 96px; }
        @keyframes sdt-saludo { 0%, 55%, 100% { transform: rotate(0deg); } 68% { transform: rotate(-16deg); } 82% { transform: rotate(10deg); } }
        .sdt-antena { animation: sdt-antena 3.2s ease-in-out infinite; }
        @keyframes sdt-antena { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
        .sdt-estela { animation: sdt-estela 3.2s ease-in-out infinite; }
        @keyframes sdt-estela { 0%,100% { opacity: 0.9; } 50% { opacity: 0.5; } }
        @media (prefers-reduced-motion: reduce) {
          .sdt-flota, .sdt-parpadeo, .sdt-saludo, .sdt-antena, .sdt-estela { animation: none; }
        }
      `}</style>
      <g className="sdt-flota">
        <g className="sdt-estela">
          <ellipse cx="128" cy="98" rx="66" ry="60" fill={`url(#${estela})`} />
          <ellipse cx="118" cy="98" rx="63" ry="60" fill={`url(#${estela})`} />
        </g>
        <line x1="100" y1="30" x2="100" y2="12" stroke={AZUL} strokeWidth="5" strokeLinecap="round" />
        <circle className="sdt-antena" cx="100" cy="9" r="7" fill={CELESTE} stroke={AZUL} strokeWidth="2" />
        <circle cx="100" cy="98" r="62" fill={`url(#${cuerpo})`} stroke={AZUL} strokeWidth="3" />
        <path d="M 67 78 Q 79 71 91 75" fill="none" stroke={TINTA} strokeWidth="4" strokeLinecap="round" />
        <path d="M 109 73 Q 121 66 133 71" fill="none" stroke={TINTA} strokeWidth="4" strokeLinecap="round" />
        <g className="sdt-parpadeo">
          <ellipse cx="80" cy="92" rx="11" ry="13" fill="#fff" stroke={AZUL} strokeWidth="1.5" />
          <ellipse cx="120" cy="92" rx="11" ry="13" fill="#fff" stroke={AZUL} strokeWidth="1.5" />
          <circle cx="80.5" cy="95" r="6" fill={TINTA} />
          <circle cx="120.5" cy="95" r="6" fill={TINTA} />
          <circle cx="78.6" cy="93" r="1.9" fill="#fff" />
          <circle cx="118.6" cy="93" r="1.9" fill="#fff" />
        </g>
        <BocaSeidorito forma={boca} />
        <ellipse cx="78" cy="170" rx="14" ry="8" fill={AZUL} />
        <ellipse cx="122" cy="170" rx="14" ry="8" fill={AZUL} />
        <g className={saluda ? "sdt-saludo" : undefined}>
          <path d="M 158 92 Q 176 78 182 58" fill="none" stroke={AZUL} strokeWidth="9" strokeLinecap="round" />
          <circle cx="184" cy="54" r="9" fill={CELESTE} stroke={AZUL} strokeWidth="2" />
        </g>
        <path d="M 100 158 l -12 8 l 12 8 l 12 -8 z" fill={TINTA} />
      </g>
    </svg>
  );
}
