"use client";

// ============================================================================
// LA AGENDA VIVA (DISENO.md §5.1.3): el próximo hueco libre de cada profesional, hoy o mañana.
// ============================================================================
//
// SÓLO LECTURA y DESPUÉS del LCP: espera el `load` de la página y un momento libre del navegador
// (`requestIdleCallback`) y recién ahí le pregunta al motor de siempre (`getAvailableSlotsRange`, la misma
// lectura que usa el calendario del modal) por hoy y mañana, una llamada por profesional. No escribe nada.
//
// Va sobre un plano petróleo (el color de la marca) con la foto real de quien atiende: es el material más
// fuerte que tiene CH. Sin foto, iniciales.
//
// CLS 0: la foto, el nombre y el servicio llegan en el HTML; sólo la línea de la hora espera, y su lugar ya
// tiene el alto final (esqueleto de alto fijo). Estados: cargando (esqueleto) · hora («Mañana 09:00», abre el
// modal en «Datos» con todo elegido) · sin lugar en 2 días («Mirá la semana», abre el modal en el paso 1) ·
// error de red (queda la ficha con «Reservar»: nunca una ficha rota ni en blanco).

import { useEffect, useState } from "react";
import { getAvailableSlotsRange } from "@/lib/actions";
import { fmtTime } from "@/lib/datetime";
import { useBooking } from "./BookingProvider";

export type FichaHueco = {
  proId: string;
  nombre: string;
  foto: string | null;
  iniciales: string;
  svcId: string;
  svcNombre: string;
};

type Estado = { tipo: "cargando" } | { tipo: "hora"; day: string; slot: string } | { tipo: "vacio" } | { tipo: "error" };

const CARGANDO: Estado = { tipo: "cargando" };

export default function ProximoHueco({
  fichas,
  dias,
  titulo = "Próximo hueco",
}: {
  fichas: FichaHueco[];
  /** Hoy y mañana en la zona del negocio (los calcula el servidor: el navegador puede tener otra hora). */
  dias: { value: string; label: string }[];
  titulo?: string;
}) {
  const { open, precargar } = useBooking();
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const clave = fichas.map((f) => `${f.proId}:${f.svcId}`).join("|") + "@" + dias.map((d) => d.value).join(",");

  useEffect(() => {
    let vivo = true;
    let ocioso: number | null = null;
    let reloj: ReturnType<typeof setTimeout> | null = null;
    const fechas = dias.map((d) => d.value);
    const poner = (id: string, e: Estado) => {
      if (vivo) setEstados((prev) => ({ ...prev, [id]: e }));
    };
    const correr = () => {
      for (const f of fichas) {
        getAvailableSlotsRange(f.proId, f.svcId, fechas)
          .then((map) => {
            for (const day of fechas) {
              const slot = map[day]?.[0];
              if (slot) return poner(f.proId, { tipo: "hora", day, slot });
            }
            poner(f.proId, { tipo: "vacio" });
          })
          .catch(() => poner(f.proId, { tipo: "error" }));
      }
    };
    const arrancar = () => {
      if (typeof window.requestIdleCallback === "function") ocioso = window.requestIdleCallback(correr, { timeout: 2000 });
      else reloj = setTimeout(correr, 200);
    };
    if (document.readyState === "complete") arrancar();
    else window.addEventListener("load", arrancar, { once: true });
    return () => {
      vivo = false;
      window.removeEventListener("load", arrancar);
      if (ocioso != null && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(ocioso);
      if (reloj) clearTimeout(reloj);
    };
    // `clave` resume fichas y días: los objetos llegan nuevos en cada render del padre, la consulta no.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  if (fichas.length === 0) return null;

  const cuando = (day: string) => (day === dias[0]?.value ? "Hoy" : day === dias[1]?.value ? "Mañana" : (dias.find((d) => d.value === day)?.label ?? ""));

  return (
    <div className="chf-panel">
      <p className="chf-kicker chf-hueco-tit">
        <span>{titulo}</span>
        <span>Hoy y mañana</span>
      </p>
      <ul className="chf-huecos">
        {fichas.map((f, i) => {
          const e = estados[f.proId] ?? CARGANDO;
          const pila = f.nombre.split(" ")[0];
          return (
            <li key={f.proId} className="chf-hueco" aria-busy={e.tipo === "cargando"} style={{ "--i": i } as React.CSSProperties}>
              <span className="chf-foto-hueco" aria-hidden={!f.foto}>
                {f.foto ? (
                  // eslint-disable-next-line @next/next/no-img-element -- WebP propio de 320 px, ya optimizado
                  <img src={f.foto} alt={f.nombre} width={96} height={96} decoding="async" />
                ) : (
                  f.iniciales
                )}
              </span>
              <span className="chf-hueco-nom">
                <b>{pila}</b>
                <span>{f.svcNombre}</span>
              </span>
              <span className="chf-hueco-hora">
                {e.tipo === "cargando" && (
                  <>
                    <span className="chf-esqueleto" aria-hidden />
                    <span className="sr-only">Buscando el próximo horario libre de {pila}</span>
                  </>
                )}
                {e.tipo === "hora" && (
                  <button
                    type="button"
                    className="chf-hora chf-llega"
                    onPointerEnter={precargar}
                    onFocus={precargar}
                    onClick={() => open({ serviceId: f.svcId, professionalId: f.proId, day: e.day, slot: e.slot })}
                    aria-label={`Reservar ${cuando(e.day).toLowerCase()} a las ${fmtTime(e.slot)} con ${pila}: ${f.svcNombre}`}
                  >
                    {cuando(e.day)} {fmtTime(e.slot)}
                  </button>
                )}
                {e.tipo === "vacio" && (
                  <span className="chf-sinlugar chf-llega">
                    <span>Sin lugar hoy ni mañana.</span>
                    <button type="button" onPointerEnter={precargar} onFocus={precargar} onClick={() => open()}>
                      Mirá la semana
                    </button>
                  </span>
                )}
                {e.tipo === "error" && (
                  <button
                    type="button"
                    className="chf-btn-claro chf-btn-chico"
                    onPointerEnter={precargar}
                    onFocus={precargar}
                    onClick={() => open({ serviceId: f.svcId, professionalId: f.proId })}
                  >
                    Reservar
                  </button>
                )}
              </span>
              {e.tipo !== "error" && (
                <span className="chf-hueco-acc">
                  <button
                    type="button"
                    className="chf-btn-claro chf-btn-chico"
                    onPointerEnter={precargar}
                    onFocus={precargar}
                    onClick={() => open({ serviceId: f.svcId, professionalId: f.proId })}
                    aria-label={`Reservar con ${pila}`}
                  >
                    Reservar
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
