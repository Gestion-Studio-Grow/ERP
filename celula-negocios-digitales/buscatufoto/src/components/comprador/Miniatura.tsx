"use client";

import { useUrlBlob } from "@/lib/hooks";

/** Imagen desde un Blob del repositorio (siempre vistas marcadas: miniatura o vista previa). */
export function Miniatura({
  blob,
  alt,
  className,
  ancho,
  alto,
  ansiosa,
}: {
  blob: Blob;
  alt: string;
  className?: string;
  ancho?: number;
  alto?: number;
  /** true = sin lazy (portada, visor) */
  ansiosa?: boolean;
}) {
  const url = useUrlBlob(blob);
  if (!url) return <span className={className} aria-hidden />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Blob local de IndexedDB: next/image no aplica.
    <img
      src={url}
      alt={alt}
      width={ancho}
      height={alto}
      loading={ansiosa ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      className={className}
    />
  );
}
