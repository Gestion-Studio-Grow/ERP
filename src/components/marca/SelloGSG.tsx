// EL SELLO DE GSG en las pantallas de la plataforma (ingreso, cambio de contraseña, panel cerrado, consola): «Con
// tecnología de» en texto chico y el logo v10 con nombre. El negocio conserva su marca arriba; GSG firma abajo.
// El logo va a 56 px de alto, el mínimo de la marca con nombre: no se achica (debajo sería el isotipo solo).
// La forma toma `currentColor` (`text-muted`, AA en los dos temas); el SVG ya lleva su aria-label.
import { LogoGSG } from "./MarcaGSG";
import { LOGO_GSG_ALTO_MINIMO } from "@/lib/gsg/marca-svg";

export default function SelloGSG({ className = "" }: { className?: string }) {
  return (
    <p data-ui="sello-gsg" className={`flex flex-wrap items-center justify-center gap-x-2 text-xs text-muted ${className}`}>
      <span>Con tecnología de</span>
      <LogoGSG alto={LOGO_GSG_ALTO_MINIMO} />
    </p>
  );
}
