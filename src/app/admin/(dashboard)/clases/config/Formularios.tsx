"use client";

import { useState, useTransition } from "react";
import { buttonClasses, cn } from "@/components/ui";
import { agregarBloqueo, guardarConfig, guardarHorarios, quitarBloqueo } from "@/lib/padel/acciones";

const campo = "h-12 w-full rounded-xl border border-line bg-surface-raised px-3 text-base text-strong";
const rotulo = "mb-1 block text-sm font-semibold text-strong";

function useGuardar() {
  const [pendiente, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const correr = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, listo = "Guardado") =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, texto: listo } : { ok: false, texto: r.error });
    });
  return { pendiente, msg, correr };
}

function Mensaje({ msg }: { msg: { ok: boolean; texto: string } | null }) {
  if (!msg) return null;
  return (
    <p role={msg.ok ? "status" : "alert"} className="text-sm font-semibold" style={{ color: msg.ok ? "var(--success)" : "var(--danger)" }}>
      {msg.ok ? "✓ " : ""}{msg.texto}
    </p>
  );
}

export function CopiarLink({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className={cn(buttonClasses("outline", "md"), "w-full sm:w-auto")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        } catch {
          window.prompt("Copiá el link:", url);
        }
      }}
    >
      {copiado ? "¡Copiado!" : "Copiar link"}
    </button>
  );
}

export function FormHorarios({ dias, valores }: { dias: string[]; valores: string[] }) {
  const { pendiente, msg, correr } = useGuardar();
  return (
    <form action={(fd) => correr(() => guardarHorarios(fd), "Horarios guardados")} className="grid gap-3">
      {dias.map((d, i) => (
        <div key={d} className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
          <label htmlFor={`dia-${i}`} className="text-sm font-semibold text-strong">{d}</label>
          <input id={`dia-${i}`} name={`dia_${i}`} defaultValue={valores[i]} placeholder="no doy clases" className={campo} data-qa={`dia-${i}`} />
        </div>
      ))}
      <button type="submit" disabled={pendiente} className={cn(buttonClasses("solid", "lg"), "w-full")} data-qa="guardar-horarios">
        {pendiente ? "Guardando…" : "Guardar horarios"}
      </button>
      <Mensaje msg={msg} />
    </form>
  );
}

export function FormBloqueo() {
  const { pendiente, msg, correr } = useGuardar();
  return (
    <form action={(fd) => correr(() => agregarBloqueo(fd), "Día bloqueado")} className="grid gap-3">
      <div>
        <label htmlFor="bl-fecha" className={rotulo}>Día</label>
        <input id="bl-fecha" name="fecha" type="date" className={campo} required data-qa="bloqueo-fecha" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="bl-desde" className={rotulo}>Desde (opcional)</label>
          <input id="bl-desde" name="desde" type="time" className={campo} />
        </div>
        <div>
          <label htmlFor="bl-hasta" className={rotulo}>Hasta (opcional)</label>
          <input id="bl-hasta" name="hasta" type="time" className={campo} />
        </div>
      </div>
      <button type="submit" disabled={pendiente} className={cn(buttonClasses("outline", "lg"), "w-full")} data-qa="bloquear">
        {pendiente ? "Bloqueando…" : "Bloquear"}
      </button>
      <Mensaje msg={msg} />
    </form>
  );
}

export function QuitarBloqueo({ id }: { id: string }) {
  const [pendiente, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      className="h-11 text-sm text-muted underline"
      onClick={() =>
        start(async () => {
          const fd = new FormData();
          fd.set("id", id);
          await quitarBloqueo(fd);
        })
      }
    >
      Quitar
    </button>
  );
}

interface ConfigVista {
  duracionMin: number;
  precioIndividual: number;
  precioGrupal: number;
  aliasCbu: string;
  titularCuenta: string;
  anticipacionMin: number;
  diasAdelante: number;
  maxPendientesPorTel: number;
  whatsappProfe: string;
  plantillas: Record<string, string>;
}

export function FormConfig({ config, claves }: { config: ConfigVista; claves: { clave: string; label: string }[] }) {
  const { pendiente, msg, correr } = useGuardar();
  return (
    <form action={(fd) => correr(() => guardarConfig(fd))} className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="c-ind" className={rotulo}>Clase individual ($)</label>
          <input id="c-ind" name="precioIndividual" inputMode="decimal" defaultValue={config.precioIndividual || ""} className={campo} data-qa="precio-individual" />
        </div>
        <div>
          <label htmlFor="c-gru" className={rotulo}>Grupal, por persona ($)</label>
          <input id="c-gru" name="precioGrupal" inputMode="decimal" defaultValue={config.precioGrupal || ""} placeholder="vacío = no doy grupales" className={campo} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="c-dur" className={rotulo}>Duración (min)</label>
          <input id="c-dur" name="duracionMin" type="number" min={30} max={180} step={15} defaultValue={config.duracionMin} className={campo} />
        </div>
        <div>
          <label htmlFor="c-ant" className={rotulo}>Anticipación mínima (min)</label>
          <input id="c-ant" name="anticipacionMin" type="number" min={0} max={2880} step={30} defaultValue={config.anticipacionMin} className={campo} aria-describedby="c-ant-ayuda" />
          <p id="c-ant-ayuda" className="mt-1 text-xs text-muted">En minutos: 120 = 2 horas.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="c-alias" className={rotulo}>Alias o CBU</label>
          <input id="c-alias" name="aliasCbu" defaultValue={config.aliasCbu} autoComplete="off" className={campo} data-qa="alias" />
        </div>
        <div>
          <label htmlFor="c-tit" className={rotulo}>Titular de la cuenta</label>
          <input id="c-tit" name="titularCuenta" defaultValue={config.titularCuenta} autoComplete="off" className={campo} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="c-wa" className={rotulo}>Tu celular (WhatsApp)</label>
          <input id="c-wa" name="whatsappProfe" type="tel" inputMode="tel" defaultValue={config.whatsappProfe} placeholder="11 5555-1234" className={campo} data-qa="whatsapp-profe" />
        </div>
        <div>
          <label htmlFor="c-dias" className={rotulo}>Días que muestra el turnero</label>
          <input id="c-dias" name="diasAdelante" type="number" min={1} max={60} defaultValue={config.diasAdelante} className={campo} />
        </div>
      </div>
      <div>
        <label htmlFor="c-max" className={rotulo}>Pedidos sin confirmar por alumno</label>
        <input id="c-max" name="maxPendientesPorTel" type="number" min={1} max={10} defaultValue={config.maxPendientesPorTel} className={campo} />
      </div>
      <details className="rounded-xl border border-line p-3">
        <summary className="min-h-11 cursor-pointer text-sm font-semibold text-strong">Los textos de WhatsApp</summary>
        <p className="mb-3 mt-1 text-xs text-muted">Podés usar {"{nombre}"}, {"{dia}"}, {"{hora}"}, {"{precio}"}, {"{alias}"}, {"{link}"}, {"{turnero}"} y {"{profe}"}.</p>
        <div className="grid gap-3">
          {claves.map(({ clave, label }) => (
            <div key={clave}>
              <label htmlFor={`p-${clave}`} className={rotulo}>{label}</label>
              <textarea id={`p-${clave}`} name={`plantilla_${clave}`} defaultValue={config.plantillas[clave]} rows={3} className="w-full rounded-xl border border-line bg-surface-raised p-3 text-base text-strong" />
            </div>
          ))}
        </div>
      </details>
      <button type="submit" disabled={pendiente} className={cn(buttonClasses("solid", "lg"), "w-full")} data-qa="guardar-config">
        {pendiente ? "Guardando…" : "Guardar"}
      </button>
      <Mensaje msg={msg} />
    </form>
  );
}
