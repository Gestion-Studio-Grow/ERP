"use client";

// CRM COMERCIAL · un borrador de mail o WhatsApp (diseño §4.4): aprobar, corregir, rechazar con motivo,
// copiar, abrirlo en WhatsApp (link sin número: el número lo elige la persona) o en el mail (sin destinatario)
// y marcarlo como enviado. El sistema no manda nada: lo manda la persona y después lo marca.

import { useState } from "react";
import { Badge, Button, Input, Textarea, buttonClasses, atributosBoton } from "@/components/ui";
import { aprobarBorrador, editarBorrador, marcarEnviado, rechazarBorrador } from "@/lib/crm-comercial/acciones";
import { Resultado, ROTULO } from "./Avisos";
import { useAccion } from "./useAccion";

export interface BorradorVista {
  id: string;
  canal: string;
  asunto: string | null;
  cuerpo: string;
  estado: string;
  motivoRechazo: string | null;
  version: number;
  contexto?: string | null;
  href?: string | null;
}

const ESTADO: Record<string, { texto: string; tono: "neutral" | "info" | "success" | "danger" }> = {
  BORRADOR: { texto: "Por aprobar", tono: "neutral" },
  APROBADO: { texto: "Aprobado: falta mandarlo", tono: "info" },
  ENVIADO_POR_PERSONA: { texto: "Enviado", tono: "success" },
  RECHAZADO: { texto: "Rechazado", tono: "danger" },
};

export function BorradorTarjeta({ b, puede }: { b: BorradorVista; puede: { aprobar: boolean; rechazar: boolean; enviar: boolean } }) {
  const { correr, pendiente, motivo, hecho } = useAccion();
  const [modo, setModo] = useState<"ver" | "editar" | "rechazar">("ver");
  const [asunto, setAsunto] = useState(b.asunto ?? "");
  const [cuerpo, setCuerpo] = useState(b.cuerpo);
  const [porque, setPorque] = useState("");
  const [copiado, setCopiado] = useState(false);
  const estado = ESTADO[b.estado] ?? { texto: b.estado, tono: "neutral" as const };
  const texto = b.canal === "MAIL" && b.asunto ? `${b.asunto}\n\n${b.cuerpo}` : b.cuerpo;
  const abrir = b.canal === "WHATSAPP" ? `https://wa.me/?text=${encodeURIComponent(b.cuerpo)}` : `mailto:?subject=${encodeURIComponent(b.asunto ?? "")}&body=${encodeURIComponent(b.cuerpo)}`;
  const vivo = b.estado === "BORRADOR" || b.estado === "APROBADO";

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <article className="rounded-lg border border-line bg-surface-raised p-4" aria-label={`Borrador de ${b.canal === "WHATSAPP" ? "WhatsApp" : "mail"}`}>
      <header className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{b.canal === "WHATSAPP" ? "WhatsApp" : "Mail"}</Badge>
        <Badge tone={estado.tono}>{estado.texto}</Badge>
        {b.contexto && (b.href ? <a href={b.href} className="min-w-0 break-words text-sm font-medium text-strong underline-offset-2 hover:underline">{b.contexto}</a> : <span className="text-sm text-strong">{b.contexto}</span>)}
      </header>

      {modo === "editar" ? (
        <form
          className="mt-3 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            correr(() => editarBorrador(b.id, { asunto: b.canal === "MAIL" ? asunto : null, cuerpo, version: b.version }), { listo: "Borrador corregido.", alTerminar: () => setModo("ver") });
          }}
        >
          {b.canal === "MAIL" && (
            <div>
              <label htmlFor={`as-${b.id}`} className={ROTULO}>Asunto</label>
              <Input id={`as-${b.id}`} value={asunto} onChange={(e) => setAsunto(e.target.value)} maxLength={300} />
            </div>
          )}
          <div>
            <label htmlFor={`cu-${b.id}`} className={ROTULO}>Texto</label>
            <Textarea id={`cu-${b.id}`} value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} rows={8} required maxLength={10000} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={pendiente}>Guardar corrección</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => (setModo("ver"), setCuerpo(b.cuerpo), setAsunto(b.asunto ?? ""))}>Cancelar</Button>
          </div>
        </form>
      ) : (
        <div className="mt-3">
          {b.asunto && <p className="break-words font-medium text-strong">{b.asunto}</p>}
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-body">{b.cuerpo}</p>
          {b.motivoRechazo && <p className="mt-2 text-sm text-danger">Motivo del rechazo: {b.motivoRechazo}</p>}
        </div>
      )}

      {modo === "rechazar" && (
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            correr(() => rechazarBorrador(b.id, porque, b.version), { listo: "Borrador rechazado; quedó el motivo.", alTerminar: () => setModo("ver") });
          }}
        >
          <label className="min-w-0 flex-1 text-sm">
            <span className={ROTULO}>Por qué se rechaza</span>
            <Input value={porque} onChange={(e) => setPorque(e.target.value)} required maxLength={1000} />
          </label>
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="danger" disabled={pendiente}>Rechazar</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setModo("ver")}>Cancelar</Button>
          </div>
        </form>
      )}

      {modo === "ver" && vivo && (
        <div className="mt-3 flex flex-wrap gap-2">
          {b.estado === "BORRADOR" && puede.aprobar && (
            <>
              <Button size="sm" disabled={pendiente} onClick={() => correr(() => aprobarBorrador(b.id, b.version), { listo: "Aprobado. Mandalo y después marcalo como enviado." })}>Aprobar</Button>
              <Button size="sm" variant="outline" disabled={pendiente} onClick={() => setModo("editar")}>Corregir</Button>
            </>
          )}
          {puede.rechazar && <Button size="sm" variant="outline" disabled={pendiente} onClick={() => setModo("rechazar")}>Rechazar…</Button>}
          <Button size="sm" variant="ghost" onClick={copiar}>{copiado ? "Copiado" : "Copiar texto"}</Button>
          {b.estado === "APROBADO" && (
            <a href={abrir} target="_blank" rel="noopener noreferrer" className={buttonClasses("ghost", "sm")} {...atributosBoton("ghost", "sm")}>
              {b.canal === "WHATSAPP" ? "Abrir en WhatsApp" : "Abrir en el mail"}
            </a>
          )}
          {b.estado === "APROBADO" && puede.enviar && (
            <Button size="sm" disabled={pendiente} onClick={() => correr(() => marcarEnviado(b.id), { listo: "Marcado como enviado." })}>Ya lo mandé</Button>
          )}
        </div>
      )}
      {modo === "ver" && b.estado === "BORRADOR" && !puede.aprobar && <p className="mt-2 text-xs text-muted">Lo aprueba una persona (Dirección o el comercial).</p>}
      <Resultado motivo={motivo} hecho={hecho} />
      <span className="sr-only" aria-live="polite">{copiado ? "Texto copiado" : ""}</span>
    </article>
  );
}
