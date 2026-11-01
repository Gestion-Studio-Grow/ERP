"use client";

// Piezas de cliente de la ficha: subir imágenes achicadas, guardar un link, abrir un stand nuevo y
// copiar el link de la propuesta.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses, cn } from "@/components/ui";
import { crearStand } from "@/lib/proyectos/acciones";
import { subirArchivoFicha } from "@/lib/proyectos/acciones-ficha";

const campo = "min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-strong";
const TIPOS = [["RENDER", "Render"], ["PLANO", "Plano"], ["PRESENTACION", "Presentación"], ["PRESUPUESTO", "Presupuesto"], ["CONTRATO", "Contrato"], ["OTRO", "Otro"]];

// Una acción del servidor recibe hasta 1 MB: lo que se manda tiene que entrar, con margen para el resto.
const TOPE_IMAGEN = 900_000;

/**
 * El render se achica en el navegador para entrar en la base sin pagar almacenamiento aparte: arranca en
 * 2000 px y baja calidad y tamaño hasta que entra, así una foto pesada también sube.
 */
export async function achicar(archivo: File): Promise<string> {
  const img = await createImageBitmap(archivo);
  try {
    for (const lado of [2000, 1600, 1280, 1024, 800]) {
      const f = Math.min(1, lado / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * f);
      c.height = Math.round(img.height * f);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      for (const calidad of [0.82, 0.7, 0.6]) {
        const datos = c.toDataURL("image/jpeg", calidad);
        if (datos.length <= TOPE_IMAGEN) return datos;
      }
    }
    throw new Error("no entra");
  } finally {
    img.close();
  }
}

/** Una imagen se achica; un PDF viaja tal cual, con su tope. */
export async function archivoADatos(a: File): Promise<string> {
  if (a.type !== "application/pdf") return achicar(a);
  if (a.size > 2_000_000) throw new Error("PDF pesado");
  return new Promise((listo, fallo) => {
    const r = new FileReader();
    r.onload = () => listo(String(r.result));
    r.onerror = () => fallo(new Error("PDF ilegible"));
    r.readAsDataURL(a);
  });
}

export function SubirArchivo({ proyectoId, itemId, alTerminar }: { proyectoId: string; itemId?: string; alTerminar?: () => void }) {
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
      alTerminar?.();
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
        <div className="grid min-w-0 gap-1 text-sm font-medium text-strong">
          Imagen o PDF
          <input
            ref={entrada}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            aria-label="Elegir imagen o PDF"
            disabled={ocupado}
            className="w-full min-w-0 text-sm"
            onChange={(e) => {
              const a = e.target.files?.[0];
              if (!a) return;
              setError(null);
              iniciar(async () => {
                let datos: string | null = null;
                try {
                  datos = await archivoADatos(a);
                } catch {
                  setError(a.type === "application/pdf" ? "El PDF pesa más de 2 MB o no se pudo leer. Pegá el link de tu nube." : "No se pudo leer esa imagen. Probá con un JPG o PNG.");
                }
                if (datos) {
                  try {
                    fin(await subirArchivoFicha({ proyectoId, tipo, nombre: a.name, datos, visibleCliente: tipo === "RENDER", itemId }));
                  } catch {
                    setError("No se pudo guardar el archivo. Revisá la conexión y probá de nuevo.");
                  }
                }
                if (entrada.current) entrada.current.value = "";
              });
            }}
          />
        </div>
      </div>
      <p className="text-sm text-muted">Para archivos de más de 2 MB, planos pesados o video, pegá el link de tu nube:</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label="Nombre del archivo" placeholder="Nombre" maxLength={120} className={campo} />
        <input value={link} onChange={(e) => setLink(e.target.value)} aria-label="Link del archivo" placeholder="https://…" inputMode="url" className={campo} />
        <button
          type="button"
          disabled={ocupado || !link.trim()}
          className={buttonClasses("outline", "md")}
          onClick={() => {
            setError(null);
            iniciar(async () => fin(await subirArchivoFicha({ proyectoId, tipo, nombre, url: link, itemId })));
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
