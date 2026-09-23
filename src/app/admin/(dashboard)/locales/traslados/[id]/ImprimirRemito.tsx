"use client";

// Imprime el remito solo, sin la barra del panel: el documento (`htmlDelRemito`, armado en el
// servidor) va en un iframe invisible y se imprime desde ahí, igual que el ticket de Vender.
// El iframe se reusa: imprimir dos veces no deja basura en la página.

import { useRef } from "react";
import { Button } from "@/components/ui";

export function ImprimirRemito({ html }: { html: string }) {
  const marco = useRef<HTMLIFrameElement | null>(null);

  function imprimir() {
    let f = marco.current;
    if (!f) {
      f = document.createElement("iframe");
      f.setAttribute("aria-hidden", "true");
      f.setAttribute("title", "Remito para imprimir");
      f.tabIndex = -1;
      Object.assign(f.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
      document.body.appendChild(f);
      marco.current = f;
    }
    const iframe = f;
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    };
    iframe.srcdoc = html;
  }

  return (
    <Button type="button" onClick={imprimir} className="w-full sm:w-auto">
      Imprimir remito
    </Button>
  );
}
