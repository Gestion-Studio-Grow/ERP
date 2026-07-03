"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { BookingData } from "./types";
import BookingModal from "./BookingModal";

// Contexto de reserva: cualquier botón "Reservar" del sitio abre el mismo modal.
const BookingContext = createContext<{ open: () => void } | null>(null);

export function useBooking() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error("useBooking debe usarse dentro de <BookingProvider>");
  return ctx;
}

export default function BookingProvider({
  data,
  children,
}: {
  data: BookingData;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const openBooking = useCallback(() => setOpen(true), []);
  const closeBooking = useCallback(() => setOpen(false), []);

  return (
    <BookingContext.Provider value={{ open: openBooking }}>
      {children}
      {open && <BookingModal data={data} onClose={closeBooking} />}
    </BookingContext.Provider>
  );
}
