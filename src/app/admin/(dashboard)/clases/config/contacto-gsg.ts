// B6 (M-047): en Ajustes → WhatsApp, modo manual, el profe ve el texto para él y un botón para
// pedirle a Gestión Studio Grow que conecte WhatsApp Business. Nunca una ruta de archivo.
//
// El número de soporte de GSG es dato de la plataforma, no del negocio: `GSG_WHATSAPP_SOPORTE`
// (celular argentino, como lo normaliza linkWhatsApp). Provisional a confirmar: mientras no esté cargado, el botón abre un mail a la
// casilla de GSG con el pedido escrito.

import { linkWhatsApp } from "@/lib/padel/core";

const CASILLA_GSG = "gestionstudiogrow@gmail.com";

/** `turnero`: el link del turnero del profe (identifica el negocio sin otra consulta a la base). */
export function contactoParaWhatsAppBusiness(turnero: string, env: Record<string, string | undefined> = process.env) {
  const texto = `Hola! Quiero que los avisos de mis clases salgan solos por WhatsApp Business. Mi turnero: ${turnero}`;
  const wa = env.GSG_WHATSAPP_SOPORTE ? linkWhatsApp(env.GSG_WHATSAPP_SOPORTE, texto) : null;
  if (wa) return { href: wa, rotulo: "Escribirle a Gestión Studio Grow" };
  return {
    href: `mailto:${CASILLA_GSG}?subject=${encodeURIComponent("Conectar WhatsApp Business")}&body=${encodeURIComponent(texto)}`,
    rotulo: "Escribirle a Gestión Studio Grow",
  };
}
