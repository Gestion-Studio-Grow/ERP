// La franja del modo simple, arriba del contenido de TODA pantalla del panel (layout.tsx). Sólo para
// quien tiene el modo simple guardado: en simple ofrece «Ver todo» (sale al completo en esta sesión);
// viendo todo, «Volver al modo simple». Así nadie queda trabado (MODO-SIMPLE-DECISION.md §1.5).
// El enlace es de cliente (EnlaceDeLaFranja.tsx): el layout no se redibuja al navegar y `ruta` queda vieja.

import { Franja } from "@/components/ui";
import EnlaceDeLaFranja from "./EnlaceDeLaFranja";
import type { EstadoModoSimple } from "@/lib/modo-simple.server";

export default function FranjaModoSimple({ estado, ruta }: { estado: EstadoModoSimple; ruta: string }) {
  if (!estado.prefiere) return null;
  return (
    <Franja className="flex flex-wrap items-center justify-between gap-2 text-base" >
      {estado.activo ? (
        <>
          <span>Estás en modo simple: lo de todos los días.</span>
          <EnlaceDeLaFranja modo="ver-todo" rutaDelServidor={ruta}>
            Ver todo
          </EnlaceDeLaFranja>
        </>
      ) : (
        <>
          <span>Estás viendo todo en esta sesión.</span>
          <EnlaceDeLaFranja modo="volver" rutaDelServidor={ruta}>
            Volver al modo simple
          </EnlaceDeLaFranja>
        </>
      )}
    </Franja>
  );
}
