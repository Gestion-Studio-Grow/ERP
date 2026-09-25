// ============================================================================
// ÍCONOS DE LAS PIEZAS — trazos propios, de la misma familia que iconos-apps.tsx.
// ============================================================================
//
// Los de las APPS viven en src/components/iconos-apps.tsx (uno por app). Éstos son los de las
// piezas: el tilde de «Listo», la flecha del delta, la perilla de «Deslizar», el borrar del
// teclado, deshacer, cerrar. Línea de 1,85 sobre 24, puntas redondas, `currentColor`: el ícono
// toma el color de la palabra que acompaña. Nunca adentro de un círculo de color.
//
// Sin "use client": sin estado, lo usan componentes de servidor y de cliente.

import type { ReactNode } from "react";

const TRAZOS = {
  listo: <path d="M4.5 12.5l4.8 4.8L19.5 7" />,
  sube: <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />,
  baja: <path d="M12 5v14M5.5 12.5 12 19l6.5-6.5" />,
  igual: <path d="M5 9.5h14M5 14.5h14" />,
  flecha: <path d="M5 12h14M13 6l6 6-6 6" />,
  cerrar: <path d="M6 6l12 12M18 6 6 18" />,
  deshacer: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 010 11H11" />
    </>
  ),
  borrar: (
    <>
      <path d="M21 5H9l-6 7 6 7h12a1 1 0 001-1V6a1 1 0 00-1-1z" />
      <path d="M17.5 9.5l-5 5M12.5 9.5l5 5" />
    </>
  ),
  alerta: (
    <>
      <path d="M12 3.5 22 20H2z" />
      <path d="M12 10v4.5M12 17.3v.2" />
    </>
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.3v.2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.7v.2" />
    </>
  ),
  mas: <path d="M12 5v14M5 12h14" />,
  casa: <path d="M4 11.5 12 5l8 6.5M6.5 10v9h11v-9M10 19v-5h4v5" />,
  persona: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.5c.8-3.3 3.6-5 7-5s6.2 1.7 7 5" />
    </>
  ),
  menos: <path d="M5 12h14" />,
  buscar: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  efectivo: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 9.5v5M18 9.5v5" />
    </>
  ),
  transferencia: (
    <>
      <path d="M4 8.5h14M14.5 5 18 8.5 14.5 12" />
      <path d="M20 15.5H6M9.5 12 6 15.5 9.5 19" />
    </>
  ),
  // Mercado Pago en el mostrador: el QR que escanea el cliente.
  qr: (
    <>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1" />
      <path d="M14 14h2.5v2.5M20.5 14v.1M14 20.5h.1M17.5 20.5h3v-3" />
    </>
  ),
  tarjeta: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
      <path d="M2.5 10h19M6 15h4" />
    </>
  ),
  imprimir: (
    <>
      <path d="M6 9V3.5h12V9" />
      <rect x="3" y="9" width="18" height="8" rx="2" />
      <path d="M6 14h12v6.5H6z" />
    </>
  ),
  tijera: (
    <>
      <circle cx="6" cy="6.5" r="2.5" />
      <circle cx="6" cy="17.5" r="2.5" />
      <path d="M8.2 7.7 20 17M8.2 16.3 20 7" />
    </>
  ),
  girar: (
    <>
      <path d="M20 11a8 8 0 00-14.3-4.9L4 8" />
      <path d="M4 3.5V8h4.5" />
      <path d="M4 13a8 8 0 0014.3 4.9L20 16" />
      <path d="M20 20.5V16h-4.5" />
    </>
  ),
  sinSenal: (
    <>
      <path d="M2 8.5a15 15 0 015.5-3.2M22 8.5a15 15 0 00-9-3.9" />
      <path d="M5.5 12a10 10 0 014-2.3M18.5 12a10 10 0 00-2.4-1.7" />
      <path d="M9 15.5a5 5 0 016 0" />
      <path d="M12 19.5v.1M3 3l18 18" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type NombreIconoPieza = keyof typeof TRAZOS;

/**
 * El ícono de cada medio de cobro (los valores de `MEDIOS_DE_COBRO`, src/lib/caja/medio-cobro.ts)
 * y de «A cuenta» (la ficha del cliente). Lo usan las elecciones del medio: Vender y el cobro del pedido.
 */
export function iconoDelMedio(valor: string): NombreIconoPieza {
  if (valor === "EFECTIVO") return "efectivo";
  if (valor === "MERCADOPAGO") return "qr";
  if (valor === "TRANSFERENCIA") return "transferencia";
  return "persona";
}

export function Icono({
  nombre,
  className = "size-[1.125rem] shrink-0",
  titulo,
}: {
  nombre: NombreIconoPieza;
  className?: string;
  /** Si el ícono va SOLO (sin palabra al lado), su nombre para el lector de pantalla. */
  titulo?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={titulo ? undefined : true}
      role={titulo ? "img" : undefined}
      aria-label={titulo}
    >
      {TRAZOS[nombre]}
    </svg>
  );
}
