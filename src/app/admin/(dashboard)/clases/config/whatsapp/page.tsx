import { requireApp } from "@/lib/require-app";
import { buttonClasses, cn } from "@/components/ui";
import { badgePendientes } from "@/lib/padel/datos.server";
import { modoWhatsApp } from "@/lib/padel/whatsapp-cloud";
import { tarjeta } from "../../_vista";
import { EncabezadoAjuste } from "../_encabezado";
import { contactoParaWhatsAppBusiness } from "../contacto-gsg";
import { linkDelTurnero } from "../_link.server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clases · WhatsApp", manifest: "/clases/app.webmanifest" };

// Ajustes → WhatsApp (B6 · M-047): en criollo, cómo salen hoy los avisos y un botón para pedirle a
// Gestión Studio Grow que los conecte a WhatsApp Business. Nunca una ruta de archivo.
export default async function AjustesWhatsApp() {
  await requireApp("padel-clases");
  const [numero, turnero] = await Promise.all([badgePendientes(), linkDelTurnero()]);
  const cloud = modoWhatsApp(process.env) === "cloud";
  const contactoGsg = contactoParaWhatsAppBusiness(turnero);
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <EncabezadoAjuste titulo="WhatsApp" detalle="Cómo les llegan los avisos a tus alumnos." pendientes={numero} />
      <section className={cn(tarjeta, "grid gap-3")} data-qa="wa-modo">
        {cloud ? (
          <p className="text-base text-strong">Conectado a WhatsApp Business: los avisos a tus alumnos salen solos, sin que toques nada.</p>
        ) : (
          <>
            <p className="text-base text-strong">
              Hoy cada aviso sale con un botón verde que abre WhatsApp con el mensaje listo: lo tocás y lo mandás.
            </p>
            <p className="text-sm text-muted">
              Si querés que salgan solos (confirmaciones, recordatorios, cambios de horario), Gestión Studio Grow conecta tu número a WhatsApp Business.
            </p>
            <a href={contactoGsg.href} target="_blank" rel="noopener noreferrer" className={cn(buttonClasses("outline", "lg"), "h-12 w-full justify-center")} data-qa="contacto-gsg">
              {contactoGsg.rotulo}
            </a>
          </>
        )}
      </section>
    </main>
  );
}
