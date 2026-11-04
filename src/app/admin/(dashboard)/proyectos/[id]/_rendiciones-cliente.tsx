"use client";

// Rendí: el formulario para rendir un gasto desde el teléfono (foto con la cámara de atrás) y los botones de revisión.
// Es de cliente para achicar la foto antes de mandarla y para decir qué faltó sin perder lo tipeado.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses, cn } from "@/components/ui";
import { aprobarRendicion, cerrarAnticipo, devolverRendicion, entregarAnticipo, rechazarRendicion, reintegrarDirecto, rendirGasto, type ResultadoRendicion } from "@/lib/proyectos/acciones-rendiciones";
import { MEDIO_LABEL } from "@/lib/proyectos/core";
import { formatearPesos } from "@/lib/rendiciones/dinero";
import { MEDIO_RENDICION_LABEL, MEDIOS_RENDICION, type MedioRendicion } from "@/lib/proyectos/rendiciones-core";
import { campo, etiqueta } from "../_vista";
import { achicar } from "./_piezas";

export function FormRendir({ proyectoId, hoy, anticipos }: { proyectoId: string; hoy: string; anticipos: readonly { id: string; montoCentavos: number; entregado: string }[] }) {
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [medio, setMedio] = useState<MedioRendicion>("PROPIO");
  const [achicando, setAchicando] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  // La clave del envío: el mismo envío dos veces (doble toque, reintento) es una sola rendición.
  const clave = useRef<string | null>(null);
  const router = useRouter();

  return (
    <form
      ref={form}
      className="grid gap-3"
      action={(fd) =>
        iniciar(async () => {
          setError(null);
          setListo(null);
          if (!foto) return setError("Sacale una foto al comprobante (o subila de la galería).");
          clave.current ??= crypto.randomUUID();
          fd.set("clave", clave.current);
          fd.set("foto", foto);
          const r = await rendirGasto(fd);
          if (!r.ok) return setError(r.error);
          clave.current = null;
          form.current?.reset();
          setFoto(null);
          setMedio("PROPIO");
          setListo("Listo: tu rendición quedó para revisar. Te avisamos cuando la revisen.");
          router.refresh();
        })
      }
    >
      <input type="hidden" name="proyectoId" value={proyectoId} />
      <label className={etiqueta}>
        Foto del comprobante
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="block min-h-11 w-full text-sm text-strong file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:text-sm file:font-medium file:text-strong"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            setFoto(null);
            if (!f) return;
            setAchicando(true);
            try {
              setFoto(await achicar(f));
              setError(null);
            } catch {
              setError("No pudimos leer esa foto. Probá con otra.");
            } finally {
              setAchicando(false);
            }
          }}
        />
      </label>
      {achicando && <p className="text-sm text-muted">Preparando la foto…</p>}
      {foto && (
        // eslint-disable-next-line @next/next/no-img-element -- imagen local achicada en el navegador
        <img src={foto} alt="Vista previa del comprobante" width={160} height={160} className="h-40 w-40 rounded-lg border border-line object-cover" />
      )}
      <label className={etiqueta}>
        Qué pagaste
        <input name="descripcion" required maxLength={200} placeholder="Ej.: taxi al predio" className={campo} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={etiqueta}>
          Importe
          <input name="monto" required inputMode="decimal" placeholder="12.500" className={cn(campo, "tabular-nums")} />
        </label>
        <label className={etiqueta}>
          Fecha
          <input name="fecha" type="date" defaultValue={hoy} className={campo} />
        </label>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium text-strong">¿Cómo lo pagaste?</legend>
        {MEDIOS_RENDICION.map((m) => (
          <label key={m} className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm text-strong">
            <input type="radio" name="medio" value={m} checked={medio === m} onChange={() => setMedio(m)} disabled={m === "ANTICIPO" && anticipos.length === 0} className="size-5" />
            {MEDIO_RENDICION_LABEL[m]}
            {m === "ANTICIPO" && anticipos.length === 0 && <span className="text-muted">(no tenés anticipos abiertos)</span>}
          </label>
        ))}
      </fieldset>
      {medio === "ANTICIPO" && (
        <label className={etiqueta}>
          Anticipo
          <select name="anticipoId" required className={campo}>
            {anticipos.map((x) => (
              <option key={x.id} value={x.id}>{`${formatearPesos(x.montoCentavos)} · entregado el ${x.entregado}`}</option>
            ))}
          </select>
        </label>
      )}
      <input name="rubro" type="hidden" value="Rendición" />
      <button type="submit" disabled={ocupado || achicando} className={cn(buttonClasses("solid", "md"), "min-h-11 w-full")}>{ocupado ? "Enviando…" : "Enviar rendición"}</button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {listo && <p role="status" className="text-sm text-success">{listo}</p>}
    </form>
  );
}

const ACCION: Record<"aprobar" | "devolver" | "rechazar", (fd: FormData) => Promise<ResultadoRendicion>> = { aprobar: aprobarRendicion, devolver: devolverRendicion, rechazar: rechazarRendicion };

/** Aprobar va directo; devolver y rechazar piden el comentario (el motor lo exige). */
export function RevisarRendicion({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pide, setPide] = useState<"devolver" | "rechazar" | null>(null);
  const [ocupado, iniciar] = useTransition();
  const router = useRouter();
  const correr = (accion: "aprobar" | "devolver" | "rechazar", fd: FormData) =>
    iniciar(async () => {
      setError(null);
      fd.set("id", id);
      const r = await ACCION[accion](fd);
      if (!r.ok) return setError(r.error);
      setPide(null);
      router.refresh();
    });

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={ocupado} onClick={() => correr("aprobar", new FormData())} className={cn(buttonClasses("solid", "sm"), "min-h-11")}>Aprobar</button>
        <button type="button" disabled={ocupado} aria-expanded={pide === "devolver"} onClick={() => setPide(pide === "devolver" ? null : "devolver")} className={cn(buttonClasses("outline", "sm"), "min-h-11")}>Devolver</button>
        <button type="button" disabled={ocupado} aria-expanded={pide === "rechazar"} onClick={() => setPide(pide === "rechazar" ? null : "rechazar")} className={cn(buttonClasses("outline", "sm"), "min-h-11 text-danger")}>Rechazar</button>
      </div>
      {pide && (
        <form action={(fd) => correr(pide, fd)} className="grid gap-2">
          <label className={etiqueta}>
            {pide === "devolver" ? "Qué hay que corregir" : "Motivo del rechazo"}
            <textarea name="comentario" required maxLength={500} rows={2} className={cn(campo, "py-2")} />
          </label>
          <button type="submit" disabled={ocupado} className={cn(buttonClasses("solid", "sm"), "min-h-11")}>{pide === "devolver" ? "Devolver con el comentario" : "Rechazar y anular el gasto"}</button>
        </form>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

/** Elegir el medio de la plata que sale o entra. Transferencia primero: es lo habitual. */
function MedioDeCaja() {
  return (
    <label className={etiqueta}>
      Medio
      <select name="medio" defaultValue="TRANSFERENCIA" className={campo}>
        {(["TRANSFERENCIA", "EFECTIVO", "MERCADO_PAGO", "CHEQUE"] as const).map((m) => <option key={m} value={m}>{MEDIO_LABEL[m]}</option>)}
      </select>
    </label>
  );
}

/** Corre una acción de plata con un solo envío a la vez y muestra el error en criollo. */
function useAccionDePlata(accion: (fd: FormData) => Promise<ResultadoRendicion>, alTerminar?: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const router = useRouter();
  const correr = (fd: FormData) =>
    iniciar(async () => {
      setError(null);
      const r = await accion(fd);
      if (!r.ok) return setError(r.error);
      alTerminar?.();
      router.refresh();
    });
  return { error, ocupado, correr };
}

/** «Reintegrar ahora»: sin esperar la liquidación. Pide confirmar: es plata que sale de caja. */
export function ReintegrarAhora({ id, monto }: { id: string; monto: string }) {
  const [abierto, setAbierto] = useState(false);
  const { error, ocupado, correr } = useAccionDePlata(reintegrarDirecto, () => setAbierto(false));
  return (
    <div className="grid gap-2">
      <button type="button" aria-expanded={abierto} onClick={() => setAbierto(!abierto)} className={cn(buttonClasses("outline", "sm"), "min-h-11 justify-self-start")}>Reintegrar ahora</button>
      {abierto && (
        <form action={(fd) => { fd.set("id", id); correr(fd); }} className="grid gap-2">
          <MedioDeCaja />
          <button type="submit" disabled={ocupado} className={cn(buttonClasses("solid", "sm"), "min-h-11")}>{ocupado ? "Reintegrando…" : `Reintegrar ${monto} y asentarlo en caja`}</button>
        </form>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

export function EntregarAnticipo({ proyectoId, equipo }: { proyectoId: string; equipo: readonly { id: string; nombre: string }[] }) {
  const form = useRef<HTMLFormElement>(null);
  const clave = useRef<string | null>(null);
  const [listo, setListo] = useState(false);
  const { error, ocupado, correr } = useAccionDePlata(entregarAnticipo, () => {
    clave.current = null;
    form.current?.reset();
    setListo(true);
  });
  return (
    <form
      ref={form}
      className="mt-4 grid gap-3 border-t border-line pt-3 sm:grid-cols-2"
      action={(fd) => {
        setListo(false);
        clave.current ??= crypto.randomUUID();
        fd.set("clave", clave.current);
        fd.set("proyectoId", proyectoId);
        correr(fd);
      }}
    >
      <h3 className="font-medium text-strong sm:col-span-2">Entregar un anticipo</h3>
      <label className={etiqueta}>
        A quién
        <select name="personaId" required className={campo}>
          {equipo.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </label>
      <label className={etiqueta}>
        Importe
        <input name="monto" required inputMode="decimal" placeholder="50.000" className={cn(campo, "tabular-nums")} />
      </label>
      <MedioDeCaja />
      <button type="submit" disabled={ocupado} className={cn(buttonClasses("solid", "md"), "min-h-11 self-end")}>{ocupado ? "Entregando…" : "Entregar y asentar el egreso"}</button>
      {error && <p role="alert" className="text-sm text-danger sm:col-span-2">{error}</p>}
      {listo && <p role="status" className="text-sm text-success sm:col-span-2">Listo: el anticipo quedó entregado y el egreso, en caja.</p>}
    </form>
  );
}

export function CerrarAnticipo({ id }: { id: string }) {
  const [abierto, setAbierto] = useState(false);
  const { error, ocupado, correr } = useAccionDePlata(cerrarAnticipo, () => setAbierto(false));
  return (
    <div className="grid gap-2">
      <button type="button" aria-expanded={abierto} onClick={() => setAbierto(!abierto)} className={cn(buttonClasses("outline", "sm"), "min-h-11 justify-self-start")}>Cerrar anticipo</button>
      {abierto && (
        <form action={(fd) => { fd.set("id", id); correr(fd); }} className="grid gap-2">
          <MedioDeCaja />
          <button type="submit" disabled={ocupado} className={cn(buttonClasses("solid", "sm"), "min-h-11")}>{ocupado ? "Cerrando…" : "Cerrar con la cuadratura"}</button>
        </form>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
