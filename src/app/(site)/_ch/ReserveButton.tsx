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
  const { open } = useBooking();
  const base: React.CSSProperties =
    variant === "nav"
      ? { padding: "8px 16px", fontSize: 14 }
      : { padding: "12px 24px", fontSize: 15 };
  return (
    <button
      type="button"
      onClick={open}
      className="ch-reserve-btn"
      style={{
        background: "var(--ch-ink)",
        color: "var(--ch-ivory)",
        border: 0,
        cursor: "pointer",
        transition: "opacity .2s ease, transform .1s ease",
        ...base,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
