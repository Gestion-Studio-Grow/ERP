"use client";

// ============================================================================
// MI PIN — la solapa de recepción para cambiar SU PIN, y nada más (hallazgo UAT-005/006).
// ============================================================================
//
// Recepción no ve Configuración (es `soloDuenos`: usuarios, PIN ajenos, reglas, respaldo). Antes eso la dejaba sin
// forma de cambiar su propio PIN. Esta solapa (`soloRecepcion` en solapas-club.ts) trae SÓLO «Cambiar mi PIN», el
// mismo formulario de Configuración: no lista usuarios ni muestra PIN de nadie. Esconder o mostrar no es seguridad: en
// la jornada real el cambio lo comprueba el servidor (`cambiarMiPinDelClub`, pin-del-club-actions.ts) con el PIN actual
// de quien opera, y el PIN de un dueño no se cambia desde un puesto de recepción.

import type { PropsDeSolapa } from "./solapas-club";
import { CambiarMiPin } from "./config-usuarios";
import { useHacerConfig } from "./config-piezas";
import { useOperador } from "./usar-almacen";
import { LARGO_PIN } from "@/lib/club/motor.mjs";

export default function MiPinDelClub({ almacen, negocio }: PropsDeSolapa) {
  const operador = useOperador(almacen);
  const hacer = useHacerConfig(almacen, negocio);
  const rol = operador?.usuario.rol ?? null;
  return (
    <div className="flex max-w-2xl min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 data-pantalla className="text-lg font-semibold text-strong">
          Mi PIN
        </h2>
        <p className="text-sm text-body">
          Con tu PIN entrás y desbloqueás la pantalla. Cambialo cuando quieras: te pide el de ahora y uno nuevo de {LARGO_PIN.recepcion} números que
          sólo sepas vos.
        </p>
      </div>
      {!operador && <p className="text-sm font-semibold text-strong">Entrá con tu PIN para cambiarlo.</p>}
      {operador && rol !== "duenio" && <CambiarMiPin almacen={almacen} rol={operador.usuario.rol} hacer={hacer} negocio={negocio} />}
      {rol === "duenio" && <p className="text-sm text-body">El PIN de un dueño se cambia en Configuración, desde el puesto del dueño.</p>}
    </div>
  );
}
