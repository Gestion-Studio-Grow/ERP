"use client";

// Subir una versión de la pieza: una imagen que se achica en el navegador, o el link de lo pesado (video, PDF).

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses, cn } from "@/components/ui";
import { subirVersion } from "@/lib/proyectos/acciones";
import { achicar } from "../../_piezas";
import { campo, etiqueta } from "../../../_vista";

export function SubirVersion({ entregableId, hayBorrador }: { entregableId: string; hayBorrador: boolean }) {
  const [nota, setNota] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const guardar = async (contenido: { datos?: string; url?: string }) => {
    try {
      const r = await subirVersion({ entregableId, nota, ...contenido });
      if (!r.ok) return setError(r.error);
      setNota("");
      setLink("");
      router.refresh();
    } catch {
      setError("No se pudo guardar. Revisá la conexión y probá de nuevo.");
    }
  };

  return (
    <div className="grid gap-3">
      <label className={etiqueta}>
        Nota para el cliente (opcional)
        <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} placeholder="Qué cambió en esta versión" className={campo} />
      </label>
      <div className="grid min-w-0 gap-1 text-sm font-medium text-strong">
        Imagen
        <input
          ref={entrada}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Elegir imagen de la versión"
          disabled={ocupado}
          className="w-full min-w-0 text-sm"
          onChange={(e) => {
            const a = e.target.files?.[0];
            if (!a) return;
            setError(null);
            iniciar(async () => {
              let datos: string | null = null;
              try {
                datos = await achicar(a);
              } catch {
                setError("No se pudo leer esa imagen. Probá con un JPG o PNG.");
              }
              if (datos) await guardar({ datos });
              if (entrada.current) entrada.current.value = "";
            });
          }}
        />
      </div>
      <p className="text-sm text-muted">Para video, PDF o algo pesado, pegá el link de tu nube:</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input value={link} onChange={(e) => setLink(e.target.value)} aria-label="Link de la versión" placeholder="https://…" inputMode="url" className={campo} />
        <button
          type="button"
          disabled={ocupado || !link.trim()}
          className={cn(buttonClasses("outline", "md"), "justify-center")}
          onClick={() => {
            setError(null);
            iniciar(() => guardar({ url: link }));
          }}
        >
          Guardar link
        </button>
      </div>
      {hayBorrador && <p className="text-sm text-muted">Lo que subas reemplaza al borrador de arriba.</p>}
      {ocupado && <p className="text-sm text-muted">Guardando…</p>}
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}
