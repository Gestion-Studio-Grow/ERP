"use client";

// Piezas de cliente de la ficha: el formulario que muestra por qué no se pudo, confirmar en dos pasos, el cambio de etapa con su
// motivo y el botón de la carpeta.

import { useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { EnvioEnCurso } from "@/components/envio-en-curso";
import { buttonClasses, cn, Dialogo } from "@/components/ui";
import { guardarCarpeta, moverProyecto, type ResultadoFicha } from "@/lib/proyectos/acciones-ficha";
import { MOTIVOS_PERDIDA } from "@/lib/proyectos/gestion-core";
import { campo } from "../_vista";
import { useToastSiHay } from "../../ToastProvider";

const campoEnLinea = "min-h-11 min-w-0 rounded-lg border border-line bg-surface px-3 text-sm text-strong";

/** Clave aleatoria URL-safe (32 caracteres) para un envío. */
export function nuevaClave(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * Un <form> de acción de servidor que dice qué falló sin perder lo tipeado. Con `limpiar`, vacía los campos si salió bien.
 * Se envía con `onSubmit` y no con `action`: React 19 vacía un <form action> al terminar, también cuando falló, y el medio
 * volvía a «Transferencia» con el monto borrado: un pago en efectivo podía quedar como transferencia (recorrido del PR #166 · 4).
 * Con `claveDeEnvio`, cada envío lleva `claveEnvio`: la misma hasta que el servidor contesta (un doble clic o un reintento
 * después de un corte repiten la clave y el servidor graba una sola vez); con respuesta, el próximo envío lleva otra.
 */
export function FormAccion({ accion, className, children, limpiar, alGuardar, claveDeEnvio }: { accion: (fd: FormData) => Promise<ResultadoFicha>; className?: string; children: ReactNode; limpiar?: boolean; alGuardar?: () => void; claveDeEnvio?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  // El servidor no grabó y pide un sí explícito (p. ej. un cobro igual a uno de recién): el texto de la casilla.
  const [confirmar, setConfirmar] = useState<string | null>(null);
  // MIA-203: el sí es un botón que reenvía este mismo formulario (la misma clave `envio`) con `confirmaRepetido=1`.
  const [reenviar, setReenviar] = useState<string | null>(null);
  const [enCurso, iniciar] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const clave = useRef<string | null>(null);
  const toast = useToastSiHay();
  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (enCurso) return;
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    if (claveDeEnvio) fd.set("claveEnvio", (clave.current ??= nuevaClave()));
    iniciar(async () => {
      setError(null);
      try {
        const r = await accion(fd);
        // El servidor contestó (bien o mal): el próximo envío es otro. Si la llamada se cortó, la clave queda.
        if (claveDeEnvio) clave.current = null;
        if (!r.ok) {
          setConfirmar(r.confirmar ?? null);
          setReenviar(r.reenviar ?? null);
          return setError(r.error);
        }
        setConfirmar(null);
        setReenviar(null);
        // El éxito va en un aviso flotante: el renglón que lo pidió (la cuota marcada) suele desaparecer al refrescar.
        if (r.listo) toast?.showSuccess(r.listo);
        if (limpiar) form.current?.reset();
        alGuardar?.();
      } catch {
        setError("No se pudo guardar. Revisá la conexión y probá de nuevo.");
      }
    });
  };
  return (
    <EnvioEnCurso.Provider value={enCurso}>
      <form ref={form} className={className} onSubmit={enviar} aria-busy={enCurso || undefined}>
        {children}
        {error && <p role="alert" className="col-span-full basis-full text-sm font-medium text-danger">{error}</p>}
        {confirmar && (
          <label className="col-span-full flex min-h-11 basis-full items-center gap-2 text-sm text-strong">
            <input type="checkbox" name="confirmaRepetido" value="1" className="size-5" />
            {confirmar}
          </label>
        )}
        {reenviar && (
          <button type="submit" name="confirmaRepetido" value="1" disabled={enCurso} className={cn(buttonClasses("solid", "md"), "col-span-full min-h-11 basis-full")}>
            {reenviar}
          </button>
        )}
      </form>
    </EnvioEnCurso.Provider>
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
        <p className="text-sm text-danger">{motivo?.startsWith("Cancelado: ") ? motivo : `Perdido${motivo ? `: ${motivo}` : ""}`}</p>
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
