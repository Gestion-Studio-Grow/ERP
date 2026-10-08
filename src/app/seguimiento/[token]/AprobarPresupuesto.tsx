"use client";

// El cliente aprueba o rechaza ítem por ítem y confirma una sola vez. El total se va
// actualizando solo con lo que deja en "Sí".

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { responderPresupuesto } from "@/lib/taller/acciones";
import { pesos } from "@/lib/taller/core";

interface Item {
  id: string;
  descripcion: string;
  tipo: string;
  importe: number;
  gratis: boolean;
  decision: string;
}

export default function AprobarPresupuesto({ token, items, editable, color }: { token: string; items: Item[]; editable: boolean; color: string }) {
  // Lo que estaba sin responder arranca en "Sí": aprobar todo es un solo toque.
  const [dec, setDec] = useState<Record<string, string>>(() => Object.fromEntries(items.map((i) => [i.id, i.decision === "RECHAZADO" ? "RECHAZADO" : "APROBADO"])));
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const router = useRouter();
  const total = items.reduce((s, i) => s + (dec[i.id] === "APROBADO" ? i.importe : 0), 0);
  const sinResponder = items.some((i) => i.decision === "PENDIENTE");

  function confirmar() {
    setAviso(null);
    iniciar(async () => {
      try {
        const r = await responderPresupuesto(token, dec);
        setAviso(r.ok ? { ok: true, texto: "¡Listo! Ya le avisamos al taller." } : { ok: false, texto: r.error });
        if (r.ok) router.refresh();
      } catch {
        setAviso({ ok: false, texto: "No pudimos enviar tu respuesta. Revisá la conexión y probá de nuevo." });
      }
    });
  }

  const boton = (activo: boolean, fondo: string): React.CSSProperties => ({
    minHeight: 44,
    minWidth: 56,
    padding: "0 14px",
    borderRadius: 10,
    border: `2px solid ${activo ? fondo : "#ccc"}`,
    background: activo ? fondo : "#fff",
    color: activo ? "#fff" : "#333",
    fontWeight: 700,
    fontSize: 15,
  });

  return (
    <div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
        {items.map((i) => {
          const si = dec[i.id] === "APROBADO";
          return (
            <li key={i.id} style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 12, opacity: si ? 1 : 0.65 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, textDecoration: si ? "none" : "line-through" }}>{i.descripcion}</div>
                  <div style={{ fontSize: 12, color: "#555" }}>{i.tipo}</div>
                </div>
                <div style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{i.gratis ? "Sin cargo" : pesos(i.importe)}</div>
              </div>
              {editable ? (
                <div role="group" aria-label={`¿Hacemos ${i.descripcion}?`} style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button type="button" aria-pressed={si} onClick={() => setDec((d) => ({ ...d, [i.id]: "APROBADO" }))} style={boton(si, "#15803d")}>Sí, hacelo</button>
                  <button type="button" aria-pressed={!si} onClick={() => setDec((d) => ({ ...d, [i.id]: "RECHAZADO" }))} style={boton(!si, "#555")}>No</button>
                </div>
              ) : (
                <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: i.decision === "APROBADO" ? "#15803d" : "#555" }}>
                  {i.decision === "APROBADO" ? "✓ Aprobado" : i.decision === "RECHAZADO" ? "✕ No se hace" : "Sin responder"}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p style={{ display: "flex", justifyContent: "space-between", margin: "14px 0", fontSize: 20, fontWeight: 800 }}>
        <span>Total</span>
        <span>{pesos(total)}</span>
      </p>

      {editable && (
        <button
          type="button"
          onClick={confirmar}
          disabled={pendiente}
          style={{ width: "100%", minHeight: 56, borderRadius: 14, border: 0, background: color, color: "#fff", fontWeight: 800, fontSize: 18, opacity: pendiente ? 0.7 : 1 }}
        >
          {pendiente ? "Enviando…" : sinResponder ? "Confirmar mi respuesta" : "Cambiar mi respuesta"}
        </button>
      )}
      {aviso && (
        <p role="status" style={{ margin: "10px 0 0", padding: 12, borderRadius: 10, fontWeight: 600, background: aviso.ok ? "#dcfce7" : "#fee2e2", color: aviso.ok ? "#14532d" : "#7f1d1d" }}>
          {aviso.texto}
        </p>
      )}
    </div>
  );
}
