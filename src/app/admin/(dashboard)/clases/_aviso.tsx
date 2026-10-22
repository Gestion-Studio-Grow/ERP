"use client";

// LA COLA DE AVISOS (matias-DISENO.md §1.1 principio 3 · M-034/M-035/M-046/M-051).
//
// Vive en el layout de Clases, no en la tarjeta: al confirmar un pedido o validar un comprobante
// la acción refresca la pantalla y esa tarjeta sale de la lista; si el botón verde estuviera
// adentro, se iría con ella antes de que el profe lo toque.
//
// Con varios alumnos para avisar (Confirmar todos, Se suspende, Recordar a los 8) es una cola:
// «Avisar a Juan (1 de 6)» abre WhatsApp con el texto listo y, al volver, ya está el 2.
// «Después» lo saltea (queda en la Bandeja → «Sin avisar»). NUNCA se cierra sola: antes se
// cerraba a los 400 ms de tocar el link y, si el profe volvía sin mandar, el aviso se perdía.
// Se apoya ENCIMA de la barra de abajo (`--alto-barra-inferior`, lo declara el layout).

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import Link from "next/link";
import { buttonClasses, cn, Icono } from "@/components/ui";
import { COLA_VACIA, actual, cola, etiquetaAvisar, resumenFinal, terminada, type ItemAviso } from "./_cola";

export type { ItemAviso } from "./_cola";
/** Compatibilidad: el resultado de UNA acción es una cola de uno. */
export type AvisoAccion = ItemAviso;

type Ctx = {
  /** El resultado de una acción (o `null` para cerrar). Si había cola a mitad, se suma al final. */
  mostrar: (a: AvisoAccion | null) => void;
  /** Varios avisos de una (Confirmar todos, Se suspende, Recordar a todos). */
  encolar: (items: ItemAviso[]) => void;
};

const Contexto = createContext<Ctx>({ mostrar: () => {}, encolar: () => {} });

/** El de siempre (las acciones de un toque de _acciones.tsx). */
export const useAvisoAccion = () => useContext(Contexto).mostrar;
/** Para las acciones masivas de la Tanda 3. */
export const useColaAvisos = () => useContext(Contexto);

export function ColaAvisos({
  children,
  marcarAvisado,
}: {
  children: React.ReactNode;
  /**
   * Marca `enviadoEl` del aviso al tocar el link (la acción `marcarAvisado(avisoId)` de la Tanda
   * 2A), que le pasa el layout. Sin ella la cola avanza igual y el aviso queda sin `enviadoEl`
   * (lo ve la Bandeja como «Sin avisar»).
   */
  marcarAvisado?: (avisoId: string) => Promise<unknown>;
}) {
  const [estado, despachar] = useReducer(cola, COLA_VACIA);
  const principal = useRef<HTMLElement | null>(null);
  const enfocarAlPasar = useRef(false);

  const valor = useMemo<Ctx>(
    () => ({
      mostrar: (a) => despachar(a ? { tipo: "encolar", items: [a] } : { tipo: "cerrar" }),
      encolar: (items) => despachar({ tipo: "encolar", items }),
    }),
    [],
  );

  // Después de pasar al siguiente (no al aparecer: no le roba el foco a la pantalla), el foco va
  // al botón principal del que sigue. Con teclado o lector de pantalla, la cola se sigue sola.
  useEffect(() => {
    if (!enfocarAlPasar.current) return;
    enfocarAlPasar.current = false;
    principal.current?.focus();
  }, [estado.indice, estado.items.length]);

  const pasar = useCallback((tipo: "avisado" | "despues" | "siguiente") => {
    enfocarAlPasar.current = true;
    despachar({ tipo });
  }, []);

  const it = actual(estado);
  const fin = terminada(estado);
  const visible = estado.items.length > 0;

  const avisar = () => {
    if (it?.avisoId && marcarAvisado) marcarAvisado(it.avisoId).catch(() => {});
    // En el próximo turno: el navegador tiene que abrir ESTE link antes de que el botón pase a
    // ser el del siguiente alumno.
    setTimeout(() => pasar("avisado"), 0);
  };

  const ref = (el: HTMLElement | null) => {
    principal.current = el;
  };

  return (
    <Contexto.Provider value={valor}>
      {children}
      {/* Lo que tapa la cola, al final del scroll: la última tarjeta no queda abajo de ella. */}
      {visible && <div aria-hidden className="h-44" />}
      <div
        role="status"
        aria-live="polite"
        data-qa={visible ? "aviso-ok" : undefined}
        className={cn(
          "fixed inset-x-0 bottom-[var(--alto-barra-inferior,0px)] z-40 lg:left-[236px]",
          visible && "border-t border-line bg-surface-raised px-4 pb-3 pt-3 shadow-overlay",
        )}
      >
        {visible && (
          <div
            key={fin ? "fin" : estado.indice}
            className="mx-auto grid max-w-3xl gap-2 transition-opacity duration-[120ms] ease-out starting:opacity-0 motion-reduce:transition-none"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 pt-2 text-sm font-semibold text-strong">
                {fin ? (
                  <>✓ {resumenFinal(estado)}</>
                ) : (
                  <>
                    ✓ {it?.texto}
                    {it?.enviado && " · le llegó el WhatsApp"}
                  </>
                )}
              </p>
              <button
                type="button"
                onClick={() => despachar({ tipo: "cerrar" })}
                aria-label={fin ? "Cerrar" : "Cerrar los avisos"}
                className="grid size-12 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-sunken hover:text-strong focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
                data-qa="cerrar-cola"
              >
                <Icono nombre="cerrar" />
              </button>
            </div>

            {fin ? (
              <div className="grid gap-2">
                {estado.despues > 0 && (
                  <Link href="/admin/clases/pendientes" className="text-sm font-semibold text-accent-ink underline underline-offset-2" data-qa="ver-sin-avisar">
                    Los ves en la campana, en «Sin avisar»
                  </Link>
                )}
                {estado.ultimo?.wa && (
                  <a href={estado.ultimo.wa} target="_blank" rel="noopener noreferrer" className="text-sm text-muted underline underline-offset-2">
                    ¿No se mandó? Abrir el WhatsApp de nuevo
                  </a>
                )}
                <button ref={ref} type="button" onClick={() => despachar({ tipo: "cerrar" })} className={cn(buttonClasses("outline", "lg"), "h-12 w-full justify-center")} data-qa="listo">
                  Listo
                </button>
              </div>
            ) : it?.wa && !it.enviado ? (
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <a
                  ref={ref}
                  href={it.wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-qa="avisar-alumno"
                  onClick={avisar}
                  className="flex h-12 items-center justify-center rounded-xl bg-success px-3 text-center text-base font-bold text-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {etiquetaAvisar(estado)}
                </a>
                <button type="button" onClick={() => pasar("despues")} className={cn(buttonClasses("outline", "lg"), "h-12 px-4")} data-qa="despues">
                  Después
                </button>
              </div>
            ) : (
              <button
                ref={ref}
                type="button"
                onClick={() => pasar("siguiente")}
                className={cn(buttonClasses("outline", "lg"), "h-12 w-full justify-center")}
                data-qa="listo"
              >
                {estado.indice + 1 < estado.items.length ? `Siguiente (${estado.indice + 2} de ${estado.items.length})` : "Listo"}
              </button>
            )}
          </div>
        )}
      </div>
    </Contexto.Provider>
  );
}
