// «Pasale esto» (GSG-02/GSG-07): lo que el operador le manda al dueño al terminar el alta —
// dirección, usuario y contraseña— listo para Copiar o mandar por WhatsApp. PURO y client-safe:
// lo usa WizardClient. Si el negocio no tiene dirección todavía, lo dice en vez de armar un link roto.
import { buildWhatsAppHref } from "@/lib/whatsapp-cta";

export interface DatosParaElDuenio {
  negocio: string;
  /** Dirección del panel (`direccionDelLocal`, multilocal-core.ts). `null`: no tiene; `undefined`: no se sabe. */
  direccion: string | null | undefined;
  usuario: string;
  /** Contraseña generada en el alta. `null`: el dueño ya tenía usuario y conserva la suya. */
  clave: string | null;
}

export type EstadoDireccion = "con-direccion" | "sin-direccion" | "sin-saber";

export function pasaleEsto(d: DatosParaElDuenio): { estado: EstadoDireccion; mensaje: string; whatsapp: string } {
  const estado: EstadoDireccion =
    d.direccion === undefined ? "sin-saber" : d.direccion ? "con-direccion" : "sin-direccion";
  const lineas = [`¡Hola! Ya está listo el sistema de ${d.negocio}.`];
  lineas.push(
    estado === "con-direccion"
      ? `Entrá en: ${d.direccion}`
      : "La dirección para entrar te la paso cuando esté lista.",
  );
  lineas.push(`Usuario: ${d.usuario}`);
  lineas.push(d.clave ? `Contraseña: ${d.clave}` : "Entrá con tu contraseña de siempre.");
  const mensaje = lineas.join("\n");
  // Sin número: WhatsApp deja elegir el contacto (regla de whatsapp-cta.ts: nunca un número fijo).
  return { estado, mensaje, whatsapp: buildWhatsAppHref("", mensaje) };
}
