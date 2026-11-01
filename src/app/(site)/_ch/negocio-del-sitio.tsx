"use client";

// EL NEGOCIO DEL SITIO, para lo que el flujo de reserva dice en voz alta (E1, fuga de marca, 29/10/2026): el archivo de
// calendario, el mensaje de WhatsApp de confirmación y el «vecino/a de La Alameda» decían CH para CUALQUIER negocio de
// servicios. Lo pone el layout del sitio (que ya resolvió nombre y localización) y lo leen el modal y el formulario de
// /reserva. Sin proveedor, neutro: nunca el nombre de otro negocio.
import { createContext, useContext } from "react";

export type NegocioDelSitio = {
  nombre: string;
  /** Dirección para el calendario; "" si el negocio todavía no la cargó. */
  direccion: string;
  /** Sólo CH tiene el precio de vecino/a de La Alameda y su texto. */
  esCH: boolean;
};

const NegocioDelSitioContext = createContext<NegocioDelSitio>({ nombre: "", direccion: "", esCH: false });

export const ProveedorNegocioDelSitio = NegocioDelSitioContext.Provider;

export function useNegocioDelSitio(): NegocioDelSitio {
  return useContext(NegocioDelSitioContext);
}
