"use client";

// «Compartir el precio» de la ficha: el menú de compartir del teléfono si existe; si no, copia la dirección.
// Nunca un número de WhatsApp escrito a mano (DISENO.md §10).
import { useState } from "react";

export default function Compartir({ titulo }: { titulo: string }) {
  const [aviso, setAviso] = useState<string | null>(null);
  async function compartir() {
    const url = window.location.href;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: titulo, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setAviso("Copiamos el enlace.");
    } catch (e) {
      // Cerrar el menú de compartir no es un error; un portapapeles bloqueado, sí.
      if (e instanceof DOMException && e.name === "AbortError") return;
      setAviso("No pudimos copiarlo: copiá la dirección de arriba.");
    }
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <button type="button" className="chf-btn-borde chf-btn-chico" onClick={compartir}>
        Compartir el precio
      </button>
      <span role="status" aria-live="polite" className="chf-serv-meta">
        {aviso}
      </span>
    </span>
  );
}
