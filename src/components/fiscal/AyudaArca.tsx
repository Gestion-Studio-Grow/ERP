// «Te ayudamos en 10 minutos»: el botón de ayuda del asistente ARCA, visible para todos (ajuste del
// dueño 11/11/2026), con la línea fija «Nunca te vamos a pedir tu clave fiscal». El mensaje ya va
// cargado con dónde está la persona y, si lo hay, el error (src/lib/fiscal/guia-arca.ts: sin CUIT
// completo ni datos de clave). Sin hooks: lo usan el asistente (servidor) y la guía (cliente).
import { ButtonLink } from "@/components/ui";
import { linkCanal, type CanalGsg } from "@/app/facturita/contacto";
import { NUNCA_TE_PEDIMOS_LA_CLAVE, TEXTO_BOTON_AYUDA } from "@/lib/fiscal/guia-arca";

export function AyudaArca({ canal, mensaje }: { canal: CanalGsg; mensaje: string }) {
  const porWhatsApp = canal.tipo === "whatsapp";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2" data-qa="ayuda-arca">
      <ButtonLink href={linkCanal(canal, "Ayuda para conectar ARCA", mensaje)} target="_blank" rel="noopener noreferrer" variant="outline">
        {TEXTO_BOTON_AYUDA}
        <span className="sr-only">{porWhatsApp ? " (abre WhatsApp)" : " (abre un mail)"}</span>
      </ButtonLink>
      <p className="text-[13px] text-muted">{NUNCA_TE_PEDIMOS_LA_CLAVE}.</p>
    </div>
  );
}
