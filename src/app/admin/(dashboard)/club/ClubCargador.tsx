"use client";

// ============================================================================
// EL LÍMITE DEL MOTOR — la demo del club baja sólo en /admin/club y sólo en el navegador.
// ============================================================================
//
// El motor del club (src/lib/club/motor.mjs, ~2.900 líneas) pesa y guarda un contador de ids a
// nivel de módulo: no puede correr en el servidor (sería estado compartido entre pedidos) ni viajar
// en el JS de otras rutas. `next/dynamic` con `ssr: false` —que sólo se puede pedir desde un client
// component— lo deja en un chunk propio que se pide al montar esta pantalla. Mientras baja, el
// esqueleto ocupa el mismo lugar (sin saltos al aparecer).

import dynamic from "next/dynamic";
import { Esqueleto } from "@/components/ui/Esqueleto";
import type { Role } from "@/lib/capabilities";

function Cargando() {
  return (
    <div role="status" aria-label="Cargando la agenda de canchas" className="flex flex-col gap-4">
      <Esqueleto className="h-16 w-full rounded-lg" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Esqueleto className="h-[70vh] w-full rounded-lg" />
        <Esqueleto className="h-40 w-full rounded-lg" />
      </div>
    </div>
  );
}

const ClubDemo = dynamic(() => import("./ClubDemo"), { ssr: false, loading: Cargando });

/** `reloj="real"` sólo lo pasa page.tsx detrás de una condición que hoy es siempre falsa (el día de corte). */
export default function ClubCargador({ negocio, usuario, rol, reloj = "demo" }: { negocio: string; usuario: string; rol: Role; reloj?: "demo" | "real" }) {
  return <ClubDemo negocio={negocio} usuario={usuario} rol={rol} reloj={reloj} />;
}
