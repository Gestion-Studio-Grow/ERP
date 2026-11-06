// La franja del modo simple, arriba del contenido de TODA pantalla del panel (layout.tsx). Sólo para
// quien tiene el modo simple guardado: en simple ofrece «Ver todo» (sale al completo en esta sesión);
// viendo todo, «Volver al modo simple». Así nadie queda trabado (MODO-SIMPLE-DECISION.md §1.5).
// Links comunes (<a>), no <Link>: la ruta prende una cookie y no se puede precargar.

import { Franja } from "@/components/ui";
import { hrefModoCompleto, hrefVolverASimple } from "@/lib/modo-simple";
import type { EstadoModoSimple } from "@/lib/modo-simple.server";

export default function FranjaModoSimple({ estado, ruta }: { estado: EstadoModoSimple; ruta: string }) {
  if (!estado.prefiere) return null;
  return (
    <Franja className="flex flex-wrap items-center justify-between gap-2 text-base" >
      {estado.activo ? (
        <>
          <span>Estás en modo simple: lo de todos los días.</span>
          <a href={hrefModoCompleto(ruta)} data-modo-simple="ver-todo" className="inline-flex min-h-12 items-center font-semibold text-strong underline underline-offset-4">
            Ver todo
          </a>
        </>
      ) : (
        <>
          <span>Estás viendo todo en esta sesión.</span>
          <a href={hrefVolverASimple(ruta)} data-modo-simple="volver" className="inline-flex min-h-12 items-center font-semibold text-strong underline underline-offset-4">
            Volver al modo simple
          </a>
        </>
      )}
    </Franja>
  );
}
