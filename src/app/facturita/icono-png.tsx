// FACTOQUE · PNG del ícono (marca F06-A sobre papel) generado con next/og (ImageResponse) desde el SVG fuente único
// (src/lib/factoque-icono.ts). Lo usan las rutas /facturita/icon-*.png y apple-touch-icon.png:
// las URLs son las mismas de antes (manifiesto, service worker), pero ya no hay binarios en Git.

import { ImageResponse } from "next/og";
import { dataUriFactoque } from "@/lib/factoque-icono";

export function pngFactoque(lado: number, opciones?: { zonaSegura?: boolean }): ImageResponse {
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element -- Satori sólo entiende <img>
    <img src={dataUriFactoque(opciones)} width={lado} height={lado} alt="" />,
    {
      width: lado,
      height: lado,
      headers: { "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" },
    },
  );
}
