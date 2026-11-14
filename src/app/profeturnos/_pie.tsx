// PROFETURNOS · Pie de la vidriera y del alta: enlaces a los legales (obligatorios en la portada,
// Res. SCI 424/2020) y el crédito GSG. Las páginas legales usan su propio marco con el mismo pie.

import Link from "next/link";

const ENLACE = "underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export function PieProfeTurnos() {
  return (
    <footer className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-5 pb-10 pt-6 text-xs text-muted">
      <nav aria-label="Legales" className="flex flex-wrap justify-center gap-x-4 gap-y-2">
        <Link href="/profeturnos/terminos" className={ENLACE}>Términos y condiciones</Link>
        <Link href="/profeturnos/privacidad" className={ENLACE}>Privacidad</Link>
        <Link href="/profeturnos/arrepentimiento" className={ENLACE}>Botón de arrepentimiento</Link>
        <Link href="/profeturnos/baja" className={ENLACE}>Darme de baja</Link>
      </nav>
      <p className="m-0">ProfeTurnos · Hecho por Gestión Studio Grow</p>
    </footer>
  );
}
