"use client";

import { useBooking, type PrefillReserva } from "./BookingProvider";

// Botón "Reservar" reutilizable: abre el modal desde cualquier parte del sitio.
//
// Diseño nuevo de CH (sólo con su interruptor prendido): `clase` reemplaza los estilos en línea de siempre por
// las clases de la piel (estilos-ch.ts) y `prefill` abre el modal ya en el paso que corresponde (servicio →
// «Profesional»; + profesional → «Día y hora»; + día y hora → «Datos»). Sin esos dos, el botón de siempre.
export default function ReserveButton({
  children = "Reservar",
  variant = "solid",
  style,
  clase,
  prefill,
  etiqueta,
}: {
  children?: React.ReactNode;
  variant?: "solid" | "nav";
  style?: React.CSSProperties;
  clase?: string;
  prefill?: PrefillReserva;
  /** Nombre accesible cuando el texto visible solo no alcanza (p. ej. «Reservar» en un renglón). */
  etiqueta?: string;
}) {
  const { open, precargar } = useBooking();
  if (clase) {
    return (
      <button
        type="button"
        onClick={() => open(prefill)}
        onPointerEnter={precargar}
        onFocus={precargar}
        className={clase}
        aria-label={etiqueta}
      >
        {children}
      </button>
    );
  }
  const base: React.CSSProperties =
    variant === "nav"
      ? { padding: "8px 16px", fontSize: 14 }
      : { padding: "12px 24px", fontSize: 15 };
  return (
    <button
      type="button"
      onClick={() => open(prefill)}
      // Los datos de la agenda se van a buscar apenas alguien se acerca al botón:
      // con el mouse encima, o al recibir el foco por teclado. Entre ese gesto y
      // el clic hay tiempo de sobra para que lleguen, así que el modal abre
      // instantáneo aunque su contenido no viaje en el HTML de la página.
      onPointerEnter={precargar}
      onFocus={precargar}
      // En el celular, 44 px de alto como mínimo (el piso táctil): el «Reservar» del encabezado
      // medía 37. En la PC queda como siempre.
      className="ch-reserve-btn max-sm:min-h-11"
      style={{
        background: "var(--text-strong)",
        color: "var(--text-on-accent)",
        border: 0,
        cursor: "pointer",
        transition: "opacity var(--ch-transicion), transform var(--ch-transicion)",
        ...base,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
