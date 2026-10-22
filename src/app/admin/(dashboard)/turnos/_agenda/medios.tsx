"use client";

// ============================================================================
// LOS MEDIOS DE PAGO QUE SE DIBUJAN — Débito y Crédito sólo si la base los tiene.
// ============================================================================
//
// Reingeniería CH, Tanda 3 · 3-B (CH-031/032). Qué medios tiene la base lo sabe el servidor
// (`mediosDePagoHabilitados()`, lee el enum en pg_enum) y lo baja en `Permisos.medios`
// (turnos/page.tsx, AgendaRenglon.tsx). `MesaDeTurnos` lo pone acá y cada hoja que cobra (Cobrar,
// Terminar, Dividir el pago, Sumar lo que debe, Llegó la seña, la seña del alta) lo lee con
// `useMediosDePago()`. Sin quien lo ponga, los TRES de siempre: una pantalla que no sabe nunca
// ofrece una tecla que el servidor después rechaza (la guarda real está en cada acción).

import { createContext, useContext } from "react";
import { METODOS_DE_PAGO, avisoDeTarjeta, type MetodoDePago } from "@/lib/turnos/cobros";

const Medios = createContext<readonly MetodoDePago[] | null>(null);

export function MediosDePago({ medios, children }: { medios?: readonly MetodoDePago[] | null; children: React.ReactNode }) {
  return <Medios.Provider value={medios && medios.length > 0 ? medios : null}>{children}</Medios.Provider>;
}

/** Las teclas de medio de esta base, y la línea «Hoy la tarjeta se registra como Mercado Pago» si falta M1. */
export function useMediosDePago(): { medios: readonly MetodoDePago[]; aviso: string | null } {
  const medios = useContext(Medios) ?? METODOS_DE_PAGO;
  return { medios, aviso: avisoDeTarjeta(medios) };
}
