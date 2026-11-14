// GSG · PNG de los íconos de app genéricos (/gsg/icon-192.png, /gsg/icon-512.png), generados con next/og desde la
// fuente única de la marca (src/lib/gsg/marca-svg.ts): el isotipo v10 «Doble G» sobre papel. Las URLs son las de
// siempre (src/lib/terminal/manifest-core.ts las usa en los manifiestos de las terminales), pero sin binarios en Git.
// El matcher del proxy deja pasar las rutas .png: no hay portón ni negocio de por medio.

import { ImageResponse } from "next/og";
import { iconoAppGsgSvg } from "@/lib/gsg/marca-svg";

export function pngGsg(lado: number, opciones?: { zonaSegura?: boolean }): ImageResponse {
  const src = `data:image/svg+xml;base64,${Buffer.from(iconoAppGsgSvg(opciones)).toString("base64")}`;
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element -- Satori sólo entiende <img>
    <img src={src} width={lado} height={lado} alt="" />,
    {
      width: lado,
      height: lado,
      headers: { "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" },
    },
  );
}
