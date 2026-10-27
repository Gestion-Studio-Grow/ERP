// ============================================================================
// «DAR TURNO» Y «ATENDER AHORA» — las dos entradas fijas al alta nueva (cert CH Tanda 2, F-2 y F-4).
// ============================================================================
//
// Las dos llevan al MISMO alta (el cajón «Dar turno» sobre el libro del día, `?nuevo=1`), nunca al
// formulario viejo de la lista:
//   · «Dar turno»: el día que se está mirando (si ya pasó, hoy: un turno nuevo en el pasado es casi
//     siempre un error, `leerNuevoTurno`).
//   · «Atender ahora» (CH-019, la clienta está en el mostrador): hoy, la franja de ahora y sólo las
//     profesionales libres ahora; al dar el turno se abre su hoja de cobro (`hrefAtenderAhora`).
//
// Sólo para quien gestiona la agenda (`agenda:manage`): la profesional no da turnos. Server component
// (sólo enlaces): lo montan la agenda (PC y celular, con y sin «Diseño nuevo») y el Inicio.

import Link from "next/link";
import { atributosBoton, buttonClasses } from "@/components/ui";
import { hrefAtenderAhora, hrefNuevoTurno } from "../pasos";

export default function AtajosDelAlta({
  fecha,
  hoy,
  principal = "dar-turno",
}: {
  /** El día que se mira ("YYYY-MM-DD"); sin él, hoy. */
  fecha?: string | null;
  /** Hoy, en la zona del negocio. */
  hoy: string;
  /** Cuál de las dos va llena (la otra, con borde). «ninguna»: las dos con borde (Inicio analítico). */
  principal?: "dar-turno" | "atender-ahora" | "ninguna";
}) {
  const dia = fecha && fecha >= hoy ? fecha : hoy;
  const llena = (cual: "dar-turno" | "atender-ahora") => (cual === principal ? "solid" : "outline") as "solid" | "outline";
  const clase = "whitespace-nowrap max-sm:min-h-11";
  return (
    <>
      <Link
        href={hrefNuevoTurno(dia)}
        className={buttonClasses(llena("dar-turno"), "sm", clase)}
        {...atributosBoton(llena("dar-turno"), "sm")}
        data-atajo="dar-turno"
      >
        + Dar turno
      </Link>
      <Link
        href={hrefAtenderAhora()}
        className={buttonClasses(llena("atender-ahora"), "sm", clase)}
        {...atributosBoton(llena("atender-ahora"), "sm")}
        aria-label="Atender ahora: la clienta está en el local, ver quién está libre ya"
        data-atajo="atender-ahora"
      >
        Atender ahora
      </Link>
    </>
  );
}
