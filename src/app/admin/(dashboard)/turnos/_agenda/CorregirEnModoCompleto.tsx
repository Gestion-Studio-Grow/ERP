"use client";

// «Corregir en modo completo» (modo simple, src/lib/modo-simple.ts): en lugar de anular un cobro, dar
// de baja un saldo o deshacer un cierre, sale al modo completo EN ESTA SESIÓN y vuelve a esta misma
// pantalla, con el turno abierto (`?turno=<id>` ya está en la dirección). <a>, no <Link>: la ruta
// prende una cookie y no se puede precargar. Lo que quien mira no puede hacer, en completo tampoco se
// le ofrece: ahí dice «Pedile al dueño» la propia pantalla.

import { usePathname, useSearchParams } from "next/navigation";
import { hrefModoCompleto } from "@/lib/modo-simple";

export default function CorregirEnModoCompleto({ turnoId }: { turnoId?: string }) {
  const pathname = usePathname();
  const params = new URLSearchParams(useSearchParams().toString());
  if (turnoId) params.set("turno", turnoId);
  const q = params.toString();
  return (
    <a
      href={hrefModoCompleto(q ? `${pathname}?${q}` : pathname)}
      data-modo-simple="corregir"
      className="inline-flex min-h-12 items-center text-base font-semibold text-strong underline underline-offset-4"
    >
      Corregir en modo completo
    </a>
  );
}
