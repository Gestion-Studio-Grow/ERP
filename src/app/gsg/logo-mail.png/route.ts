// GSG · /gsg/logo-mail.png — el logo v10 sobre papel para el encabezado de los mails de la plataforma (los clientes
// de correo no muestran SVG; el alt «Gestión Studio Grow» lo pone el <img> del mail, src/lib/gsg/mail-gsg.ts).
// Generado con next/og, sin binarios en Git. Público y sin negocio: el matcher del proxy deja pasar las rutas .png.
import { pngLogoMailGsg } from "../logo-mail-png";

export const dynamic = "force-static";

export function GET() {
  return pngLogoMailGsg();
}
