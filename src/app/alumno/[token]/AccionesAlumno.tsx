"use client";

// Los botones del link del alumno: repetir la clase, mandar el comprobante y cancelar.
// Cada uno llama a su acción del servidor, que vuelve a chequear todo con el token.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelarDesdeLink, recordarToken, reservarDesdeLink, subirComprobante } from "@/lib/padel/acciones";

/**
 * Al abrir el link, este teléfono queda recordado (cookie httpOnly que escribe el servidor): la
 * próxima vez el turnero sabe quién es. Una sola vez por visita; no pinta nada.
 */
export function RecordarSesion({ token }: { token: string }) {
  const hecho = useRef(false);
  useEffect(() => {
    if (hecho.current) return;
    hecho.current = true;
    recordarToken(token).catch(() => {});
  }, [token]);
  return null;
}

const ZONA = "America/Argentina/Buenos_Aires";
const cuando = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ZONA });

const boton = (color: string, lleno = true): React.CSSProperties => ({
  width: "100%",
  minHeight: 54,
  borderRadius: 14,
  border: `2px solid ${color}`,
  background: lleno ? color : "var(--padel-superficie)",
  color: lleno ? "var(--padel-sobre-cancha)" : color,
  fontSize: 18,
  fontWeight: 700,
  cursor: "pointer",
});
const alerta: React.CSSProperties = { margin: "10px 0 0", padding: 10, borderRadius: 10, background: "var(--padel-peligro-suave)", color: "var(--padel-peligro)", fontWeight: 600, fontSize: 16 };
const ok: React.CSSProperties = { margin: "10px 0 0", padding: 10, borderRadius: 10, background: "var(--padel-ok-suave)", color: "var(--padel-cancha)", fontWeight: 600, fontSize: 16 };

export function BotonRepetir({ token, horaIso, repiteDe, etiqueta, color }: { token: string; horaIso: string; repiteDe: string; etiqueta: string; color: string }) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [alternativas, setAlternativas] = useState<string[]>([]);

  const reservar = (iso: string, repite?: string) =>
    start(async () => {
      const r = await reservarDesdeLink(token, iso, repite);
      if (r.ok) {
        setAlternativas([]);
        setMsg({ ok: true, texto: r.estado === "CONFIRMADA" ? `¡Listo! Quedó confirmada: ${r.cuando}.` : `Pedida: ${r.cuando}. El profe te la confirma.` });
        router.refresh();
      } else {
        setMsg({ ok: false, texto: r.error });
        setAlternativas(r.alternativas ?? []);
      }
    });

  return (
    <div>
      <button type="button" disabled={pendiente} onClick={() => reservar(horaIso, repiteDe)} style={boton(color)} data-qa="repetir">
        {pendiente ? "Reservando…" : `Sí, ${etiqueta}`}
      </button>
      {msg && <p role={msg.ok ? "status" : "alert"} style={msg.ok ? ok : alerta}>{msg.texto}</p>}
      {alternativas.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <p style={{ margin: "0 0 8px", fontSize: 16 }}>Te quedan libres:</p>
          <div style={{ display: "grid", gap: 8 }}>
            {alternativas.map((a) => (
              <button key={a} type="button" disabled={pendiente} onClick={() => reservar(a)} style={{ ...boton(color, false), textTransform: "capitalize" }} data-qa="alternativa">
                {cuando(a)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Achica la foto a JPEG de 1024 px de lado mayor (~100 KB) en el teléfono. Devuelve un data URL. */
async function achicarFoto(file: File, lado = 1024, calidad = 0.62): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", calidad);
}

export function SubirComprobante({ token, claseId, color, otra }: { token: string; claseId: string; color: string; otra?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pendiente, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const elegir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    start(async () => {
      let dataUrl: string;
      try {
        dataUrl = await achicarFoto(file);
      } catch {
        setMsg({ ok: false, texto: "No pudimos leer esa imagen. Probá con una captura de pantalla." });
        return;
      }
      const r = await subirComprobante(token, claseId, dataUrl);
      setMsg(r.ok ? { ok: true, texto: "¡Recibido! El profe lo revisa y te avisa." } : { ok: false, texto: r.error });
      if (r.ok) router.refresh();
    });
  };

  return (
    <div style={{ marginTop: 10 }}>
      <input ref={input} type="file" accept="image/*" onChange={elegir} hidden aria-hidden data-qa="archivo-comprobante" />
      <button type="button" disabled={pendiente} onClick={() => input.current?.click()} style={boton(color, !otra)} data-qa="subir-comprobante">
        {pendiente ? "Subiendo…" : otra ? "Mandar otro comprobante" : "Subir comprobante"}
      </button>
      {msg && <p role={msg.ok ? "status" : "alert"} style={msg.ok ? ok : alerta}>{msg.texto}</p>}
    </div>
  );
}

export function BotonCancelar({ token, claseId, color }: { token: string; claseId: string; color: string }) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const [seguro, setSeguro] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!seguro) {
    return (
      <button type="button" onClick={() => setSeguro(true)} style={{ background: "none", border: 0, color, textDecoration: "underline", fontSize: 16, minHeight: 44, cursor: "pointer", padding: 0 }} data-qa="cancelar">
        No puedo ir, cancelar
      </button>
    );
  }
  return (
    <div>
      <p style={{ margin: "0 0 8px", fontSize: 16 }}>¿Seguro? El horario queda libre para otro.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <button type="button" onClick={() => setSeguro(false)} style={boton(color, false)}>No</button>
        <button
          type="button"
          disabled={pendiente}
          data-qa="cancelar-si"
          onClick={() =>
            start(async () => {
              const r = await cancelarDesdeLink(token, claseId);
              if (r.ok) router.refresh();
              else setError(r.error);
            })
          }
          style={boton("var(--padel-peligro)")}
        >
          {pendiente ? "Cancelando…" : "Sí, cancelar"}
        </button>
      </div>
      {error && <p role="alert" style={alerta}>{error}</p>}
    </div>
  );
}
