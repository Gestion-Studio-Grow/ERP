"use client";

// Piezas de cliente del taller: enviar por WhatsApp con el texto editable, copiar un link y
// sacar fotos achicadas en el teléfono (para que suban con mala señal y no cuesten nada).

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses, cn } from "@/components/ui";
import { waLink } from "@/lib/taller/core";
import { agregarFoto } from "@/lib/taller/acciones";
import SubmitButton from "@/components/SubmitButton";

/**
 * Un toque abre WhatsApp con el mensaje armado. "Editar" despliega el texto para retocarlo antes.
 * `alEnviar` deja asentado que se mandó (presupuesto enviado, aviso enviado, reseña pedida).
 */
export function EnviarWhatsApp({
  telefono,
  texto,
  etiqueta = "Enviar por WhatsApp",
  alEnviar,
  variante = "solid",
  chico,
}: {
  telefono: string | null | undefined;
  texto: string;
  etiqueta?: string;
  alEnviar?: () => Promise<unknown>;
  variante?: "solid" | "outline";
  chico?: boolean;
}) {
  // Mientras no lo retoquen a mano, el mensaje sigue al texto armado (cambia si cambia el total).
  const [editado, setEditado] = useState<string | null>(null);
  const mensaje = editado ?? texto;
  const [editando, setEditando] = useState(false);
  const [, iniciar] = useTransition();
  const router = useRouter();
  const href = waLink(telefono, mensaje);

  if (!href) {
    return <p className="text-sm text-muted">Sin teléfono cargado: no se puede enviar por WhatsApp.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            if (alEnviar) iniciar(async () => { await alEnviar(); router.refresh(); });
          }}
          className={cn(buttonClasses(variante, chico ? "md" : "lg"), "flex-1 justify-center")}
        >
          {etiqueta}
        </a>
        <button type="button" onClick={() => setEditando((v) => !v)} className={buttonClasses("ghost", chico ? "md" : "lg")} aria-expanded={editando}>
          {editando ? "Cerrar" : "Editar"}
        </button>
      </div>
      {editando && (
        <textarea
          value={mensaje}
          onChange={(e) => setEditado(e.target.value)}
          rows={5}
          aria-label="Mensaje de WhatsApp"
          className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-strong"
        />
      )}
    </div>
  );
}

export function CopiarLink({ url, etiqueta = "Copiar link" }: { url: string; etiqueta?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className={buttonClasses("outline", "md")}
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
      {copiado ? "¡Copiado!" : etiqueta}
    </button>
  );
}

/** Achica una foto a JPEG de 1024 px de lado mayor (~100 KB). Devuelve un data URL. */
export async function achicarFoto(file: File, lado = 1024, calidad = 0.62): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", calidad);
}

/** Botón grande de cámara. Sube de a una: si se corta la señal, las que entraron quedan. */
export function SubirFotos({ ordenId, momento, etiqueta = "Sacar foto" }: { ordenId: string; momento: "INGRESO" | "TRABAJO" | "ENTREGA"; etiqueta?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<string | null>(null);
  const router = useRouter();

  async function subir(files: FileList | null) {
    if (!files?.length) return;
    let ok = 0;
    for (const f of Array.from(files)) {
      setEstado(`Subiendo ${ok + 1} de ${files.length}…`);
      try {
        const r = await agregarFoto(ordenId, await achicarFoto(f), momento);
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

  return (
    <div className="flex flex-col gap-1">
      <input ref={input} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => subir(e.target.files)} />
      <button type="button" className={buttonClasses("outline", "lg")} onClick={() => input.current?.click()} disabled={estado?.startsWith("Subiendo")}>
        📷 {etiqueta}
      </button>
      {estado && <p role="status" className="text-sm text-muted">{estado}</p>}
    </div>
  );
}

/** Botón de envío con la forma de la casa (SubmitButton no trae clases propias). */
export function BotonEnviar({
  children,
  pendingText,
  variant = "solid",
  size = "lg",
  className,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "solid" | "outline" | "ghost" | "danger" | "subtle";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <SubmitButton pendingText={pendingText} variant={variant} size={size} className={cn(buttonClasses(variant, size), className)}>
      {children}
    </SubmitButton>
  );
}
