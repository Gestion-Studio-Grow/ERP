"use client";

// Piezas de cliente de la ficha: el formulario que muestra por qué no se pudo, confirmar en dos pasos, el cambio de etapa con su
// motivo y el botón de la carpeta.

import { useRef, useState, useTransition, type ReactNode } from "react";
import { buttonClasses, cn, Dialogo } from "@/components/ui";
import { guardarCarpeta, moverProyecto, type ResultadoFicha } from "@/lib/proyectos/acciones-ficha";
import { MOTIVOS_PERDIDA } from "@/lib/proyectos/gestion-core";
import { campo } from "../_vista";
import { useToastSiHay } from "../../ToastProvider";

const campoEnLinea = "min-h-11 min-w-0 rounded-lg border border-line bg-surface px-3 text-sm text-strong";

/** Un <form> de acción de servidor que dice qué falló sin perder lo tipeado. Con `limpiar`, vacía los campos si salió bien. */
export function FormAccion({ accion, className, children, limpiar, alGuardar }: { accion: (fd: FormData) => Promise<ResultadoFicha>; className?: string; children: ReactNode; limpiar?: boolean; alGuardar?: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const toast = useToastSiHay();
  return (
    <form
      ref={form}
      className={className}
      action={async (fd) => {
        setError(null);
        try {
          const r = await accion(fd);
          if (!r.ok) return setError(r.error);
          // El éxito va en un aviso flotante: el renglón que lo pidió (la cuota marcada) suele desaparecer al refrescar.
          if (r.listo) toast?.showSuccess(r.listo);
          if (limpiar) form.current?.reset();
          alGuardar?.();
        } catch {
          setError("No se pudo guardar. Revisá la conexión y probá de nuevo.");
        }
      }}
    >
      {children}
      {error && <p role="alert" className="col-span-full basis-full text-sm font-medium text-danger">{error}</p>}
    </form>
  );
}

/** Sin confirm nativo: el primer toque arma el botón y el segundo hace. */
export function BotonConConfirmacion({ accion, ocultos, texto, textoConfirma, etiqueta }: { accion: (fd: FormData) => Promise<ResultadoFicha>; ocultos: Record<string, string>; texto: string; textoConfirma: string; etiqueta?: string }) {
  const [armado, setArmado] = useState(false);
  return (
    <FormAccion accion={accion} className="flex flex-wrap items-center gap-1" alGuardar={() => setArmado(false)}>
      {Object.entries(ocultos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {armado ? (
        <>
          <button type="submit" className={buttonClasses("danger", "md")}>{textoConfirma}</button>
          <button type="button" className={buttonClasses("ghost", "md")} onClick={() => setArmado(false)}>No</button>
        </>
      ) : (
        <button type="button" aria-label={etiqueta} className={buttonClasses("ghost", "md")} onClick={() => setArmado(true)}>{texto}</button>
      )}
    </FormAccion>
  );
}

/** Pasar a la que sigue, corregir la etapa, marcar perdido o reabrir. */
export function ControlEtapa({ id, etapa, perdido, motivo, siguiente, etapas }: { id: string; etapa: string; perdido: boolean; motivo: string | null; siguiente: { id: string; label: string } | null; etapas: { id: string; label: string }[] }) {
  const [ocupado, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [motivoLista, setMotivoLista] = useState("");

  const mover = (destino: string, motivoPerdida?: string) =>
    iniciar(async () => {
      setError(null);
      const r = await moverProyecto({ id, destino, motivo: motivoPerdida });
      if (!r.ok) return setError(r.error);
      setAbierto(false);
      setTexto("");
    });

  if (perdido) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-danger">Perdido{motivo ? `: ${motivo}` : ""}</p>
        <button type="button" disabled={ocupado} className={buttonClasses("outline", "md")} onClick={() => mover(etapa)}>Reabrir</button>
        {error && <p role="alert" className="basis-full text-sm font-medium text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      {siguiente && <button type="button" disabled={ocupado} className={buttonClasses("solid", "md")} onClick={() => mover(siguiente.id)}>Pasar a {siguiente.label}</button>}
      <label className="grid gap-1 text-sm">
        Corregir etapa
        <select value={etapa} disabled={ocupado} onChange={(e) => mover(e.target.value)} className={campoEnLinea}>
          {etapas.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
      </label>
      <button type="button" disabled={ocupado} className={buttonClasses("ghost", "md")} onClick={() => setAbierto(true)}>Marcar perdido</button>
      {error && !abierto && <p role="alert" className="basis-full text-sm font-medium text-danger">{error}</p>}
      <Dialogo
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        titulo="Marcar como perdido"
        descripcion="Los cobros y pagos pendientes salen del cashflow. Se puede reabrir."
        pie={
          <>
            <button type="button" className={buttonClasses("ghost", "md")} onClick={() => setAbierto(false)}>Cancelar</button>
            <button type="button" disabled={ocupado || !motivoLista || (motivoLista === "Otro" && !texto.trim())} className={buttonClasses("danger", "md")} onClick={() => mover("PERDIDO", texto.trim() ? `${motivoLista} — ${texto.trim()}` : motivoLista)}>Marcar perdido</button>
          </>
        }
      >
        <label className="mb-3 grid gap-1 text-sm font-medium text-strong">
          Motivo
          <select value={motivoLista} onChange={(e) => setMotivoLista(e.target.value)} className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-strong">
            <option value="">Elegí un motivo</option>
            {MOTIVOS_PERDIDA.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-strong">
          {motivoLista === "Otro" ? "Contá qué pasó" : "Detalle (opcional)"}
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={260} className="w-full rounded-lg border border-line bg-surface p-3 text-sm text-strong" />
        </label>
        {error && <p role="alert" className="mt-2 text-sm font-medium text-danger">{error}</p>}
      </Dialogo>
    </div>
  );
}

/** La carpeta es un link a la nube del negocio. */
export function BotonCarpeta({ id, url, edita }: { id: string; url: string | null; edita: boolean }) {
  const [editando, setEditando] = useState(false);
  if (editando) {
    return (
      <FormAccion accion={guardarCarpeta} className="flex w-full flex-wrap items-center gap-2" alGuardar={() => setEditando(false)}>
        <input type="hidden" name="id" value={id} />
        <input name="carpetaUrl" defaultValue={url ?? ""} aria-label="Link de la carpeta" placeholder="https://…" inputMode="url" className={cn(campo, "min-w-0 flex-1 sm:max-w-sm")} />
        <button type="submit" className={buttonClasses("solid", "md")}>Guardar</button>
        <button type="button" className={buttonClasses("ghost", "md")} onClick={() => setEditando(false)}>Cancelar</button>
      </FormAccion>
    );
  }
  return (
    <>
      {url && <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "md")}>Carpeta</a>}
      {edita && <button type="button" className={buttonClasses("ghost", "md")} onClick={() => setEditando(true)}>{url ? "Cambiar carpeta" : "Agregar carpeta"}</button>}
    </>
  );
}
