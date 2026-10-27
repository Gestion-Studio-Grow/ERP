"use client";

// ============================================================================
// LA ENTREGA EN LA BOLSA — zona, franja, «te faltan $X» y lo que frena, para TODAS las vidrieras.
// (reingeniería Magra 1I: el hueco que dejó 1H fuera de MagraFront)
// ============================================================================
//
// `useEntregaDeLaTienda` guarda lo que elige la clienta (zona, franja, día) y devuelve la vista
// previa de `entregaDeLaBolsa` (reglas-tienda.ts), la misma que usa MagraFront y con las mismas
// funciones puras que `placeOnlineOrder`. La entrega (retiro o envío) la sigue guardando cada
// vidriera, que ya la tenía.
//
// `CamposDeEntrega` dibuja lo que falta elegir —la zona, el día y la franja, la aclaración del retiro
// y el «te faltan $X para el envío gratis»— y `FrenoDeEntrega`, al lado del botón, lo que impide
// mandar el pedido (tienda pausada, falta la zona, el mínimo con «Retiro en el local» a un toque).
// Cada vidriera les pone su piel con `apariencia` (clases o estilos): la marca no cambia.
//
// Sin configuración de Envíos (la mayoría de los negocios, Shine con la tarifa de su copy) no
// dibujan NADA y el costo es el de siempre: la vidriera queda exactamente igual.

import { useState, type CSSProperties } from "react";
import type { ConfigEnvios } from "@/lib/envios/modelo";
import type { ShippingConfig } from "@/lib/storefront-shipping";
import { entregaDeLaBolsa, type EntregaDeLaBolsa } from "./reglas-tienda";

export type EstadoDeEntrega = EntregaDeLaBolsa & {
  zonaId: string;
  setZonaId: (id: string) => void;
  setFranja: (f: string) => void;
  setDia: (d: string) => void;
  /** «Retiro en el local» desde el aviso del mínimo. */
  elegirRetiro: () => void;
};

export function useEntregaDeLaTienda(p: {
  entrega: ConfigEnvios | null;
  hoy: string | null;
  subtotal: number;
  hayProductos: boolean;
  envio: ShippingConfig | null;
  fulfillment: "PICKUP" | "DELIVERY";
  setFulfillment: (f: "PICKUP" | "DELIVERY") => void;
}): EstadoDeEntrega {
  const [zonaId, setZonaId] = useState("");
  const [franja, setFranja] = useState("");
  const [dia, setDia] = useState(p.hoy ?? "");
  const e = entregaDeLaBolsa({
    entrega: p.entrega,
    hoy: p.hoy,
    subtotal: p.subtotal,
    hayProductos: p.hayProductos,
    envio: p.envio,
    elegida: { fulfillment: p.fulfillment, zonaId, franja, dia },
  });
  return { ...e, zonaId: e.zona?.id ?? "", setZonaId, setFranja, setDia, elegirRetiro: () => p.setFulfillment("PICKUP") };
}

/** Una parte que se puede vestir con la piel de la vidriera. */
type Parte = { className?: string; style?: CSSProperties };
export type AparienciaDeEntrega = Partial<
  Record<"bloque" | "campo" | "rotulo" | "control" | "grupo" | "opcion" | "opcionElegida" | "nota" | "empujon" | "freno" | "boton", Parte>
>;

const plata = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

function partes(a: AparienciaDeEntrega | undefined, ...nombres: (keyof AparienciaDeEntrega)[]): Parte {
  const className = nombres.map((n) => a?.[n]?.className).filter(Boolean).join(" ") || undefined;
  const style = nombres.reduce<CSSProperties | undefined>((s, n) => (a?.[n]?.style ? { ...s, ...a[n]!.style } : s), undefined);
  return { ...(className ? { className } : {}), ...(style ? { style } : {}) };
}

/** ¿Hay algo para elegir o aclarar? Sin configuración de Envíos, no. */
export function hayCamposDeEntrega(e: EntregaDeLaBolsa): boolean {
  return (e.modo === "envio" && e.conZonas) || e.franjas.length > 0 || (e.modo === "retiro" && Boolean(e.horarioRetiro)) || e.faltaParaGratis > 0;
}

/**
 * La zona, el día y la franja, la aclaración del retiro y el «te faltan $X». Va DENTRO del
 * formulario del pedido: sus campos (`envioZona`, `dia`, `franja`) viajan con él.
 */
export function CamposDeEntrega({
  e,
  idBase,
  apariencia,
  direccionDelLocal = null,
}: {
  e: EstadoDeEntrega;
  /** Prefijo de los id (dos bolsas en la misma página no chocan). */
  idBase: string;
  apariencia?: AparienciaDeEntrega;
  direccionDelLocal?: string | null;
}) {
  if (!hayCamposDeEntrega(e)) return null;
  const a = apariencia;
  return (
    <div data-ui="entrega-de-la-bolsa" {...partes(a, "bloque")}>
      {e.modo === "envio" && e.conZonas && (
        <div {...partes(a, "campo")}>
          <label htmlFor={`${idBase}-zona`} {...partes(a, "rotulo")}>
            Zona *
          </label>
          <select id={`${idBase}-zona`} name="envioZona" required value={e.zonaId} onChange={(ev) => e.setZonaId(ev.target.value)} {...partes(a, "control")}>
            <option value="">Elegí tu zona</option>
            {e.zonas.map((z) => (
              <option key={z.id} value={z.id}>
                {z.nombre} · {z.costo > 0 ? plata.format(z.costo) : "sin cargo"}
                {z.gratisDesde !== null && z.costo > 0 ? ` (gratis desde ${plata.format(z.gratisDesde)})` : ""}
              </option>
            ))}
          </select>
        </div>
      )}
      {e.modo === "retiro" && e.horarioRetiro && (
        <p {...partes(a, "nota")}>
          Retirás en {direccionDelLocal ?? "el local"} · {e.horarioRetiro}
        </p>
      )}
      {e.franjas.length > 0 && (
        <fieldset {...partes(a, "campo")} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, ...partes(a, "campo").style }}>
          <legend {...partes(a, "rotulo")}>{e.modo === "envio" ? "¿Cuándo te lo llevamos? *" : "¿Cuándo lo retirás? *"}</legend>
          <label htmlFor={`${idBase}-dia`} {...partes(a, "rotulo")}>
            Día
          </label>
          <select id={`${idBase}-dia`} name="dia" value={e.diaElegido} onChange={(ev) => e.setDia(ev.target.value)} {...partes(a, "control")}>
            {e.dias.map((d) => (
              <option key={d.valor} value={d.valor}>
                {d.texto}
              </option>
            ))}
          </select>
          <div role="radiogroup" aria-label="Franja horaria" {...partes(a, "grupo")}>
            {e.franjas.map((f) => {
              const elegida = f === e.franjaElegida;
              return (
                <label key={f} data-elegida={elegida || undefined} {...(elegida ? partes(a, "opcion", "opcionElegida") : partes(a, "opcion"))}>
                  <input type="radio" name="franja" value={f} checked={elegida} onChange={() => e.setFranja(f)} />
                  <span>{f}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
      {e.faltaParaGratis > 0 && (
        <p aria-live="polite" {...partes(a, "empujon")}>
          Te faltan {plata.format(e.faltaParaGratis)} para el envío gratis
        </p>
      )}
    </div>
  );
}

/** Lo que impide mandar el pedido, al lado del botón; con el mínimo, «Retiro en el local» a un toque. */
export function FrenoDeEntrega({ e, apariencia }: { e: EstadoDeEntrega; apariencia?: AparienciaDeEntrega }) {
  if (!e.freno) return null;
  return (
    <div role="status" data-ui="freno-de-entrega" {...partes(apariencia, "freno")}>
      <p style={{ margin: 0 }}>{e.freno}</p>
      {e.ofrecerRetiro && (
        <button type="button" onClick={e.elegirRetiro} {...partes(apariencia, "boton")}>
          Retiro en el local
        </button>
      )}
    </div>
  );
}
