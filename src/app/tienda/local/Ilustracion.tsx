// Los dibujos de «Pedí Local»: una línea fina por categoría de la carta (lo que va en la tarjeta
// cuando el producto no tiene foto) y la taza de la portada. SVG en línea, decorativos
// (aria-hidden), pintados con `currentColor`: toman el color de la marca del local sin archivos
// nuevos ni pedidos de red. Server-safe (sin estado).

import type { ReactNode } from "react";

const TRAZOS: Record<string, ReactNode> = {
  cafe: (
    <>
      <path d="M18 28h24v8a12 12 0 0 1-24 0z" />
      <path d="M42 30.5h2.5a4.75 4.75 0 0 1 0 9.5H41" />
      <path d="M12 51h36" />
      <path d="M26 13c-2.5 3.5 2.5 5.5 0 9.5M34 13c-2.5 3.5 2.5 5.5 0 9.5" />
    </>
  ),
  bebidas: (
    <>
      <path d="M21 16h22l-3.5 36h-15z" />
      <path d="M23 30h18" />
      <path d="M35 8l-3.5 19" />
      <circle cx="28" cy="40" r="1.6" />
      <circle cx="35" cy="45" r="1.2" />
    </>
  ),
  brunch: (
    <>
      <ellipse cx="32" cy="38" rx="23" ry="10" />
      <path d="M20 36c0-6 8-8.5 12.5-6.5S44 29 44 34.5s-6.5 7-11.5 6S20 42 20 36z" />
      <circle cx="32" cy="35" r="3.6" />
    </>
  ),
  pasteleria: (
    <>
      <path d="M9 40c6-15 40-15 46 0-5.5 3-10 2-12.5-1.5-4.5 4.5-16.5 4.5-21 0C19 42 14.5 43 9 40z" />
      <path d="M24 29.5l2.2 9.5M32 27.5v12M40 29.5l-2.2 9.5" />
    </>
  ),
  granos: (
    <>
      <ellipse cx="32" cy="32" rx="13" ry="19" transform="rotate(-28 32 32)" />
      <path d="M24.5 18.5c9.5 6-3.5 19.5 15 27" />
    </>
  ),
  otros: (
    <>
      <path d="M32 54V22" />
      <path d="M32 31c-8.5-1.5-13-7.5-13-14.5 8.5 0 13 6 13 14.5z" />
      <path d="M32 40c8.5-1.5 13-7.5 13-14.5-8.5 0-13 6-13 14.5z" />
    </>
  ),
};

/** El dibujo de una categoría de la carta (carta.ts → `categoriaDe(...).id`). */
export function IlustracionDeCategoria({ categoria, className }: { categoria: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {TRAZOS[categoria] ?? TRAZOS.otros}
    </svg>
  );
}

/**
 * La portada sin foto: una taza grande en capas (plato, taza, vapor) sobre dos discos de papel.
 * Las capas llevan su clase para el parallax liviano (CSS, local.module.css): sin JS de scroll.
 */
export function TazaDePortada({ capas }: { capas: { fondo: string; disco: string; taza: string; vapor: string } }) {
  return (
    <svg viewBox="0 0 320 300" aria-hidden="true" focusable="false" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <g className={capas.fondo}>
        <circle cx="168" cy="150" r="128" fill="currentColor" />
      </g>
      <g className={capas.disco}>
        <circle cx="96" cy="78" r="38" fill="currentColor" />
      </g>
      <g className={capas.taza} stroke="currentColor" strokeWidth={3}>
        <ellipse cx="160" cy="232" rx="104" ry="22" />
        <ellipse cx="160" cy="226" rx="62" ry="10" />
        <path d="M98 130h124v40a62 62 0 0 1-124 0z" />
        <path d="M222 140h12a24 24 0 0 1 0 48h-17" />
        <path d="M110 150c10 4 20 4 30 0s20-4 30 0 20 4 30 0" />
      </g>
      <g className={capas.vapor} stroke="currentColor" strokeWidth={3}>
        <path d="M138 58c-10 14 10 22 0 38" />
        <path d="M162 46c-10 14 10 22 0 38" />
        <path d="M186 58c-10 14 10 22 0 38" />
      </g>
    </svg>
  );
}
