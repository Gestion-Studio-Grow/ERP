"use client";

// «Nuevo pedido de WhatsApp», DIFERIDO (Magra · tanda perf, P-2).
//
// Cerrado es un botón y una línea: no hace falta bajar las 726 líneas de `PedidoDesdeWhatsApp`
// (lector del chat, propuesta, entrega) para dibujarlo. Acá va el MISMO botón; el componente
// entero se trae con `next/dynamic` al tocarlo (o si se llega con #whatsapp desde la bandeja), y
// se adelanta cuando el navegador queda libre, así el toque no espera la red.

import dynamic from "next/dynamic";
import { useEffect, useState, useSyncExternalStore } from "react";
import { atributosBoton, buttonClasses } from "@/components/ui";
import type { PedidoDesdeWhatsAppProps } from "../PedidoDesdeWhatsApp";

const traer = () => import("../PedidoDesdeWhatsApp");

function Cerrado({ onAbrir, cargando = false }: { onAbrir?: () => void; cargando?: boolean }) {
  return (
    <div id="whatsapp" className="flex flex-wrap items-center gap-3" aria-busy={cargando || undefined}>
      <button type="button" onClick={onAbrir} disabled={cargando} className={buttonClasses("outline", "md")} {...atributosBoton("outline", "md")}>
        Nuevo pedido de WhatsApp
      </button>
      <span className="text-sm text-muted">Pegá el chat de la clienta y lo armamos.</span>
    </div>
  );
}

const PedidoDesdeWhatsApp = dynamic(traer, { loading: () => <Cerrado cargando /> });

function suscribirHash(avisar: () => void): () => void {
  window.addEventListener("hashchange", avisar);
  return () => window.removeEventListener("hashchange", avisar);
}

export default function WhatsAppDiferido(props: PedidoDesdeWhatsAppProps) {
  // Desde la bandeja se llega con #whatsapp: se abre solo, como el componente entero.
  const porHash = useSyncExternalStore(suscribirHash, () => window.location.hash === "#whatsapp", () => false);
  const [abrir, setAbrir] = useState(false);
  useEffect(() => {
    // Con el navegador libre, el código ya queda bajado para el primer toque.
    const w = window as Window & { requestIdleCallback?: (f: () => void) => number; cancelIdleCallback?: (n: number) => void };
    if (w.requestIdleCallback) {
      const n = w.requestIdleCallback(() => void traer());
      return () => w.cancelIdleCallback?.(n);
    }
    const t = window.setTimeout(() => void traer(), 1500);
    return () => window.clearTimeout(t);
  }, []);
  if (abrir || porHash) return <PedidoDesdeWhatsApp {...props} abrirAlMontar={abrir} />;
  return <Cerrado onAbrir={() => setAbrir(true)} />;
}
