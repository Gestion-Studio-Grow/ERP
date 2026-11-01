"use client";

// El chat: canales, mensajes con autor y hora, menciones con @ y, en el del equipo, adjunto por archivo o por link.

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, cn } from "@/components/ui";
import { enviarMensajeChat } from "@/lib/proyectos/acciones-diseno";
import { subirArchivoFicha } from "@/lib/proyectos/acciones-ficha";
import { archivoADatos } from "./[id]/_piezas";
import { campo, etiqueta } from "./_vista";

export interface MensajeChat {
  id: string;
  canal: string;
  autor: string;
  texto: string;
  hora: string;
  adjuntoNombre: string | null;
  adjuntoUrl: string | null;
}

const NOMBRE_CANAL: Record<string, string> = { general: "General", logistica: "Logística", creatividad: "Creatividad", pagos: "Pagos" };

function ConMenciones({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(@[\p{L}]+)/gu).map((p, i) => (p.startsWith("@") ? <strong key={i} className="font-semibold text-strong">{p}</strong> : p))}
    </>
  );
}

export function ChatCliente({ proyectoId, canales, mensajes, personas, puedeEscribir, conAdjunto }: { proyectoId: string | null; canales: readonly string[]; mensajes: readonly MensajeChat[]; personas: readonly string[]; puedeEscribir: boolean; conAdjunto?: boolean }) {
  const [vista, setVista] = useState("todo");
  const [canal, setCanal] = useState(canales[0] ?? "general");
  const [texto, setTexto] = useState("");
  const [adjuntoNombre, setAdjuntoNombre] = useState("");
  const [adjuntoUrl, setAdjuntoUrl] = useState("");
  const [archivo, setArchivo] = useState<{ id: string; nombre: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const lista = useRef<HTMLOListElement>(null);
  const caja = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const variosCanales = canales.length > 1;
  const visibles = vista === "todo" ? mensajes : mensajes.filter((m) => m.canal === vista);

  useEffect(() => {
    if (lista.current) lista.current.scrollTop = lista.current.scrollHeight;
  }, [visibles.length]);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (ocupado) return;
    setError(null);
    iniciar(async () => {
      try {
        const r = await enviarMensajeChat({ proyectoId, canal, texto, adjuntoNombre, adjuntoUrl, archivoId: archivo?.id });
        if (!r.ok) return setError(r.error);
        setTexto("");
        setAdjuntoNombre("");
        setAdjuntoUrl("");
        setArchivo(null);
        router.refresh();
      } catch {
        setError("No se pudo enviar. Revisá la conexión y probá de nuevo.");
      }
    });
  };

  return (
    <div className="grid min-w-0 gap-3">
      {variosCanales && (
        <div role="group" aria-label="Canales" className="flex gap-1 overflow-x-auto">
          {["todo", ...canales].map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={vista === c}
              onClick={() => {
                setVista(c);
                if (c !== "todo") setCanal(c);
              }}
              className={cn("min-h-11 shrink-0 rounded-lg px-3 text-sm font-medium", vista === c ? "bg-accent text-on-accent" : "border border-line text-strong")}
            >
              {c === "todo" ? "Todo" : NOMBRE_CANAL[c] ?? c}
            </button>
          ))}
        </div>
      )}
      <ol ref={lista} aria-label="Mensajes" className="grid max-h-[60dvh] min-h-32 min-w-0 content-start gap-3 overflow-y-auto rounded-2xl border border-line bg-surface-raised p-3">
        {visibles.length === 0 && <li className="text-sm text-muted">Todavía no hay mensajes acá.</li>}
        {visibles.map((m) => (
          <li key={m.id} className="min-w-0">
            <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
              <span className="font-semibold text-strong">{m.autor}</span>
              <span>{m.hora}</span>
              {variosCanales && <span>· {NOMBRE_CANAL[m.canal] ?? m.canal}</span>}
            </p>
            {m.texto && <p className="whitespace-pre-wrap break-words text-sm"><ConMenciones texto={m.texto} /></p>}
            {m.adjuntoUrl && <a href={m.adjuntoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center break-all text-sm underline">{m.adjuntoNombre ?? "Adjunto"}</a>}
          </li>
        ))}
      </ol>
      {puedeEscribir ? (
        <form onSubmit={enviar} className="grid gap-2">
          {variosCanales && (
            <label className={etiqueta}>
              Escribir en
              <select value={canal} onChange={(e) => setCanal(e.target.value)} className={campo}>
                {canales.map((c) => <option key={c} value={c}>{NOMBRE_CANAL[c] ?? c}</option>)}
              </select>
            </label>
          )}
          <label className={etiqueta}>
            Mensaje
            <textarea
              ref={caja}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviar(e);
              }}
              rows={2}
              maxLength={4000}
              className="w-full min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-strong"
            />
          </label>
          {personas.length > 0 && (
            <div role="group" aria-label="Mencionar a alguien" className="flex gap-1 overflow-x-auto">
              {personas.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setTexto((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}@${p} `);
                    caja.current?.focus();
                  }}
                  className="min-h-11 shrink-0 rounded-full border border-line px-3 text-sm text-strong"
                >
                  @{p}
                </button>
              ))}
            </div>
          )}
          {proyectoId && (
            <label className="grid gap-1 text-sm font-medium text-strong">
              {archivo ? `Adjunto: ${archivo.nombre}` : "Adjuntar imagen o PDF (hasta 2 MB)"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                disabled={ocupado}
                className="w-full min-w-0 text-sm font-normal"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  setError(null);
                  iniciar(async () => {
                    try {
                      const r = await subirArchivoFicha({ proyectoId, tipo: "OTRO", nombre: f.name, datos: await archivoADatos(f) });
                      if (!r.ok) return setError(r.error);
                      setArchivo({ id: r.id, nombre: f.name });
                    } catch {
                      setError("No se pudo subir: el PDF pesa más de 2 MB o el archivo no se pudo leer.");
                    }
                  });
                }}
              />
            </label>
          )}
          {conAdjunto && (
            <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
              <input value={adjuntoNombre} onChange={(e) => setAdjuntoNombre(e.target.value)} aria-label="Nombre del adjunto" placeholder="Nombre del adjunto" maxLength={120} className={campo} />
              <input value={adjuntoUrl} onChange={(e) => setAdjuntoUrl(e.target.value)} aria-label="Link del adjunto" placeholder="Link del adjunto: https://…" inputMode="url" className={campo} />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={ocupado || (!texto.trim() && !adjuntoUrl.trim() && !archivo)}>{ocupado ? "Enviando…" : "Enviar"}</Button>
            <Button variant="ghost" disabled={ocupado} onClick={() => router.refresh()}>Actualizar</Button>
          </div>
          {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
        </form>
      ) : (
        <p className="text-sm text-muted">Tu rol puede leer este chat, pero no escribir.</p>
      )}
    </div>
  );
}
