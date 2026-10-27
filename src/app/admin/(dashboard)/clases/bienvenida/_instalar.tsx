"use client";

// «Instalar» (E1 · M-083): dejar «Clases» como un ícono en el inicio del celular (el manifiesto del
// profe, /clases/app.webmanifest, abre /admin/clases). En Android/Chrome, el pedido nativo del
// navegador (`beforeinstallprompt`); en iPhone no existe: se explican los dos pasos de Safari.
// Ya instalada (se abre sola, sin barra del navegador), no se ofrece.

import { useEffect, useState } from "react";
import { buttonClasses, cn } from "@/components/ui";

type PedidoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export function Instalar() {
  const [pedido, setPedido] = useState<PedidoInstalar | null>(null);
  const [entorno, setEntorno] = useState<"instalada" | "ios" | "otro" | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setEntorno(standalone ? "instalada" : /iphone|ipad|ipod/i.test(navigator.userAgent) ? "ios" : "otro");
    const guardar = (e: Event) => {
      e.preventDefault();
      setPedido(e as PedidoInstalar);
    };
    const instalada = () => setListo(true);
    window.addEventListener("beforeinstallprompt", guardar);
    window.addEventListener("appinstalled", instalada);
    return () => {
      window.removeEventListener("beforeinstallprompt", guardar);
      window.removeEventListener("appinstalled", instalada);
    };
  }, []);

  if (entorno === "instalada" || listo) return <p role="status" className="text-sm font-semibold text-success">✓ Ya tenés «Clases» en el inicio del celular.</p>;

  if (pedido) {
    return (
      <button
        type="button"
        className={cn(buttonClasses("outline", "lg"), "h-12 w-full justify-center")}
        onClick={async () => {
          await pedido.prompt();
          const r = await pedido.userChoice.catch(() => null);
          if (r?.outcome === "accepted") setListo(true);
          setPedido(null);
        }}
        data-qa="instalar"
      >
        Instalar en el celular
      </button>
    );
  }

  return (
    <div className="rounded-xl bg-surface-sunken p-3 text-sm text-strong" data-qa="instalar-pasos">
      <p className="mb-1 font-semibold">Instalar en el celular</p>
      {entorno === "ios" ? (
        <ol className="list-decimal pl-5">
          <li>En Safari, tocá el botón Compartir (el cuadrado con la flecha para arriba).</li>
          <li>Elegí «Agregar a inicio». Queda el ícono «Clases».</li>
        </ol>
      ) : (
        <ol className="list-decimal pl-5">
          <li>Abrí el menú del navegador (los tres puntitos).</li>
          <li>Tocá «Instalar app» o «Agregar a la pantalla principal».</li>
        </ol>
      )}
    </div>
  );
}
