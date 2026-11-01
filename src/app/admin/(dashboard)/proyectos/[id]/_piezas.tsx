"use client";

// Piezas de cliente de la ficha: subir imágenes achicadas, guardar un link, abrir un stand nuevo y
// copiar el link de la propuesta.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses, cn } from "@/components/ui";
import { agregarArchivo, crearStand } from "@/lib/proyectos/acciones";

const campo = "min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-strong";
const TIPOS = [["RENDER", "Render"], ["DISENO", "Diseño"], ["PLANO", "Plano"], ["REFERENCIA", "Referencia"], ["OTRO", "Otro"]];

/** El render se achica en el navegador: 2000 px bastan para mostrarlo y entra en la base sin pagar almacenamiento aparte. */
async function achicar(archivo: File, lado = 2000, calidad = 0.82): Promise<string> {
  const img = await createImageBitmap(archivo);
  const f = Math.min(1, lado / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * f);
  c.height = Math.round(img.height * f);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  img.close();
  return c.toDataURL("image/jpeg", calidad);
}

export function SubirArchivo({ proyectoId }: { proyectoId: string }) {
  const [tipo, setTipo] = useState("RENDER");
  const [link, setLink] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const fin = (r: { ok: true } | { ok: false; error: string }) => {
    if (r.ok) {
      setLink("");
      setNombre("");
      router.refresh();
    } else setError(r.error);
  };

  return (
    <div className="grid gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-strong">
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={campo}>
            {TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <div className="grid gap-1 text-sm font-medium text-strong">
          Imagen
          <input
            ref={entrada}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Elegir imagen"
            disabled={ocupado}
            className="text-sm"
            onChange={(e) => {
              const a = e.target.files?.[0];
              if (!a) return;
              setError(null);
              iniciar(async () => {
                try {
                  fin(await agregarArchivo({ proyectoId, tipo, nombre: a.name, datos: await achicar(a), visibleCliente: tipo === "RENDER" }));
                } catch {
                  setError("No se pudo leer esa imagen.");
                }
                if (entrada.current) entrada.current.value = "";
              });
            }}
          />
        </div>
      </div>
      <p className="text-sm text-muted">Para PDF, planos pesados o video, pegá el link de tu nube:</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label="Nombre del archivo" placeholder="Nombre" maxLength={120} className={campo} />
        <input value={link} onChange={(e) => setLink(e.target.value)} aria-label="Link del archivo" placeholder="https://…" inputMode="url" className={campo} />
        <button
          type="button"
          disabled={ocupado || !link.trim()}
          className={buttonClasses("outline", "md")}
          onClick={() => {
            setError(null);
            iniciar(async () => fin(await agregarArchivo({ proyectoId, tipo, nombre, url: link })));
          }}
        >
          Guardar link
        </button>
      </div>
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}

export function BotonNuevoStand({ proyectoId }: { proyectoId: string }) {
  const [ocupado, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <>
      <button
        type="button"
        disabled={ocupado}
        className={cn(buttonClasses("solid", "md"), "justify-center")}
        onClick={() =>
          iniciar(async () => {
            const fd = new FormData();
            fd.set("proyectoId", proyectoId);
            const r = await crearStand(fd);
            if (r.ok) router.push(`/admin/proyectos/${r.proyectoId}/stand/${r.id}`);
            else setError(r.error);
          })
        }
      >
        {ocupado ? "Abriendo…" : "+ Armar stand en 3D"}
      </button>
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
    </>
  );
}

export function CopiarLink({ ruta }: { ruta: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className={buttonClasses("outline", "md")}
      onClick={async () => {
        await navigator.clipboard.writeText(`${window.location.origin}${ruta}`);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      }}
    >
      {copiado ? "Copiado" : "Copiar link"}
    </button>
  );
}
