"use client";

import { useBooking } from "./BookingProvider";

// Botón "Reservar" reutilizable: abre el modal desde cualquier parte del sitio.
export default function ReserveButton({
  children = "Reservar",
  variant = "solid",
  style,
}: {
  children?: React.ReactNode;
  variant?: "solid" | "nav";
  style?: React.CSSProperties;
}) {
  const { open, precargar } = useBooking();
  const base: React.CSSProperties =
    variant === "nav"
      ? { padding: "8px 16px", fontSize: 14 }
      : { padding: "12px 24px", fontSize: 15 };
  return (
    <button
      type="button"
      onClick={open}
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
