"use client";

// Estudio: se pide una imagen en texto y se generan variantes. Sin servicio de imágenes conectado, se sube a mano y el resto del camino es igual.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { generarEnEstudio, subirAlEstudio } from "@/lib/proyectos/acciones-diseno";
import { sumarVariante, VARIANTES_ESTUDIO } from "@/lib/proyectos/diseno-core";
import { achicar } from "./[id]/_piezas";
import { campo, etiqueta } from "./_vista";

export function EstudioImagenes({ proyectoId, conectado, puedeGenerar, puedeSubir }: { proyectoId: string; conectado: boolean; puedeGenerar: boolean; puedeSubir: boolean }) {
  const [pedido, setPedido] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);
  const router = useRouter();

  return (
    <div className="grid gap-3">
      <label className={etiqueta}>
        Qué imagen querés
        <textarea
          value={pedido}
          onChange={(e) => setPedido(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Un escenario con arcos de luz para una gala de 300 invitados"
          className="w-full min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-strong"
        />
      </label>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Sumar una variante al pedido">
        {VARIANTES_ESTUDIO.map((v) => (
          <button key={v} type="button" onClick={() => setPedido(sumarVariante(pedido, v))} className="min-h-11 rounded-full border border-line bg-surface px-3 text-sm text-strong hover:bg-surface-raised">
            + {v}
          </button>
        ))}
      </div>
      {puedeGenerar && (
        <div>
          <Button
            disabled={ocupado || !conectado || !pedido.trim()}
            title={conectado ? undefined : "Falta conectar un servicio de imágenes"}
            onClick={() => {
              setError(null);
              iniciar(async () => {
                try {
                  const r = await generarEnEstudio({ proyectoId, pedido });
                  if (!r.ok) return setError(r.error);
                  router.refresh();
                } catch {
                  setError("El servicio de imágenes no respondió. Probá de nuevo.");
                }
              });
            }}
          >
            {ocupado ? "Un momento…" : "Generar"}
          </Button>
        </div>
      )}
      {puedeSubir && (
        <div className="grid gap-2 rounded-xl border border-line p-3">
          <p className="text-sm font-medium text-strong">Subir una imagen a mano</p>
          <label className={etiqueta}>Nombre (opcional)<input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={100} placeholder="Render de la entrada" className={campo} /></label>
          <label className={etiqueta}>
            Imagen
            <input
              ref={entrada}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={ocupado}
              className="min-h-11 w-full min-w-0 text-sm"
              onChange={(e) => {
                const a = e.target.files?.[0];
                if (!a) return;
                setError(null);
                iniciar(async () => {
                  try {
                    const datos = await achicar(a);
                    const r = await subirAlEstudio({ proyectoId, nombre: nombre || a.name, datos });
                    if (!r.ok) return setError(r.error);
                    setNombre("");
                    router.refresh();
                  } catch {
                    setError("No se pudo subir esa imagen. Probá con un JPG o PNG.");
                  } finally {
                    if (entrada.current) entrada.current.value = "";
                  }
                });
              }}
            />
          </label>
        </div>
      )}
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}
