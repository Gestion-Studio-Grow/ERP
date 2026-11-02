"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { buttonClasses, cn } from "@/components/ui";
import { aprobarBorrador, cambiarEstadoConsulta, convertirEnLead, descartarBorrador, pedirBorradorConsulta, responderConsulta } from "@/lib/proyectos/acciones-consultas";
import { campo } from "../../_vista";

export interface BorradorVista {
  id: string;
  texto: string;
  problemas: string[];
}

interface Props {
  id: string;
  estado: string;
  proyectoId: string | null;
  puedeUsarIA: boolean;
  tieneMail: boolean;
  borradores: BorradorVista[];
}

/** Las acciones del equipo sobre una consulta. Nada sale solo: el borrador del agente espera acá hasta que una persona lo apruebe. */
export function PanelConsulta({ id, estado, proyectoId, puedeUsarIA, tieneMail, borradores }: Props) {
  const router = useRouter();
  const [ocupado, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  const [wa, setWa] = useState<string | null>(null);
  const [respuesta, setRespuesta] = useState("");
  const [editados, setEditados] = useState<Record<string, string>>({});

  const correr = (f: () => Promise<{ ok: boolean; error?: string } | { ok: true }>, alOk?: (r: never) => void) =>
    iniciar(async () => {
      setError(null);
      setNota(null);
      const r = (await f()) as { ok: boolean; error?: string };
      if (!r.ok) return setError(r.error ?? "No se pudo hacer.");
      alOk?.(r as never);
      router.refresh();
    });

  const resultadoEnvio = (r: { envio: string; enlaceWhatsApp: string | null }) => {
    setWa(r.enlaceWhatsApp);
    setNota(r.envio === "ENVIADO" ? "Enviado por mail." : r.envio === "FALLIDO" ? "El mail falló. Podés mandarlo por WhatsApp con el enlace de abajo." : "No salió ningún mail (no hay mail conectado o falta el mail del cliente): quedó registrado. Podés mandarlo por WhatsApp con el enlace de abajo.");
  };

  return (
    <div className="grid gap-4">
      {borradores.map((b) => {
        const texto = editados[b.id] ?? b.texto;
        return (
          <section key={b.id} aria-label="Borrador del agente" className="grid gap-2 rounded-2xl border border-accent p-4">
            <h2 className="font-semibold text-strong">Borrador del agente: espera tu aprobación</h2>
            {b.problemas.length > 0 && (
              <div role="alert" className="grid gap-1 rounded-lg border border-danger p-2 text-sm text-danger">
                <p className="font-semibold">Revisalo antes de mandarlo:</p>
                <ul className="list-disc pl-5">{b.problemas.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
            )}
            <textarea aria-label="Texto del borrador" value={texto} rows={7} maxLength={2000} onChange={(e) => setEditados((v) => ({ ...v, [b.id]: e.target.value }))} className={cn(campo, "py-2")} />
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={ocupado} className={cn(buttonClasses("solid", "md"), "min-h-11")} onClick={() => correr(() => aprobarBorrador({ mensajeId: b.id, texto }), resultadoEnvio as never)}>
                {tieneMail ? "Aprobar y enviar" : "Aprobar y registrar"}
              </button>
              <button type="button" disabled={ocupado} className={cn(buttonClasses("ghost", "md"), "min-h-11")} onClick={() => correr(() => descartarBorrador({ mensajeId: b.id }))}>Descartar</button>
            </div>
          </section>
        );
      })}

      {estado !== "CONVERTIDA" && (
        <section aria-label="Responder" className="grid gap-2 rounded-2xl border border-line p-4">
          <h2 className="font-semibold text-strong">Responder</h2>
          <textarea aria-label="Tu respuesta" value={respuesta} rows={5} maxLength={2000} onChange={(e) => setRespuesta(e.target.value)} placeholder="Escribí la respuesta al cliente…" className={cn(campo, "py-2")} />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={ocupado || respuesta.trim().length < 10} className={cn(buttonClasses("solid", "md"), "min-h-11")} onClick={() => correr(() => responderConsulta({ id, texto: respuesta }), ((r: { envio: string; enlaceWhatsApp: string | null }) => { resultadoEnvio(r); setRespuesta(""); }) as never)}>
              {tieneMail ? "Enviar respuesta" : "Registrar respuesta"}
            </button>
            {puedeUsarIA ? (
              <button type="button" disabled={ocupado} className={cn(buttonClasses("outline", "md"), "min-h-11")} onClick={() => correr(() => pedirBorradorConsulta({ id }))}>
                {ocupado ? "Preparando…" : "Pedirle un borrador al agente"}
              </button>
            ) : (
              <p className="self-center text-xs text-muted">Tu rol no usa el agente.</p>
            )}
          </div>
        </section>
      )}

      <section aria-label="Estado" className="flex flex-wrap items-center gap-2">
        {estado !== "CONVERTIDA" && (
          <button type="button" disabled={ocupado} className={cn(buttonClasses("solid", "md"), "min-h-11")} onClick={() => correr(() => convertirEnLead({ id }), ((r: { proyectoId: string }) => router.push(`/admin/proyectos/${r.proyectoId}`)) as never)}>
            Convertir en lead
          </button>
        )}
        {proyectoId && <Link href={`/admin/proyectos/${proyectoId}`} className={buttonClasses("outline", "md")}>Abrir el proyecto</Link>}
        {estado !== "CONVERTIDA" && estado !== "PARA_PERSONA" && <button type="button" disabled={ocupado} className={cn(buttonClasses("outline", "md"), "min-h-11")} onClick={() => correr(() => cambiarEstadoConsulta({ id, estado: "PARA_PERSONA" }))}>Marcar para una persona</button>}
        {estado !== "CONVERTIDA" && estado !== "DESCARTADA" && <button type="button" disabled={ocupado} className={cn(buttonClasses("ghost", "md"), "min-h-11 text-danger")} onClick={() => correr(() => cambiarEstadoConsulta({ id, estado: "DESCARTADA" }))}>Descartar consulta</button>}
        {estado === "DESCARTADA" && <button type="button" disabled={ocupado} className={cn(buttonClasses("outline", "md"), "min-h-11")} onClick={() => correr(() => cambiarEstadoConsulta({ id, estado: "NUEVA" }))}>Reabrir</button>}
      </section>

      {error && <p role="alert" className="font-medium text-danger">{error}</p>}
      {nota && <p role="status" className="text-sm text-strong">{nota}</p>}
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" className={cn(buttonClasses("outline", "md"), "min-h-11 justify-self-start")}>
          Abrir WhatsApp con este texto
        </a>
      )}
    </div>
  );
}
