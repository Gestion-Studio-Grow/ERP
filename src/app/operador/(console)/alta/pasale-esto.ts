// «Pasale esto» (GSG-02/GSG-07): lo que el operador le manda al dueño al terminar el alta —
// dirección y usuario— listo para Copiar o mandar por WhatsApp. La CONTRASEÑA no va acá: le llega sola
// por mail al titular (GSG-SEG-014); el mensaje sólo le avisa que la busque ahí. PURO y client-safe:
// lo usa WizardClient. Si el negocio no tiene dirección todavía, lo dice en vez de armar un link roto.
import { buildWhatsAppHref } from "@/lib/whatsapp-cta";
import { lineaDelDuenioFacturaAFuera } from "@/lib/fiscal/regimen-factura-a";
import type { RegimenFacturaA } from "@/lib/fiscal/decidir-comprobante";

export interface DatosParaElDuenio {
  negocio: string;
  /** Dirección del panel (`direccionDelLocal`, multilocal-core.ts). `null`: no tiene; `undefined`: no se sabe. */
  direccion: string | null | undefined;
  usuario: string;
  /**
   * A dónde salió por mail la provisoria, enmascarado («c***@dominio.com»). `null`: el dueño ya tenía
   * usuario y conserva la suya (o el mail no salió y se le reenvía desde la ficha).
   */
  claveEnviadaA: string | null;
  /** Pidió varios locales y el alta creó el primero (la casa): el mensaje le dice que los otros van aparte. */
  otrosLocales?: boolean;
  /** La Factura A que asignó ARCA: con «A con leyenda» o «M», el mensaje dice que esas van por ARCA. */
  facturaAFuera?: RegimenFacturaA | null;
}

export const LINEA_OTROS_LOCALES = "Por ahora quedó el primer local. Los otros los sumamos aparte y te aviso cuando estén.";

export type EstadoDireccion = "con-direccion" | "sin-direccion" | "sin-saber";

export function pasaleEsto(d: DatosParaElDuenio): { estado: EstadoDireccion; mensaje: string; whatsapp: string } {
  const estado: EstadoDireccion =
    d.direccion === undefined ? "sin-saber" : d.direccion ? "con-direccion" : "sin-direccion";
  const lineas = [`¡Hola! Ya está listo el sistema de ${d.negocio}.`];
  if (d.otrosLocales) lineas.push(LINEA_OTROS_LOCALES);
  lineas.push(
    estado === "con-direccion"
      ? `Entrá en: ${d.direccion}`
      : "La dirección para entrar te la paso cuando esté lista.",
  );
  lineas.push(`Usuario: ${d.usuario}`);
  lineas.push(
    d.claveEnviadaA
      ? `La contraseña provisoria te llegó por mail a ${d.claveEnviadaA}. Al entrar, el sistema te pide que elijas una nueva.`
      : "Entrá con tu contraseña de siempre.",
  );
  const facturaA = lineaDelDuenioFacturaAFuera(d.facturaAFuera);
  if (facturaA) lineas.push(facturaA);
  const mensaje = lineas.join("\n");
  // Sin número: WhatsApp deja elegir el contacto (regla de whatsapp-cta.ts: nunca un número fijo).
  return { estado, mensaje, whatsapp: buildWhatsAppHref("", mensaje) };
}
