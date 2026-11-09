"use client";

import { ProveedorNegocioDelSitio, type NegocioDelSitio } from "./negocio-del-sitio";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { getBookingDataPublic } from "@/lib/client-actions";
import { useDiseno } from "@/lib/diseno/DisenoProvider";
import { borrarReservaGuardada, leerReservaGuardada } from "./reserva-guardada";
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

// Lo que un botón puede dejar elegido al abrir el modal (diseño nuevo de CH: la agenda viva, los renglones
// de la carta, la ficha). Sin prefill, el modal arranca en el paso 1 como siempre.
// `paso`, `vecina`: lo que trae una reserva guardada al recargar (reserva-guardada.ts), para volver a donde estaba.
export type PrefillReserva = { serviceId?: string; professionalId?: string; day?: string; slot?: string; paso?: number; vecina?: boolean };

// Sólo un objeto con textos cuenta como prefill: un evento de clic (un `onClick={open}` de siempre) o cualquier
// otra cosa queda en «sin prefill».
function prefillValido(p: unknown): PrefillReserva | null {
  if (!p || typeof p !== "object" || !("serviceId" in p)) return null;
  const { serviceId, professionalId, day, slot, paso, vecina } = p as Record<string, unknown>;
  if (typeof serviceId !== "string" || !serviceId) return null;
  const texto = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  return {
    serviceId,
    professionalId: texto(professionalId),
    day: texto(day),
    slot: texto(slot),
    paso: typeof paso === "number" ? paso : undefined,
    vecina: vecina === true ? true : undefined,
  };
}

// Contexto de reserva: cualquier botón "Reservar" del sitio abre el mismo modal.
// `precargar` no abre nada — le avisa al provider que este visitante está por
// reservar, para ir a buscar los datos mientras decide el clic. `abierto` lo lee
// la barra fija del celular para esconderse mientras el modal está arriba. `reservas` cuenta los turnos confirmados
// en esta visita: la agenda viva lo mira para sacar la hora recién tomada (P0-2, ronda 2).
const BookingContext = createContext<{ open: (prefill?: PrefillReserva) => void; precargar: () => void; abierto: boolean; reservas: number } | null>(null);

export function useBooking() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error("useBooking debe usarse dentro de <BookingProvider>");
  return ctx;
}

export default function BookingProvider({ children, negocio }: { children: React.ReactNode; negocio: NegocioDelSitio }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<BookingData | null>(null);
  const [prefill, setPrefill] = useState<PrefillReserva | null>(null);
  const [reservas, setReservas] = useState(0);
  const nuevo = useDiseno();
  // La promesa en curso, para que dos botones (o el hover y el clic) no disparen
  // dos veces la misma consulta.
  const pedido = useRef<Promise<BookingData | null> | null>(null);
  // No se pudo traer la agenda: se dice, se puede cerrar y el próximo intento vuelve a pedirla.
  const [fallo, setFallo] = useState(false);

  const traerDatos = useCallback(() => {
    if (!pedido.current) {
      pedido.current = getBookingDataPublic().then(
        (d) => {
          setData(d);
          return d;
        },
        () => {
          pedido.current = null;
          setFallo(true);
          return null;
        },
      );
    }
    return pedido.current;
  }, []);

  const openBooking = useCallback(
    (p?: PrefillReserva) => {
      setFallo(false);
      void traerDatos();
      setPrefill(prefillValido(p));
      setOpen(true);
    },
    [traerDatos],
  );

  // Cerrar a propósito es «no sigo»: lo guardado se borra. Recargar no pasa por acá (P1-2).
  const closeBooking = useCallback(() => {
    borrarReservaGuardada();
    setOpen(false);
  }, []);

  const avisarReservado = useCallback(() => setReservas((n) => n + 1), []);

  // Diseño nuevo de CH (P1-2, QA 16): si se recargó con una reserva a medias, el modal vuelve al mismo paso. Apagado,
  // el sitio de siempre: nada se guarda ni se reabre.
  useEffect(() => {
    if (!nuevo) return;
    const guardada = leerReservaGuardada();
    // Reabrir pide la agenda al servidor: es sincronizar con algo externo (el almacenamiento del navegador y
    // la red) después de hidratar, que es justo para lo que está un efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (guardada) openBooking(guardada);
  }, [nuevo, openBooking]);

  return (
    <ProveedorNegocioDelSitio value={negocio}>
    <BookingContext.Provider value={{ open: openBooking, precargar: traerDatos, abierto: open, reservas }}>
      {children}
      {open &&
        (data ? (
          <BookingModal data={data} onClose={closeBooking} prefill={prefill} onReservado={avisarReservado} />
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
              {fallo ? "No pudimos abrir la agenda. Probá de nuevo en un momento." : "Abriendo la agenda…"}
              {fallo && (
                <button
                  type="button"
                  onClick={closeBooking}
                  style={{ display: "block", marginTop: 12, minHeight: 48, padding: "0 20px", border: "1px solid var(--line-strong)", background: "transparent", color: "var(--text-strong)", cursor: "pointer", font: "inherit" }}
                >
                  Cerrar
                </button>
              )}
            </p>
          </div>
        ))}
    </BookingContext.Provider>
    </ProveedorNegocioDelSitio>
  );
}
