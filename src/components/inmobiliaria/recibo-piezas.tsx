"use client";

// Botones del recibo: imprimir o guardar como PDF (lo hace el navegador), copiar el link y
// mandarlo por WhatsApp. Sólo cliente; el recibo en sí es de servidor.

import { useState } from "react";
import { waLink } from "@/lib/inmobiliaria/core";
import r from "./recibo.module.css";

export function AccionesRecibo({ link, telefono, mensaje, volver }: { link: string; telefono?: string | null; mensaje?: string; volver?: { href: string; texto: string } }) {
  const [copiado, setCopiado] = useState(false);
  const wa = telefono && mensaje ? waLink(telefono, mensaje) : null;
  return (
    <div className={`${r.acciones} ${r.noImprimir}`}>
      <button type="button" className={r.boton} onClick={() => window.print()}>
        Imprimir / guardar PDF
      </button>
      <button
        type="button"
        className={`${r.boton} ${r.botonClaro}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          } catch {
            window.prompt("Copiá el link:", link);
          }
        }}
      >
        {copiado ? "¡Copiado!" : "Copiar link"}
      </button>
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" className={`${r.boton} ${r.botonClaro}`}>
          Mandar por WhatsApp
        </a>
      )}
      {volver && (
        <a href={volver.href} className={`${r.boton} ${r.botonClaro}`}>
          {volver.texto}
        </a>
      )}
    </div>
  );
}
