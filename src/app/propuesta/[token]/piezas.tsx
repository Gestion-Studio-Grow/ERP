"use client";

// Lo interactivo de la propuesta: el visor 3D (sólo mirar), aprobar o rechazar, e imprimir.

import { useEffect, useRef, useState, useTransition } from "react";
import { responderPropuesta } from "@/lib/proyectos/acciones";
import { normalizarDiseno } from "@/lib/proyectos/stand";
import type { EscenaStand } from "@/lib/proyectos/stand-escena";

export function VisorStand({ diseno, nombre, acento }: { diseno: unknown; nombre: string; acento: string }) {
  const [abierto, setAbierto] = useState(false);
  const [falla, setFalla] = useState(false);
  const lienzo = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const c = lienzo.current;
    const d = normalizarDiseno(diseno);
    if (!c || !d) return;
    let vivo = true;
    let escena: EscenaStand | null = null;
    const r = () => c.parentElement!.getBoundingClientRect();
    import("@/lib/proyectos/stand-escena")
      .then(({ crearEscena }) => {
        if (!vivo) return;
        escena = crearEscena({ lienzo: c, ancho: r().width, alto: r().height });
        escena.dibujar(d);
      })
      .catch(() => setFalla(true));
    const ro = new ResizeObserver(() => escena?.medir(r().width, r().height));
    ro.observe(c.parentElement!);
    return () => {
      vivo = false;
      ro.disconnect();
      escena?.destruir();
    };
  }, [abierto, diseno]);

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="mia-boton mia-solo-pantalla" style={{ background: acento, color: "#fff" }}>
        Recorrer {nombre} en 3D
      </button>
    );
  }
  return (
    <div className="mia-solo-pantalla" style={{ position: "relative", height: "60vh", minHeight: 320, overflow: "hidden", borderRadius: 4 }}>
      <canvas ref={lienzo} aria-label={`Vista 3D de ${nombre}`} style={{ display: "block", width: "100%", height: "100%", touchAction: "none" }} />
      {falla && <p style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>Este navegador no puede mostrar el 3D.</p>}
    </div>
  );
}

export function Responder({ token, acento }: { token: string; acento: string }) {
  const [nombre, setNombre] = useState("");
  const [motivo, setMotivo] = useState("");
  const [rechazando, setRechazando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  const enviar = (aprueba: boolean) =>
    iniciar(async () => {
      setError(null);
      const r = await responderPropuesta({ token, aprueba, nombre, motivo });
      if (!r.ok) setError(r.error);
    });

  return (
    <div className="mia-solo-pantalla" style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "grid", gap: 6, fontSize: 14 }}>
        Tu nombre y apellido (queda como constancia)
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} autoComplete="name" className="mia-campo" />
      </label>
      {rechazando && (
        <label style={{ display: "grid", gap: 6, fontSize: 14 }}>
          ¿Qué te gustaría cambiar?
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={500} className="mia-campo" style={{ paddingTop: 10 }} />
        </label>
      )}
      {error && <p role="alert" style={{ margin: 0, color: "#b3261e", fontWeight: 500 }}>{error}</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {!rechazando && (
          <button type="button" disabled={ocupado} onClick={() => enviar(true)} className="mia-boton" style={{ background: acento, color: "#fff", flex: "1 1 200px" }}>
            {ocupado ? "Enviando…" : "Aprobar propuesta"}
          </button>
        )}
        {rechazando ? (
          <>
            <button type="button" disabled={ocupado || !motivo.trim()} onClick={() => enviar(false)} className="mia-boton" style={{ background: "#1a1a1a", color: "#fff", flex: "1 1 200px" }}>
              {ocupado ? "Enviando…" : "Enviar respuesta"}
            </button>
            <button type="button" onClick={() => setRechazando(false)} className="mia-boton mia-boton-linea">Volver</button>
          </>
        ) : (
          <button type="button" disabled={ocupado} onClick={() => setRechazando(true)} className="mia-boton mia-boton-linea" style={{ flex: "1 1 200px" }}>
            No la aprobamos
          </button>
        )}
      </div>
    </div>
  );
}

export function BotonImprimir() {
  return (
    <button type="button" onClick={() => window.print()} className="mia-boton mia-boton-linea mia-solo-pantalla">
      Imprimir
    </button>
  );
}
