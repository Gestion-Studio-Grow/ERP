"use client";

// Piezas de cliente de la inmobiliaria: el formulario que muestra el error de la acción, el
// botón de responder por WhatsApp (que frena el reloj de la consulta), la subida de fotos
// achicadas en el teléfono y la bajada de índices oficiales.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses, cn } from "@/components/ui";
import { waLink } from "@/lib/inmobiliaria/core";
import { agregarFotoPropiedad, marcarRespondida, traerIndicesOficiales, type Resultado } from "@/lib/inmobiliaria/acciones";
// Achicar una foto en el teléfono y el botón de envío con la forma de la casa ya existen.
import { achicarFoto, BotonEnviar } from "../taller/_piezas";

export { BotonEnviar };

/**
 * Formulario para una acción que puede decir que no: muestra el motivo (role="alert") y, si
 * sale bien, refresca o va a `irA` ("{id}" se reemplaza por el id que devuelve la acción).
 */
export function FormAccion({
  accion,
  children,
  className,
  irA,
  mensajeOk,
  vaciar,
  confirmar,
}: {
  accion: (form: FormData) => Promise<Resultado<{ id?: string; aviso?: string }>>;
  children: React.ReactNode;
  className?: string;
  irA?: string;
  mensajeOk?: string;
  /** Limpia el formulario cuando sale bien (para cargar otro). */
  vaciar?: boolean;
  /** Pregunta antes de enviar (acciones que no tienen vuelta fácil). */
  confirmar?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  return (
    <form
      ref={form}
      className={className}
      action={async (datos) => {
        if (confirmar && !window.confirm(confirmar)) return;
        setError(null);
        setOk(null);
        try {
          const r = await accion(datos);
          if (!r.ok) {
            setError(r.error);
            return;
          }
          if (irA) {
            router.push(irA.replace("{id}", r.id ?? ""));
            return;
          }
          if (vaciar) form.current?.reset();
          setOk([mensajeOk, r.aviso].filter(Boolean).join(" ") || null);
          router.refresh();
        } catch {
          setError("Se cortó la conexión. Probá de nuevo.");
        }
      }}
    >
      {children}
      {error && (
        <p role="alert" className="mt-2 rounded-xl border border-line px-3 py-2 text-sm font-medium text-strong" style={{ background: "var(--danger-soft, var(--warning-soft))" }}>
          {error}
        </p>
      )}
      {ok && (
        <p role="status" className="mt-2 text-sm font-medium" style={{ color: "var(--success)" }}>
          {ok}
        </p>
      )}
    </form>
  );
}

/**
 * Abre WhatsApp con la respuesta armada (editable antes de mandar) y deja asentado que la
 * consulta se respondió: ahí se frena el reloj y la consulta queda a nombre de quien respondió.
 */
export function Responder({ consultaId, telefono, texto, chico }: { consultaId: string; telefono: string; texto: string; chico?: boolean }) {
  const [editado, setEditado] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [, iniciar] = useTransition();
  const router = useRouter();
  const mensaje = editado ?? texto;
  const href = waLink(telefono, mensaje);
  if (!href) return <p className="text-sm text-muted">Sin teléfono: respondé por mail o llamá.</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => iniciar(async () => { await marcarRespondida(consultaId); router.refresh(); })}
          className={cn(buttonClasses("solid", chico ? "md" : "lg"), "flex-1 justify-center")}
        >
          Responder por WhatsApp
        </a>
        <button type="button" onClick={() => setEditando((v) => !v)} className={buttonClasses("ghost", chico ? "md" : "lg")} aria-expanded={editando}>
          {editando ? "Cerrar" : "Editar"}
        </button>
      </div>
      {editando && (
        <textarea value={mensaje} onChange={(e) => setEditado(e.target.value)} rows={4} aria-label="Mensaje de WhatsApp" className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-strong" />
      )}
    </div>
  );
}

/** Abre WhatsApp con un mensaje armado, sin asentar nada. */
export function Avisar({ telefono, texto, etiqueta = "Avisar por WhatsApp" }: { telefono: string; texto: string; etiqueta?: string }) {
  const href = waLink(telefono, texto);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "md")}>
      {etiqueta}
    </a>
  );
}

/** Sube fotos de a una, achicadas en el teléfono: si se corta la señal, las que entraron quedan. */
export function SubirFotosPropiedad({ propiedadId }: { propiedadId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const router = useRouter();

  async function subir(files: FileList | null) {
    if (!files?.length) return;
    let ok = 0;
    for (const f of Array.from(files)) {
      setEstado(`Subiendo ${ok + 1} de ${files.length}…`);
      try {
        const r = await agregarFotoPropiedad(propiedadId, await achicarFoto(f, 1600, 0.7));
        if (!r.ok) {
          setEstado(r.error);
          router.refresh();
          return;
        }
        ok++;
      } catch {
        setEstado("Se cortó la conexión. Las fotos que entraron quedaron guardadas; probá de nuevo con las que faltan.");
        router.refresh();
        return;
      }
    }
    setEstado(null);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  async function porLink() {
    if (!link.trim()) return;
    const r = await agregarFotoPropiedad(propiedadId, link.trim());
    setEstado(r.ok ? null : r.error);
    if (r.ok) setLink("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => subir(e.target.files)} />
      <button type="button" className={buttonClasses("solid", "lg")} onClick={() => input.current?.click()} disabled={estado?.startsWith("Subiendo")}>
        Subir fotos
      </button>
      <div className="flex gap-2">
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="…o pegá el link de una foto (https://)"
          aria-label="Link de una foto"
          className="h-11 min-w-0 flex-1 rounded-md border border-line bg-surface-raised px-3 text-sm text-strong"
        />
        <button type="button" className={buttonClasses("outline", "md")} onClick={porLink}>
          Agregar
        </button>
      </div>
      {estado && (
        <p role="status" className="text-sm text-muted">
          {estado}
        </p>
      )}
    </div>
  );
}

/** Baja el ICL del Banco Central y el IPC del INDEC y dice cuántos valores entraron. */
export function BajarIndices() {
  const [estado, setEstado] = useState<string | null>(null);
  const [bajando, iniciar] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className={buttonClasses("solid", "lg")}
        disabled={bajando}
        onClick={() =>
          iniciar(async () => {
            setEstado("Consultando al Banco Central y al INDEC…");
            try {
              const r = await traerIndicesOficiales();
              setEstado(r.ok ? `Listo: ${r.icl} valores del ICL y ${r.ipc} del IPC. ${r.aviso}`.trim() : r.error);
            } catch {
              setEstado("No se pudo consultar. Revisá la conexión y probá de nuevo.");
            }
            router.refresh();
          })
        }
      >
        {bajando ? "Bajando…" : "Bajar los índices oficiales"}
      </button>
      {estado && (
        <p role="status" className="text-sm text-muted">
          {estado}
        </p>
      )}
    </div>
  );
}
