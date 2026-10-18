"use client";

// El motor del club no corre en el servidor ni viaja en el JS de otras rutas (ver ../ClubCargador.tsx): el aprobador
// baja en su propio chunk, sólo en el navegador, con un esqueleto del mismo alto mientras tanto.

import dynamic from "next/dynamic";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { leerFotoDelClub } from "../estado-actions";

function Cargando() {
  return (
    <div role="status" aria-label="Cargando el pedido" className="flex flex-col gap-3">
      <Esqueleto className="h-24 w-full rounded-lg" />
      <Esqueleto className="h-64 w-full rounded-lg" />
    </div>
  );
}

const AprobadorDelDuenio = dynamic(() => import("./AprobadorDelDuenio"), { ssr: false, loading: Cargando });

export default function AprobadorCargador({ negocio, usuario, modo }: { negocio: string; usuario: string; modo: "demo" | "real" }) {
  // En el real, los dueños (y sus PIN) salen de la jornada guardada en la base (BP-3): la misma lectura del club.
  return <AprobadorDelDuenio negocio={negocio} usuario={usuario} modo={modo} leerFoto={modo === "real" ? leerFotoDelClub : undefined} />;
}
