// GSG · el PNG del logo v10 sobre papel para el encabezado de los mails de la plataforma (/gsg/logo-mail.png), con
// next/og desde la fuente única de la marca (src/lib/gsg/mail-gsg.ts), al doble del alto mínimo de 56 px. Sin binarios
// en Git. El SVG es ASCII puro (curvas y colores hex): `btoa` alcanza para el data-URI.
import { ImageResponse } from "next/og";
import { LOGO_MAIL_GSG, logoMailGsgSvg } from "@/lib/gsg/mail-gsg";

export function pngLogoMailGsg(): ImageResponse {
  const ancho = LOGO_MAIL_GSG.ancho * LOGO_MAIL_GSG.escalaPng;
  const alto = LOGO_MAIL_GSG.alto * LOGO_MAIL_GSG.escalaPng;
  const src = `data:image/svg+xml;base64,${btoa(logoMailGsgSvg())}`;
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element -- Satori sólo entiende <img>
    <img src={src} width={ancho} height={alto} alt="" />,
    {
      width: ancho,
      height: alto,
      headers: { "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" },
    },
  );
}
