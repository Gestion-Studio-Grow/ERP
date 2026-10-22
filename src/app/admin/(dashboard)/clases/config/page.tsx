import { headers } from "next/headers";
import { requireApp } from "@/lib/require-app";
import { badgePendientes, configCompleta } from "@/lib/padel/datos.server";
import { buttonClasses, cn } from "@/components/ui";
import { contactoParaWhatsAppBusiness } from "./contacto-gsg";
import { CLAVES_PLANTILLA, PLANTILLA_LABEL } from "@/lib/padel/core";
import { modoWhatsApp } from "@/lib/padel/whatsapp-cloud";
import { tarjeta } from "../_vista";
import { Cabecera } from "../_cabecera";
import { FormBloqueo, FormConfig, FormHorarios, QuitarBloqueo, CopiarLink } from "./Formularios";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clases · Ajustes", manifest: "/clases/app.webmanifest" };

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export default async function ClasesConfig() {
  await requireApp("padel-clases");
  const [{ config, franjas, bloqueos }, numero, h] = await Promise.all([configCompleta(), badgePendientes(), headers()]);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const turnero = `${host.includes("localhost") ? "http" : "https"}://${host}/clases`;
  const porDia = DIAS.map((_, i) => franjas.filter((f) => f.diaSemana === i).map((f) => `${f.desde}-${f.hasta}`).join(", "));
  const cloud = modoWhatsApp(process.env) === "cloud";
  const contactoGsg = contactoParaWhatsAppBusiness(turnero);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <Cabecera titulo="Ajustes" detalle="Horarios, precios y reglas. Lo que ve el alumno en el turnero sale de acá." pendientes={numero} actual="config" />

      <section className={`${tarjeta} mb-4`} aria-labelledby="t-link">
        <h2 id="t-link" className="mb-1 text-base font-bold text-strong">Tu link para la bio de Instagram</h2>
        <p className="mb-2 break-all font-mono text-sm text-strong" data-qa="link-turnero">{turnero}</p>
        <CopiarLink url={turnero} />
      </section>

      <section className={`${tarjeta} mb-4`} aria-labelledby="t-horarios">
        <h2 id="t-horarios" className="mb-1 text-base font-bold text-strong">Cuándo das clases</h2>
        <p className="mb-3 text-sm text-muted">Por día, los tramos separados por coma. Ej.: 08:00-12:00, 16:00-21:00. Vacío = ese día no.</p>
        <FormHorarios dias={DIAS} valores={porDia} />
      </section>

      <section className={`${tarjeta} mb-4`} aria-labelledby="t-bloqueo">
        <h2 id="t-bloqueo" className="mb-1 text-base font-bold text-strong">Bloquear un día</h2>
        <p className="mb-3 text-sm text-muted">Lluvia, viaje, torneo. El turnero deja de ofrecerlo.</p>
        <FormBloqueo />
        {bloqueos.length > 0 && (
          <ul className="mt-3 grid gap-1.5">
            {bloqueos.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-1 text-sm" data-qa="bloqueo">
                <span>
                  {b.fecha?.toISOString().slice(0, 10).split("-").reverse().join("/")} · {b.desde === "00:00" && b.hasta === "23:59" ? "todo el día" : `${b.desde} a ${b.hasta}`}
                  {b.tipo === "DA" && " (extra)"}
                </span>
                <QuitarBloqueo id={b.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${tarjeta} mb-4`} aria-labelledby="t-config">
        <h2 id="t-config" className="mb-3 text-base font-bold text-strong">Precios, cobro y reglas</h2>
        <FormConfig
          config={{ ...config, plantillas: config.plantillas }}
          claves={CLAVES_PLANTILLA.map((k) => ({ clave: k, label: PLANTILLA_LABEL[k] }))}
        />
      </section>

      <section className={tarjeta} aria-labelledby="t-wa">
        <h2 id="t-wa" className="mb-1 text-base font-bold text-strong">WhatsApp</h2>
        {cloud ? (
          <p className="text-sm text-strong" data-qa="wa-modo">Conectado a WhatsApp Business: los avisos a los alumnos salen solos.</p>
        ) : (
          <div className="grid gap-3" data-qa="wa-modo">
            <p className="text-sm text-muted">
              Hoy los avisos salen con un botón verde que abre WhatsApp con el mensaje listo: lo tocás y lo mandás. Para que salgan solos,
              sin tocar nada, Gestión Studio Grow conecta tu número a WhatsApp Business.
            </p>
            <a
              href={contactoGsg.href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonClasses("outline", "lg"), "h-12 w-full justify-center")}
              data-qa="contacto-gsg"
            >
              {contactoGsg.rotulo}
            </a>
          </div>
        )}
      </section>
    </main>
  );
}
