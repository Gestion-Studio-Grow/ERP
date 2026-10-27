"use client";

// «Tu link y QR» (Ajustes, arriba de todo · M-087) y el final de la Bienvenida (M-083): copiar el
// link del turnero, compartirlo con la hoja nativa del teléfono (navigator.share) y bajar el QR
// para imprimirlo en el club. El QR lo dibuja el servidor (librería `qrcode`, ya instalada).

import { useState } from "react";
import { buttonClasses, cn } from "@/components/ui";

const grande = (v: "solid" | "outline" = "outline") => cn(buttonClasses(v, "lg"), "h-12 w-full justify-center px-3");

/** Copia al portapapeles; si el navegador no deja, lo muestra para copiar a mano. */
export async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    window.prompt("Copiá el link:", texto);
    return false;
  }
}

export function CopiarLink({ url, variante = "outline" }: { url: string; variante?: "solid" | "outline" }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className={grande(variante)}
      onClick={async () => {
        if (await copiar(url)) {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2500);
        }
      }}
      data-qa="copiar-link"
    >
      <span role="status">{copiado ? "✓ Link copiado" : "Copiar link"}</span>
    </button>
  );
}

export function CompartirLink({ url, texto }: { url: string; texto: string }) {
  const [aviso, setAviso] = useState<string | null>(null);
  return (
    <div className="grid gap-1">
      <button
        type="button"
        className={grande()}
        onClick={async () => {
          setAviso(null);
          if (typeof navigator.share === "function") {
            try {
              await navigator.share({ title: texto, text: texto, url });
            } catch {
              /* cerró la hoja de compartir: nada */
            }
            return;
          }
          if (await copiar(url)) setAviso("Este navegador no comparte directo: te lo copiamos, pegalo donde quieras.");
        }}
        data-qa="compartir-link"
      >
        Compartir
      </button>
      {aviso && <p role="status" className="text-sm text-muted">{aviso}</p>}
    </div>
  );
}

export function QrTurnero({ qr, url }: { qr: string; url: string }) {
  return (
    <div className="grid justify-items-center gap-2 sm:grid-cols-[auto_1fr] sm:items-center sm:justify-items-start">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} width={160} height={160} alt={`Código QR que abre tu turnero (${url})`} className="size-40 rounded-lg border border-line bg-surface-raised" data-qa="qr-turnero" />
      <a href={qr} download="turnero-qr.png" className={grande()} data-qa="bajar-qr">
        Bajar el QR (imagen)
      </a>
    </div>
  );
}
