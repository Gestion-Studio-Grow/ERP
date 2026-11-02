"use client";

// Los agentes: elegir uno, un proyecto o el contexto general, y charlar. La charla vive en el navegador: «Nueva charla» la borra.
// Preparan texto; no ejecutan nada.

import { useRef, useState, useTransition, type FormEvent } from "react";
import { Button, cn } from "@/components/ui";
import { conversarConAgente } from "@/lib/proyectos/acciones-diseno";
import type { MensajeAgente } from "@/lib/proyectos/diseno-core";
import { campo, etiqueta, tarjeta } from "./_vista";

export interface AgenteVista {
  id: string;
  nombre: string;
  ayuda: string;
  bloqueado: boolean;
  sugerencias: readonly string[];
}

export function ChatAgentes({ agentes, proyectos, iaLista, proyectoInicial }: { agentes: readonly AgenteVista[]; proyectos: readonly { id: string; nombre: string }[]; iaLista: boolean; proyectoInicial?: string }) {
  const [agenteId, setAgenteId] = useState(agentes.find((a) => !a.bloqueado)?.id ?? "");
  const [proyectoId, setProyectoId] = useState(proyectoInicial ?? "");
  const [mensajes, setMensajes] = useState<MensajeAgente[]>([]);
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<number | null>(null);
  const [ocupado, iniciar] = useTransition();
  const fondo = useRef<HTMLDivElement>(null);
  const agente = agentes.find((a) => a.id === agenteId);

  const reiniciar = () => {
    setMensajes([]);
    setAviso(null);
    setError(null);
    setTexto("");
  };

  const preguntar = (pregunta: string) => {
    const limpia = pregunta.trim();
    if (!limpia || ocupado || !agente || !iaLista) return;
    const charla: MensajeAgente[] = [...mensajes, { rol: "user", texto: limpia }];
    setMensajes(charla);
    setTexto("");
    setError(null);
    setAviso(null);
    iniciar(async () => {
      try {
        const r = await conversarConAgente({ agente: agente.id, proyectoId: proyectoId || null, mensajes: charla });
        if (!r.ok) {
          // La pregunta vuelve a la caja: lo que el agente no contestó no queda como si hubiera pasado.
          setMensajes(mensajes);
          setTexto(limpia);
          setError(r.error);
          return;
        }
        setMensajes([...charla, { rol: "assistant", texto: r.texto }]);
        if (r.cortada) setAviso("La respuesta quedó cortada por largo. Pedile que siga.");
      } catch {
        setMensajes(mensajes);
        setTexto(limpia);
        setError("La IA no respondió. Probá de nuevo.");
      } finally {
        fondo.current?.scrollIntoView({ block: "nearest" });
      }
    });
  };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    preguntar(texto);
  };

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="grid min-w-0 content-start gap-3">
        <ul className="grid gap-2">
          {agentes.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                disabled={a.bloqueado}
                aria-pressed={a.id === agenteId}
                onClick={() => {
                  if (a.id !== agenteId) {
                    setAgenteId(a.id);
                    reiniciar();
                  }
                }}
                className={cn("grid min-h-11 w-full gap-0.5 rounded-xl border border-line p-3 text-left disabled:cursor-not-allowed disabled:opacity-60", a.id === agenteId && "border-accent bg-surface-raised")}
              >
                <span className="text-sm font-semibold text-strong">{a.nombre}{a.bloqueado && " · Bloqueado"}</span>
                <span className="text-xs text-muted">{a.bloqueado ? "Tu rol no ve lo que este agente necesita." : a.ayuda}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="grid min-w-0 content-start gap-3" aria-label={agente ? `Charla con ${agente.nombre}` : "Charla"}>
        <div className="flex flex-wrap items-end gap-2">
          <label className={cn(etiqueta, "min-w-48 flex-1")}>
            Sobre qué
            <select
              value={proyectoId}
              onChange={(e) => {
                setProyectoId(e.target.value);
                reiniciar();
              }}
              className={campo}
            >
              <option value="">Contexto general</option>
              {proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>
          <Button variant="outline" onClick={reiniciar} disabled={ocupado || mensajes.length === 0}>Nueva charla</Button>
        </div>

        {!agente && <p className="text-sm text-muted">Tu rol no tiene ningún agente disponible.</p>}

        {agente && mensajes.length === 0 && (
          <div className="grid gap-2" role="group" aria-label="Sugerencias para arrancar">
            {agente.sugerencias.map((s) => (
              <button key={s} type="button" disabled={!iaLista || ocupado} onClick={() => preguntar(s)} className="min-h-11 rounded-xl border border-line px-3 py-2 text-left text-sm text-strong disabled:cursor-not-allowed disabled:opacity-60">{s}</button>
            ))}
          </div>
        )}

        {mensajes.length > 0 && (
          <ol aria-label="Mensajes" className="grid min-w-0 gap-3">
            {mensajes.map((m, i) => (
              <li key={i} className={cn(tarjeta, "min-w-0 p-3", m.rol === "user" && "bg-surface")}>
                <p className="mb-1 text-xs font-semibold text-muted">{m.rol === "user" ? "Vos" : agente?.nombre}</p>
                <p className="whitespace-pre-wrap break-words text-sm text-strong">{m.texto}</p>
                {m.rol === "assistant" && (
                  <button
                    type="button"
                    className="mt-1 inline-flex min-h-11 items-center text-sm underline"
                    onClick={() => {
                      navigator.clipboard?.writeText(m.texto).then(() => setCopiado(i), () => setCopiado(null));
                    }}
                  >
                    {copiado === i ? "Copiado" : "Copiar texto"}
                  </button>
                )}
              </li>
            ))}
            {ocupado && <li role="status" className="text-sm text-muted">{agente?.nombre} está escribiendo…</li>}
          </ol>
        )}
        <div ref={fondo} />

        {aviso && <p role="status" className="text-sm text-muted">{aviso}</p>}
        {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}

        <form onSubmit={enviar} className="grid gap-2">
          <label className={etiqueta}>
            Tu mensaje
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviar(e);
              }}
              rows={3}
              maxLength={6000}
              disabled={!iaLista || !agente}
              className="w-full min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-strong disabled:opacity-60"
            />
          </label>
          <div>
            <Button type="submit" disabled={!iaLista || !agente || ocupado || !texto.trim()}>{ocupado ? "Esperando…" : "Enviar"}</Button>
          </div>
        </form>
        <p className="text-sm text-muted">El agente prepara y sugiere. Enviar, pagar o cambiar un precio lo aprueba una persona.</p>
      </section>
    </div>
  );
}
