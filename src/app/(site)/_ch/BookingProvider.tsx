"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { getBookingDataPublic } from "@/lib/client-actions";
import type { BookingData } from "./types";

// El modal de reserva es, de lejos, la pieza de JavaScript más grande del sitio
// (el flujo de 5 pasos, el calendario, los cupones, el .ics). Con un import
// normal viajaba en el paquete inicial de CADA página, aunque la mayoría de las
// visitas no llegue a abrirlo. Cargado bajo demanda, el navegador lo baja recién
// cuando hace falta.
//
// `ssr: false` a propósito: el modal arranca cerrado, así que pre-renderizarlo
// en el servidor sería trabajo tirado.
const BookingModal = dynamic(() => import("./BookingModal"), { ssr: false });

// Contexto de reserva: cualquier botón "Reservar" del sitio abre el mismo modal.
// `precargar` no abre nada — le avisa al provider que este visitante está por
// reservar, para ir a buscar los datos mientras decide el clic.
const BookingContext = createContext<{ open: () => void; precargar: () => void } | null>(null);

export function useBooking() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error("useBooking debe usarse dentro de <BookingProvider>");
  return ctx;
}

export default function BookingProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<BookingData | null>(null);
  // La promesa en curso, para que dos botones (o el hover y el clic) no disparen
  // dos veces la misma consulta.
  const pedido = useRef<Promise<BookingData> | null>(null);

  const traerDatos = useCallback(() => {
    if (!pedido.current) {
      pedido.current = getBookingDataPublic().then((d) => {
        setData(d);
        return d;
      });
    }
    return pedido.current;
  }, []);

  const openBooking = useCallback(() => {
    void traerDatos();
    setOpen(true);
  }, [traerDatos]);

  const closeBooking = useCallback(() => setOpen(false), []);

  return (
    <BookingContext.Provider value={{ open: openBooking, precargar: traerDatos }}>
      {children}
      {open &&
        (data ? (
          <BookingModal data={data} onClose={closeBooking} />
        ) : (
          // Sólo se ve si alguien llega al clic antes que los datos (por ejemplo
          // entrando por teclado sin pasar por el hover). Ocupa el mismo lugar que
          // el modal para que no salte nada cuando aparece.
          <div
            role="status"
            aria-live="polite"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 60,
              display: "grid",
              placeItems: "center",
              background: "color-mix(in srgb, var(--text-strong) 32%, transparent)",
            }}
          >
            <p
              style={{
                background: "var(--surface)",
                padding: "18px 26px",
                fontSize: 15,
                color: "var(--text-muted)",
                fontFamily: "var(--font-body), system-ui, sans-serif",
              }}
            >
              Abriendo la agenda…
            </p>
          </div>
        ))}
    </BookingContext.Provider>
  );
}
