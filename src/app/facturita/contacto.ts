// FACTURITA · Por dónde nos escribe quien llega a la vidriera (alta y planes). Puro, sin JSX.
//
// 1. El WhatsApp de GSG, si está cargado en `WHATSAPP_GSG` (la misma variable del login y de
//    /admin/usuarios/plan). Sin número no se inventa uno (DX-4).
// 2. Si no, la casilla de GSG que el repo YA usa como canal de contacto con GSG
//    (`CASILLA_GSG` en src/app/admin/(dashboard)/clases/config/contacto-gsg.ts:10, el «Escribirle a
//    Gestión Studio Grow» del panel). Se copia acá en vez de importarla para no atar la vidriera
//    pública al panel; si cambia allá, cambia acá (pedido a estetica-base: un módulo compartido).
//
// QA 29/10: sin `WHATSAPP_GSG` el alta terminaba en «Copiar el resumen» sin decir adónde mandarlo.

import { buildWhatsAppHref, sanitizePhone } from "@/lib/whatsapp-cta";

export const CASILLA_GSG = "gestionstudiogrow@gmail.com";

export type CanalGsg =
  | { tipo: "whatsapp"; base: string }
  | { tipo: "mail"; casilla: string };

/** El canal disponible en este despliegue (se lee en el servidor, en el build de la página estática). */
export function canalGsg(numeroCrudo: string | null | undefined = process.env.WHATSAPP_GSG): CanalGsg {
  const numero = sanitizePhone(numeroCrudo);
  if (numero.length >= 10) return { tipo: "whatsapp", base: buildWhatsAppHref(numero, "") };
  return { tipo: "mail", casilla: CASILLA_GSG };
}

/** El link para mandar `texto` por ese canal (WhatsApp con el texto, o un mail con asunto y cuerpo). */
export function linkCanal(canal: CanalGsg, asunto: string, texto: string): string {
  if (canal.tipo === "whatsapp") return `${canal.base}${encodeURIComponent(texto)}`;
  return `mailto:${canal.casilla}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}`;
}
