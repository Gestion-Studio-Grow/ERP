"use client";

// AVISO DE PEDIDO NUEVO — la bandeja abierta se entera sola (UAT MAGRA 16/10).
//
// Cada `REFRESCO_DE_LA_BANDEJA_MS` pide la página de nuevo al servidor (`router.refresh()`: el
// mismo render, sin perder lo que hay en pantalla) si la pestaña está a la vista y nadie está
// escribiendo ni tiene un diálogo abierto. Cuando en la vuelta aparecen pedidos de la tienda que
// no estaban, muestra el aviso y hace un «bip» corto si el sonido está prendido. Si el navegador
// no deja sonar (no hubo un toque en la página todavía), queda sólo el aviso visible.
//
// Lo monta la bandeja SÓLO en el negocio que vende por kilo (page.tsx): en CH no cambia nada.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  REFRESCO_DE_LA_BANDEJA_MS,
  pedidosWebNuevos,
  puedeRefrescarLaBandeja,
  textoDePedidosWebNuevos,
  type PedidoWeb,
} from "./pedidos-core";
import { bip, guardarPreferenciaDeSonido, useAudioDelAviso, useSonidoDelAviso, useSuenaElChip } from "./sonido-del-aviso";

// La preferencia del sonido y el «bip» son los de todo el panel (sonido-del-aviso.ts): la misma
// tecla acá y en el chip de la cabecera. Con el chip montado (mostrador boutique), el pedido nuevo
// lo hace sonar el chip y acá sólo se muestra: el mismo pedido no suena dos veces.

export default function AvisoDePedidosNuevos({ pedidosWeb }: { pedidosWeb: PedidoWeb[] }) {
  const router = useRouter();
  const vistos = useRef<Set<string> | null>(null);
  // El navegador deja sonar recién después de un toque en la página: el primero lo habilita.
  const audio = useAudioDelAviso();
  const [aviso, setAviso] = useState<string | null>(null);
  const sonido = useSonidoDelAviso();
  const suenaElChip = useSuenaElChip();

  // El refresco: sólo a la vista, sin interrumpir a quien carga algo.
  useEffect(() => {
    const id = window.setInterval(() => {
      const foco = document.activeElement as HTMLElement | null;
      const escribiendo = !!foco && (foco.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(foco.tagName));
      if (puedeRefrescarLaBandeja({ visible: document.visibilityState === "visible", escribiendo, dialogoAbierto: !!document.querySelector("dialog[open]") })) {
        router.refresh();
      }
    }, REFRESCO_DE_LA_BANDEJA_MS);
    return () => window.clearInterval(id);
  }, [router]);

  // Lo que trajo la vuelta: ¿hay pedidos de la tienda que no estaban? Correrlo de más no hace
  // daño: lo ya visto no vuelve a avisar.
  useEffect(() => {
    const nuevos = pedidosWebNuevos(vistos.current, pedidosWeb);
    vistos.current = new Set([...(vistos.current ?? []), ...pedidosWeb.map((p) => p.id)]);
    const texto = textoDePedidosWebNuevos(nuevos);
    if (!texto) return;
    setAviso(texto);
    if (sonido && !suenaElChip) bip(audio.current);
  }, [pedidosWeb, sonido, suenaElChip, audio]);

  function cambiarSonido() {
    guardarPreferenciaDeSonido(!sonido);
  }

  return (
    <div data-ui="aviso-pedidos-nuevos" className="mb-4 flex flex-wrap items-center gap-2">
      <div role="status" aria-live="polite" className="contents">
        {aviso && (
          <p className="flex min-h-11 flex-1 items-center gap-3 rounded-md border border-success bg-success-soft px-3 py-2 text-sm font-semibold text-strong">
            <span className="flex-1">{aviso}</span>
            <button type="button" className="chip-btn h-11 text-sm" onClick={() => setAviso(null)}>
              Listo
            </button>
          </p>
        )}
      </div>
      <button type="button" className="chip-btn h-11 text-sm" aria-pressed={sonido} onClick={cambiarSonido}>
        {sonido ? "Sonido del aviso: prendido" : "Sonido del aviso: apagado"}
      </button>
    </div>
  );
}
