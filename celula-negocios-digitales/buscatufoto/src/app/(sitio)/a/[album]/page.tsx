import type { Metadata } from "next";
import { RutaAlbum } from "@/components/rutas";

export const metadata: Metadata = {
  title: "Álbum",
  description: "Buscá tus fotos por número, elegí las que te gusten y descargalas.",
};

// Exportación estática: se genera una sola página comodín; el álbum se lee de la URL (src/lib/ruta.ts).
export const dynamicParams = false;
export function generateStaticParams() {
  return [{ album: "_" }];
}

/** Álbum público. Los datos viven en el navegador (IndexedDB). */
export default function PaginaAlbum() {
  return <RutaAlbum />;
}
