"use client";

// Ajustes → Buscador de profes: la zona (se guarda al salir del campo) y «Aparecer en el buscador»
// (se guarda con el toque). Los dos van juntos a `guardarDirectorio`,
// que valida en el servidor (src/lib/padel/directorio.ts). Si falla, el chip vuelve a lo de antes.

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/components/ui";
import { guardarDirectorio } from "@/lib/padel/acciones-config";
import type { Directorio } from "@/lib/padel/directorio";
import { ZONA_MAX } from "@/lib/padel/directorio";
import { useToast } from "../../../ToastProvider";
import { campo, chipEleccion, rotulo } from "../_estilos";

export function EditorDirectorio({ inicial }: { inicial: Directorio }) {
  const id = useId();
  const router = useRouter();
  const { showSuccess } = useToast();
  const [d, setD] = useState<Directorio>(inicial);
  const [zona, setZona] = useState(inicial.zona);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();

  const guardar = (nuevo: Directorio) => {
    const antes = d;
    setD(nuevo);
    start(async () => {
      setError(null);
      try {
        const r = await guardarDirectorio(nuevo);
        if (!r.ok) {
          setError(r.error);
          setD(antes);
          setZona(antes.zona);
          return;
        }
        setD(r.valor);
        setZona(r.valor.zona);
        showSuccess("Guardado");
        router.refresh();
      } catch {
        setError("No pudimos guardar. Revisá la conexión y probá de nuevo.");
        setD(antes);
        setZona(antes.zona);
      }
    });
  };

  return (
    <div className="grid gap-5" aria-busy={pendiente}>
      <div>
        <label htmlFor={`${id}-zona`} className={rotulo}>Zona</label>
        <input
          id={`${id}-zona`}
          type="text"
          value={zona}
          maxLength={ZONA_MAX}
          placeholder="Ej. Canning"
          autoComplete="off"
          onChange={(e) => setZona(e.target.value)}
          onBlur={() => {
            if (zona.trim() !== d.zona) guardar({ ...d, zona });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          aria-describedby={`${id}-zona-ayuda`}
          className={campo}
          data-qa="directorio-zona"
        />
        <p id={`${id}-zona-ayuda`} className="mt-1 text-sm text-muted">El barrio o la localidad donde das clase. La gente filtra por acá.</p>
      </div>

      <fieldset>
        <legend className={rotulo}>Aparecer en el buscador de profes</legend>
        <p className="-mt-0.5 mb-2 text-sm text-muted">Sale tu nombre, tu zona, tus clubes, tu precio y tus próximos horarios libres. Nunca los datos de tus alumnos.</p>
        <div role="radiogroup" aria-label="Aparecer en el buscador de profes" className="flex flex-wrap gap-2">
          {[
            { valor: true, rotulo: "Sí, quiero aparecer" },
            { valor: false, rotulo: "No" },
          ].map((o) => (
            <button
              key={String(o.valor)}
              type="button"
              role="radio"
              aria-checked={d.visible === o.valor}
              disabled={pendiente}
              onClick={() => d.visible !== o.valor && guardar({ ...d, zona, visible: o.valor })}
              className={chipEleccion}
              data-qa={`directorio-visible-${o.valor ? "si" : "no"}`}
            >
              {o.rotulo}
            </button>
          ))}
        </div>
      </fieldset>


      <p role={error ? "alert" : "status"} className={cn("min-h-5 text-sm", error ? "font-semibold text-danger" : "text-muted")} data-qa="directorio-estado">
        {error ?? (pendiente ? "Guardando…" : "")}
      </p>
    </div>
  );
}
