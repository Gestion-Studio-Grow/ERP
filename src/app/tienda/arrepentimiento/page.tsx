// Botón de arrepentimiento de «Pedí Local» (Ley 24.240 art. 34 y Disp. 954/2025): a un toque desde
// el pie de la vidriera, sin registrarse. «Quiero cancelar mi pedido» abre el WhatsApp del local
// con el mensaje ya escrito; si llega con ?pedido=<número>, el número va en el mensaje.
import type { Metadata } from "next";
import { arrepentimiento } from "@/lib/delivery-local/legales";
import { buildWhatsAppHref } from "@/lib/whatsapp-cta";
import { configDelHost, metadataLegal, whatsappDelLocal } from "../local/del-negocio";
import { mensajeDeCancelacion } from "../local/carta";
import DocumentoLegal from "../local/DocumentoLegal";
import s from "../local/local.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return metadataLegal("Arrepentimiento y cancelación", await configDelHost());
}

export default async function ArrepentimientoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [cfg, numero, sp] = await Promise.all([configDelHost(), whatsappDelLocal(), searchParams]);
  const texto = mensajeDeCancelacion(cfg.nombre, sp.pedido);
  return (
    <DocumentoLegal cfg={cfg} doc={arrepentimiento(cfg)}>
      <div className={`${s.caja} ${s.separado}`}>
        {numero ? (
          <a className={`${s.boton} ${s.botonPrincipal}`} href={buildWhatsAppHref(numero, texto)} target="_blank" rel="noopener noreferrer">
            Quiero cancelar mi pedido
          </a>
        ) : (
          <p>
            Para cancelar, escribile a {cfg.nombre} al WhatsApp desde el que te confirmaron el pedido. El número del local
            todavía no está cargado en esta página (provisional a confirmar).
          </p>
        )}
        <p className={s.ayuda}>Se abre WhatsApp con el mensaje ya escrito: sólo tenés que mandarlo. No hace falta registrarte.</p>
      </div>
    </DocumentoLegal>
  );
}
