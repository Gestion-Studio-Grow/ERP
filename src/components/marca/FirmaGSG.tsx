// LA FIRMA DE GSG EN EL PANEL DE CADA NEGOCIO (co-marca, 29/10/2026): el cliente arriba y grande (su logo), GSG abajo y
// chico, nunca en la misma línea. Va al pie de la barra, del cajón y del panel de casa. `text-faint` ya es AA en los
// dos temas: sin opacidad extra. Lleva a la portada de GSG en otra pestaña (no saca a nadie de su panel).
import { IsotipoGSG } from "./MarcaGSG";

export default function FirmaGSG({ className = "" }: { className?: string }) {
  return (
    <a
      href="https://gsgapp.com.ar/"
      target="_blank"
      rel="noopener noreferrer"
      data-ui="firma-gsg"
      aria-label="powered by GSG — Gestión Studio Grow (se abre en otra pestaña)"
      className={`inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-[12px] font-medium tracking-[.01em] text-faint hover:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${className}`}
    >
      <IsotipoGSG tamano={14} />
      <span>powered by GSG</span>
    </a>
  );
}
