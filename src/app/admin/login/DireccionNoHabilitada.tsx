// La dirección no lleva a ningún negocio (QA 26/09, bloqueante 4). Antes el dueño veía el
// formulario, ponía su clave y caía en «Se produjo un error inesperado», sin salida. Ahora se dice
// qué pasa y qué hacer, con una salida: escribirle a GSG (si hay número cargado) o reintentar.
// Sin marca de ningún negocio: no se sabe de quién es la dirección.

import { buildWhatsAppHref } from "@/lib/whatsapp-cta";

export default function DireccionNoHabilitada({ whatsappGsg }: { whatsappGsg: string | null }) {
  const ayuda = whatsappGsg
    ? buildWhatsAppHref(whatsappGsg, "Hola, entro a la dirección de mi panel y me dice que todavía no abre ningún negocio.")
    : null;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6 py-10">
      <h1 className="text-xl font-semibold text-strong">Esta dirección todavía no abre ningún panel</h1>
      <p className="text-sm text-muted">
        Puede estar mal escrita, o Gestión Studio Grow todavía no la publicó. Si te la acaban de pasar, puede tardar
        un rato en quedar activa. No hace falta que pongas tu contraseña: acá no entra.
      </p>
      <p className="text-sm text-muted">
        Revisá que la dirección sea igual a la del mensaje que recibiste. Si es igual y sigue sin abrir, avisale a
        quien te la pasó: tu contadora o Gestión Studio Grow.
      </p>
      <div className="flex flex-wrap gap-3">
        {ayuda && (
          <a
            href={ayuda}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-on-accent"
          >
            Escribirle a Gestión Studio Grow
          </a>
        )}
        <a
          href="/admin/login"
          className="inline-flex h-11 items-center justify-center rounded-md border border-line-strong px-5 text-sm font-medium text-strong"
        >
          Probar de nuevo
        </a>
      </div>
    </main>
  );
}
