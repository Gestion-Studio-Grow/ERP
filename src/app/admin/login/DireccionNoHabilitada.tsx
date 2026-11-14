// La dirección no lleva a ningún negocio (QA 26/09, bloqueante 4). Antes el dueño veía el
// formulario, ponía su clave y caía en «Se produjo un error inesperado», sin salida. Ahora se dice
// qué pasa y qué hacer, con una salida: escribirle a GSG (si hay número cargado) o reintentar.
// Sin marca de ningún negocio: no se sabe de quién es la dirección. Con la identidad de GSG (E1, 29/10/2026): la misma
// voz que la página de una dirección sin negocio (src/lib/gsg/pagina-sin-negocio.ts) — papel, tinta y el logo de GSG.

import { buildWhatsAppHref } from "@/lib/whatsapp-cta";
import { MarcaDeAgua } from "@/components/marca/MarcaDeAgua";
import { LogoGSG } from "@/components/marca/MarcaGSG";

export default function DireccionNoHabilitada({ whatsappGsg }: { whatsappGsg: string | null }) {
  const ayuda = whatsappGsg
    ? buildWhatsAppHref(whatsappGsg, "Hola, entro a la dirección de mi panel y me dice que todavía no abre ningún negocio.")
    : null;
  return (
    <main className="isolate flex min-h-dvh flex-col bg-[#f4f5f4] text-[17px] leading-relaxed text-[#35363a]">
      {/* Marca de agua de GSG (mosaico de isotipos), en lugar de la trama de puntos: la página es de GSG. */}
      <MarcaDeAgua className="text-[#191b1c]" />
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center px-6 text-[#191b1c] sm:h-[72px]">
        <a href="/sin-negocio" className="inline-flex min-h-11 items-center" aria-label="GSG — Gestión Studio Grow">
          <LogoGSG alto={56} />
        </a>
      </header>
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 pb-16">
        <div className="rounded-2xl border border-[#e2e2df] bg-white p-6 shadow-[0_1px_2px_rgba(25,27,28,.04),0_8px_24px_-12px_rgba(25,27,28,.12)] sm:p-8">
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[#191b1c] [text-wrap:balance] sm:text-[32px]">
            Esta dirección todavía no abre ningún panel
          </h1>
          <p className="mt-4">
            Puede estar mal escrita, o Gestión Studio Grow todavía no la publicó. Si te la acaban de pasar, puede tardar
            un rato en quedar activa. No hace falta que pongas tu contraseña: acá no entra.
          </p>
          <p className="mt-3 text-[#5f6065]">
            Revisá que la dirección sea igual a la del mensaje que recibiste. Si es igual y sigue sin abrir, avisale a
            quien te la pasó: tu contadora o Gestión Studio Grow.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {ayuda && (
              <a
                href={ayuda}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-[#191b1c] px-6 text-base font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#191b1c] sm:flex-none"
              >
                Escribirle a Gestión Studio Grow
              </a>
            )}
            <a
              href="/admin/login"
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-[#c9c9c4] px-6 text-base font-semibold text-[#191b1c] hover:border-[#191b1c] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#191b1c] sm:flex-none"
            >
              Probar de nuevo
            </a>
          </div>
        </div>
      </div>
      <footer className="mx-auto w-full max-w-5xl px-6 pb-8 text-[13px] text-[#5f6065]">powered by GSG</footer>
    </main>
  );
}
