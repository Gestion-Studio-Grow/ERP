"use client";

// Mapa como fachada: el iframe de Google Maps (pesado) se monta recién cuando la persona lo pide. Mismo bloque
// 16:10 antes y después: no mueve nada (CLS 0).
import { useState } from "react";

export default function Mapa({ src, direccion }: { src: string; direccion: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="agr-mapa">
      {abierto ? (
        <iframe title={`Mapa: ${direccion}`} src={src} referrerPolicy="no-referrer-when-downgrade" />
      ) : (
        <div className="agr-mapa__fachada">
          <p>{direccion}</p>
          <button type="button" className="agr-btn agr-btn--borde" onClick={() => setAbierto(true)}>
            Ver el mapa
          </button>
        </div>
      )}
    </div>
  );
}
