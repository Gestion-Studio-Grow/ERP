"use client";

// LA HOJA (ronda 2, P0-3): un `<dialog>` modal con la misma conducta en las cuatro tiendas y los turneros.
//   · abre con `showModal()` (foco atrapado, fondo inerte, Esc nativo) y lleva el foco al título;
//   · con `historial`, abrirla agrega una entrada al historial: «atrás» del celular CIERRA la hoja en vez de sacar a
//     la persona de la tienda (QA de Shine y Qué Bien Olés: «atrás» expulsaba con la bolsa abierta). Cerrarla desde la
//     hoja (X, fondo, Esc, «Seguir comprando») consume esa entrada, así el historial queda como estaba.
// No maneja el Esc ni el clic en el fondo: cada hoja ya lo hace con su `onCancel`/`onClick`, y sumarlos acá cerraría dos
// veces. Las hojas que ya escriben su propia URL (`?p=` de la ficha de Shine y de la vidriera genérica) van con
// `historial: false`.

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const MARCA = "gsgHoja";
// El id lleva una semilla de la carga: `history.state` sobrevive a la recarga y un contador solo repetiría «h1».
const SEMILLA = Math.random().toString(36).slice(2, 8);
let contador = 0;
// Las entradas que empujaron las hojas, en orden. Next borra las marcas propias del estado cuando reemplaza la entrada
// (revalidar, `refresh()`, un `replaceState(null)`): sin marca, la entrada de arriba se reconoce por esta pila y la URL.
const pila: { id: string; href: string }[] = [];

function estadoActual(): Record<string, unknown> | null {
  const s = window.history.state as unknown;
  return s && typeof s === "object" ? (s as Record<string, unknown>) : null;
}

export function useHoja(
  dialogo: RefObject<HTMLDialogElement | null>,
  abierta: boolean,
  alCerrar: () => void,
  opciones: {
    foco?: RefObject<HTMLElement | null>;
    historial?: boolean;
    /** Si devuelve `false` (p. ej. en la compu), «abierta» no es modal: la hoja queda como riel al costado. */
    modalSi?: () => boolean;
    /** Cerrada, la hoja sigue visible como riel no modal (`show()`), como la bolsa de Shine en la compu. */
    cerradaVisible?: boolean;
  } = {},
): void {
  const { foco, historial = true, modalSi, cerradaVisible = false } = opciones;
  const cerrar = useRef(alCerrar);
  const entrada = useRef<string | null>(null);

  useEffect(() => {
    cerrar.current = alCerrar;
  });

  // Antes de pintar (como hacían las fichas): una transición de vista (Qué Bien Olés) ya ve la hoja abierta.
  useLayoutEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    const modal = abierta && (modalSi ? modalSi() : true);
    if (modal) {
      if (!d.matches(":modal")) {
        // Un riel abierto sin modal se cierra para reabrirlo modal (showModal tira si ya está abierto).
        if (d.open) d.close();
        d.showModal();
        foco?.current?.focus({ preventScroll: true });
      }
      if (historial && !entrada.current) {
        const id = `h${SEMILLA}${++contador}`;
        entrada.current = id;
        pila.push({ id, href: window.location.href });
        window.history.pushState({ ...(estadoActual() ?? {}), [MARCA]: id }, "");
      }
    } else {
      if (d.matches(":modal") || (!cerradaVisible && d.open)) d.close();
      if (cerradaVisible && !d.open) d.show();
      soltar(entrada);
    }
    // `modalSi` se lee al abrir: cambia con el ancho de la ventana, no con el render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta, historial, dialogo, foco, cerradaVisible]);

  // «Atrás» con la hoja abierta: la entrada ya no es la de esta hoja → se cierra (sin volver a tocar el historial).
  useEffect(() => {
    if (!abierta || !historial) return;
    const alVolver = () => {
      const id = entrada.current;
      if (!id) return;
      if (estadoActual()?.[MARCA] !== id) {
        entrada.current = null;
        sacarDeLaPila(id);
        cerrar.current();
      }
    };
    window.addEventListener("popstate", alVolver);
    return () => window.removeEventListener("popstate", alVolver);
  }, [abierta, historial]);

  // Una hoja que se desmonta abierta (la ficha que se dibuja sólo mientras está abierta) también devuelve su entrada.
  useEffect(() => () => soltar(entrada), []);
}

/** Si la entrada de esta hoja sigue arriba del historial, se la saca (cerró desde la hoja, no con «atrás»). */
function soltar(entrada: { current: string | null }) {
  const id = entrada.current;
  if (!id) return;
  entrada.current = null;
  const ultima = pila[pila.length - 1];
  sacarDeLaPila(id);
  const marca = estadoActual()?.[MARCA];
  const sinMarcaPeroArriba = marca === undefined && ultima?.id === id && ultima.href === window.location.href;
  if (marca === id || sinMarcaPeroArriba) window.history.back();
}

function sacarDeLaPila(id: string) {
  const i = pila.findIndex((e) => e.id === id);
  if (i >= 0) pila.splice(i, 1);
}
