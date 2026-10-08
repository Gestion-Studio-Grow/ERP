import type { Metadata } from "next";
import { Suspense } from "react";
import { AlbumDetalle } from "@/components/panel/AlbumDetalle";
import { Cargando } from "@/components/panel/comunes";

export const metadata: Metadata = { title: "Álbum" };

export const dynamicParams = false;
export function generateStaticParams() {
  return [{ id: "_" }];
}

/** El id y la sección se leen en el cliente (useParams / useSearchParams): los datos viven en el navegador. */
export default function Pagina() {
  return (
    <Suspense fallback={<Cargando texto="Abriendo el álbum…" />}>
      <AlbumDetalle />
    </Suspense>
  );
}
