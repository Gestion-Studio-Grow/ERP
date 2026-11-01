"use client";

// La respuesta del cliente a una presentación. El nombre se recuerda para no pedirlo en cada una.

import { useEffect, useState, useTransition } from "react";
import { responderPresentacion } from "@/lib/proyectos/acciones-gestion";

const CLAVE_NOMBRE = "portal:nombre";

export function ResponderPresentacion({ token, presentacionId, acento }: { token: string; presentacionId: string; acento: string }) {
  const [nombre, setNombre] = useState("");
  const [comentario, setComentario] = useState("");
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  useEffect(() => {
    // Después de hidratar: el servidor no conoce el almacenamiento del navegador.
    queueMicrotask(() => {
      try {
        const guardado = sessionStorage.getItem(CLAVE_NOMBRE);
        if (guardado) setNombre(guardado);
      } catch {
        // Sin almacenamiento, se vuelve a escribir.
      }
    });
  }, []);

  const enviar = (aprueba: boolean) =>
    iniciar(async () => {
      setError(null);
      try {
        sessionStorage.setItem(CLAVE_NOMBRE, nombre);
      } catch {
        // Sin almacenamiento, se vuelve a escribir.
      }
      try {
        const r = await responderPresentacion({ token, presentacionId, aprueba, nombre, comentario });
        if (!r.ok) setError(r.error);
      } catch {
        setError("No se pudo enviar. Revisá la conexión y probá de nuevo.");
      }
    });

  return (
    <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
      <label style={{ display: "grid", gap: 6, fontSize: 14 }}>
        Tu nombre y apellido (queda como constancia)
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} autoComplete="name" className="mia-campo" />
      </label>
      {corrigiendo && (
        <label style={{ display: "grid", gap: 6, fontSize: 14 }}>
          ¿Qué hay que cambiar?
          <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={3} maxLength={1000} className="mia-campo" style={{ paddingTop: 10 }} />
        </label>
      )}
      {error && <p role="alert" style={{ margin: 0, color: "#b3261e", fontWeight: 500 }}>{error}</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {corrigiendo ? (
          <>
            <button type="button" disabled={ocupado} onClick={() => enviar(false)} className="mia-boton" style={{ background: "#1a1a1a", color: "#fff", flex: "1 1 200px" }}>
              {ocupado ? "Enviando…" : "Enviar los cambios"}
            </button>
            <button type="button" onClick={() => setCorrigiendo(false)} className="mia-boton mia-boton-linea">Volver</button>
          </>
        ) : (
          <>
            <button type="button" disabled={ocupado} onClick={() => enviar(true)} className="mia-boton" style={{ background: acento, color: "#fff", flex: "1 1 200px" }}>
              {ocupado ? "Enviando…" : "Aprobar"}
            </button>
            <button type="button" disabled={ocupado} onClick={() => setCorrigiendo(true)} className="mia-boton mia-boton-linea" style={{ flex: "1 1 200px" }}>
              Pedir cambios
            </button>
          </>
        )}
      </div>
    </div>
  );
}
