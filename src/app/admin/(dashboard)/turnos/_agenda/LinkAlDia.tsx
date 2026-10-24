"use client";

// Un enlace a otro día de la agenda que conserva cómo se la está mirando: el «Ver por: Box» de la
// planilla (`?por=box`) se cambia en el navegador sin ir al servidor, así que el enlace lo lee de la
// dirección de ahora y no del HTML que armó el servidor (pasos.ts: `hrefDiaDeLaAgenda`).

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { hrefDiaDeLaAgenda } from "../pasos";

export default function LinkAlDia({
  dia,
  hoy,
  vista,
  children,
  ...resto
}: {
  dia: string;
  hoy: string;
  vista?: "lista" | "profesionales";
  children: React.ReactNode;
} & Omit<React.ComponentProps<typeof Link>, "href">) {
  const params = useSearchParams();
  return (
    <Link href={hrefDiaDeLaAgenda(dia, hoy, { vista, por: params.get("por") })} {...resto}>
      {children}
    </Link>
  );
}
