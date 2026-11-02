"use client";

// Subir una versión desde la grilla: sobre una pieza que ya existe o abriendo una nueva. La imagen se achica en el navegador.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses, cn } from "@/components/ui";
import { subirVersionDiseno } from "@/lib/proyectos/acciones-diseno";
import { achicar } from "./[id]/_piezas";
import { campo, etiqueta } from "./_vista";

const NUEVA = "__nueva";

export function SubirVersionDiseno({ proyectoId, piezas }: { proyectoId: string; piezas: readonly { id: string; nombre: string; hayBorrador: boolean }[] }) {
  const [pieza, setPieza] = useState(piezas[0]?.id ?? NUEVA);
  const [nombre, setNombre] = useState("");
  const [nota, setNota] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const esNueva = pieza === NUEVA;
  const elegida = piezas.find((p) => p.id === pieza);
  const faltaNombre = esNueva && !nombre.trim();

  const guardar = async (contenido: { datos?: string; url?: string }) => {
    try {
      const r = await subirVersionDiseno({ proyectoId, entregableId: esNueva ? null : pieza, nombreNuevo: nombre, nota, ...contenido });
      if (!r.ok) return setError(r.error);
      setNombre("");
      setNota("");
      setLink("");
      setPieza(r.entregableId);
      router.refresh();
    } catch {
      setError("No se pudo guardar. Revisá la conexión y probá de nuevo.");
    }
  };

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={etiqueta}>
          Pieza
          <select value={pieza} onChange={(e) => setPieza(e.target.value)} className={campo}>
            {piezas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            <option value={NUEVA}>Pieza nueva…</option>
          </select>
        </label>
        {esNueva && <label className={etiqueta}>Nombre de la pieza<input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} placeholder="Render del escenario" className={campo} /></label>}
      </div>
      <label className={etiqueta}>Nota (opcional)<input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} placeholder="Qué cambió en esta versión" className={campo} /></label>
      <label className={etiqueta}>
        Imagen
        <input
          ref={entrada}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={ocupado || faltaNombre}
          className="min-h-11 w-full min-w-0 text-sm"
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
      </label>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input value={link} onChange={(e) => setLink(e.target.value)} aria-label="Link de la versión, para video o PDF" placeholder="O el link de lo pesado: https://…" inputMode="url" className={campo} />
        <button
          type="button"
          disabled={ocupado || !link.trim() || faltaNombre}
          className={cn(buttonClasses("outline", "md"), "justify-center")}
          onClick={() => {
            setError(null);
            iniciar(() => guardar({ url: link }));
          }}
        >
          Guardar link
        </button>
      </div>
      {faltaNombre && <p className="text-sm text-muted">Escribí el nombre de la pieza para poder subir.</p>}
      {elegida?.hayBorrador && <p className="text-sm text-muted">Reemplaza al borrador de esa pieza; sus comentarios quedan como generales y la revisión vuelve a empezar.</p>}
      {ocupado && <p className="text-sm text-muted">Guardando…</p>}
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}
